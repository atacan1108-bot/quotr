import { redirect } from 'next/navigation'

// Old /dashboard URL — redirect to the new /quotes page in the app shell
export default function DashboardPage() {
  redirect('/quotes')
}
