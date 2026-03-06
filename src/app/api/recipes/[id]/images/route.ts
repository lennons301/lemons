import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/recipes/[id]/images — upload an image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipeId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify recipe exists and user has access
  const { data: recipe } = await supabase
    .from('recipes')
    .select('id, household_id')
    .eq('id', recipeId)
    .single()

  if (!recipe) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const file = formData.get('image') as File | null
  const imageType = (formData.get('type') as string) || 'photo'

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${recipe.household_id}/${recipeId}/${crypto.randomUUID()}.${ext}`

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('recipe-images')
    .upload(path, bytes, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('recipe-images')
    .getPublicUrl(path)

  // Get next sort order
  const { count } = await supabase
    .from('recipe_images')
    .select('*', { count: 'exact', head: true })
    .eq('recipe_id', recipeId)

  const { data: image, error: dbError } = await supabase
    .from('recipe_images')
    .insert({
      recipe_id: recipeId,
      url: publicUrl,
      type: imageType,
      sort_order: count || 0,
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json(image, { status: 201 })
}

// DELETE /api/recipes/[id]/images — delete an image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipeId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const imageId = searchParams.get('imageId')
  if (!imageId) {
    return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('recipe_images')
    .delete()
    .eq('id', imageId)
    .eq('recipe_id', recipeId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
