'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { getWeekStart, getWeekDays } from '@/lib/utils/week'

interface DraftItem {
  name: string
  quantity: number | null
  unit: string | null
  isStaple: boolean
  included: boolean
}

interface GenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  householdId: string
  onConfirm: (title: string, items: { title: string; quantity: number | null; unit: string | null }[]) => Promise<void>
}

export function GenerateDialog({ open, onOpenChange, householdId, onConfirm }: GenerateDialogProps) {
  const [step, setStep] = useState<'dates' | 'review'>('dates')
  const [from, setFrom] = useState(() => {
    const ws = getWeekStart(new Date())
    return ws.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => {
    const ws = getWeekStart(new Date())
    const days = getWeekDays(ws)
    return days[6]
  })
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entryCount, setEntryCount] = useState(0)
  const [manualItem, setManualItem] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shopping/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, from, to }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const data = await res.json()
      setDraft(
        data.items.map((item: any) => ({ ...item, included: true }))
      )
      setEntryCount(data.entry_count)
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = (index: number) => {
    setDraft((prev) =>
      prev.map((item, i) => (i === index ? { ...item, included: !item.included } : item))
    )
  }

  const updateQuantity = (index: number, quantity: string) => {
    setDraft((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: quantity ? parseFloat(quantity) : null } : item
      )
    )
  }

  const addManualItem = () => {
    if (!manualItem.trim()) return
    setDraft((prev) => [
      ...prev,
      { name: manualItem.trim(), quantity: null, unit: null, isStaple: false, included: true },
    ])
    setManualItem('')
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const items = draft
        .filter((item) => item.included)
        .map((item) => ({
          title: item.name,
          quantity: item.quantity,
          unit: item.unit,
        }))
      const title = `Shop ${from} to ${to}`
      await onConfirm(title, items)
      onOpenChange(false)
      // Reset for next use
      setStep('dates')
      setDraft([])
    } finally {
      setSaving(false)
    }
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep('dates')
      setDraft([])
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'dates' ? 'Generate Shopping List' : `Review (${entryCount} meals)`}
          </DialogTitle>
        </DialogHeader>

        {step === 'dates' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={loading || !from || !to}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {draft.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No ingredients found for this date range.
                </p>
              ) : (
                draft.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={item.included}
                      onCheckedChange={() => toggleItem(idx)}
                    />
                    <span className="flex-1 text-sm">
                      {item.name}
                      {item.isStaple && (
                        <span className="text-xs text-muted-foreground ml-1">(staple)</span>
                      )}
                    </span>
                    <Input
                      type="number"
                      className="w-20 h-7 text-sm"
                      value={item.quantity ?? ''}
                      onChange={(e) => updateQuantity(idx, e.target.value)}
                      placeholder="qty"
                    />
                    <span className="text-xs text-muted-foreground w-16 truncate">
                      {item.unit || ''}
                    </span>
                  </div>
                ))
              )}

              {/* Manual add */}
              <div className="flex items-center gap-2 pt-2 border-t mt-2">
                <Input
                  className="flex-1 h-8 text-sm"
                  placeholder="Add item..."
                  value={manualItem}
                  onChange={(e) => setManualItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
                />
                <Button size="sm" variant="outline" onClick={addManualItem}>
                  Add
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('dates')}>Back</Button>
              <Button onClick={handleConfirm} disabled={saving || draft.filter((d) => d.included).length === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create List ({draft.filter((d) => d.included).length} items)
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
