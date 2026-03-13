'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { AMALFI_COLORS, TODO_LIST_TYPES } from '@/types/todos'
import type { TodoList, TodoListType } from '@/types/todos'
import type { Person } from '@/types/person'

interface TodoListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  list: TodoList | null // null = creating
  persons: Person[]
  onSave: (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
  }) => Promise<void>
}

export function TodoListDialog({
  open,
  onOpenChange,
  list,
  persons,
  onSave,
}: TodoListDialogProps) {
  const [title, setTitle] = useState('')
  const [listType, setListType] = useState<TodoListType>('general')
  const [color, setColor] = useState<string | null>(null)
  const [defaultAssignee, setDefaultAssignee] = useState('none')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (list) {
        setTitle(list.title)
        setListType(list.list_type)
        setColor(list.color)
        setDefaultAssignee(list.default_assigned_to || 'none')
      } else {
        setTitle('')
        setListType('general')
        setColor(null)
        setDefaultAssignee('none')
      }
    }
  }, [open, list])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        list_type: listType,
        color,
        default_assigned_to: defaultAssignee === 'none' ? null : defaultAssignee,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{list ? 'Edit List' : 'New List'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="list-title">Title</Label>
            <Input
              id="list-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Chores"
              autoFocus
            />
          </div>

          {!list && (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={listType} onValueChange={(v) => setListType(v as TodoListType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TODO_LIST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className={`w-8 h-8 rounded-full border-2 ${color === null ? 'border-foreground' : 'border-transparent'}`}
                style={{ background: 'var(--muted)' }}
                onClick={() => setColor(null)}
                title="No color"
              />
              {AMALFI_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 ${color === c.hex ? 'border-foreground' : 'border-transparent'}`}
                  style={{ background: c.hex }}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Default Assignee</Label>
            <Select value={defaultAssignee} onValueChange={setDefaultAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {persons.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {list ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
