import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractRecipeFromImages, type ImageInput } from '@/lib/ai/extract-recipe'

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

// POST /api/recipes/extract — extract recipe from uploaded image(s)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const files = formData.getAll('images') as File[]
  const hint = formData.get('hint') as string | null
  const householdId = formData.get('householdId') as string | null

  if (!files.length) {
    return NextResponse.json({ error: 'No images provided' }, { status: 400 })
  }

  if (files.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 images allowed' }, { status: 400 })
  }

  for (const file of files) {
    const mediaType = file.type as (typeof VALID_TYPES)[number]
    if (!VALID_TYPES.includes(mediaType)) {
      return NextResponse.json(
        { error: `Invalid image type: ${file.type}. Supported: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
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

  // Convert all files to base64
  const images: ImageInput[] = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
      mediaType: file.type as ImageInput['mediaType'],
    }))
  )

  try {
    const result = await extractRecipeFromImages(images, apiKey, hint || undefined)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Recipe extraction failed:', error)

    // Surface useful detail so we can diagnose production issues
    let detail = error?.message || String(error)
    let status = 422

    // Anthropic SDK errors carry a status code
    if (error?.status) {
      status = error.status === 401 ? 401 : 422
      if (error.status === 401) {
        detail = 'Invalid or missing Anthropic API key'
      } else if (error.status === 429) {
        detail = 'Anthropic rate limit exceeded — please try again shortly'
      } else if (error.status === 529) {
        detail = 'Anthropic API is temporarily overloaded — please try again shortly'
      }
    }

    return NextResponse.json(
      { error: `Recipe extraction failed: ${detail}` },
      { status }
    )
  }
}
