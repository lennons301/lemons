'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { TodoItemRow } from './todo-item-row'
import type { TodoItem } from '@/types/todos'
import type { Person } from '@/types/person'

interface GroupSectionsProps {
  items: TodoItem[]
  persons: Person[]
  onToggle: (item: TodoItem) => void
  onClick: (item: TodoItem) => void
  onDragEnd: (event: DragEndEvent) => void
}

function groupItems(items: TodoItem[]): { name: string | null; items: TodoItem[] }[] {
  const groups = new Map<string | null, TodoItem[]>()
  for (const item of items) {
    const key = item.group_name ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  return Array.from(groups.entries())
    .sort(([, a], [, b]) => (a[0]?.sort_order ?? 0) - (b[0]?.sort_order ?? 0))
    .map(([name, items]) => ({ name, items }))
}

export function GroupSections({ items, persons, onToggle, onClick, onDragEnd }: GroupSectionsProps) {
  const groups = groupItems(items)
  const [collapsed, setCollapsed] = useState<Set<string | null>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const toggleCollapse = (groupName: string | null) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <div className="space-y-3">
        {groups.map((group) => {
          const label = group.name ?? 'Ungrouped'
          const isCollapsed = collapsed.has(group.name)
          return (
            <div key={group.name ?? '__ungrouped'}>
              <button
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 hover:text-foreground"
                onClick={() => toggleCollapse(group.name)}
              >
                {isCollapsed ? '▸' : '▾'} {label} ({group.items.length})
              </button>
              {!isCollapsed && (
                <SortableContext
                  items={group.items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="border rounded-lg overflow-hidden">
                    {group.items.map((item) => (
                      <TodoItemRow
                        key={item.id}
                        item={item}
                        persons={persons}
                        onToggle={onToggle}
                        onClick={onClick}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          )
        })}
      </div>
    </DndContext>
  )
}
