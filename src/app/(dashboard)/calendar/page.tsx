import { CalendarView } from '@/components/features/calendar/calendar-view'
import { getMonthRange } from '@/lib/utils/calendar'
import { getPageContext } from '@/lib/supabase/queries'

export default async function CalendarPage() {
  const { supabase, householdId } = await getPageContext()

  const now = new Date()
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth())

  const [eventsResult, personsResult] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .eq('household_id', householdId)
      .lt('start_datetime', end)
      .gt('end_datetime', start)
      .order('start_datetime', { ascending: true }),
    supabase
      .from('household_persons')
      .select('id, display_name')
      .eq('household_id', householdId),
  ])

  return (
    <CalendarView
      initialEvents={eventsResult.data || []}
      householdId={householdId}
      persons={personsResult.data || []}
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth()}
    />
  )
}
