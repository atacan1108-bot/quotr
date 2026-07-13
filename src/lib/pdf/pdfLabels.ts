/**
 * Bilingual labels for anything driven by a QUOTE's own language
 * (jobs.language) — the built-in PDF designs (QuotePDF, ProposalPDF,
 * SignedQuotePDF), the DOCX export, the custom-template static-label
 * tokens, and the public share page's own static text.
 *
 * Deliberately NOT next-intl: quote language is a piece of DATA (a column
 * on the job) that has to flow through explicit function calls — PDF
 * rendering via @react-pdf/renderer isn't part of Next.js's request/RSC
 * tree, so there's no "current locale" to read from a cookie the way the
 * app's own UI does (see src/i18n/ + next-intl for that, a separate,
 * unrelated concern: the CONTRACTOR's own app language). A plain
 * Record<Locale, ...> keeps this simple, synchronous, and usable from
 * every one of those places the exact same way.
 */
import type { Locale } from '@/i18n/config'
import type { ItemType, RecurringRateType } from '@/lib/pricing'
import { effectiveHourlyRate, formatEuro } from '@/lib/pricing'

export interface PdfLabels {
  quoteFor:            string  // "Quote for" / "Offerte voor"
  aNoteFrom:            string // "A note from" / "Een bericht van"
  scopeOfWork:          string
  quoteBreakdown:       string
  description:          string
  type:                 string
  quantity:             string
  amount:               string
  client:               string
  workDescription:      string // "Werkzaamheden" / "Work"
  lineItems:            string // "Regelposten" / "Line items"
  subtotal:              string
  subtotalExclVat:       string
  vatPercent:            string // "VAT ({percent}%)" template, {percent} substituted by caller
  total:                 string
  totalInclVat:          string
  itemTypeLabour:        string
  itemTypeMaterial:      string
  itemTypeFixed:         string
  hourUnit:              string // compact "u"/"hr" column suffix
  unitUnit:              string // compact "st"/"unit" column suffix
  fixedPrice:            string
  markupSuffix:          string // "+15% markup" / "+15% opslag"
  viewAndAcceptOnline:   string
  generatedWith:         string // "Generated with Quotr · All prices in euro (€) · VAT {percent}%" template
  acceptedAndSigned:     string
  signedElectronicallyVia: string
  dayRate:               string
  hourlyRate:            string
  perDay:                string
  perOccurrence:         string
  pageOf:                string // "page {current} of {total}" template
  annexA:                string
  annexB:                string
  freqDaily:              string
  freqWeekly:             string
  freqMonthly:            string
  freqQuarterly:          string
  // Static-label tokens for custom-uploaded templates (SCALAR_TOKENS in
  // htmlTemplate.ts) — one template, resolved per job.language.
  quote:                 string // "Offerte" / "Quote"
  from:                  string // "Van" / "From"
  details:               string // "Gegevens" / "Details"
  quoteNumber:           string // "Offertenummer" / "Quote number"
  date:                  string // "Datum" / "Date"
  rate:                  string // "Tarief" / "Rate"
  termsAndConditions:    string // "Algemene voorwaarden" / "Terms and conditions"
  forApprovalContractor: string // "Voor akkoord — opdrachtnemer" / "For approval — contractor"
  forApprovalClient:     string // "Voor akkoord — opdrachtgever" / "For approval — client"
  signatureAndDate:      string // "Handtekening & datum" / "Signature & date"
  initials:              string // "Paraaf" / "Initials"
  page:                  string // "pagina" / "page"
  of:                    string // "van" / "of"
  dear:                  string // "Geachte" / "Dear" — salutation prefix before the client's name
  // Recurring-quote PERIOD TOTALS block (custom templates only — the
  // <!-- RECURRING_START/END --> region in htmlTemplate.ts). Column
  // headings for the day/week/month/year/contract-term summary table.
  periodTotalsTitle:     string // "Periodetotalen" / "Period totals"
  columnPerDay:          string // "Per dag" / "Per day"
  columnPerWeek:         string // "Per week" / "Per week"
  columnPerMonth:        string // "Per maand" / "Per month"
  columnPerYear:         string // "Per jaar" / "Per year"
  columnTotalContractTerm: string // "Totaal over contractduur" / "Total over contract term"
  contractBasisTemplate: string // "op basis van {days} dagen per week, {weeks} weken per jaar" — filled by contractBasisLabel()
  vatBasisExcl:          string // "Bedragen excl. BTW" / "Amounts excl. VAT"
  vatBasisIncl:          string // "Bedragen incl. BTW" / "Amounts incl. VAT"
  // Public share page (/quote/[token]) — this visitor has no logged-in
  // session, so there's no next-intl locale to read; these follow the
  // QUOTE's own language exclusively, same as the PDF.
  you:                   string // "jou" / "you" — fallback when no client name is known
  thisBusiness:          string // "Dit bedrijf" / "This business" — fallback business name
  validUntil:            string // "Geldig tot {date}" / "Valid until {date}"
  youAcceptedOn:         string // "Je hebt deze offerte geaccepteerd op {date}." / "You accepted this quote on {date}."
  downloadPdf:           string
  sentViaQuotr:          string
  termsAndConditionsShort: string // shorter public-page heading, e.g. "Terms & conditions" (ampersand form)
  notSetUpTitle:         string
  notSetUpBody:          string
  invalidLinkTitle:      string
  invalidLinkBody:       string
  declinedTitle:         string
  declinedBody:          string
  // Shown instead of declinedTitle/Body when THIS visitor is the one who
  // declined it (proposal.declined_at set) — declinedTitle/Body above stay
  // for the other case, the contractor withdrawing the quote themselves.
  declinedByYouTitle:    string
  declinedByYouBody:     string
  expiredTitle:          string
  expiredBody:           string // "This quote was valid until {date}. Ask the business that sent it for an updated quote."
  // Accept & sign panel (AcceptSignSection.tsx) — same public, no-session
  // page as above.
  acceptSignTitle:       string // "Accept & sign"
  acceptSignSubtitle:    string // "Sign below to accept this quote and its terms."
  drawSignature:         string
  typeSignature:         string
  yourFullName:          string
  namePlaceholder:       string // "Jane Doe" / "Jan Jansen"
  signatureLabel:        string
  typedSignaturePreview: string // "This typed name will appear as your signature"
  agreeToTerms:          string // "I accept this quote and its terms & conditions."
  submitting:            string
  acceptAndSign:         string // button label
  thankYouNotified:      string // "Thank you — {business} has been notified." — {business} interpolated by caller
  signedBy:              string // "Signed by {name}" — {name} interpolated by caller
  downloadSignedCopy:    string
  sessionExpiredRetry:   string
  somethingWentWrongRetry: string
  signatureLooksGood:    string
  signatureDrawPrompt:   string
  signatureClear:        string
  // Decline sub-flow — a subtle secondary action alongside Accept & sign,
  // in the same AcceptSignSection card.
  declineThisQuote:      string // subtle link text, e.g. "Decline this quote"
  declineConfirmTitle:   string // small heading shown once expanded
  declineReasonLabel:    string // optional textarea label
  declineReasonPlaceholder: string
  confirmDecline:        string // button label
  cancelDecline:         string // "Never mind" / back-out link
  decliningStatus:       string // shown on the button while submitting
  // Accept route (public, no session) — errors returned to the customer,
  // and the "share_token invalid" case that has no quote loaded yet.
  linkNotValid:          string // "This quote link isn't valid."
  invalidRequest:        string
  nameRequired:          string // "Please enter your name."
  signatureUnreadable:   string
  somethingWentWrong:    string
  noLongerAvailable:     string
  quoteExpiredShort:     string
  alreadyAcceptedCannotDecline: string // decline route error when accepted_at is already set
  // Contractor notification email (sent in the CONTRACTOR's own app
  // language, not the quote's language — see rate_cards.language).
  emailAcceptedSubject:  string // "{client} accepted your quote {quoteNumber}"
  emailAcceptedIntro:    string // "<strong>{client}</strong> just accepted and signed the quote for <strong>{job}</strong>."
  emailDeclinedSubject:  string // "{client} declined your quote {quoteNumber}"
  emailDeclinedIntro:    string // "<strong>{client}</strong> declined the quote for <strong>{job}</strong>."
  emailDeclineReasonLabel: string // "Reason given:"
  emailTimeLabel:        string
  emailViewInApp:        string // link text, "View in Quotr"
  emailTotalLabel:       string
  emailDownloadSignedPdf: string
  // Invoice-only labels (src/lib/pdf/invoiceTemplate.ts, invoice PDF/DOCX,
  // and the invoice list/detail UI). Additive — nothing above this line
  // is touched, so quote rendering is unaffected.
  invoice:               string // "Factuur" / "Invoice"
  invoiceNumber:         string // "Factuurnummer" / "Invoice number"
  invoiceDate:           string // "Factuurdatum" / "Invoice date"
  dueDate:               string // "Vervaldatum" / "Due date"
  paymentDetails:        string // "Betaalgegevens" / "Payment details"
  iban:                  string // "IBAN" (same in both languages)
  accountHolder:         string // "Ten name van" / "Account holder"
  paymentReference:      string // "Kenmerk" / "Reference"
  amountDue:             string // "Te betalen" / "Amount due"
  vatShort:              string // "BTW" / "VAT" — short column-header form
  vatBreakdownTitle:     string // "BTW-overzicht" / "VAT breakdown"
  discountLabel:         string // "Korting" / "Discount"
  reverseChargeNote:     string // "BTW verlegd naar de afnemer." / "VAT reverse-charged to the recipient."
  paidStamp:             string // "BETAALD" / "PAID"
  clientVatNumber:       string // "BTW-nummer klant" / "Client VAT number"
  clientKvkNumber:       string // "KvK-nummer klant" / "Client KvK number"
  statusDraft:           string
  statusSent:            string
  statusPaid:            string
  statusOverdue:         string
}

const NL: PdfLabels = {
  quoteFor:            'Offerte voor',
  aNoteFrom:            'Een bericht van',
  scopeOfWork:          'Werkomschrijving',
  quoteBreakdown:       'Prijsopbouw',
  description:          'Omschrijving',
  type:                 'Type',
  quantity:             'Aantal',
  amount:               'Bedrag',
  client:               'Klant',
  workDescription:      'Werkzaamheden',
  lineItems:            'Regelposten',
  subtotal:              'Subtotaal',
  subtotalExclVat:       'Subtotaal (excl. BTW)',
  vatPercent:            'BTW ({percent}%)',
  total:                 'Totaal',
  totalInclVat:          'Totaal incl. BTW',
  itemTypeLabour:        'Arbeid',
  itemTypeMaterial:      'Materiaal',
  itemTypeFixed:         'Vast',
  hourUnit:              'u',
  unitUnit:              'st',
  fixedPrice:            'Vaste prijs',
  markupSuffix:          'opslag',
  viewAndAcceptOnline:   'Bekijk en accepteer deze offerte online:',
  generatedWith:         'Gegenereerd met Quotr · Alle prijzen in euro (€) · BTW {percent}%',
  acceptedAndSigned:     'Geaccepteerd & ondertekend',
  signedElectronicallyVia: 'Elektronisch ondertekend via Quotr',
  dayRate:               'Dagtarief',
  hourlyRate:            'Uurtarief',
  perDay:                'per dag',
  perOccurrence:         'per keer',
  pageOf:                'pagina {current} van {total}',
  annexA:                'Bijlage A: werkafspraken',
  annexB:                'Bijlage B: werkprogramma',
  freqDaily:              'dagelijks',
  freqWeekly:             'wekelijks',
  freqMonthly:            'maandelijks',
  freqQuarterly:          'per kwartaal',
  quote:                 'Offerte',
  from:                  'Van',
  details:               'Gegevens',
  quoteNumber:           'Offertenummer',
  date:                  'Datum',
  rate:                  'Tarief',
  termsAndConditions:    'Algemene voorwaarden',
  forApprovalContractor: 'Voor akkoord — opdrachtnemer',
  forApprovalClient:     'Voor akkoord — opdrachtgever',
  signatureAndDate:      'Handtekening & datum',
  initials:              'Paraaf',
  page:                  'pagina',
  of:                    'van',
  dear:                  'Geachte',
  periodTotalsTitle:     'Periodetotalen',
  columnPerDay:          'Per dag',
  columnPerWeek:         'Per week',
  columnPerMonth:        'Per maand',
  columnPerYear:         'Per jaar',
  columnTotalContractTerm: 'Totaal over contractduur',
  contractBasisTemplate: 'op basis van {days} dagen per week, {weeks} weken per jaar',
  vatBasisExcl:          'Bedragen excl. BTW',
  vatBasisIncl:          'Bedragen incl. BTW',
  you:                   'jou',
  thisBusiness:          'Dit bedrijf',
  validUntil:            'Geldig tot {date}',
  youAcceptedOn:         'Je hebt deze offerte geaccepteerd op {date}.',
  downloadPdf:           'Download PDF',
  sentViaQuotr:          'Verzonden via Quotr',
  termsAndConditionsShort: 'Algemene voorwaarden',
  notSetUpTitle:         'Deze pagina is nog niet ingesteld',
  notSetUpBody:          'De eigenaar moet het delen van offertes nog afronden voordat deze link werkt.',
  invalidLinkTitle:      'Deze link is niet geldig',
  invalidLinkBody:       'De offerte is mogelijk verwijderd, of de link is niet goed gekopieerd. Vraag het bedrijf dat de link stuurde om een nieuwe.',
  declinedTitle:         'Deze offerte is niet meer beschikbaar',
  declinedBody:          'Het bedrijf dat deze offerte stuurde heeft hem ingetrokken. Neem rechtstreeks contact op bij vragen.',
  declinedByYouTitle:    'Je hebt deze offerte afgewezen',
  declinedByYouBody:     'Bedankt dat je het hebt laten weten. Heb je toch nog vragen? Neem gerust rechtstreeks contact op met het bedrijf.',
  expiredTitle:          'Deze offerte is verlopen',
  expiredBody:           'Deze offerte was geldig tot {date}. Vraag het bedrijf dat de offerte stuurde om een nieuwe.',
  acceptSignTitle:       'Akkoord & ondertekenen',
  acceptSignSubtitle:    'Onderteken hieronder om deze offerte en de voorwaarden te accepteren.',
  drawSignature:         'Handtekening tekenen',
  typeSignature:         'Handtekening typen',
  yourFullName:          'Je volledige naam',
  namePlaceholder:       'Jan Jansen',
  signatureLabel:        'Handtekening',
  typedSignaturePreview: 'Deze getypte naam verschijnt als je handtekening',
  agreeToTerms:          'Ik accepteer deze offerte en de bijbehorende voorwaarden.',
  submitting:            'Versturen…',
  acceptAndSign:         'Akkoord & ondertekenen',
  thankYouNotified:      'Bedankt — {business} is op de hoogte gebracht.',
  signedBy:              'Ondertekend door {name}',
  downloadSignedCopy:    'Download je ondertekende exemplaar',
  sessionExpiredRetry:   'Je sessie is mogelijk verlopen — ververs de pagina en probeer het opnieuw.',
  somethingWentWrongRetry: 'Er is iets misgegaan — probeer het opnieuw.',
  signatureLooksGood:    'Ziet er goed uit.',
  signatureDrawPrompt:   'Teken je handtekening hierboven',
  signatureClear:        'Wissen',
  declineThisQuote:      'Offerte afwijzen',
  declineConfirmTitle:   'Offerte afwijzen',
  declineReasonLabel:    'Reden (optioneel)',
  declineReasonPlaceholder: 'Laat weten waarom, als je wilt…',
  confirmDecline:        'Ja, afwijzen',
  cancelDecline:         'Toch niet',
  decliningStatus:       'Bezig…',
  linkNotValid:          'Deze offertelink is niet geldig.',
  invalidRequest:        'Ongeldig verzoek.',
  nameRequired:          'Vul je naam in.',
  signatureUnreadable:   'Die handtekening kon niet worden gelezen — probeer het opnieuw.',
  somethingWentWrong:    'Er is iets misgegaan — probeer het opnieuw.',
  noLongerAvailable:     'Deze offerte is niet meer beschikbaar.',
  quoteExpiredShort:     'Deze offerte is verlopen.',
  alreadyAcceptedCannotDecline: 'Deze offerte is al geaccepteerd en kan niet meer worden afgewezen.',
  emailAcceptedSubject:  '{client} heeft offerte {quoteNumber} geaccepteerd',
  emailAcceptedIntro:    '<strong>{client}</strong> heeft zojuist de offerte voor <strong>{job}</strong> geaccepteerd en ondertekend.',
  emailDeclinedSubject:  '{client} heeft offerte {quoteNumber} afgewezen',
  emailDeclinedIntro:    '<strong>{client}</strong> heeft de offerte voor <strong>{job}</strong> afgewezen.',
  emailDeclineReasonLabel: 'Opgegeven reden:',
  emailTimeLabel:        'Tijdstip:',
  emailViewInApp:        'Bekijk in Quotr',
  emailTotalLabel:       'Totaal:',
  emailDownloadSignedPdf: 'Download de ondertekende PDF',
  invoice:               'Factuur',
  invoiceNumber:         'Factuurnummer',
  invoiceDate:           'Factuurdatum',
  dueDate:               'Vervaldatum',
  paymentDetails:        'Betaalgegevens',
  iban:                  'IBAN',
  accountHolder:         'Ten name van',
  paymentReference:      'Kenmerk',
  amountDue:             'Te betalen',
  vatShort:              'BTW',
  vatBreakdownTitle:     'BTW-overzicht',
  discountLabel:         'Korting',
  reverseChargeNote:     'BTW verlegd naar de afnemer.',
  paidStamp:             'BETAALD',
  clientVatNumber:       'BTW-nummer klant',
  clientKvkNumber:       'KvK-nummer klant',
  statusDraft:           'Concept',
  statusSent:            'Verzonden',
  statusPaid:            'Betaald',
  statusOverdue:         'Te laat',
}

const EN: PdfLabels = {
  quoteFor:            'Quote for',
  aNoteFrom:            'A note from',
  scopeOfWork:          'Scope of work',
  quoteBreakdown:       'Quote breakdown',
  description:          'Description',
  type:                 'Type',
  quantity:             'Quantity',
  amount:               'Amount',
  client:               'Client',
  workDescription:      'Work',
  lineItems:            'Line items',
  subtotal:              'Subtotal',
  subtotalExclVat:       'Subtotal (excl. VAT)',
  vatPercent:            'VAT ({percent}%)',
  total:                 'Total',
  totalInclVat:          'Total incl. VAT',
  itemTypeLabour:        'Labour',
  itemTypeMaterial:      'Material',
  itemTypeFixed:         'Fixed',
  hourUnit:              'hr',
  unitUnit:              'unit',
  fixedPrice:            'Fixed price',
  markupSuffix:          'markup',
  viewAndAcceptOnline:   'View and accept this quote online:',
  generatedWith:         'Generated with Quotr · All prices in euro (€) · VAT {percent}%',
  acceptedAndSigned:     'Accepted & signed',
  signedElectronicallyVia: 'Signed electronically via Quotr',
  dayRate:               'Daily rate',
  hourlyRate:            'Hourly rate',
  perDay:                'per day',
  perOccurrence:         'per occurrence',
  pageOf:                'page {current} of {total}',
  annexA:                'Annex A: terms of work',
  annexB:                'Annex B: work programme',
  freqDaily:              'daily',
  freqWeekly:             'weekly',
  freqMonthly:            'monthly',
  freqQuarterly:          'quarterly',
  quote:                 'Quote',
  from:                  'From',
  details:               'Details',
  quoteNumber:           'Quote number',
  date:                  'Date',
  rate:                  'Rate',
  termsAndConditions:    'Terms and conditions',
  forApprovalContractor: 'For approval — contractor',
  forApprovalClient:     'For approval — client',
  signatureAndDate:      'Signature & date',
  initials:              'Initials',
  page:                  'page',
  of:                    'of',
  dear:                  'Dear',
  periodTotalsTitle:     'Period totals',
  columnPerDay:          'Per day',
  columnPerWeek:         'Per week',
  columnPerMonth:        'Per month',
  columnPerYear:         'Per year',
  columnTotalContractTerm: 'Total over contract term',
  contractBasisTemplate: 'based on {days} days per week, {weeks} weeks per year',
  vatBasisExcl:          'Amounts excl. VAT',
  vatBasisIncl:          'Amounts incl. VAT',
  you:                   'you',
  thisBusiness:          'This business',
  validUntil:            'Valid until {date}',
  youAcceptedOn:         'You accepted this quote on {date}.',
  downloadPdf:           'Download PDF',
  sentViaQuotr:          'Sent via Quotr',
  termsAndConditionsShort: 'Terms & conditions',
  notSetUpTitle:         'This page isn’t set up yet',
  notSetUpBody:          'The site owner needs to finish setting up sharing before this link will work.',
  invalidLinkTitle:      'This link isn’t valid',
  invalidLinkBody:       'The quote may have been removed, or the link was copied incorrectly. Ask the business that sent it for a new link.',
  declinedTitle:         'This quote is no longer available',
  declinedBody:          'The business that sent this quote has withdrawn it. Get in touch with them directly if you have questions.',
  declinedByYouTitle:    'You declined this quote',
  declinedByYouBody:     'Thanks for letting us know. If you still have questions, feel free to contact the business directly.',
  expiredTitle:          'This quote has expired',
  expiredBody:           'This quote was valid until {date}. Ask the business that sent it for an updated quote.',
  acceptSignTitle:       'Accept & sign',
  acceptSignSubtitle:    'Sign below to accept this quote and its terms.',
  drawSignature:         'Draw signature',
  typeSignature:         'Type signature',
  yourFullName:          'Your full name',
  namePlaceholder:       'Jane Doe',
  signatureLabel:        'Signature',
  typedSignaturePreview: 'This typed name will appear as your signature',
  agreeToTerms:          'I accept this quote and its terms & conditions.',
  submitting:            'Submitting…',
  acceptAndSign:         'Accept & Sign',
  thankYouNotified:      'Thank you — {business} has been notified.',
  signedBy:              'Signed by {name}',
  downloadSignedCopy:    'Download your signed copy',
  sessionExpiredRetry:   'Your session may have expired — please refresh the page and try again.',
  somethingWentWrongRetry: 'Something went wrong — please try again.',
  signatureLooksGood:    'Looks good.',
  signatureDrawPrompt:   'Draw your signature above',
  signatureClear:        'Clear',
  declineThisQuote:      'Decline this quote',
  declineConfirmTitle:   'Decline this quote',
  declineReasonLabel:    'Reason (optional)',
  declineReasonPlaceholder: 'Let them know why, if you\'d like…',
  confirmDecline:        'Yes, decline',
  cancelDecline:         'Never mind',
  decliningStatus:       'Submitting…',
  linkNotValid:          'This quote link isn\'t valid.',
  invalidRequest:        'Invalid request.',
  nameRequired:          'Please enter your name.',
  signatureUnreadable:   'That signature couldn\'t be read — please try again.',
  somethingWentWrong:    'Something went wrong — please try again.',
  noLongerAvailable:     'This quote is no longer available.',
  quoteExpiredShort:     'This quote has expired.',
  alreadyAcceptedCannotDecline: 'This quote has already been accepted and can no longer be declined.',
  emailAcceptedSubject:  '{client} accepted quote {quoteNumber}',
  emailAcceptedIntro:    '<strong>{client}</strong> just accepted and signed the quote for <strong>{job}</strong>.',
  emailDeclinedSubject:  '{client} declined quote {quoteNumber}',
  emailDeclinedIntro:    '<strong>{client}</strong> declined the quote for <strong>{job}</strong>.',
  emailDeclineReasonLabel: 'Reason given:',
  emailTimeLabel:        'Time:',
  emailViewInApp:        'View in Quotr',
  emailTotalLabel:       'Total:',
  emailDownloadSignedPdf: 'Download the signed PDF',
  invoice:               'Invoice',
  invoiceNumber:         'Invoice number',
  invoiceDate:           'Invoice date',
  dueDate:               'Due date',
  paymentDetails:        'Payment details',
  iban:                  'IBAN',
  accountHolder:         'Account holder',
  paymentReference:      'Reference',
  amountDue:             'Amount due',
  vatShort:              'VAT',
  vatBreakdownTitle:     'VAT breakdown',
  discountLabel:         'Discount',
  reverseChargeNote:     'VAT reverse-charged to the recipient.',
  paidStamp:             'PAID',
  clientVatNumber:       'Client VAT number',
  clientKvkNumber:       'Client KvK number',
  statusDraft:           'Draft',
  statusSent:            'Sent',
  statusPaid:            'Paid',
  statusOverdue:         'Overdue',
}

const DICTIONARIES: Record<Locale, PdfLabels> = { nl: NL, en: EN }

export function pdfLabels(locale: Locale): PdfLabels {
  return DICTIONARIES[locale] ?? NL
}

/** {{template with placeholders}} → substituted string. Tiny — these are
 * fixed single-placeholder chrome strings, not full ICU pluralization. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''))
}

export function vatLabel(locale: Locale, percent: number): string {
  return fill(pdfLabels(locale).vatPercent, { percent })
}

export function generatedWithLabel(locale: Locale, percent: number): string {
  return fill(pdfLabels(locale).generatedWith, { percent })
}

export function pageOfLabel(locale: Locale, current: number, total: number): string {
  return fill(pdfLabels(locale).pageOf, { current, total })
}

export function contractBasisLabel(locale: Locale, days: number, weeks: number): string {
  return fill(pdfLabels(locale).contractBasisTemplate, { days, weeks })
}

export function vatBasisLabel(locale: Locale, excludingVat: boolean): string {
  const l = pdfLabels(locale)
  return excludingVat ? l.vatBasisExcl : l.vatBasisIncl
}

export function validUntilLabel(locale: Locale, date: string): string {
  return fill(pdfLabels(locale).validUntil, { date })
}

export function youAcceptedOnLabel(locale: Locale, date: string): string {
  return fill(pdfLabels(locale).youAcceptedOn, { date })
}

export function expiredBodyLabel(locale: Locale, date: string): string {
  return fill(pdfLabels(locale).expiredBody, { date })
}

export function thankYouNotifiedLabel(locale: Locale, business: string): string {
  return fill(pdfLabels(locale).thankYouNotified, { business })
}

export function signedByLabel(locale: Locale, name: string): string {
  return fill(pdfLabels(locale).signedBy, { name })
}

export function emailAcceptedSubjectLabel(locale: Locale, client: string, quoteNumber: string): string {
  return fill(pdfLabels(locale).emailAcceptedSubject, { client, quoteNumber })
}

/** client/job are already HTML-escaped by the caller before this fills them
 * into the fixed <strong> markup baked into the template string. */
export function emailAcceptedIntroLabel(locale: Locale, client: string, job: string): string {
  return fill(pdfLabels(locale).emailAcceptedIntro, { client, job })
}

export function emailDeclinedSubjectLabel(locale: Locale, client: string, quoteNumber: string): string {
  return fill(pdfLabels(locale).emailDeclinedSubject, { client, quoteNumber })
}

/** client/job are already HTML-escaped by the caller before this fills them
 * into the fixed <strong> markup baked into the template string. */
export function emailDeclinedIntroLabel(locale: Locale, client: string, job: string): string {
  return fill(pdfLabels(locale).emailDeclinedIntro, { client, job })
}

/** Same formatting the one-off item quantity column has always used
 * ("4 hours of labour" / "2 units" / "Fixed price"), now bilingual. */
export function typeMeta(locale: Locale, type: ItemType, qty: number): string {
  const l = pdfLabels(locale)
  if (type === 'labour') {
    return locale === 'nl'
      ? `${qty} ${qty === 1 ? 'uur' : 'uur'} arbeid`
      : `${qty} ${qty === 1 ? 'hour' : 'hours'} of labour`
  }
  if (type === 'material') {
    return locale === 'nl'
      ? `${qty} ${qty === 1 ? 'stuk' : 'stuks'}`
      : `${qty} ${qty === 1 ? 'unit' : 'units'}`
  }
  return l.fixedPrice
}

export function itemTypeLabel(locale: Locale, type: ItemType): string {
  const l = pdfLabels(locale)
  if (type === 'labour') return l.itemTypeLabour
  if (type === 'material') return l.itemTypeMaterial
  return l.itemTypeFixed
}

export function recurringRateLabel(locale: Locale, rateType: RecurringRateType): string {
  const l = pdfLabels(locale)
  if (rateType === 'day_rate') return l.dayRate
  if (rateType === 'hourly') return l.hourlyRate
  return l.itemTypeFixed
}

/** Bilingual version of pricing.ts's old English-only recurringRateItemText
 * — same money math (none here, formatting only), now locale-aware. */
export function recurringRateItemText(
  locale: Locale,
  rateType: RecurringRateType,
  quantity: number,
  unitCost: number,
): { quantityText: string; rateText: string } {
  const l = pdfLabels(locale)
  const hourWord = locale === 'nl' ? 'uur' : (quantity === 1 ? 'hour' : 'hours')
  switch (rateType) {
    case 'day_rate': {
      const perHour = effectiveHourlyRate(unitCost, quantity)
      const perDaySuffix = locale === 'nl' ? '/dag' : '/day'
      const perHourSuffix = locale === 'nl' ? '/uur' : '/hr'
      return {
        quantityText: quantity > 0 ? `${quantity} ${hourWord}/${locale === 'nl' ? 'dag' : 'day'}` : l.perDay,
        rateText: perHour != null
          ? `${formatEuro(unitCost)}${perDaySuffix} (${formatEuro(perHour)}${perHourSuffix})`
          : `${formatEuro(unitCost)}${perDaySuffix}`,
      }
    }
    case 'hourly': {
      const perHourSuffix = locale === 'nl' ? '/uur' : '/hr'
      return {
        quantityText: `${quantity} ${hourWord}`,
        rateText: `${formatEuro(unitCost)}${perHourSuffix}`,
      }
    }
    case 'fixed':
      return {
        quantityText: l.perOccurrence,
        rateText: formatEuro(unitCost),
      }
  }
}
