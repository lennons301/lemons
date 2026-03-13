'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Plus } from 'lucide-react'
import { GenerateDialog } from './generate-dialog'
import Link from 'next/link'

interface ShoppingList {
  id: string
  title: string
  created_at: string
  total_items: number
  completed_items: number
}

interface ShoppingListViewProps {
  householdId: string
  lists: ShoppingList[]
}

export function ShoppingListView({ householdId, lists: initialLists }: ShoppingListViewProps) {
  const router = useRouter()
  const [lists, setLists] = useState(initialLists)
  const [generateOpen, setGenerateOpen] = useState(false)

  const handleCreateEmpty = async () => {
    const title = `Shopping List ${new Date().toLocaleDateString('en-GB')}`
    const res = await fetch('/api/shopping/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId, title }),
    })
    if (res.ok) {
      const list = await res.json()
      router.push(`/shopping/${list.id}`)
      router.refresh()
    } else {
      toast.error('Failed to create shopping list')
    }
  }

  const handleGenerate = async (
    title: string,
    items: { title: string; quantity: number | null; unit: string | null }[]
  ) => {
    // Create list
    const listRes = await fetch('/api/shopping/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId, title }),
    })
    if (!listRes.ok) throw new Error('Failed to create list')
    const list = await listRes.json()

    // Add items
    if (items.length > 0) {
      const itemsRes = await fetch(`/api/shopping/lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items.map((item, idx) => ({ ...item, sort_order: idx }))),
      })
      if (!itemsRes.ok) throw new Error('Failed to add items')
    }

    router.push(`/shopping/${list.id}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => setGenerateOpen(true)}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          Generate from Meal Plan
        </Button>
        <Button variant="outline" onClick={handleCreateEmpty}>
          <Plus className="mr-2 h-4 w-4" />
          Empty List
        </Button>
      </div>

      {lists.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">No shopping lists yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Generate one from your meal plan or create an empty list.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <Link key={list.id} href={`/shopping/${list.id}`}>
              <div className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                <div>
                  <h3 className="font-medium">{list.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {list.completed_items}/{list.total_items} items done
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(list.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        householdId={householdId}
        onConfirm={handleGenerate}
      />
    </div>
  )
}
