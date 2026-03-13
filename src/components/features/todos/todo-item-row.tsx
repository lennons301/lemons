'use client'

import { forwardRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { getMemberBgClass } from '@/lib/utils/member-colors'
import { PRIORITY_COLORS } from '@/types/todos'
import type { TodoItem } from '@/types/todos'
import type { Person } from '@/types/person'

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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const priorityColor = PRIORITY_COLORS[item.priority]
  const dueBadge = getDueBadge(item.due_date, item.status === 'completed')
  const assignee = item.assigned_to ? persons.find((p) => p.id === item.assigned_to) : null
  const isCompleted = item.status === 'completed'

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftWidth: priorityColor ? 3 : 0,
    borderLeftColor: priorityColor ?? undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 py-2.5 px-1 pr-3 border-b last:border-b-0 hover:bg-muted/50 ${isDragging ? 'opacity-50 bg-muted z-10 relative shadow-md' : ''} ${isCompleted ? 'opacity-40' : ''}`}
    >
      <button
        className="touch-none shrink-0 p-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => onToggle(item)}
        />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onClick(item)}>
        <span className={`text-sm font-medium ${isCompleted ? 'line-through' : ''}`}>
          {item.title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 cursor-pointer" onClick={() => onClick(item)}>
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
