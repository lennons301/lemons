import { toLocalDateIso } from './calendar'

interface TodoItemForStats {
  status: string
  priority: string
  due_date: string | null
}

export interface ListStats {
  total_items: number
  completed_items: number
  overdue_count: number
  high_priority_count: number
  due_today_count: number
}

export function getListStats(items: TodoItemForStats[], today?: string): ListStats {
  const todayStr = today ?? toLocalDateIso(new Date())
  let completed = 0
  let overdue = 0
  let highPriority = 0
  let dueToday = 0

  for (const i of items) {
    const pending = i.status !== 'completed'
    if (!pending) {
      completed++
      continue
    }
    if (i.due_date && i.due_date < todayStr) overdue++
    if (i.due_date === todayStr) dueToday++
    if (i.priority === 'high' || i.priority === 'urgent') highPriority++
  }

  return {
    total_items: items.length,
    completed_items: completed,
    overdue_count: overdue,
    high_priority_count: highPriority,
    due_today_count: dueToday,
  }
}
