import Anthropic from '@anthropic-ai/sdk'

export interface ImageInput {
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
}

export interface ExtractedIngredient {
  raw_text: string
  quantity: number | null
  unit: string | null
  name: string | null
  notes: string | null
}

export interface HeroImageInfo {
  /** 0-based index of the image that best shows the finished dish */
  image_index: number
  /** Crop region as percentages (0-100) of the original image dimensions */
  crop: { x: number; y: number; width: number; height: number } | null
}

export interface ExtractionResult {
  title: string
  description: string | null
  servings: number
  prep_time: number | null
  cook_time: number | null
  ingredients: ExtractedIngredient[]
  instructions: string[]
  tags: string[]
  source_author: string | null
  source_book: string | null
  hero_image: HeroImageInfo | null
}

export function validateExtractionResult(input: any): ExtractionResult {
  if (!input.title || typeof input.title !== 'string') {
    throw new Error('Extraction result must include a title')
  }
  if (!input.ingredients || !Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new Error('Extraction result must include at least one ingredient')
  }
  if (!input.instructions || !Array.isArray(input.instructions) || input.instructions.length === 0) {
    throw new Error('Extraction result must include at least one instruction step')
  }

  return {
    title: input.title,
    description: input.description ?? null,
    servings: typeof input.servings === 'number' ? input.servings : 4,
    prep_time: typeof input.prep_time === 'number' ? input.prep_time : null,
    cook_time: typeof input.cook_time === 'number' ? input.cook_time : null,
    ingredients: input.ingredients.map((ing: any) => ({
      raw_text: ing.raw_text || '',
      quantity: typeof ing.quantity === 'number' ? ing.quantity : null,
      unit: ing.unit || null,
      name: ing.name || null,
      notes: ing.notes || null,
    })),
    instructions: input.instructions.filter((s: any) => typeof s === 'string' && s.trim()),
    tags: Array.isArray(input.tags) ? input.tags.map((t: string) => t.toLowerCase().trim()) : [],
    source_author: typeof input.source_author === 'string' ? input.source_author : null,
    source_book: typeof input.source_book === 'string' ? input.source_book : null,
    hero_image: input.hero_image && typeof input.hero_image.image_index === 'number'
      ? {
          image_index: input.hero_image.image_index,
          crop: input.hero_image.crop && typeof input.hero_image.crop.x === 'number'
            ? {
                x: input.hero_image.crop.x,
                y: input.hero_image.crop.y,
                width: input.hero_image.crop.width,
                height: input.hero_image.crop.height,
              }
            : null,
        }
      : null,
  }
}

const EXTRACTION_PROMPT = `You are a recipe extraction assistant. Analyze this image of a recipe (photo of a cookbook page, screenshot of a website, or handwritten recipe) and extract structured data.

Return ONLY valid JSON with this exact structure:
{
  "title": "Recipe title",
  "description": "Brief description of the dish",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 30,
  "ingredients": [
    {
      "raw_text": "2 large onions, diced",
      "quantity": 2,
      "unit": null,
      "name": "onion",
      "notes": "diced"
    }
  ],
  "instructions": [
    "Step 1 text",
    "Step 2 text"
  ],
  "tags": ["cuisine-type", "dietary-info", "meal-type"],
  "source_author": "Author name if identifiable",
  "source_book": "Book or publication title if identifiable",
  "hero_image": {
    "image_index": 0,
    "crop": { "x": 10, "y": 5, "width": 45, "height": 50 }
  }
}

- If multiple images are provided, they are all part of the same recipe (e.g. different pages, front/back of card). Combine information from all images into a single recipe.

Rules:
- quantity: numeric value (use decimals for fractions: 1/2 = 0.5). null if unspecified.
- unit: use standard abbreviations (g, kg, ml, l, tsp, tbsp, cup, oz, lb). null if no unit (e.g. "2 onions").
- name: singular, lowercase, size adjectives stripped ("onion" not "large onions").
- notes: preparation instructions separated from the ingredient name ("diced", "finely chopped").
- instructions: each step as a separate string, in order.
- tags: lowercase, relevant categories (e.g. "italian", "vegetarian", "dinner", "quick").
- If something is unclear or illegible, make your best guess and note uncertainty in the relevant notes field.
- prep_time and cook_time in minutes. null if not stated.
- source_author: the chef, blogger, or author if identifiable from the images (cover page, headers, attribution text). null if not found.
- source_book: the book, website, or publication name if identifiable. null if not found.
- hero_image: identify the best photo of the finished dish to use as the recipe's display image.
  - image_index: 0-based index of which provided image contains the best view of the finished food. If no image shows the food, set hero_image to null.
  - crop: if the food photo is part of a larger image (e.g. a cookbook page with both text and a photo), provide crop coordinates as PERCENTAGES (0-100) of the image dimensions to extract just the food portion. x/y is the top-left corner. Set to null if the entire image is suitable (e.g. a standalone food photo).`

export async function extractRecipeFromImages(
  images: ImageInput[],
  apiKey?: string,
  hint?: string
): Promise<ExtractionResult> {
  const client = new Anthropic(apiKey ? { apiKey } : undefined)

  const imageBlocks = images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mediaType,
      data: img.base64,
    },
  }))

  const promptText = hint
    ? `User note: ${hint}\n\n${EXTRACTION_PROMPT}`
    : EXTRACTION_PROMPT

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: promptText },
        ],
      },
    ],
  })

  // Extract JSON from response
  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  // Try to parse JSON from the response (may be wrapped in ```json blocks)
  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return validateExtractionResult(parsed)
}
