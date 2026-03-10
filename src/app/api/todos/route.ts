import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AMALFI_HEX_SET } from '@/types/todos'

const VALID_LIST_TYPES = new Set(['general', 'checklist', 'project'])

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const showArchived = url.searchParams.get('archived') === 'true'

  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  let query = supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status, priority, due_date)
    `)
    .eq('household_id', householdId)
    .neq('list_type', 'shopping')
    .order('created_at', { ascending: false })

  if (showArchived) {
    query = query.eq('archived', true)
  } else {
    query = query.eq('archived', false)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date().toISOString().split('T')[0]

  const lists = (data || []).map((list: any) => {
    const items = list.todo_items || []
    return {
      ...list,
      todo_items: undefined,
      total_items: items.length,
      completed_items: items.filter((i: any) => i.status === 'completed').length,
      overdue_count: items.filter((i: any) => i.due_date && i.due_date < today && i.status !== 'completed').length,
      high_priority_count: items.filter((i: any) => (i.priority === 'high' || i.priority === 'urgent') && i.status !== 'completed').length,
      due_today_count: items.filter((i: any) => i.due_date === today && i.status !== 'completed').length,
    }
  })

  return NextResponse.json(lists)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { household_id, title, list_type, color, default_assigned_to } = body

  if (!household_id || !title?.trim()) {
    return NextResponse.json({ error: 'household_id and title are required' }, { status: 400 })
  }
  if (!list_type || !VALID_LIST_TYPES.has(list_type)) {
    return NextResponse.json({ error: 'list_type must be general, checklist, or project' }, { status: 400 })
  }
  if (color && !AMALFI_HEX_SET.has(color)) {
    return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('todo_lists')
    .insert({
      household_id,
      title: title.trim(),
      list_type,
      color: color ?? null,
      default_assigned_to: default_assigned_to ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
