// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { extractRecipeFromImage } from './extract-recipe'

// Smoke test — calls the real Claude API. Requires ANTHROPIC_API_KEY env var.
// Run with: ANTHROPIC_API_KEY=sk-... npx vitest run src/lib/ai/extract-recipe.smoke.test.ts
describe('extractRecipeFromImage (smoke)', () => {
  it('extracts structured recipe data from a screenshot', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.log('Skipping smoke test: ANTHROPIC_API_KEY not set')
      return
    }

    const imagePath = join(__dirname, '__fixtures__', 'recipe-screenshot.png')
    const imageBuffer = readFileSync(imagePath)
    const base64 = imageBuffer.toString('base64')

    const result = await extractRecipeFromImage(base64, 'image/png', apiKey)

    // Title
    expect(result.title.toLowerCase()).toContain('banana bread')

    // Servings
    expect(result.servings).toBe(8)

    // Times
    expect(result.prep_time).toBe(15)
    expect(result.cook_time).toBe(60)

    // Ingredients — should have 8 items
    expect(result.ingredients.length).toBeGreaterThanOrEqual(7)

    // Check some key ingredients are extracted
    const ingredientNames = result.ingredients.map((i) => i.name?.toLowerCase() ?? '')
    expect(ingredientNames).toEqual(
      expect.arrayContaining([
        expect.stringContaining('banana'),
        expect.stringContaining('butter'),
        expect.stringContaining('sugar'),
        expect.stringContaining('flour'),
      ])
    )

    // Check some quantities
    const bananaIng = result.ingredients.find((i) => i.name?.toLowerCase().includes('banana'))
    expect(bananaIng?.quantity).toBe(3)

    const flourIng = result.ingredients.find((i) => i.name?.toLowerCase().includes('flour'))
    expect(flourIng?.quantity).toBe(1.5)
    expect(flourIng?.unit).toBe('cup')

    // Instructions — should have 9 steps
    expect(result.instructions.length).toBeGreaterThanOrEqual(8)
    expect(result.instructions[0].toLowerCase()).toContain('preheat')

    // Tags
    expect(result.tags.length).toBeGreaterThan(0)
  }, 30000)
})
