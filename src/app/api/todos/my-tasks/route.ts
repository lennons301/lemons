import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const showCompleted = url.searchParams.get('completed') === 'true'
  const filterList = url.searchParams.get('listId')
  const filterPriority = url.searchParams.get('priority')

  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  // Get user's member ID — assigned_to stores person IDs, not auth UIDs
  const { data: member } = await supabase
    .from('household_members')
    .select('id, profile_id')
    .eq('household_id', householdId)
    .eq('profile_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Not a member of this household' }, { status: 403 })

  // Query items assigned to this user across all non-shopping, non-template, non-archived lists
  let query = supabase
    .from('todo_items')
    .select(`
      *,
      todo_lists!inner(id, title, list_type, color, is_template, archived)
    `)
    .eq('assigned_to', member.id)
    .eq('todo_lists.is_template', false)
    .eq('todo_lists.archived', false)
    .neq('todo_lists.list_type', 'shopping')
    .eq('todo_lists.household_id', householdId)

  if (!showCompleted) {
    query = query.neq('status', 'completed')
  }
  if (filterList) {
    query = query.eq('list_id', filterList)
  }
  if (filterPriority) {
    query = query.eq('priority', filterPriority as any)
  }

  const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Transform to include list info at top level
  const items = (data || []).map((item: any) => ({
    ...item,
    list_title: item.todo_lists.title,
    list_color: item.todo_lists.color,
    list_id: item.todo_lists.id,
    todo_lists: undefined,
  }))

  return NextResponse.json(items)
}
