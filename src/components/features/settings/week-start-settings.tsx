'use client'

import { useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

interface WeekStartSettingsProps {
  householdId: string
  initialWeekStartDay: number
}

export function WeekStartSettings({ householdId, initialWeekStartDay }: WeekStartSettingsProps) {
  const [weekStartDay, setWeekStartDay] = useState(initialWeekStartDay)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const hasChanges = weekStartDay !== initialWeekStartDay

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/households/${householdId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start_day: weekStartDay }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      setSuccess('Saved. Reload the meal plan to see the updated week layout.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5" />
          Meal Plan Week
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Choose which day your meal planning week starts on.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-500/10 px-3 py-2 text-green-700 text-sm dark:text-green-400">
            {success}
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="space-y-2 flex-1 max-w-[200px]">
            <Label htmlFor="weekStartDay">Week starts on</Label>
            <Select
              value={String(weekStartDay)}
              onValueChange={(v) => setWeekStartDay(Number(v))}
            >
              <SelectTrigger id="weekStartDay">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
