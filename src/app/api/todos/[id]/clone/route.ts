import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch source list with items
  const { data: source, error: fetchError } = await supabase
    .from('todo_lists')
    .select(`*, todo_items(*)`)
    .eq('id', id)
    .neq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (fetchError || !source) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  const body = await request.json()
  const { title, is_template, event_id } = body

  // Create the cloned list
  const { data: clonedList, error: listError } = await supabase
    .from('todo_lists')
    .insert({
      household_id: source.household_id,
      title: title?.trim() || source.title,
      list_type: source.list_type,
      color: source.color,
      default_assigned_to: source.default_assigned_to,
      is_template: is_template ?? false,
      event_id: event_id ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  // Clone items
  const sourceItems = source.todo_items || []
  if (sourceItems.length > 0) {
    const clonedItems = sourceItems.map((item: any, idx: number) => ({
      list_id: clonedList.id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      group_name: item.group_name,
      sort_order: idx,
      status: 'pending',
      created_by: user.id,
    }))

    const { error: itemsError } = await supabase
      .from('todo_items')
      .insert(clonedItems)

    if (itemsError) {
      // Clean up the list if items failed
      await supabase.from('todo_lists').delete().eq('id', clonedList.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  // Return the full cloned list with items
  const { data: result } = await supabase
    .from('todo_lists')
    .select(`*, todo_items(*)`)
    .eq('id', clonedList.id)
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  return NextResponse.json(result, { status: 201 })
}
