import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserHouseholds } from '@/lib/supabase/queries'
import { HouseholdProvider } from '@/components/providers/household-provider'
import { Sidebar } from '@/components/features/sidebar'
import { MobileHeader } from '@/components/features/mobile-header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const memberships = await getUserHouseholds(supabase, user.id)

  // No households — redirect to onboarding
  if (!memberships || memberships.length === 0) {
    redirect('/onboarding')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const households = memberships.map((m) => ({
    id: m.household_id,
    name: (m.households as unknown as { id: string; name: string })?.name ?? 'Unknown',
    role: m.role,
  }))

  return (
    <HouseholdProvider
      initialHouseholds={households}
      defaultHouseholdId={profile?.default_household_id ?? null}
    >
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <MobileHeader />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </HouseholdProvider>
  )
}
