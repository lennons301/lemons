import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/features/calendar/calendar-view'
import { getMonthRange } from '@/lib/utils/calendar'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

  // Fetch current month's events
  const now = new Date()
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth())

  const { data: events } = await (supabase as any)
    .from('calendar_events')
    .select('*')
    .eq('household_id', householdId)
    .lt('start_datetime', end)
    .gt('end_datetime', start)
    .order('start_datetime', { ascending: true })

  // Fetch household persons for assignee picker
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name')
    .eq('household_id', householdId)

  return (
    <CalendarView
      initialEvents={events || []}
      householdId={householdId}
      persons={persons || []}
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth()}
    />
  )
}
