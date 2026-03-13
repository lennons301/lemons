import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Batch reorder items
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: list } = await supabase
    .from('todo_lists')
    .select('id, list_type')
    .eq('id', listId)
    .neq('list_type', 'shopping')
    .single()
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const body = await request.json()
  const items: { id: string; sort_order: number }[] = body.items
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  // Update each item's sort_order
  const updates = items.map(({ id, sort_order }) =>
    supabase
      .from('todo_items')
      .update({ sort_order })
      .eq('id', id)
      .eq('list_id', listId)
  )
  await Promise.all(updates)

  return NextResponse.json({ success: true })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify list exists and is not shopping
  // Cast needed: default_assigned_to not in generated Supabase types yet
  const { data: list } = await supabase
    .from('todo_lists')
    .select('id, list_type, default_assigned_to')
    .eq('id', listId)
    .neq('list_type', 'shopping')
    .single()
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const body = await request.json()
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // Get max sort_order for this list
  const { data: maxRow } = await supabase
    .from('todo_items')
    .select('sort_order')
    .eq('list_id', listId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSortOrder = maxRow ? maxRow.sort_order + 1 : 0

  const { data, error } = await supabase
    .from('todo_items')
    .insert({
      list_id: listId,
      title: body.title.trim(),
      description: body.description ?? null,
      priority: body.priority ?? 'none',
      due_date: body.due_date ?? null,
      assigned_to: body.assigned_to ?? list.default_assigned_to ?? null,
      sort_order: body.sort_order ?? nextSortOrder,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
