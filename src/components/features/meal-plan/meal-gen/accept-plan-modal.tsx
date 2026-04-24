'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftCount: number
  shoppingItemCount?: number
  onConfirm: () => void | Promise<void>
  confirming?: boolean
}

export function AcceptPlanModal({ open, onOpenChange, draftCount, shoppingItemCount, onConfirm, confirming }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept plan?</DialogTitle>
          <DialogDescription>
            This will create {draftCount} meal plan {draftCount === 1 ? 'entry' : 'entries'} for the target week
            {typeof shoppingItemCount === 'number' && shoppingItemCount > 0
              ? ` and a shopping list with ${shoppingItemCount} ${shoppingItemCount === 1 ? 'item' : 'items'}`
              : ''}
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Accepting…' : 'Accept'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
