/**
 * Route handler for the manual "Generate wording" button on the quote page.
 * The actual Anthropic call + price-leak guard lives in
 * src/lib/generateWording.ts, shared with the auto-generate guard in
 * /api/quote/[id]/generate-pdf.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWording, WordingGenerationError } from '@/lib/generateWording'
import type { WordingLineItemInput, WordingRecurringConfigInput } from '@/lib/generateWording'

interface RequestBody {
  jobTitle:        string
  clientName:      string | null
  quoteType?:      'one_off' | 'recurring'
  lineItems?:      WordingLineItemInput[]
  recurringConfig?: WordingRecurringConfigInput | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  try {
    const result = await generateWording({
      jobTitle:        body.jobTitle,
      clientName:      body.clientName,
      quoteType:       body.quoteType === 'recurring' ? 'recurring' : 'one_off',
      lineItems:       body.lineItems,
      recurringConfig: body.recurringConfig,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof WordingGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('generate-wording: unexpected failure', err)
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }
}
