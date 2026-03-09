import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/recipes — list recipes for active household
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const householdId = searchParams.get('householdId')
  if (!householdId) {
    return NextResponse.json({ error: 'householdId is required' }, { status: 400 })
  }

  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''
  const author = searchParams.get('author') || ''
  const book = searchParams.get('book') || ''

  let query = supabase
    .from('recipes')
    .select(`
      *,
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order),
      recipe_members(person_id)
    `)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter by tag in JS (Supabase .contains on joined tables is unreliable)
  let recipes = data || []
  if (tag) {
    recipes = recipes.filter((r: any) =>
      r.recipe_tags?.some((t: any) => t.tag_name === tag)
    )
  }
  if (author) {
    recipes = recipes.filter((r: any) =>
      r.source_author?.toLowerCase() === author.toLowerCase()
    )
  }
  if (book) {
    recipes = recipes.filter((r: any) =>
      r.source_book?.toLowerCase() === book.toLowerCase()
    )
  }

  return NextResponse.json(recipes)
}

// POST /api/recipes — create a new recipe
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, servings, prep_time, cook_time, instructions, source_url, source_author, source_book, household_id, ingredients, tags, members } = body

  if (!title || !household_id) {
    return NextResponse.json({ error: 'title and household_id are required' }, { status: 400 })
  }

  // Insert recipe
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      title,
      description: description || null,
      servings: servings || 4,
      prep_time: prep_time || null,
      cook_time: cook_time || null,
      instructions: instructions || [],
      source_url: source_url || null,
      source_author: source_author || null,
      source_book: source_book || null,
      household_id,
      created_by: user.id,
    })
    .select()
    .single()

  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 })
  }

  // Insert ingredients if provided
  if (ingredients && ingredients.length > 0) {
    const ingredientRows = ingredients.map((ing: any, idx: number) => ({
      recipe_id: recipe.id,
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
      console.error('Failed to insert ingredients:', ingError.message)
    }
  }

  // Insert tags if provided
  if (tags && tags.length > 0) {
    const tagRows = tags.map((tagName: string) => ({
      recipe_id: recipe.id,
      tag_name: tagName.trim().toLowerCase(),
    }))

    const { error: tagError } = await supabase
      .from('recipe_tags')
      .insert(tagRows)

    if (tagError) {
      console.error('Failed to insert tags:', tagError.message)
    }
  }

  // Insert recipe_members if provided
  if (members && members.length > 0) {
    const memberRows = members.map((personId: string) => ({
      recipe_id: recipe.id,
      person_id: personId,
    }))

    const { error: memberError } = await supabase
      .from('recipe_members')
      .insert(memberRows)

    if (memberError) {
      console.error('Failed to insert recipe_members:', memberError.message)
    }
  }

  // Return full recipe with relations
  const { data: fullRecipe } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order),
      recipe_members(person_id)
    `)
    .eq('id', recipe.id)
    .single()

  return NextResponse.json(fullRecipe, { status: 201 })
}
