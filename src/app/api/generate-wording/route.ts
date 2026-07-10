/**
 * Route handler for the manual "Generate wording" button on the quote page.
 * The actual Anthropic call + price-leak guard lives in
 * src/lib/generateWording.ts, shared with the auto-generate guard in
 * /api/quote/[id]/generate-pdf.
 */
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { generateWording, WordingGenerationError } from '@/lib/generateWording'
import type { WordingLineItemInput, WordingRecurringConfigInput } from '@/lib/generateWording'

interface RequestBody {
  jobId:           string
  jobTitle:        string
  clientName:      string | null
  quoteType?:      'one_off' | 'recurring'
  lineItems?:      WordingLineItemInput[]
  recurringConfig?: WordingRecurringConfigInput | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tErrors = await getTranslations('errors')
  if (!user) {
    return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: tErrors('invalidRequest') }, { status: 400 })
  }

  // The AI writes in the QUOTE's own language, not the logged-in
  // contractor's app language — look it up from the job itself, scoped to
  // this contractor so nobody can probe another owner's quote language.
  const { data: job } = await supabase
    .from('jobs')
    .select('language')
    .eq('id', body.jobId)
    .eq('owner_id', user.id)
    .single()
  if (!job) {
    return NextResponse.json({ error: tErrors('invalidRequest') }, { status: 404 })
  }

  try {
    const result = await generateWording({
      jobTitle:        body.jobTitle,
      clientName:      body.clientName,
      quoteType:       body.quoteType === 'recurring' ? 'recurring' : 'one_off',
      lineItems:       body.lineItems,
      recurringConfig: body.recurringConfig,
      language:        job.language,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof WordingGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('generate-wording: unexpected failure', err)
    return NextResponse.json({ error: tErrors('somethingWentWrong') }, { status: 500 })
  }
}
