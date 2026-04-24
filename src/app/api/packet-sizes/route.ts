import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/packet-sizes?householdId=... — list globals + this household's overrides
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = request.nextUrl.searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('packet_sizes')
    .select('id, ingredient_name, pack_quantity, pack_unit, locale, is_default, household_id, notes, created_at')
    .or(`household_id.is.null,household_id.eq.${householdId}`)
    .order('ingredient_name', { ascending: true })
    .order('is_default', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/packet-sizes — create a household override
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    household_id?: string
    ingredient_name?: string
    pack_quantity?: number
    pack_unit?: string
    is_default?: boolean
    notes?: string | null
  } | null

  if (!body?.household_id || !body?.ingredient_name || !body?.pack_quantity || !body?.pack_unit) {
    return NextResponse.json(
      { error: 'household_id, ingredient_name, pack_quantity, pack_unit are required' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('packet_sizes')
    .insert({
      ingredient_name: body.ingredient_name.toLowerCase().trim(),
      pack_quantity: body.pack_quantity,
      pack_unit: body.pack_unit,
      locale: 'UK',
      is_default: body.is_default ?? true,
      household_id: body.household_id,
      notes: body.notes ?? null,
    })
    .select('*')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
