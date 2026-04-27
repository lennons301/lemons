'use client'

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
import { getGroupNames } from './group-utils'
import type { TodoItem } from '@/types/todos'
import type { Person } from '@/types/person'

interface GroupTabsProps {
  items: TodoItem[]
  persons: Person[]
  activeTab: string | null
  onActiveTabChange: (tab: string | null) => void
  onToggle: (item: TodoItem) => void
  onClick: (item: TodoItem) => void
  onDragEnd: (event: DragEndEvent) => void
}

export function GroupTabs({
  items,
  persons,
  activeTab,
  onActiveTabChange,
  onToggle,
  onClick,
  onDragEnd,
}: GroupTabsProps) {
  const groupNames = getGroupNames(items)
  const activeItems = items.filter((i) => (i.group_name ?? null) === activeTab)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  return (
    <div>
      <div className="flex gap-1 border-b mb-3 overflow-x-auto">
        {groupNames.map((name) => {
          const count = items.filter((i) => (i.group_name ?? null) === name).length
          return (
            <button
              key={name ?? '__ungrouped'}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === name
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onActiveTabChange(name)}
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
