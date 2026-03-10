import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AMALFI_HEX_SET } from '@/types/todos'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(*)
    `)
    .eq('id', id)
    .neq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify not a shopping list
  const { data: existing } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', id)
    .single()
  if (!existing || existing.list_type === 'shopping') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('title' in body) {
    if (!body.title?.trim()) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    updates.title = body.title.trim()
  }
  if ('color' in body) {
    if (body.color && !AMALFI_HEX_SET.has(body.color)) {
      return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
    }
    updates.color = body.color ?? null
  }
  if ('pinned' in body) updates.pinned = body.pinned
  if ('archived' in body) updates.archived = body.archived
  if ('default_assigned_to' in body) updates.default_assigned_to = body.default_assigned_to ?? null

  const { data, error } = await supabase
    .from('todo_lists')
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

  // Verify not a shopping list
  const { data: existing } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', id)
    .single()
  if (!existing || existing.list_type === 'shopping') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase.from('todo_lists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
