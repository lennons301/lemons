'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Copy, Calendar } from 'lucide-react'
import { MealCell } from './meal-cell'
import { AddMealDialog } from './add-meal-dialog'
import { CopyWeekDialog } from './copy-week-dialog'
import { getWeekStart, getWeekDays, getOrderedDayNames, formatWeekLabel, shiftWeek, MEAL_TYPES, type MealType } from '@/lib/utils/week'
import type { Person } from '@/types/person'

interface WeeklyGridProps {
  householdId: string
  persons: Person[]
  weekStartDay?: number
}

export function WeeklyGrid({ householdId, persons, weekStartDay = 1 }: WeeklyGridProps) {
  const dayNames = getOrderedDayNames(weekStartDay)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date(), weekStartDay))
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addDialogDate, setAddDialogDate] = useState('')
  const [addDialogMealType, setAddDialogMealType] = useState<MealType>('dinner')
  const [editingEntry, setEditingEntry] = useState<any | null>(null)
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)

  const weekDays = getWeekDays(weekStart)
  const weekEnd = weekDays[6]

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/meal-plans?householdId=${householdId}&from=${weekDays[0]}&to=${weekEnd}`
      )
      if (res.ok) {
        const data = await res.json()
        setEntries(data)
      }
    } finally {
      setLoading(false)
    }
  }, [householdId, weekDays[0], weekEnd])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleAdd = (date: string, mealType: MealType) => {
    setEditingEntry(null)
    setAddDialogDate(date)
    setAddDialogMealType(mealType)
    setAddDialogOpen(true)
  }

  const handleEdit = (entry: any) => {
    setEditingEntry(entry)
    setAddDialogDate(entry.date)
    setAddDialogMealType(entry.meal_type)
    setAddDialogOpen(true)
  }

  const handleSave = async (data: {
    recipe_id?: string
    custom_name?: string
    servings: number
    assigned_to: string[]
    notes?: string
  }) => {
    if (editingEntry) {
      const res = await fetch(`/api/meal-plans/${editingEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update')
    } else {
      const res = await fetch('/api/meal-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          date: addDialogDate,
          meal_type: addDialogMealType,
          ...data,
        }),
      })
      if (!res.ok) throw new Error('Failed to create')
    }
    await fetchEntries()
  }

  const handleDelete = async (entryId: string) => {
    const res = await fetch(`/api/meal-plans/${entryId}`, { method: 'DELETE' })
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId))
    }
  }

  const handleCopyWeek = async (sourceWeekStart: string) => {
    const res = await fetch('/api/meal-plans/copy-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: householdId,
        sourceWeekStart,
        targetWeekStart: weekDays[0],
      }),
    })
    if (!res.ok) throw new Error('Failed to copy week')
    await fetchEntries()
  }

  const getEntriesForCell = (date: string, mealType: string) =>
    entries.filter((e) => e.date === date && e.meal_type === mealType)

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm sm:text-lg font-semibold text-center truncate">
            {formatWeekLabel(weekStart)}
          </h2>
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(getWeekStart(new Date(), weekStartDay))}
          >
            <Calendar className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Today</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)}>
            <Copy className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Copy Week</span>
          </Button>
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden md:block overflow-x-auto">
        <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-px bg-border rounded-lg overflow-hidden min-w-[800px]">
          {/* Column headers */}
          <div className="bg-muted p-2" /> {/* Empty corner */}
          {weekDays.map((date, i) => (
            <div
              key={date}
              className={`bg-muted p-2 text-center text-sm font-medium ${
                date === today ? 'bg-primary/10 text-primary' : ''
              }`}
            >
              <div>{dayNames[i]}</div>
              <div className="text-xs text-muted-foreground">{new Date(date + 'T12:00:00').getDate()}</div>
            </div>
          ))}

          {/* Rows per meal type */}
          {MEAL_TYPES.map((mealType) => (
            <div key={mealType} className="contents">
              <div className="bg-muted p-2 text-sm font-medium capitalize flex items-start">
                {mealType}
              </div>
              {weekDays.map((date) => (
                <div
                  key={`${date}-${mealType}`}
                  className={`bg-card ${date === today ? 'bg-primary/5' : ''}`}
                >
                  <MealCell
                    entries={getEntriesForCell(date, mealType)}
                    persons={persons}
                    onAdd={() => handleAdd(date, mealType)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: stacked day view */}
      <div className="md:hidden space-y-4">
        {weekDays.map((date, i) => (
          <div key={date} className={`rounded-lg border ${date === today ? 'border-primary' : ''}`}>
            <div className={`p-3 font-medium border-b ${date === today ? 'bg-primary/10' : 'bg-muted'}`}>
              {dayNames[i]} {new Date(date + 'T12:00:00').getDate()}
            </div>
            <div className="divide-y">
              {MEAL_TYPES.map((mealType) => {
                const cellEntries = getEntriesForCell(date, mealType)
                return (
                  <div key={mealType} className="p-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      {mealType}
                    </div>
                    <MealCell
                      entries={cellEntries}
                      persons={persons}
                      onAdd={() => handleAdd(date, mealType)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Dialogs */}
      <AddMealDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        householdId={householdId}
        date={addDialogDate}
        mealType={addDialogMealType}
        persons={persons}
        editingEntry={editingEntry}
        onSave={handleSave}
      />

      <CopyWeekDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        currentWeekStart={weekStart}
        onCopy={handleCopyWeek}
      />
    </div>
  )
}
