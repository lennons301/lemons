import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('household_managed_members')
    .select('*')
    .eq('household_id', householdId)

  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { displayName, dateOfBirth } = await request.json()

  if (!displayName || typeof displayName !== 'string') {
    return NextResponse.json({ error: 'Display name required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('household_managed_members')
    .insert({
      household_id: householdId,
      display_name: displayName.trim(),
      date_of_birth: dateOfBirth || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId, displayName, dateOfBirth } = await request.json()

  if (!memberId) {
    return NextResponse.json({ error: 'memberId required' }, { status: 400 })
  }

  const updates: Record<string, any> = {}
  if (displayName !== undefined) updates.display_name = displayName.trim()
  if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth || null

  const { data, error } = await supabase
    .from('household_managed_members')
    .update(updates)
    .eq('id', memberId)
    .eq('household_id', householdId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId } = await request.json()

  if (!memberId) {
    return NextResponse.json({ error: 'memberId required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('household_managed_members')
    .delete()
    .eq('id', memberId)
    .eq('household_id', householdId)

  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
