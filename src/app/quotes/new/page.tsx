import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DEFAULT_RATE_CARD } from '@/lib/types'
import NewQuoteForm from './NewQuoteForm'

export default async function NewQuotePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: clients }, { data: rateCard }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, phone')
      .eq('owner_id', user.id)
      .order('name'),
    supabase
      .from('rate_cards')
      .select('labour_rate_per_hour, material_markup_percent, vat_percent, day_rate, hours_per_day, weekend_surcharge_percent, holiday_surcharge_percent, extra_work_hourly_rate, prices_shown_excluding_vat')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <NewQuoteForm
      ownerId={user.id}
      existingClients={(clients ?? []) as { id: string; name: string; phone: string | null }[]}
      rateCard={rateCard ?? {
        labour_rate_per_hour:    DEFAULT_RATE_CARD.labour_rate_per_hour,
        material_markup_percent: DEFAULT_RATE_CARD.material_markup_percent,
        vat_percent:             DEFAULT_RATE_CARD.vat_percent,
        day_rate:                    DEFAULT_RATE_CARD.day_rate,
        hours_per_day:               DEFAULT_RATE_CARD.hours_per_day,
        weekend_surcharge_percent:   DEFAULT_RATE_CARD.weekend_surcharge_percent,
        holiday_surcharge_percent:   DEFAULT_RATE_CARD.holiday_surcharge_percent,
        extra_work_hourly_rate:      DEFAULT_RATE_CARD.extra_work_hourly_rate,
        prices_shown_excluding_vat:  DEFAULT_RATE_CARD.prices_shown_excluding_vat,
      }}
    />
  )
}
