import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/recipes/[id] — get single recipe with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order),
      recipe_members(person_id)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .order('sort_order', { referencedTable: 'recipe_images', ascending: true })
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json(data)
}

// PUT /api/recipes/[id] — update recipe
export async function PUT(
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
  const { title, description, servings, prep_time, cook_time, instructions, source_url, source_author, source_book, ingredients, tags, members } = body

  // Update recipe fields
  const { error: recipeError } = await supabase
    .from('recipes')
    .update({
      title,
      description: description ?? null,
      servings: servings ?? 4,
      prep_time: prep_time ?? null,
      cook_time: cook_time ?? null,
      instructions: instructions ?? [],
      source_url: source_url ?? null,
      source_author: source_author ?? null,
      source_book: source_book ?? null,
    })
    .eq('id', id)

  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 })
  }

  // Replace ingredients: delete all, re-insert
  if (ingredients !== undefined) {
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)

    if (ingredients.length > 0) {
      const ingredientRows = ingredients.map((ing: any, idx: number) => ({
        recipe_id: id,
        raw_text: ing.raw_text,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        name: ing.name ?? null,
        group: ing.group ?? null,
        optional: ing.optional ?? false,
        notes: ing.notes ?? null,
        sort_order: ing.sort_order ?? idx,
      }))

      const { error: ingError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredientRows)

      if (ingError) {
        console.error('Failed to replace ingredients:', ingError.message)
      }
    }
  }

  // Replace tags: delete all, re-insert
  if (tags !== undefined) {
    await supabase.from('recipe_tags').delete().eq('recipe_id', id)

    if (tags.length > 0) {
      const tagRows = tags.map((tagName: string) => ({
        recipe_id: id,
        tag_name: tagName.trim().toLowerCase(),
      }))

      const { error: tagError } = await supabase
        .from('recipe_tags')
        .insert(tagRows)

      if (tagError) {
        console.error('Failed to replace tags:', tagError.message)
      }
    }
  }

  // Replace recipe_members: delete all, re-insert
  if (members !== undefined) {
    await supabase.from('recipe_members').delete().eq('recipe_id', id)

    if (members.length > 0) {
      const memberRows = members.map((personId: string) => ({
        recipe_id: id,
        person_id: personId,
      }))

      const { error: memberError } = await supabase
        .from('recipe_members')
        .insert(memberRows)

      if (memberError) {
        console.error('Failed to replace recipe_members:', memberError.message)
      }
    }
  }

  // Return updated recipe with relations
  const { data: fullRecipe } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order),
      recipe_members(person_id)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .single()

  return NextResponse.json(fullRecipe)
}

// DELETE /api/recipes/[id] — delete recipe
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

  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
