import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewInvoiceForm from './NewInvoiceForm'

export default async function NewInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: clients }, { data: rateCard }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, email, address')
      .eq('owner_id', user.id)
      .order('name'),
    supabase
      .from('rate_cards')
      .select('vat_percent, language, branding')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <NewInvoiceForm
      ownerId={user.id}
      existingClients={(clients ?? []) as { id: string; name: string; email: string | null; address: string | null }[]}
      vatPercent={rateCard?.vat_percent ?? 21}
      language={rateCard?.language ?? 'nl'}
      paymentTermsDays={rateCard?.branding?.paymentTermsDays ?? 30}
    />
  )
}
