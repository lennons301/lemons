'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { MyTasksItemRow } from './my-tasks-item-row'
import { TodoItemDialog } from './todo-item-dialog'
import type { MyTaskItem, TodoPriority } from '@/types/todos'
import type { Person } from '@/types/person'

interface MyTasksViewProps {
  householdId: string
  persons: Person[]
}

interface TimeBucket {
  label: string
  items: MyTaskItem[]
}

function bucketItems(items: MyTaskItem[]): TimeBucket[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const endOfWeek = new Date(today)
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
  const weekEndStr = endOfWeek.toISOString().split('T')[0]

  const buckets: Record<string, MyTaskItem[]> = {
    'Overdue': [],
    'Due today': [],
    'Due this week': [],
    'Due later': [],
    'No due date': [],
  }

  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }

  for (const item of items) {
    if (!item.due_date) {
      buckets['No due date'].push(item)
    } else if (item.due_date < todayStr) {
      buckets['Overdue'].push(item)
    } else if (item.due_date === todayStr) {
      buckets['Due today'].push(item)
    } else if (item.due_date <= weekEndStr) {
      buckets['Due this week'].push(item)
    } else {
      buckets['Due later'].push(item)
    }
  }

  for (const bucket of Object.values(buckets)) {
    bucket.sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4))
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

export function MyTasksView({ householdId, persons }: MyTasksViewProps) {
  const [items, setItems] = useState<MyTaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingItem, setEditingItem] = useState<MyTaskItem | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/todos/my-tasks?householdId=${householdId}`)
    if (res.ok) {
      setItems(await res.json())
    }
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleToggle = async (item: MyTaskItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed'
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      const res = await fetch(`/api/todos/${item.list_id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        fetchTasks()
        toast.error('Failed to update task')
      }
    } catch {
      fetchTasks()
      toast.error('Failed to update task')
    }
  }

  const handleSaveItem = async (data: {
    title: string
    description: string | null
    priority: TodoPriority
    due_date: string | null
    assigned_to: string | null
    group_name: string | null
  }) => {
    if (!editingItem) return
    const res = await fetch(`/api/todos/${editingItem.list_id}/items/${editingItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      fetchTasks()
    } else {
      toast.error('Failed to save task')
    }
  }

  const buckets = bucketItems(items)

  if (loading) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-lg">No tasks assigned to you.</p>
        <p className="text-muted-foreground text-sm mt-1">Tasks assigned to you across all lists will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {bucket.label} ({bucket.items.length})
          </p>
          <div className="border rounded-lg overflow-hidden">
            {bucket.items.map((item) => (
              <MyTasksItemRow
                key={item.id}
                item={item}
                persons={persons}
                onToggle={handleToggle}
                onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
              />
            ))}
          </div>
        </div>
      ))}

      <TodoItemDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={editingItem}
        persons={persons}
        onSave={handleSaveItem}
      />
    </div>
  )
}
