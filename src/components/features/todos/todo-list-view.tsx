'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { TodoListCard } from './todo-list-card'
import { TodoListDialog } from './todo-list-dialog'
import { MyTasksView } from './my-tasks-view'
import { TemplateSection } from './template-section'
import type { TodoListWithCounts, TodoListType } from '@/types/todos'
import type { Person } from '@/types/person'

interface TodoListViewProps {
  lists: TodoListWithCounts[]
  householdId: string
  persons: Person[]
}

type FilterType = 'all' | TodoListType | 'archived'

export function TodoListView({ lists: initialLists, householdId, persons }: TodoListViewProps) {
  const router = useRouter()
  const [lists, setLists] = useState(initialLists)
  const [filter, setFilter] = useState<FilterType>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'lists' | 'my-tasks'>('lists')

  const filteredLists = filter === 'all' || filter === 'archived'
    ? lists
    : lists.filter((l) => l.list_type === filter)

  const pinnedLists = filteredLists.filter((l) => l.pinned)
  const unpinnedLists = filteredLists.filter((l) => !l.pinned)

  const handleUnarchive = async (id: string) => {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    })
    if (res.ok) {
      setLists((prev) => prev.filter((l) => l.id !== id))
    } else {
      toast.error('Failed to unarchive list')
    }
  }

  const handleCreate = async (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
  }) => {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId, ...data }),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/todos/${created.id}`)
      router.refresh()
    } else {
      toast.error('Failed to create list')
    }
  }

  const handleFilterChange = (f: FilterType) => {
    setFilter(f)
    if (f === 'archived') {
      fetch(`/api/todos?householdId=${householdId}&archived=true`)
        .then((res) => res.json())
        .then((data) => setLists(data))
        .catch(() => {})
    } else if (filter === 'archived') {
      fetch(`/api/todos?householdId=${householdId}`)
        .then((res) => res.json())
        .then((data) => setLists(data))
        .catch(() => setLists(initialLists))
    }
  }

  const filters: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'general', label: 'General' },
    { value: 'checklist', label: 'Checklists' },
    { value: 'project', label: 'Projects' },
    { value: 'archived', label: 'Archived' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Todos</h1>
          <p className="text-sm text-muted-foreground">{lists.length} list{lists.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 border rounded-md p-0.5">
            <button
              className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'lists' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('lists')}
            >
              Lists
            </button>
            <button
              className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'my-tasks' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('my-tasks')}
            >
              My Tasks
            </button>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New List
        </Button>
      </div>

      {viewMode === 'my-tasks' ? (
        <MyTasksView householdId={householdId} persons={persons} />
      ) : (
        <>
          {/* Filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.value}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'border hover:bg-muted'
                }`}
                onClick={() => handleFilterChange(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Empty state */}
          {lists.length === 0 && filter !== 'archived' && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground text-lg">No todo lists yet.</p>
              <p className="text-muted-foreground text-sm mt-1">Create a list to get started.</p>
            </div>
          )}

          {filteredLists.length === 0 && lists.length > 0 && filter !== 'all' && (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No {filter === 'archived' ? 'archived' : filter} lists.</p>
            </div>
          )}

          {/* Pinned section */}
          {pinnedLists.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Pinned
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {pinnedLists.map((list) => (
                  <TodoListCard key={list.id} list={list} onUnarchive={filter === 'archived' ? handleUnarchive : undefined} />
                ))}
              </div>
            </div>
          )}

          {/* All lists */}
          {unpinnedLists.length > 0 && (
            <div>
              {pinnedLists.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  All Lists
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {unpinnedLists.map((list) => (
                  <TodoListCard key={list.id} list={list} onUnarchive={filter === 'archived' ? handleUnarchive : undefined} />
                ))}
              </div>
            </div>
          )}

          {/* Template section */}
          <TemplateSection householdId={householdId} onUseTemplate={() => {}} />

          {/* Create dialog */}
          <TodoListDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            list={null}
            persons={persons}
            onSave={handleCreate}
          />
        </>
      )}
    </div>
  )
}
