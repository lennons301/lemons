import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BulkInventoryItem } from '@/types/inventory'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { household_id, items } = await request.json() as {
    household_id: string
    items: BulkInventoryItem[]
  }

  if (!household_id || !items?.length) {
    return NextResponse.json({ error: 'household_id and items are required' }, { status: 400 })
  }

  // Validate all items have location
  for (const item of items) {
    if (!item.location) {
      return NextResponse.json({ error: `Location required for "${item.display_name}"` }, { status: 400 })
    }
  }

  // Deduplicate incoming items: merge quantities for same name+location+unit
  const deduped = new Map<string, BulkInventoryItem>()
  for (const item of items) {
    const key = `${item.name}|${item.location}|${item.unit || ''}`
    const existing = deduped.get(key)
    if (existing && item.quantity != null) {
      existing.quantity = (existing.quantity ?? 0) + item.quantity
    } else if (!existing) {
      deduped.set(key, { ...item })
    }
  }

  const dedupedItems = Array.from(deduped.values())

  // Call transactional RPC function
  // Cast needed: RPC not yet in generated Supabase types
  const { data, error } = await (supabase.rpc as any)('inventory_bulk_transfer', {
    p_household_id: household_id,
    p_created_by: user.id,
    p_items: dedupedItems,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, ...data }, { status: 201 })
}
