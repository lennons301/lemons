'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { getMemberBgClass } from '@/lib/utils/member-colors'
import { PRIORITY_COLORS } from '@/types/todos'
import type { TodoItem } from '@/types/todos'

interface Person {
  id: string
  display_name: string | null
}

interface TodoItemRowProps {
  item: TodoItem
  persons: Person[]
  onToggle: (item: TodoItem) => void
  onClick: (item: TodoItem) => void
}

function getDueBadge(dueDate: string | null, isCompleted: boolean): { label: string; className: string } | null {
  if (!dueDate || isCompleted) return null
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

export function TodoItemRow({ item, persons, onToggle, onClick }: TodoItemRowProps) {
  const priorityColor = PRIORITY_COLORS[item.priority]
  const dueBadge = getDueBadge(item.due_date, item.status === 'completed')
  const assignee = item.assigned_to ? persons.find((p) => p.id === item.assigned_to) : null
  const isCompleted = item.status === 'completed'

  return (
    <div
      className={`flex items-center gap-2.5 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer ${isCompleted ? 'opacity-40' : ''}`}
      style={{ borderLeftWidth: priorityColor ? 3 : 0, borderLeftColor: priorityColor ?? undefined }}
      onClick={() => onClick(item)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => onToggle(item)}
        />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${isCompleted ? 'line-through' : ''}`}>
          {item.title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {dueBadge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${dueBadge.className}`}>
            {dueBadge.label}
          </span>
        )}
        {assignee && (
          <div
            className={`w-5 h-5 rounded-full ${getMemberBgClass(assignee.id)} flex items-center justify-center text-[9px] font-semibold text-white`}
          >
            {(assignee.display_name || '?')[0].toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}
