import { redirect } from 'next/navigation'
import { getCachedClient, getCachedProfile, getUserHouseholds } from '@/lib/supabase/queries'
import { HouseholdProvider } from '@/components/providers/household-provider'
import { Sidebar } from '@/components/features/navigation/sidebar'
import { MobileHeader } from '@/components/features/navigation/mobile-header'
import { TimezoneSync } from '@/components/timezone-sync'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getCachedClient()

  if (!user) redirect('/login')

  // Parallel fetch: memberships + profile (profile uses React.cache, shared with getPageContext)
  const [memberships, profile] = await Promise.all([
    getUserHouseholds(supabase, user.id),
    getCachedProfile(supabase, user.id),
  ])

  if (!memberships || memberships.length === 0) {
    redirect('/onboarding')
  }

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
      <TimezoneSync />
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
