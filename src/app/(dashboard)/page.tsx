import { DashboardView } from '@/components/features/dashboard/dashboard-view'
import { getWeekStart, getWeekRange } from '@/lib/utils/calendar'
import { getPageContext } from '@/lib/supabase/queries'

export default async function HomePage() {
  const { supabase, user, householdId, profile } = await getPageContext()

  const displayName = profile.display_name || user.email?.split('@')[0] || 'there'

  // Date computations
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const weekStart = getWeekStart(now)
  const { start: weekStartIso, end: weekEndIso } = getWeekRange(weekStart)
  const threeDaysFromNow = new Date(now)
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
  const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0]

  // Fetch all data in parallel
  const [eventsResult, listsResult, mealsResult, inventoryResult, memberResult] = await Promise.all([
    // Events this week
    supabase
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
    supabase
      .from('inventory_items')
      .select('*')
      .eq('household_id', householdId)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', threeDaysStr)
      .gte('expiry_date', today)
      .order('expiry_date', { ascending: true }),

    // Current user's person ID
    supabase
      .from('household_members')
      .select('id')
      .eq('household_id', householdId)
      .eq('profile_id', user.id)
      .single(),
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
    .flatMap((list) => list.todo_items || [])
    .filter((item) =>
      item.status !== 'completed' &&
      item.due_date &&
      item.due_date >= thirtyDaysStr &&
      item.due_date <= weekEndDate
    )

  const currentPersonId = memberResult.data?.id || null

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
