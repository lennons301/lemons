'use client'

import { useState, useEffect, useMemo } from 'react'
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

interface GroupTabsProps {
  items: TodoItem[]
  persons: Person[]
  onToggle: (item: TodoItem) => void
  onClick: (item: TodoItem) => void
  onDragEnd: (event: DragEndEvent) => void
}

function getGroupNames(items: TodoItem[]): (string | null)[] {
  const seen = new Map<string | null, number>()
  for (const item of items) {
    if (!seen.has(item.group_name)) {
      seen.set(item.group_name, item.sort_order)
    } else {
      seen.set(item.group_name, Math.min(seen.get(item.group_name)!, item.sort_order))
    }
  }
  return Array.from(seen.entries())
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name)
}

export function GroupTabs({ items, persons, onToggle, onClick, onDragEnd }: GroupTabsProps) {
  const groupNames = useMemo(() => getGroupNames(items), [items])
  const [activeTab, setActiveTab] = useState<string | null>(groupNames[0] ?? null)

  useEffect(() => {
    if (!groupNames.includes(activeTab)) {
      setActiveTab(groupNames[0] ?? null)
    }
  }, [groupNames, activeTab])

  const activeItems = items.filter((i) => i.group_name === activeTab)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  return (
    <div>
      <div className="flex gap-1 border-b mb-3 overflow-x-auto">
        {groupNames.map((name) => {
          const count = items.filter((i) => i.group_name === name).length
          return (
            <button
              key={name ?? '__ungrouped'}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === name
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(name)}
            >
              {name ?? 'Ungrouped'} ({count})
            </button>
          )
        })}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={activeItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="border rounded-lg overflow-hidden">
            {activeItems.length === 0 && (
              <p className="text-muted-foreground text-sm py-6 text-center">No items in this group</p>
            )}
            {activeItems.map((item) => (
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
      </DndContext>
    </div>
  )
}
