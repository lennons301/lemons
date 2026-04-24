'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ShoppingBasket } from 'lucide-react'

interface ShoppingLine {
  name: string
  required_qty: number | null
  required_unit: string | null
  packed_qty: number | null
  packed_unit: string | null
  waste_qty: number
  pack_size: { quantity: number; unit: string } | null
  pack_count: number
  is_staple: boolean
}

interface Totals {
  line_count: number
  waste_qty_total: number
  pack_total: number
}

interface Props {
  items: ShoppingLine[]
  totals: Totals
  loading?: boolean
}

function fmtQty(qty: number | null, unit: string | null): string {
  if (qty == null) return '—'
  const q = Number(qty).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return unit ? `${q} ${unit}` : q
}

export function ShoppingPreview({ items, totals, loading }: Props) {
  const [open, setOpen] = useState(false)

  if (items.length === 0 && !loading) return null

  return (
    <div className="border-t">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <ShoppingBasket className="h-4 w-4" />
          Shopping preview
          <span className="text-xs text-muted-foreground">
            · {totals.line_count} {totals.line_count === 1 ? 'item' : 'items'}
          </span>
        </span>
        {totals.waste_qty_total > 0 ? (
          <span className="text-xs text-muted-foreground">
            ~{Math.round(totals.waste_qty_total)} leftover
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="max-h-48 overflow-auto border-t">
          {loading ? (
            <div className="p-3 text-xs text-muted-foreground italic">Updating…</div>
          ) : (
            <ul className="divide-y text-sm">
              {items.map((item, i) => (
                <li key={i} className="flex items-start justify-between gap-2 px-3 py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      {item.is_staple ? (
                        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">staple</span>
                      ) : null}
                    </div>
                    {item.pack_size ? (
                      <div className="text-xs text-muted-foreground">
                        {fmtQty(item.packed_qty, item.packed_unit)} from {item.pack_count}×{' '}
                        {fmtQty(item.pack_size.quantity, item.pack_size.unit)}
                        {item.waste_qty > 0
                          ? ` · ${fmtQty(item.waste_qty, item.packed_unit)} leftover`
                          : ''}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {fmtQty(item.packed_qty, item.packed_unit)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
