import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardView } from '@/components/features/dashboard/dashboard-view'
import { getWeekStart, getWeekRange } from '@/lib/utils/calendar'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id, display_name')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) redirect('/onboarding')

  const displayName = profile?.display_name || user.email?.split('@')[0] || 'there'

  // Date computations
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const weekStart = getWeekStart(now)
  const { start: weekStartIso, end: weekEndIso } = getWeekRange(weekStart)
  const threeDaysFromNow = new Date(now)
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
  const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0]

  // Fetch all data in parallel
  const [eventsResult, listsResult, mealsResult, inventoryResult] = await Promise.all([
    // Events this week
    (supabase as any)
      .from('calendar_events')
      .select('*')
      .eq('household_id', householdId)
      .lt('start_datetime', weekEndIso)
      .gt('end_datetime', weekStartIso)
      .order('start_datetime', { ascending: true }),

    // Todo lists with items (for tasks due)
    supabase
      .from('todo_lists')
      .select('*, todo_items(*)')
      .eq('household_id', householdId)
      .neq('list_type', 'shopping')
      .eq('archived', false),

    // Meals today
    supabase
      .from('meal_plan_entries')
      .select('*, recipes(id, title)')
      .eq('household_id', householdId)
      .eq('date', today),

    // Expiring inventory
    (supabase as any)
      .from('inventory_items')
      .select('*')
      .eq('household_id', householdId)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', threeDaysStr)
      .gte('expiry_date', today)
      .order('expiry_date', { ascending: true }),
  ])

  const events = eventsResult.data || []
  const meals = mealsResult.data || []
  const expiringItems = inventoryResult.data || []

  // Flatten tasks from lists
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0]
  const weekEndDate = weekEndIso.split('T')[0]

  const tasks = (listsResult.data || [])
    .flatMap((list: any) => list.todo_items || [])
    .filter((item: any) =>
      item.status !== 'completed' &&
      item.due_date &&
      item.due_date >= thirtyDaysStr &&
      item.due_date <= weekEndDate
    )

  // Find current user's person ID
  const { data: memberRow } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', householdId)
    .eq('profile_id', user.id)
    .single()

  const currentPersonId = memberRow?.id || null

  return (
    <DashboardView
      displayName={displayName}
      events={events}
      tasks={tasks}
      meals={meals}
      expiringItems={expiringItems}
      currentPersonId={currentPersonId}
    />
  )
}
