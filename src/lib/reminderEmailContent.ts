/**
 * Deterministic (NOT AI-generated) subject + body text for the 4 automated
 * reminder stages. Reminders are sent unattended by the cron job with no
 * human review step — unlike the manual "Draft email" flow (AI-drafted,
 * contractor reviews/edits before sending), there is no one to catch a
 * bad AI output here. A fixed, predictable template is the safer choice,
 * and it trivially satisfies the standing rule that prose never restates
 * numbers: these templates literally don't have a token for an amount —
 * the total only ever appears via the attached PDF and the deterministic
 * Pay-now button (see sendDocumentEmail's paymentUrl option), never in text.
 */
import { pdfLabels } from '@/lib/pdf/pdfLabels'
import { formatDate } from '@/lib/formatDate'
import type { Locale } from '@/i18n/config'

export type ReminderStage = 'before_due' | 'due' | 'overdue_1' | 'overdue_2'

export interface ReminderEmailInput {
  stage:          ReminderStage
  language:       Locale
  clientName:     string
  invoiceNumber:  string
  businessName:   string
  dueDate:        string   // ISO date
  daysOverdue?:   number   // only meaningful for overdue_1 / overdue_2
}

export interface ReminderEmailContent {
  subject: string
  body: string
}

const STRINGS: Record<Locale, {
  subjectPrefix: string
  beforeDue: (dueDate: string) => string
  due: () => string
  overdue1: (days: number) => string
  overdue2: (days: number) => string
  closing: string
}> = {
  nl: {
    subjectPrefix: 'Herinnering: factuur',
    beforeDue: dueDate => `Dit is een vriendelijke herinnering dat onderstaande factuur vervalt op ${dueDate}. De factuur vind je in de bijlage, en je kunt direct online betalen via de knop hieronder.`,
    due: () => 'Dit is een vriendelijke herinnering dat onderstaande factuur vandaag vervalt. De factuur vind je in de bijlage, en je kunt direct online betalen via de knop hieronder.',
    overdue1: days => `Onderstaande factuur is inmiddels ${days} dagen te laat. Zou je deze op korte termijn willen voldoen? De factuur vind je in de bijlage, en je kunt direct online betalen via de knop hieronder.`,
    overdue2: days => `Onderstaande factuur is nu ${days} dagen te laat. We vragen je vriendelijk maar dringend om deze zo spoedig mogelijk te voldoen. De factuur vind je in de bijlage, en je kunt direct online betalen via de knop hieronder.`,
    closing: 'Heb je de factuur al voldaan of heb je vragen? Neem dan gerust contact op.',
  },
  en: {
    subjectPrefix: 'Reminder: invoice',
    beforeDue: dueDate => `This is a friendly reminder that the invoice below is due on ${dueDate}. You'll find the invoice attached, and you can pay online right away using the button below.`,
    due: () => 'This is a friendly reminder that the invoice below is due today. You\'ll find the invoice attached, and you can pay online right away using the button below.',
    overdue1: days => `The invoice below is now ${days} days overdue. Could you settle it at your earliest convenience? You'll find the invoice attached, and you can pay online right away using the button below.`,
    overdue2: days => `The invoice below is now ${days} days overdue. We'd kindly but urgently ask you to settle it as soon as possible. You'll find the invoice attached, and you can pay online right away using the button below.`,
    closing: 'Already paid, or have a question? Feel free to get in touch.',
  },
}

export function buildReminderEmail(input: ReminderEmailInput): ReminderEmailContent {
  const l = pdfLabels(input.language)
  const s = STRINGS[input.language]
  const dueDateFormatted = formatDate(input.dueDate, input.language)

  const subject = `${s.subjectPrefix} ${input.invoiceNumber} — ${input.businessName}`

  let mainLine: string
  switch (input.stage) {
    case 'before_due': mainLine = s.beforeDue(dueDateFormatted); break
    case 'due':         mainLine = s.due(); break
    case 'overdue_1':   mainLine = s.overdue1(input.daysOverdue ?? 0); break
    case 'overdue_2':   mainLine = s.overdue2(input.daysOverdue ?? 0); break
  }

  const body = [
    `${l.dear} ${input.clientName},`,
    mainLine,
    `${l.invoiceNumber}: ${input.invoiceNumber}\n${l.dueDate}: ${dueDateFormatted}`,
    s.closing,
    input.businessName,
  ].join('\n\n')

  return { subject, body }
}
