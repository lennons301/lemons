'use client'

import Link from 'next/link'
import { Checkbox } from '@/components/ui/checkbox'
import { PRIORITY_COLORS } from '@/types/todos'
import type { MyTaskItem } from '@/types/todos'
import type { Person } from '@/types/person'

interface MyTasksItemRowProps {
  item: MyTaskItem
  persons: Person[]
  onToggle: (item: MyTaskItem) => void
  onClick: (item: MyTaskItem) => void
}

function getDueBadge(dueDate: string | null): { label: string; className: string } | null {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate + 'T00:00:00')
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: 'overdue', className: 'bg-red-500/20 text-red-400' }
  if (diffDays === 0) return { label: 'today', className: 'bg-amber-500/20 text-amber-400' }
  if (diffDays === 1) return { label: 'tomorrow', className: 'bg-blue-500/10 text-blue-400' }
  return {
    label: new Date(dueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    className: 'text-muted-foreground',
  }
}

export function MyTasksItemRow({ item, persons, onToggle, onClick }: MyTasksItemRowProps) {
  const priorityColor = PRIORITY_COLORS[item.priority]
  const dueBadge = getDueBadge(item.due_date)

  return (
    <div
      className="flex items-center gap-2 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/50"
      style={{ borderLeftWidth: priorityColor ? 3 : 0, borderLeftColor: priorityColor ?? undefined }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={item.status === 'completed'}
          onCheckedChange={() => onToggle(item)}
        />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onClick(item)}>
        <span className="text-sm font-medium">{item.title}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Link
            href={`/todos/${item.list_id}`}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {item.list_color && (
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: item.list_color }} />
            )}
            {item.list_title}
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {dueBadge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${dueBadge.className}`}>
            {dueBadge.label}
          </span>
        )}
      </div>
    </div>
  )
}
