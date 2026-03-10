'use client'

import Link from 'next/link'
import { Pin } from 'lucide-react'
import type { TodoListWithCounts } from '@/types/todos'

interface TodoListCardProps {
  list: TodoListWithCounts
  onUnarchive?: (id: string) => void
}

export function TodoListCard({ list, onUnarchive }: TodoListCardProps) {
  const allDone = list.total_items > 0 && list.completed_items === list.total_items
  const typeLabel = list.list_type.charAt(0).toUpperCase() + list.list_type.slice(1)

  return (
    <Link href={`/todos/${list.id}`}>
      <div
        className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer"
        style={{ borderLeftWidth: list.color ? 4 : 1, borderLeftColor: list.color ?? undefined }}
      >
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{list.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {typeLabel} · {list.completed_items}/{list.total_items} done{allDone && list.total_items > 0 ? ' ✓' : ''}
            </div>
          </div>
          {list.pinned && (
            <Pin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          )}
        </div>
        {onUnarchive && (
          <button
            className="text-xs text-primary hover:underline mt-2"
            onClick={(e) => { e.preventDefault(); onUnarchive(list.id) }}
          >
            Unarchive
          </button>
        )}
        {(list.overdue_count > 0 || list.high_priority_count > 0 || list.due_today_count > 0) && (
          <div className="flex gap-3 mt-2 text-[11px] text-muted-foreground">
            {list.overdue_count > 0 && <span className="text-red-500">{list.overdue_count} overdue</span>}
            {list.high_priority_count > 0 && <span className="text-red-500">{list.high_priority_count} high</span>}
            {list.due_today_count > 0 && <span className="text-amber-500">{list.due_today_count} due today</span>}
          </div>
        )}
      </div>
    </Link>
  )
}
