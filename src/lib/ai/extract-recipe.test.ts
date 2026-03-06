import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateExtractionResult, extractRecipeFromImages, type ExtractionResult, type ImageInput } from './extract-recipe'

// Mock the Anthropic SDK
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  })
  return { default: MockAnthropic }
})

describe('validateExtractionResult', () => {
  it('validates a correct extraction result', () => {
    const input: ExtractionResult = {
      title: 'Chicken Curry',
      description: 'A simple chicken curry',
      servings: 4,
      prep_time: 15,
      cook_time: 30,
      ingredients: [
        { raw_text: '500g chicken breast', quantity: 500, unit: 'g', name: 'chicken breast', notes: null },
        { raw_text: '1 onion, diced', quantity: 1, unit: null, name: 'onion', notes: 'diced' },
      ],
      instructions: ['Dice the chicken', 'Fry the onion', 'Add spices', 'Simmer'],
      tags: ['curry', 'chicken', 'dinner'],
    }
    const result = validateExtractionResult(input)
    expect(result.title).toBe('Chicken Curry')
    expect(result.ingredients).toHaveLength(2)
    expect(result.instructions).toHaveLength(4)
  })

  it('provides defaults for missing optional fields', () => {
    const input = {
      title: 'Test Recipe',
      ingredients: [{ raw_text: 'some ingredient' }],
      instructions: ['Step 1'],
    }
    const result = validateExtractionResult(input as any)
    expect(result.servings).toBe(4)
    expect(result.description).toBeNull()
    expect(result.prep_time).toBeNull()
    expect(result.cook_time).toBeNull()
    expect(result.tags).toEqual([])
  })

  it('throws for missing title', () => {
    const input = { ingredients: [], instructions: [] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })

  it('throws for empty ingredients', () => {
    const input = { title: 'Test', ingredients: [], instructions: ['Step 1'] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })

  it('throws for empty instructions', () => {
    const input = { title: 'Test', ingredients: [{ raw_text: 'foo' }], instructions: [] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })
})

const VALID_RESPONSE = JSON.stringify({
  title: 'Test Recipe',
  description: 'A test',
  servings: 4,
  prep_time: 10,
  cook_time: 20,
  ingredients: [{ raw_text: '1 cup flour', quantity: 1, unit: 'cup', name: 'flour', notes: null }],
  instructions: ['Mix ingredients', 'Bake at 350F'],
  tags: ['baking'],
})

describe('extractRecipeFromImages', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: VALID_RESPONSE }],
    })
  })

  it('sends a single image and extracts recipe', async () => {
    const images: ImageInput[] = [{ base64: 'abc123', mediaType: 'image/png' }]
    const result = await extractRecipeFromImages(images)

    expect(result.title).toBe('Test Recipe')
    expect(mockCreate).toHaveBeenCalledTimes(1)

    const call = mockCreate.mock.calls[0][0]
    const content = call.messages[0].content
    expect(content).toHaveLength(2) // 1 image + 1 text
    expect(content[0].type).toBe('image')
    expect(content[0].source.data).toBe('abc123')
    expect(content[1].type).toBe('text')
  })

  it('includes hint in prompt when provided', async () => {
    const images: ImageInput[] = [{ base64: 'abc123', mediaType: 'image/png' }]
    await extractRecipeFromImages(images, undefined, 'Focus on the dessert recipe')

    const call = mockCreate.mock.calls[0][0]
    const textBlock = call.messages[0].content.find((b: any) => b.type === 'text')
    expect(textBlock.text).toContain('User note: Focus on the dessert recipe')
    expect(textBlock.text).toContain('You are a recipe extraction assistant')
  })

  it('does not include hint prefix when no hint provided', async () => {
    const images: ImageInput[] = [{ base64: 'abc123', mediaType: 'image/png' }]
    await extractRecipeFromImages(images)

    const call = mockCreate.mock.calls[0][0]
    const textBlock = call.messages[0].content.find((b: any) => b.type === 'text')
    expect(textBlock.text).not.toContain('User note:')
  })

  it('sends multiple images in a single message', async () => {
    const images: ImageInput[] = [
      { base64: 'img1data', mediaType: 'image/png' },
      { base64: 'img2data', mediaType: 'image/jpeg' },
    ]
    await extractRecipeFromImages(images)

    const call = mockCreate.mock.calls[0][0]
    const content = call.messages[0].content
    expect(content).toHaveLength(3) // 2 images + 1 text
    expect(content[0].type).toBe('image')
    expect(content[0].source.data).toBe('img1data')
    expect(content[0].source.media_type).toBe('image/png')
    expect(content[1].type).toBe('image')
    expect(content[1].source.data).toBe('img2data')
    expect(content[1].source.media_type).toBe('image/jpeg')
    expect(content[2].type).toBe('text')
  })

  it('passes apiKey to Anthropic client', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const images: ImageInput[] = [{ base64: 'abc123', mediaType: 'image/png' }]
    await extractRecipeFromImages(images, 'sk-test-key')

    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-test-key' })
  })
})
