import { DashboardView } from '@/components/features/dashboard/dashboard-view'
import { getWeekStart, getWeekRange, addDaysToIsoDate } from '@/lib/utils/calendar'
import { getPageContext } from '@/lib/supabase/queries'
import { getUserTimezone, todayInTimezone } from '@/lib/utils/timezone'

export default async function HomePage() {
  const { supabase, user, householdId, profile } = await getPageContext()

  const displayName = profile.display_name || user.email?.split('@')[0] || 'there'

  // Anchor "today" to the user's timezone so dashboard data matches their calendar.
  const tz = await getUserTimezone()
  const today = todayInTimezone(tz)
  // Noon-UTC anchor lets getWeekStart's day-of-week math line up with the user's date.
  const todayAnchor = new Date(`${today}T12:00:00Z`)
  const weekStart = getWeekStart(todayAnchor)
  const { start: weekStartIso, end: weekEndIso } = getWeekRange(weekStart)
  const threeDaysStr = addDaysToIsoDate(today, 3)

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

    // Meals this week
    supabase
      .from('meal_plan_entries')
      .select('*, recipes(id, title)')
      .eq('household_id', householdId)
      .gte('date', weekStartIso.split('T')[0])
      .lte('date', weekEndIso.split('T')[0]),

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
  const thirtyDaysStr = addDaysToIsoDate(today, -30)
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
