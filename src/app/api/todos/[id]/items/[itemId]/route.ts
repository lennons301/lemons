import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: listId, itemId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify list exists and is not shopping
  const { data: list } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', listId)
    .neq('list_type', 'shopping')
    .single()
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('status' in body) {
    updates.status = body.status
    updates.completed_at = body.status === 'completed' ? new Date().toISOString() : null
  }
  if ('title' in body) updates.title = body.title?.trim()
  if ('description' in body) updates.description = body.description ?? null
  if ('priority' in body) updates.priority = body.priority
  if ('due_date' in body) updates.due_date = body.due_date ?? null
  if ('assigned_to' in body) updates.assigned_to = body.assigned_to ?? null
  if ('sort_order' in body) updates.sort_order = body.sort_order

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('todo_items')
    .update(updates)
    .eq('id', itemId)
    .eq('list_id', listId)
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
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: listId, itemId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify list exists and is not shopping
  const { data: list } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', listId)
    .neq('list_type', 'shopping')
    .single()
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const { error } = await supabase.from('todo_items').delete().eq('id', itemId).eq('list_id', listId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
