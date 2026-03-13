'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, MoreVertical, Plus, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { TodoItemRow } from './todo-item-row'
import { TodoItemDialog } from './todo-item-dialog'
import { TodoListDialog } from './todo-list-dialog'
import type { TodoList, TodoItem, TodoPriority, TodoListType } from '@/types/todos'
import type { Person } from '@/types/person'

interface TodoDetailProps {
  list: TodoList & { todo_items: TodoItem[] }
  persons: Person[]
}

export function TodoDetail({ list: initialList, persons }: TodoDetailProps) {
  const router = useRouter()
  const [list, setList] = useState(initialList)
  const [items, setItems] = useState<TodoItem[]>(initialList.todo_items || [])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null)
  const [listDialogOpen, setListDialogOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const pendingItems = items.filter((i) => i.status !== 'completed')
  const completedItems = items.filter((i) => i.status === 'completed')

  const defaultAssignee = list.default_assigned_to
    ? persons.find((p) => p.id === list.default_assigned_to)
    : null
  const typeLabel = list.list_type.charAt(0).toUpperCase() + list.list_type.slice(1)
  const progress = `${completedItems.length}/${items.length} done`

  // DnD sensors — pointer for desktop, touch for mobile
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = pendingItems.findIndex((i) => i.id === active.id)
      const newIndex = pendingItems.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      // Reorder pending items
      const reordered = [...pendingItems]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)

      // Assign new sort_order values
      const updatedPending = reordered.map((item, idx) => ({ ...item, sort_order: idx }))
      // Keep completed items after pending, preserving their relative order
      const updatedCompleted = completedItems.map((item, idx) => ({
        ...item,
        sort_order: updatedPending.length + idx,
      }))

      const allUpdated = [...updatedPending, ...updatedCompleted]
      setItems(allUpdated)

      // Persist the reorder
      fetch(`/api/todos/${list.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: updatedPending.map((i) => ({ id: i.id, sort_order: i.sort_order })),
        }),
      })
    },
    [pendingItems, completedItems, list.id]
  )

  // Quick add
  const handleQuickAdd = async () => {
    if (!newTaskTitle.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/todos/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle.trim() }),
      })
      if (res.ok) {
        const created = await res.json()
        setItems((prev) => [...prev, created])
        setNewTaskTitle('')
      } else {
        toast.error('Failed to add task')
      }
    } finally {
      setAdding(false)
    }
  }

  // Toggle status
  const handleToggle = async (item: TodoItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed'
    const previousItems = items
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null } : i))
    )
    try {
      const res = await fetch(`/api/todos/${list.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        setItems(previousItems)
        toast.error('Failed to update task')
      }
    } catch {
      setItems(previousItems)
      toast.error('Failed to update task')
    }
  }

  // Edit task
  const handleSaveItem = async (data: {
    title: string
    description: string | null
    priority: TodoPriority
    due_date: string | null
    assigned_to: string | null
  }) => {
    if (!editingItem) return
    const res = await fetch(`/api/todos/${list.id}/items/${editingItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updated : i)))
    } else {
      toast.error('Failed to save task')
    }
  }

  // Delete task
  const handleDeleteItem = async (id: string) => {
    const res = await fetch(`/api/todos/${list.id}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      toast.error('Failed to delete task')
    }
  }

  // List actions
  const handleEditList = async (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
  }) => {
    // Strip list_type — not mutable after creation
    const { list_type: _, ...updateData } = data
    const res = await fetch(`/api/todos/${list.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    })
    if (res.ok) {
      const updated = await res.json()
      setList(updated)
    }
  }

  const handlePin = async () => {
    const res = await fetch(`/api/todos/${list.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !list.pinned }),
    })
    if (res.ok) setList((prev) => ({ ...prev, pinned: !prev.pinned }))
  }

  const handleArchive = async () => {
    const res = await fetch(`/api/todos/${list.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
    if (res.ok) {
      router.push('/todos')
      router.refresh()
    }
  }

  const handleDeleteList = async () => {
    if (!confirm('Delete this list and all its tasks?')) return
    const res = await fetch(`/api/todos/${list.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/todos')
      router.refresh()
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/todos">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {list.color && (
              <div className="w-1 h-6 rounded" style={{ background: list.color }} />
            )}
            <h1 className="text-xl font-bold truncate">{list.title}</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {typeLabel}
            {defaultAssignee ? ` · ${defaultAssignee.display_name}` : ''}
            {' · '}{progress}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setListDialogOpen(true)}>Edit list</DropdownMenuItem>
            <DropdownMenuItem onClick={handlePin}>
              {list.pinned ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchive}>Archive</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={handleDeleteList}>
              Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quick add */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a task..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
        />
        <Button onClick={handleQuickAdd} disabled={adding || !newTaskTitle.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Pending tasks */}
      <div>
        {pendingItems.length === 0 && completedItems.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">No tasks yet</p>
        )}
        {pendingItems.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={pendingItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="border rounded-lg overflow-hidden">
                {pendingItems.map((item) => (
                  <TodoItemRow
                    key={item.id}
                    item={item}
                    persons={persons}
                    onToggle={handleToggle}
                    onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Completed tasks (collapsible) */}
      {completedItems.length > 0 && (
        <div>
          <button
            className="text-xs font-medium text-muted-foreground uppercase mb-1 hover:text-foreground"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            {showCompleted ? '▾' : '▸'} Completed ({completedItems.length})
          </button>
          {showCompleted && (
            <div className="border rounded-lg overflow-hidden">
              {completedItems.map((item) => (
                <TodoItemRow
                  key={item.id}
                  item={item}
                  persons={persons}
                  onToggle={handleToggle}
                  onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task edit dialog */}
      <TodoItemDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={editingItem}
        persons={persons}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
      />

      {/* List edit dialog */}
      <TodoListDialog
        open={listDialogOpen}
        onOpenChange={setListDialogOpen}
        list={list}
        persons={persons}
        onSave={handleEditList}
      />
    </div>
  )
}
