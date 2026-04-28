'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ListTodo, X } from 'lucide-react'
import type { TodoList } from '@/types/todos'

interface AttachListControlProps {
  householdId: string
  eventId: string | null
  currentListId: string | null
  onChange: (mode: 'none' | 'existing' | 'template' | 'new', listId: string | null) => void
}

export function AttachListControl({ householdId, eventId, currentListId, onChange }: AttachListControlProps) {
  const [lists, setLists] = useState<TodoList[]>([])
  const [templates, setTemplates] = useState<TodoList[]>([])
  const [mode, setMode] = useState<'none' | 'existing' | 'template' | 'new'>('none')
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/todos?householdId=${householdId}`).then((r) => r.json()),
      fetch(`/api/todos?householdId=${householdId}&templates=true`).then((r) => r.json()),
    ]).then(([listsData, templatesData]) => {
      setLists((listsData || []).filter((l: any) => !l.event_id || l.event_id === eventId))
      setTemplates(templatesData || [])
    })
  }, [householdId, eventId])

  if (currentListId) {
    const linked = lists.find((l) => l.id === currentListId)
    return (
      <div className="space-y-2">
        <Label>Linked List</Label>
        <div className="flex items-center gap-2 text-sm">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <span>{linked?.title ?? 'Linked list'}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 sm:h-6 sm:w-6"
            onClick={() => onChange('none', null)}
            title="Detach list"
          >
            <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label>Attach List</Label>
      <Select value={mode} onValueChange={(v) => {
        const m = v as 'none' | 'existing' | 'template' | 'new'
        setMode(m)
        setSelectedId('')
        if (m === 'new') onChange('new', null)
        else if (m === 'none') onChange('none', null)
      }}>
        <SelectTrigger>
          <SelectValue placeholder="No list" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No list</SelectItem>
          <SelectItem value="new">Create new list</SelectItem>
          {templates.length > 0 && <SelectItem value="template">From template</SelectItem>}
          {lists.length > 0 && <SelectItem value="existing">Attach existing list</SelectItem>}
        </SelectContent>
      </Select>

      {mode === 'existing' && (
        <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); onChange('existing', v) }}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a list..." />
          </SelectTrigger>
          <SelectContent>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {mode === 'template' && (
        <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); onChange('template', v) }}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a template..." />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
