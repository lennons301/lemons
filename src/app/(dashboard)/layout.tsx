import { redirect } from 'next/navigation'
import { getCachedClient, getCachedProfile, getUserHouseholds } from '@/lib/supabase/queries'
import { HouseholdProvider } from '@/components/providers/household-provider'
import { Sidebar } from '@/components/features/navigation/sidebar'
import { MobileHeader } from '@/components/features/navigation/mobile-header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const layoutStart = performance.now()
  const { supabase, user } = await getCachedClient()
  console.log(`⏱ Layout getCachedClient: ${(performance.now() - layoutStart).toFixed(0)}ms`)

  if (!user) redirect('/login')

  // Parallel fetch: memberships + profile (profile uses React.cache, shared with getPageContext)
  const queryStart = performance.now()
  const [memberships, profile] = await Promise.all([
    getUserHouseholds(supabase, user.id),
    getCachedProfile(supabase, user.id),
  ])
  console.log(`⏱ Layout queries: ${(performance.now() - queryStart).toFixed(0)}ms`)
  console.log(`⏱ Layout total: ${(performance.now() - layoutStart).toFixed(0)}ms`)

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
