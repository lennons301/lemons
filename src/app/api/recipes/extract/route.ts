import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractRecipeFromImage } from '@/lib/ai/extract-recipe'

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

// POST /api/recipes/extract — extract recipe from uploaded image
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('image') as File | null
  const householdId = formData.get('householdId') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const mediaType = file.type as (typeof VALID_TYPES)[number]
  if (!VALID_TYPES.includes(mediaType)) {
    return NextResponse.json(
      { error: `Invalid image type. Supported: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Look up household's API key if householdId provided
  let apiKey: string | undefined
  if (householdId) {
    const { data: household } = await supabase
      .from('households')
      .select('anthropic_api_key')
      .eq('id', householdId)
      .single()
    if (household?.anthropic_api_key) {
      apiKey = household.anthropic_api_key
    }
  }

  // Convert to base64
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  try {
    const result = await extractRecipeFromImage(base64, mediaType, apiKey)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Recipe extraction failed:', error)
    return NextResponse.json(
      { error: 'Failed to extract recipe from image. Please try again or enter manually.' },
      { status: 422 }
    )
  }
}
