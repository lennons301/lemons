'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { toast } from 'sonner'
import { normalizeName } from '@/lib/utils/ingredients'
import { INVENTORY_LOCATIONS, INVENTORY_CATEGORIES } from '@/types/inventory'
import type { InventoryLocation, InventoryDefault, BulkInventoryItem } from '@/types/inventory'

interface ShoppingItemForReview {
  id: string
  title: string
  quantity: number | null
  unit: string | null
}

interface ReviewItem extends ShoppingItemForReview {
  normalizedName: string
  location: InventoryLocation | ''
  category: string | null
  isNew: boolean
}

interface AddToInventoryReviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ShoppingItemForReview[]
  householdId: string
  onComplete: () => void
}

export function AddToInventoryReview({
  open,
  onOpenChange,
  items,
  householdId,
  onComplete,
}: AddToInventoryReviewProps) {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || items.length === 0) return
    loadDefaults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, householdId])

  const loadDefaults = async () => {
    setLoading(true)
    const normalized = items.map((i) => ({
      ...i,
      normalizedName: normalizeName(i.title),
    }))

    // Fetch defaults for all normalized names
    const names = normalized.map((i) => i.normalizedName).join(',')
    const res = await fetch(
      `/api/inventory/defaults?householdId=${householdId}&names=${encodeURIComponent(names)}`
    )
    const defaults: InventoryDefault[] = res.ok ? await res.json() : []

    const defaultsMap = new Map(defaults.map((d) => [d.normalized_name, d]))

    setReviewItems(
      normalized.map((item) => {
        const def = defaultsMap.get(item.normalizedName)
        return {
          ...item,
          location: (def?.location as InventoryLocation) || '',
          category: def?.category || null,
          isNew: !def,
        }
      })
    )
    setLoading(false)
  }

  const updateItem = (index: number, field: 'location' | 'category', value: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value === 'none' ? null : (value || null) } : item
      )
    )
  }

  const allHaveLocation = reviewItems.every((i) => i.location)

  const handleSubmit = async () => {
    if (!allHaveLocation) return
    setSubmitting(true)
    try {
      const bulkItems: BulkInventoryItem[] = reviewItems.map((item) => ({
        display_name: item.title,
        name: item.normalizedName,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location as InventoryLocation,
        category: item.category,
      }))

      const res = await fetch('/api/inventory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, items: bulkItems }),
      })

      if (res.ok) {
        toast.success(`Added ${reviewItems.length} item${reviewItems.length !== 1 ? 's' : ''} to inventory`)
        onComplete()
        onOpenChange(false)
      } else {
        toast.error('Failed to add items to inventory')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Inventory</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Assign locations for each item. Previously used locations are pre-filled.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-1 py-2">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : (
            reviewItems.map((item, index) => (
              <div key={item.id} className="py-3 px-2 border-b last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {item.title}
                      {item.isNew && (
                        <Badge variant="outline" className="text-[10px] py-0 border-primary text-primary">
                          NEW
                        </Badge>
                      )}
                    </div>
                    {(item.quantity != null || item.unit) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                      </div>
                    )}
                    {!item.isNew && item.location && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">remembered from last time</div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Select
                      value={item.location}
                      onValueChange={(v) => updateItem(index, 'location', v)}
                    >
                      <SelectTrigger className={`h-8 w-[130px] text-xs ${!item.location ? 'border-dashed border-primary' : ''}`}>
                        <SelectValue placeholder="Location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {INVENTORY_LOCATIONS.map((loc) => (
                          <SelectItem key={loc.value} value={loc.value}>
                            {loc.icon} {loc.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.category || ''}
                      onValueChange={(v) => updateItem(index, 'category', v)}
                    >
                      <SelectTrigger className="h-8 w-[110px] text-xs">
                        <SelectValue placeholder="Category..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {INVENTORY_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || !allHaveLocation || loading}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Add {reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''} to Inventory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
