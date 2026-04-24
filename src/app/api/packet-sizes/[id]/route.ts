import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/packet-sizes/[id] — update a household override (global rows are read-only)
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as Partial<{
    pack_quantity: number
    pack_unit: string
    is_default: boolean
    notes: string | null
  }> | null
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.pack_quantity === 'number') update.pack_quantity = body.pack_quantity
  if (typeof body.pack_unit === 'string') update.pack_unit = body.pack_unit
  if (typeof body.is_default === 'boolean') update.is_default = body.is_default
  if (body.notes !== undefined) update.notes = body.notes

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('packet_sizes')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to update' }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/packet-sizes/[id] — delete a household override
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('packet_sizes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
