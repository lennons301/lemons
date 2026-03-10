'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import { InventoryItemRow } from './inventory-item-row'
import { InventoryItemDialog } from './inventory-item-dialog'
import { INVENTORY_LOCATIONS, INVENTORY_CATEGORIES } from '@/types/inventory'
import type { InventoryItem, InventoryLocation } from '@/types/inventory'

interface InventoryListProps {
  items: InventoryItem[]
  householdId: string
}

type GroupBy = 'location' | 'category'

export function InventoryList({ items: initialItems, householdId }: InventoryListProps) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems)
  const [groupBy, setGroupBy] = useState<GroupBy>('location')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [quickAddLocation, setQuickAddLocation] = useState<InventoryLocation | null>(null)
  const [quickAddValue, setQuickAddValue] = useState('')
  const [quickAdding, setQuickAdding] = useState(false)

  // Filter by search
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) => i.display_name.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    )
  }, [items, search])

  // Group items
  const grouped = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {}
    for (const item of filteredItems) {
      const key = groupBy === 'location' ? item.location : (item.category || 'other')
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return groups
  }, [filteredItems, groupBy])

  // Ordered section keys
  const sectionKeys = groupBy === 'location'
    ? INVENTORY_LOCATIONS.map((l) => l.value).filter((k) => grouped[k]?.length)
    : [...INVENTORY_CATEGORIES, 'other' as const].filter((k) => grouped[k as string]?.length).map(String)

  const getSectionLabel = (key: string) => {
    if (groupBy === 'location') {
      const loc = INVENTORY_LOCATIONS.find((l) => l.value === key)
      return loc ? `${loc.icon} ${loc.label}` : key
    }
    return key.charAt(0).toUpperCase() + key.slice(1)
  }

  const handleQuantityChange = async (id: string, newQuantity: number) => {
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: newQuantity } : i)))
    await fetch(`/api/inventory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity }),
    })
  }

  const handleSave = async (data: {
    display_name: string
    quantity: number | null
    unit: string | null
    location: InventoryLocation
    category: string | null
    expiry_date: string | null
    notes: string | null
  }) => {
    if (editingItem) {
      // Update existing
      const res = await fetch(`/api/inventory/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const updated = await res.json()
        setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updated : i)))
      }
    } else {
      // Create new
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, ...data }),
      })
      if (res.ok) {
        const created = await res.json()
        setItems((prev) => [...prev, created])
      }
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }
  }

  const handleQuickAdd = async (location: InventoryLocation) => {
    if (!quickAddValue.trim()) return
    setQuickAdding(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          display_name: quickAddValue.trim(),
          location,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setItems((prev) => [...prev, created])
        setQuickAddValue('')
        setQuickAddLocation(null)
      }
    } finally {
      setQuickAdding(false)
    }
  }

  const openAddDialog = () => {
    setEditingItem(null)
    setDialogOpen(true)
  }

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} {groupBy === 'location' ? 'location' : 'categor'}
            {Object.keys(grouped).length !== 1 ? (groupBy === 'location' ? 's' : 'ies') : (groupBy === 'location' ? '' : 'y')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Group toggle */}
          <div className="flex border rounded-md text-sm overflow-hidden">
            <button
              className={`px-3 py-1.5 ${groupBy === 'location' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
              onClick={() => setGroupBy('location')}
            >
              Location
            </button>
            <button
              className={`px-3 py-1.5 ${groupBy === 'category' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
              onClick={() => setGroupBy('category')}
            >
              Category
            </button>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search inventory..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">No inventory items yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Add items manually or transfer them from a shopping list.
          </p>
        </div>
      )}

      {/* No search results */}
      {items.length > 0 && filteredItems.length === 0 && search && (
        <div className="py-8 text-center">
          <p className="text-muted-foreground">No items match &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Grouped sections */}
      {sectionKeys.map((key) => (
        <div key={key}>
          <div className="flex items-center justify-between py-2">
            <h2 className="text-sm font-semibold flex items-center gap-1">
              {getSectionLabel(key)}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {grouped[key].length} item{grouped[key].length !== 1 ? 's' : ''}
              </span>
            </h2>
            {groupBy === 'location' && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setQuickAddLocation(quickAddLocation === key ? null : key as InventoryLocation)
                  setQuickAddValue('')
                }}
              >
                + Quick add
              </button>
            )}
          </div>

          {/* Quick add input */}
          {quickAddLocation === key && (
            <div className="flex gap-2 mb-2">
              <Input
                placeholder={`Add to ${getSectionLabel(key)}...`}
                value={quickAddValue}
                onChange={(e) => setQuickAddValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd(key as InventoryLocation)}
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => handleQuickAdd(key as InventoryLocation)}
                disabled={quickAdding || !quickAddValue.trim()}
              >
                Add
              </Button>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            {grouped[key].map((item) => (
              <InventoryItemRow
                key={item.id}
                item={item}
                onQuantityChange={handleQuantityChange}
                onClick={openEditDialog}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Dialog */}
      <InventoryItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
