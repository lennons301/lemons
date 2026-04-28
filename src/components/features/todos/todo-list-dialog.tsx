'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogBody,
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
  householdId: string
  onSave: (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
    from_template_id?: string
  }) => Promise<void>
}

export function TodoListDialog({
  open,
  onOpenChange,
  list,
  persons,
  householdId,
  onSave,
}: TodoListDialogProps) {
  const [title, setTitle] = useState('')
  const [listType, setListType] = useState<TodoListType>('general')
  const [color, setColor] = useState<string | null>(null)
  const [defaultAssignee, setDefaultAssignee] = useState('none')
  const [saving, setSaving] = useState(false)
  const [fromTemplate, setFromTemplate] = useState(false)
  const [templates, setTemplates] = useState<TodoList[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

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
        setFromTemplate(false)
        setSelectedTemplateId('')
      }
    }
  }, [open, list])

  useEffect(() => {
    if (open && !list) {
      fetch(`/api/todos?householdId=${householdId}&templates=true`)
        .then((r) => r.json())
        .then((data) => setTemplates(data || []))
        .catch(() => {})
    }
  }, [open, list, householdId])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        list_type: listType,
        color,
        default_assigned_to: defaultAssignee === 'none' ? null : defaultAssignee,
        from_template_id: fromTemplate && selectedTemplateId ? selectedTemplateId : undefined,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" className="sm:max-w-md">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-2">
          <DialogTitle>{list ? 'Edit List' : 'New List'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4 px-4 pb-2 sm:px-6">
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

          {!list && templates.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="from-template"
                checked={fromTemplate}
                onCheckedChange={(checked) => { setFromTemplate(checked === true); setSelectedTemplateId('') }}
              />
              <Label htmlFor="from-template" className="font-normal">From template</Label>
            </div>
          )}

          {!list && fromTemplate && (
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
        </DialogBody>
        <DialogFooter className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6 border-t">
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {list ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
