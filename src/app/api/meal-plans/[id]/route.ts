import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/meal-plans/[id] — update a meal plan entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  // Only include fields that are present in the body
  if ('date' in body) updates.date = body.date
  if ('meal_type' in body) updates.meal_type = body.meal_type
  if ('recipe_id' in body) updates.recipe_id = body.recipe_id || null
  if ('custom_name' in body) updates.custom_name = body.custom_name || null
  if ('servings' in body) updates.servings = body.servings
  if ('assigned_to' in body) updates.assigned_to = body.assigned_to
  if ('status' in body) updates.status = body.status
  if ('notes' in body) updates.notes = body.notes || null

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE /api/meal-plans/[id] — delete a meal plan entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
