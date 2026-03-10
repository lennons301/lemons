import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeName } from '@/lib/utils/ingredients'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { display_name, quantity, unit, location, category, expiry_date, notes } = body

  if (!display_name || !location) {
    return NextResponse.json({ error: 'display_name and location are required' }, { status: 400 })
  }

  const name = normalizeName(display_name)

  const { data, error } = await (supabase as any)
    .from('inventory_items')
    .update({
      name,
      display_name: display_name.trim(),
      quantity: quantity ?? null,
      unit: unit ?? null,
      location,
      category: category ?? null,
      expiry_date: expiry_date ?? null,
      notes: notes ?? null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Upsert inventory default
  await (supabase as any)
    .from('inventory_defaults')
    .upsert(
      { household_id: data.household_id, normalized_name: name, location, category: category ?? null },
      { onConflict: 'household_id,normalized_name' }
    )

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // PATCH only supports quantity and unit changes (for +/- buttons).
  // Use PUT for full edits including location/category.
  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('quantity' in body) updates.quantity = body.quantity
  if ('unit' in body) updates.unit = body.unit

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update (PATCH supports quantity and unit only)' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await (supabase as any).from('inventory_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
