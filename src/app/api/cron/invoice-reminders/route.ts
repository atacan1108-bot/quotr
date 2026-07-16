/**
 * Runs once a day (see vercel.json's "crons" entry) and sends automated
 * payment reminders for overdue/upcoming invoices. NO LOGIN — Vercel Cron
 * calls this with no Quotr session at all, verified only by CRON_SECRET
 * (see "Securing cron jobs" in Vercel's own docs) — so it runs on the
 * admin/service-role Supabase client (src/lib/supabase/admin.ts), scoped
 * carefully: it only ever touches invoices with status='sent' and only
 * ever writes a reminder log row or updates payment-status columns, never
 * anything a contractor wouldn't already be able to do themselves.
 *
 * RELIABILITY: every invoice is processed in its own try/catch. One
 * invoice's Mollie/email failure is logged and skipped — it can NEVER
 * crash the whole run or stop other contractors' reminders from going
 * out, and it never marks a reminder as sent unless it actually was
 * (see invoice_reminders' unique (invoice_id, stage) constraint, which
 * doubles as the "never send the same reminder twice" guarantee even if
 * Vercel's cron delivery invokes this route more than once — Vercel's own
 * docs explicitly warn cron delivery is "best effort" and can duplicate
 * or occasionally invoke the same run more than once).
 *
 * STAGE SELECTION is a pure function of today's date vs. the invoice's
 * due date and the contractor's own schedule settings (rate_cards) —
 * always the MOST-ESCALATED stage that currently applies, most-severe
 * first. This means a contractor who turns reminders on for the first
 * time on an invoice that's already 20 days overdue gets the "overdue_2"
 * reminder today, not four backdated reminders in a row.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createInvoicePayment, CreateInvoicePaymentError } from '@/lib/mollie/createInvoicePayment'
import { sendDocumentEmail, SendDocumentEmailError } from '@/lib/sendDocumentEmail'
import { buildReminderEmail, type ReminderStage } from '@/lib/reminderEmailContent'
import { pdfLabels } from '@/lib/pdf/pdfLabels'
import { calculateInvoice } from '@/lib/pricing'
import { EMPTY_BRANDING } from '@/lib/types'
import type { InvoiceExportData } from '@/lib/invoiceData'
import type { Invoice } from '@/lib/invoicing/types'

export const runtime = 'nodejs'
export const maxDuration = 300

interface ReminderSettings {
  reminders_enabled: boolean
  reminder_before_due_days: number
  reminder_overdue_days_1: number
  reminder_overdue_days_2: number
  business_name: string | null
  business_address: string | null
  business_email: string | null
  logo_url: string | null
  branding: InvoiceExportData['rateCard']['branding']
}

function determineStage(dueDate: string, today: string, settings: ReminderSettings): { stage: ReminderStage; daysOverdue: number } | null {
  const dueMs = new Date(dueDate + 'T00:00:00Z').getTime()
  const todayMs = new Date(today + 'T00:00:00Z').getTime()
  const daysSinceDue = Math.round((todayMs - dueMs) / 86_400_000)

  if (daysSinceDue >= settings.reminder_overdue_days_2) return { stage: 'overdue_2', daysOverdue: daysSinceDue }
  if (daysSinceDue >= settings.reminder_overdue_days_1) return { stage: 'overdue_1', daysOverdue: daysSinceDue }
  if (daysSinceDue >= 0) return { stage: 'due', daysOverdue: daysSinceDue }
  if (daysSinceDue >= -settings.reminder_before_due_days) return { stage: 'before_due', daysOverdue: daysSinceDue }
  return null
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const host = req.headers.get('host') ?? 'localhost:3000'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`
  const today = new Date().toISOString().slice(0, 10)

  const supabase = createAdminClient()

  const [{ data: rateCards, error: rateCardsError }, { data: invoices, error: invoicesError }] = await Promise.all([
    supabase
      .from('rate_cards')
      .select('owner_id, business_name, business_address, business_email, logo_url, branding, reminders_enabled, reminder_before_due_days, reminder_overdue_days_1, reminder_overdue_days_2')
      .order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').eq('status', 'sent'),
  ])

  if (rateCardsError || invoicesError) {
    console.error('invoice-reminders cron: could not load data', { rateCardsError, invoicesError })
    return NextResponse.json({ error: 'could not load data' }, { status: 502 })
  }

  // Latest rate_card per owner, same "most recent wins" rule getInvoiceExportData uses.
  const settingsByOwner = new Map<string, ReminderSettings>()
  for (const rc of rateCards ?? []) {
    if (!settingsByOwner.has(rc.owner_id)) settingsByOwner.set(rc.owner_id, rc as ReminderSettings)
  }

  const results = { sent: 0, skipped: 0, failed: 0 }

  for (const invoiceRow of invoices ?? []) {
    const invoice = invoiceRow as Invoice
    const settings = settingsByOwner.get(invoice.owner_id)

    if (!settings || !settings.reminders_enabled) {
      console.log('invoice-reminders cron: skipped (reminders off/no settings)', { invoiceId: invoice.id, hasSettings: !!settings })
      results.skipped++; continue
    }
    if (!invoice.client_email || !invoice.due_date || !invoice.invoice_number) {
      console.log('invoice-reminders cron: skipped (missing required field)', { invoiceId: invoice.id, hasClientEmail: !!invoice.client_email, dueDate: invoice.due_date, invoiceNumber: invoice.invoice_number })
      results.skipped++; continue
    }

    const match = determineStage(invoice.due_date, today, settings)
    if (!match) {
      console.log('invoice-reminders cron: skipped (no stage matches today)', { invoiceId: invoice.id, dueDate: invoice.due_date, today, settings })
      results.skipped++; continue
    }
    const { stage, daysOverdue } = match

    const { data: existingReminder } = await supabase
      .from('invoice_reminders')
      .select('id')
      .eq('invoice_id', invoice.id)
      .eq('stage', stage)
      .maybeSingle()
    if (existingReminder) {
      console.log('invoice-reminders cron: skipped (already sent this stage)', { invoiceId: invoice.id, stage })
      results.skipped++; continue
    }

    const logCtx = { invoiceId: invoice.id, stage, daysOverdue }

    try {
      const rateCard: InvoiceExportData['rateCard'] = {
        business_name: settings.business_name,
        business_address: settings.business_address,
        business_email: settings.business_email,
        logo_url: settings.logo_url,
        branding: settings.branding ?? EMPTY_BRANDING,
      }
      const breakdown = calculateInvoice(invoice.line_items ?? [], {
        discountType: invoice.discount_type ?? undefined,
        discountValue: invoice.discount_value ?? undefined,
        reverseCharge: invoice.reverse_charge,
      })
      const data: InvoiceExportData = { invoice, rateCard, breakdown }

      const { checkoutUrl } = await createInvoicePayment(supabase, data, baseUrl)

      let attachmentBuffer: Buffer | null = null
      if (invoice.pdf_url) {
        try {
          const res = await fetch(invoice.pdf_url)
          if (res.ok) attachmentBuffer = Buffer.from(await res.arrayBuffer())
        } catch {
          // Attachment is a nice-to-have here — the email's own Pay-now
          // button is the primary call to action. Don't fail the whole
          // reminder over a transient fetch of an already-existing file.
        }
      }

      const businessName = settings.business_name || 'Quotr'
      const l = pdfLabels(invoice.language)
      const { subject, body } = buildReminderEmail({
        stage,
        language: invoice.language,
        clientName: invoice.client_name,
        invoiceNumber: invoice.invoice_number,
        businessName,
        dueDate: invoice.due_date,
        daysOverdue,
      })

      await sendDocumentEmail({
        to: invoice.client_email,
        fromName: businessName,
        replyTo: settings.business_email,
        subject,
        bodyText: body,
        ...(attachmentBuffer ? { attachmentFilename: `${l.invoice.toLowerCase()}-${invoice.invoice_number}.pdf`, attachmentBuffer } : {}),
        paymentUrl: checkoutUrl,
        payNowLabel: l.payNow,
      })

      const { error: logError } = await supabase
        .from('invoice_reminders')
        .insert({ invoice_id: invoice.id, stage })
      if (logError) {
        // The email genuinely went out — logging it failing is a real
        // problem (risks a duplicate send tomorrow) but must not be
        // reported as a failed reminder, since it wasn't.
        console.error('invoice-reminders cron: reminder sent but logging it failed', { ...logCtx, error: logError })
      }

      console.log('invoice-reminders cron: reminder sent', logCtx)
      results.sent++
    } catch (err) {
      const message = err instanceof CreateInvoicePaymentError || err instanceof SendDocumentEmailError
        ? err.message
        : (err instanceof Error ? err.message : String(err))
      console.error('invoice-reminders cron: failed to send reminder', { ...logCtx, error: message })
      results.failed++
    }
  }

  console.log('invoice-reminders cron: run complete', results)
  return NextResponse.json({ ok: true, ...results })
}
