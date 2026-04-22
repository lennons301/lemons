import type { ToolContext, ToolResult } from '../types'

export interface GetCalendarEventsInput {
  from: string
  to: string
}

export interface CalendarEventOutput {
  id: string
  title: string
  start_datetime: string
  end_datetime: string | null
  all_day: boolean
  category: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function getCalendarEvents(
  ctx: ToolContext,
  input: GetCalendarEventsInput,
): Promise<ToolResult<CalendarEventOutput[] | { error: string }>> {
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
    return { content: { error: 'from and to must be YYYY-MM-DD' }, is_error: true }
  }

  const { data, error } = await ctx.supabase
    .from('calendar_events')
    .select('id, title, start_datetime, end_datetime, all_day, category')
    .eq('household_id', ctx.householdId)
    .gte('start_datetime', `${input.from}T00:00:00Z`)
    .lte('start_datetime', `${input.to}T23:59:59Z`)
    .order('start_datetime', { ascending: true })

  if (error) {
    return { content: { error: error.message }, is_error: true }
  }

  return {
    content: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      start_datetime: row.start_datetime,
      end_datetime: row.end_datetime,
      all_day: row.all_day,
      category: row.category,
    })),
  }
}
