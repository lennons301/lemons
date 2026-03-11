import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VALID_CATEGORIES } from '@/types/calendar'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('title' in body) {
    if (!body.title?.trim()) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    updates.title = body.title.trim()
  }
  if ('description' in body) updates.description = body.description ?? null
  if ('start_datetime' in body) updates.start_datetime = body.start_datetime
  if ('end_datetime' in body) updates.end_datetime = body.end_datetime
  if ('all_day' in body) updates.all_day = body.all_day
  if ('location' in body) updates.location = body.location ?? null
  if ('assigned_to' in body) updates.assigned_to = body.assigned_to ?? []
  if ('category' in body) {
    if (!VALID_CATEGORIES.has(body.category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    updates.category = body.category
  }
  if ('metadata' in body) updates.metadata = body.metadata ?? null

  // Validate end > start if both are being updated
  if (updates.start_datetime && updates.end_datetime) {
    if (new Date(updates.end_datetime as string) <= new Date(updates.start_datetime as string)) {
      return NextResponse.json({ error: 'end_datetime must be after start_datetime' }, { status: 400 })
    }
  }

  const { data, error } = await (supabase as any)
    .from('calendar_events')
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

  const { error } = await (supabase as any).from('calendar_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
