'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Loader2, Trash2 } from 'lucide-react'
import { PRIORITIES } from '@/types/todos'
import type { TodoItem, TodoPriority } from '@/types/todos'
import type { Person } from '@/types/person'

interface TodoItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: TodoItem | null
  persons: Person[]
  onSave: (data: {
    title: string
    description: string | null
    priority: TodoPriority
    due_date: string | null
    assigned_to: string | null
    group_name: string | null
  }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function TodoItemDialog({
  open,
  onOpenChange,
  item,
  persons,
  onSave,
  onDelete,
}: TodoItemDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('none')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('none')
  const [groupName, setGroupName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open && item) {
      setTitle(item.title)
      setDescription(item.description || '')
      setPriority(item.priority)
      setDueDate(item.due_date || '')
      setAssignedTo(item.assigned_to || 'none')
      setGroupName(item.group_name || '')
    }
  }, [open, item])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
        assigned_to: assignedTo === 'none' ? null : assignedTo,
        group_name: groupName.trim() || null,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!item || !onDelete) return
    if (!confirm('Delete this task?')) return
    setDeleting(true)
    try {
      await onDelete(item.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TodoPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due Date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
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
          <div className="space-y-2">
            <Label htmlFor="task-group">Group</Label>
            <Input
              id="task-group"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Clothes, Toiletries"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {item && onDelete && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive mr-auto">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
