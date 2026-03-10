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
import { Loader2, Trash2 } from 'lucide-react'
import { INVENTORY_LOCATIONS, INVENTORY_CATEGORIES } from '@/types/inventory'
import type { InventoryItem, InventoryLocation } from '@/types/inventory'

interface InventoryItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null // null = adding new item
  defaultLocation?: InventoryLocation // for quick-add from a location section
  onSave: (data: {
    display_name: string
    quantity: number | null
    unit: string | null
    location: InventoryLocation
    category: string | null
    expiry_date: string | null
    notes: string | null
  }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function InventoryItemDialog({
  open,
  onOpenChange,
  item,
  defaultLocation,
  onSave,
  onDelete,
}: InventoryItemDialogProps) {
  const [displayName, setDisplayName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [location, setLocation] = useState<InventoryLocation>('fridge')
  const [category, setCategory] = useState('none')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      if (item) {
        setDisplayName(item.display_name)
        setQuantity(item.quantity != null ? String(item.quantity) : '')
        setUnit(item.unit || '')
        setLocation(item.location)
        setCategory(item.category || 'none')
        setExpiryDate(item.expiry_date || '')
        setNotes(item.notes || '')
      } else {
        setDisplayName('')
        setQuantity('')
        setUnit('')
        setLocation(defaultLocation || 'fridge')
        setCategory('none')
        setExpiryDate('')
        setNotes('')
      }
    }
  }, [open, item, defaultLocation])

  const handleSave = async () => {
    if (!displayName.trim()) return
    setSaving(true)
    try {
      await onSave({
        display_name: displayName.trim(),
        quantity: quantity ? parseFloat(quantity) : null,
        unit: unit.trim() || null,
        location,
        category: category && category !== 'none' ? category : null,
        expiry_date: expiryDate || null,
        notes: notes.trim() || null,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!item || !onDelete) return
    if (!confirm('Delete this item?')) return
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
          <DialogTitle>{item ? 'Edit Item' : 'Add Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="display-name">Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Whole milk"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. L, kg, bags"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={location} onValueChange={(v) => setLocation(v as InventoryLocation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_LOCATIONS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.icon} {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
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
          <div className="space-y-2">
            <Label htmlFor="expiry">Expiry Date</Label>
            <Input
              id="expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
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
          <Button onClick={handleSave} disabled={saving || !displayName.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {item ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
