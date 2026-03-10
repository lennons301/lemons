'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Minus, Plus } from 'lucide-react'
import type { InventoryItem } from '@/types/inventory'

interface InventoryItemRowProps {
  item: InventoryItem
  onQuantityChange: (id: string, newQuantity: number) => void
  onClick: (item: InventoryItem) => void
}

function getExpiryBadge(expiryDate: string | null): { label: string; variant: 'destructive' | 'outline'; className?: string } | null {
  if (!expiryDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays <= 1) return { label: diffDays <= 0 ? 'expired' : 'exp tomorrow', variant: 'destructive' }
  if (diffDays <= 3) return { label: `exp ${diffDays} days`, variant: 'outline', className: 'border-amber-500 text-amber-600 dark:text-amber-400' }
  return null
}

export function InventoryItemRow({ item, onQuantityChange, onClick }: InventoryItemRowProps) {
  const expiryBadge = getExpiryBadge(item.expiry_date)

  const handleQuantityChange = (delta: number) => {
    const currentQty = item.quantity ?? 0
    const newQty = Math.max(0, currentQty + delta)
    onQuantityChange(item.id, newQty)
  }

  return (
    <div
      className="flex items-center gap-2 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer group"
      onClick={() => onClick(item)}
    >
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm">{item.display_name}</span>
        {expiryBadge && (
          <Badge variant={expiryBadge.variant} className={`ml-2 text-[11px] ${expiryBadge.className || ''}`}>
            {expiryBadge.label}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.quantity != null && (
          <span className="text-sm text-muted-foreground">
            {item.quantity}{item.unit ? ` ${item.unit}` : ''}
          </span>
        )}
        <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleQuantityChange(-1)}
            disabled={item.quantity == null || item.quantity <= 0}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleQuantityChange(1)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
