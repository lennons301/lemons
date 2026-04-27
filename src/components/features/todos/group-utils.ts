import type { TodoItem } from '@/types/todos'

export function getGroupNames(items: TodoItem[]): (string | null)[] {
  const seen = new Map<string | null, number>()
  for (const item of items) {
    const key = item.group_name ?? null
    if (!seen.has(key)) {
      seen.set(key, item.sort_order)
    } else {
      seen.set(key, Math.min(seen.get(key)!, item.sort_order))
    }
  }
  return Array.from(seen.entries())
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name)
}
