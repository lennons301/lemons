import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = new URL(request.url).searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status)
    `)
    .eq('household_id', householdId)
    .eq('list_type', 'shopping')
    .eq('archived', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add item counts
  const lists = (data || []).map((list) => ({
    ...list,
    total_items: list.todo_items?.length || 0,
    completed_items: list.todo_items?.filter((i: any) => i.status === 'completed').length || 0,
  }))

  return NextResponse.json(lists)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { household_id, title } = await request.json()
  if (!household_id || !title) {
    return NextResponse.json({ error: 'household_id and title are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('todo_lists')
    .insert({
      household_id,
      title,
      list_type: 'shopping',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
