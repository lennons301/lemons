import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeName } from '@/lib/utils/ingredients'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = new URL(request.url).searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId)
    .order('display_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { household_id, display_name, quantity, unit, location, category, expiry_date, notes } = body

  if (!household_id || !display_name || !location) {
    return NextResponse.json({ error: 'household_id, display_name, and location are required' }, { status: 400 })
  }

  const name = normalizeName(display_name)

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      household_id,
      created_by: user.id,
      name,
      display_name: display_name.trim(),
      quantity: quantity ?? null,
      unit: unit ?? null,
      location,
      category: category ?? null,
      expiry_date: expiry_date ?? null,
      added_from: 'manual',
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Upsert inventory default for this item
  await supabase
    .from('inventory_defaults')
    .upsert(
      { household_id, normalized_name: name, location, category: category ?? null },
      { onConflict: 'household_id,normalized_name' }
    )

  return NextResponse.json(data, { status: 201 })
}
