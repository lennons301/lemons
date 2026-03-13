'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { AddToInventoryButton } from '@/components/features/inventory/add-to-inventory-button'

interface ShoppingItem {
  id: string
  title: string
  quantity: number | null
  unit: string | null
  status: string
  sort_order: number
}

interface ShoppingListDetailProps {
  list: {
    id: string
    title: string
    todo_items: ShoppingItem[]
  }
  householdId: string
}

export function ShoppingListDetail({ list: initialList, householdId }: ShoppingListDetailProps) {
  const router = useRouter()
  const [items, setItems] = useState<ShoppingItem[]>(initialList.todo_items || [])
  const [newItemTitle, setNewItemTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const pendingItems = items.filter((i) => i.status !== 'completed')
  const completedItems = items.filter((i) => i.status === 'completed')

  const toggleItem = async (item: ShoppingItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed'
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    )
    const res = await fetch(`/api/shopping/lists/${initialList.id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)))
      toast.error('Failed to update item')
    }
  }

  const addItem = async () => {
    if (!newItemTitle.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/shopping/lists/${initialList.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newItemTitle.trim(),
          sort_order: items.length,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setItems((prev) => [...prev, ...(Array.isArray(data) ? data : [data])])
        setNewItemTitle('')
      } else {
        toast.error('Failed to add item')
      }
    } finally {
      setAdding(false)
    }
  }

  const deleteItem = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    await fetch(`/api/shopping/lists/${initialList.id}/items/${itemId}`, {
      method: 'DELETE',
    })
  }

  const deleteList = async () => {
    if (!confirm('Delete this shopping list?')) return
    setDeleting(true)
    const res = await fetch(`/api/shopping/lists/${initialList.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/shopping')
      router.refresh()
    } else {
      setDeleting(false)
      toast.error('Failed to delete list')
    }
  }

  const renderItem = (item: ShoppingItem) => (
    <div
      key={item.id}
      className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 group"
    >
      <Checkbox
        checked={item.status === 'completed'}
        onCheckedChange={() => toggleItem(item)}
      />
      <span
        className={`flex-1 text-sm ${
          item.status === 'completed' ? 'line-through text-muted-foreground' : ''
        }`}
      >
        {item.quantity && (
          <span className="font-medium">
            {item.quantity}{item.unit ? ` ${item.unit}` : ''}{' '}
          </span>
        )}
        {item.title}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={() => deleteItem(item.id)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/shopping">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>
        <h1 className="flex-1 text-2xl font-bold">{initialList.title}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={deleteList}
          disabled={deleting}
          className="text-destructive"
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>

      {/* Add item */}
      <div className="flex gap-2">
        <Input
          placeholder="Add item..."
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <Button onClick={addItem} disabled={adding || !newItemTitle.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Pending items */}
      <div className="space-y-0.5">
        {pendingItems.length === 0 && completedItems.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">No items yet</p>
        )}
        {pendingItems.map(renderItem)}
      </div>

      {/* Completed items */}
      {completedItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
            Completed ({completedItems.length})
          </p>
          <div className="space-y-0.5">
            {completedItems.map(renderItem)}
          </div>
        </div>
      )}

      <AddToInventoryButton items={items} householdId={householdId} />
    </div>
  )
}
