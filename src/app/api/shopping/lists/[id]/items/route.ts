import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const items = Array.isArray(body) ? body : [body]

  const rows = items.map((item, idx) => ({
    list_id: listId,
    title: item.title,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    sort_order: item.sort_order ?? idx,
    created_by: user.id,
  }))

  const { data, error } = await supabase
    .from('todo_items')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
