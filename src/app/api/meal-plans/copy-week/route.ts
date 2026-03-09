import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/meal-plans/copy-week — copy all entries from one week to another
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { household_id, sourceWeekStart, targetWeekStart } = await request.json()

  if (!household_id || !sourceWeekStart || !targetWeekStart) {
    return NextResponse.json(
      { error: 'household_id, sourceWeekStart, and targetWeekStart are required' },
      { status: 400 }
    )
  }

  // Calculate source week end (7 days from start)
  const sourceStart = new Date(sourceWeekStart)
  const sourceEnd = new Date(sourceStart)
  sourceEnd.setDate(sourceEnd.getDate() + 6)

  // Fetch source week entries
  const { data: sourceEntries, error: fetchError } = await supabase
    .from('meal_plan_entries')
    .select('*')
    .eq('household_id', household_id)
    .gte('date', sourceWeekStart)
    .lte('date', sourceEnd.toISOString().split('T')[0])

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!sourceEntries || sourceEntries.length === 0) {
    return NextResponse.json({ error: 'No entries in source week' }, { status: 400 })
  }

  // Map entries to target week (same day offset)
  const targetStart = new Date(targetWeekStart)
  const newEntries = sourceEntries.map((entry) => {
    const entryDate = new Date(entry.date)
    const dayOffset = Math.round(
      (entryDate.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24)
    )
    const targetDate = new Date(targetStart)
    targetDate.setDate(targetDate.getDate() + dayOffset)

    return {
      household_id: entry.household_id,
      date: targetDate.toISOString().split('T')[0],
      meal_type: entry.meal_type,
      recipe_id: entry.recipe_id,
      custom_name: entry.custom_name,
      servings: entry.servings,
      assigned_to: entry.assigned_to,
      created_by: user.id,
      notes: entry.notes,
    }
  })

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .insert(newEntries)
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
