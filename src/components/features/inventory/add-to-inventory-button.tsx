'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Package, Check } from 'lucide-react'
import { AddToInventoryReview } from './add-to-inventory-review'

interface ShoppingItem {
  id: string
  title: string
  quantity: number | null
  unit: string | null
  status: string
}

interface AddToInventoryButtonProps {
  items: ShoppingItem[]
  householdId: string
}

export function AddToInventoryButton({ items, householdId }: AddToInventoryButtonProps) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [added, setAdded] = useState(false)

  const completedItems = items.filter((i) => i.status === 'completed')

  if (completedItems.length === 0) return null

  if (added) {
    return (
      <div className="pt-3 border-t mt-4">
        <Button variant="outline" disabled className="w-full">
          <Check className="h-4 w-4 mr-2" />
          Added to Inventory
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="pt-3 border-t mt-4">
        <Button
          className="w-full"
          onClick={() => setReviewOpen(true)}
        >
          <Package className="h-4 w-4 mr-2" />
          Add {completedItems.length} item{completedItems.length !== 1 ? 's' : ''} to Inventory
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-1">
          Checked-off items will be added to your inventory
        </p>
      </div>

      <AddToInventoryReview
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        items={completedItems}
        householdId={householdId}
        onComplete={() => setAdded(true)}
      />
    </>
  )
}
