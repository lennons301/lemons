import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/meal-plans — list meal plan entries for a date range
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const householdId = searchParams.get('householdId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!householdId || !from || !to) {
    return NextResponse.json({ error: 'householdId, from, and to are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)
    .eq('household_id', householdId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
    .order('meal_type', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST /api/meal-plans — create a new meal plan entry
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { household_id, date, meal_type, recipe_id, custom_name, servings, assigned_to, notes } = body

  if (!household_id || !date || !meal_type) {
    return NextResponse.json({ error: 'household_id, date, and meal_type are required' }, { status: 400 })
  }
  if (!recipe_id && !custom_name) {
    return NextResponse.json({ error: 'Either recipe_id or custom_name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .insert({
      household_id,
      date,
      meal_type,
      recipe_id: recipe_id || null,
      custom_name: custom_name || null,
      servings: servings || 1,
      assigned_to: assigned_to || [],
      created_by: user.id,
      notes: notes || null,
    })
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
