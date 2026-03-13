'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
import { EVENT_CATEGORIES, CATEGORY_COLORS } from '@/types/calendar'
import type { CalendarEvent, EventCategory } from '@/types/calendar'
import type { Person } from '@/types/person'

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null // null = creating
  defaultDate?: string // ISO date for pre-fill
  defaultTime?: string // HH:MM for pre-fill (week view click)
  defaultAllDay?: boolean
  persons: Person[]
  onSave: (data: {
    title: string
    description: string | null
    start_datetime: string
    end_datetime: string
    all_day: boolean
    location: string | null
    assigned_to: string[]
    category: EventCategory
  }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  defaultTime,
  defaultAllDay,
  persons,
  onSave,
  onDelete,
}: EventDialogProps) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<EventCategory>('custom')
  const [allDay, setAllDay] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('10:00')
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (event) {
      setTitle(event.title)
      setCategory(event.category)
      setAllDay(event.all_day)
      const start = new Date(event.start_datetime)
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
      setStartDate(startStr)
      setStartTime(start.toTimeString().slice(0, 5))
      const end = new Date(event.end_datetime)
      if (event.all_day) {
        // Exclusive end: subtract 1 day for display
        const displayEnd = new Date(end)
        displayEnd.setDate(displayEnd.getDate() - 1)
        const endStr = `${displayEnd.getFullYear()}-${String(displayEnd.getMonth() + 1).padStart(2, '0')}-${String(displayEnd.getDate()).padStart(2, '0')}`
        setEndDate(endStr === startStr ? '' : endStr)
      } else {
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
        setEndDate(endStr)
        setEndTime(end.toTimeString().slice(0, 5))
      }
      setAssignedTo(event.assigned_to || [])
      setLocation(event.location || '')
      setDescription(event.description || '')
    } else {
      setTitle('')
      setCategory('custom')
      setAllDay(defaultAllDay ?? true)
      setStartDate(defaultDate || new Date().toISOString().split('T')[0])
      setStartTime(defaultTime || '09:00')
      setEndDate('')
      setEndTime(defaultTime ? incrementHour(defaultTime) : '10:00')
      setAssignedTo([])
      setLocation('')
      setDescription('')
    }
  }, [open, event, defaultDate, defaultTime, defaultAllDay])

  function incrementHour(time: string): string {
    const [h, m] = time.split(':').map(Number)
    return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      let startDt: string
      let endDt: string

      if (allDay) {
        startDt = new Date(startDate + 'T00:00:00Z').toISOString()
        // Exclusive end: day after the end date (or day after start if no end date)
        const lastDay = endDate || startDate
        const endDay = new Date(lastDay + 'T00:00:00Z')
        endDay.setUTCDate(endDay.getUTCDate() + 1)
        endDt = endDay.toISOString()
      } else {
        startDt = new Date(`${startDate}T${startTime}`).toISOString()
        const ed = endDate || startDate
        endDt = new Date(`${ed}T${endTime}`).toISOString()
      }

      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        start_datetime: startDt,
        end_datetime: endDt,
        all_day: allDay,
        location: location.trim() || null,
        assigned_to: assignedTo,
        category,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!event || !onDelete) return
    if (!confirm('Delete this event?')) return
    setDeleting(true)
    try {
      await onDelete(event.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  const togglePerson = (personId: string) => {
    setAssignedTo((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{event ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dentist appointment"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as EventCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c.value] }} />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="all-day"
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            <Label htmlFor="all-day" className="font-normal">All day</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder={startDate}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>

          {persons.length > 0 && (
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <div className="flex gap-2 flex-wrap">
                {persons.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      assignedTo.includes(p.id)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                    onClick={() => togglePerson(p.id)}
                  >
                    {p.display_name || 'Unknown'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-desc">Description</Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {event && onDelete && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive mr-auto">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {event ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
