import { CalendarView } from '@/components/features/calendar/calendar-view'
import { getMonthRange } from '@/lib/utils/calendar'
import { getPageContext } from '@/lib/supabase/queries'

export default async function CalendarPage() {
  const { supabase, householdId } = await getPageContext()

  // Fetch current month's events
  const now = new Date()
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth())

  const { data: events } = await supabase
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
