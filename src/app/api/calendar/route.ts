import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VALID_CATEGORIES } from '@/types/calendar'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')

  if (!householdId || !start || !end) {
    return NextResponse.json({ error: 'householdId, start, and end are required' }, { status: 400 })
  }

  // Range overlap query: events where [start_datetime, end_datetime) overlaps [start, end)
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('household_id', householdId)
    .lt('start_datetime', end)
    .gt('end_datetime', start)
    .order('start_datetime', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { household_id, title, description, start_datetime, end_datetime, all_day, location, assigned_to, category, metadata } = body

  if (!household_id || !title?.trim() || !start_datetime || !end_datetime) {
    return NextResponse.json({ error: 'household_id, title, start_datetime, and end_datetime are required' }, { status: 400 })
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }
  if (new Date(end_datetime) <= new Date(start_datetime)) {
    return NextResponse.json({ error: 'end_datetime must be after start_datetime' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      household_id,
      title: title.trim(),
      description: description ?? null,
      start_datetime,
      end_datetime,
      all_day: all_day ?? false,
      location: location ?? null,
      assigned_to: assigned_to ?? [],
      created_by: user.id,
      category,
      metadata: metadata ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
