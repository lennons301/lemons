import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function verifyAdmin(supabase: any, userId: string, householdId: string) {
  const { data: member } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('profile_id', userId)
    .single()
  return member?.role === 'admin'
}

// PATCH /api/households/[id]/preferences — update household preferences
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await verifyAdmin(supabase, user.id, householdId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()

  const updates: Record<string, unknown> = {}

  if ('week_start_day' in body) {
    const day = body.week_start_day
    if (typeof day !== 'number' || day < 0 || day > 6 || !Number.isInteger(day)) {
      return NextResponse.json({ error: 'week_start_day must be an integer 0–6' }, { status: 400 })
    }
    updates.week_start_day = day
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('households')
    .update(updates)
    .eq('id', householdId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
