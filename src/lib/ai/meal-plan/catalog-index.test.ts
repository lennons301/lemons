import { describe, it, expect } from 'vitest'
import { buildCatalogIndex, OUT_OF_ROTATION_MARKER, type CatalogRecipe } from './catalog-index'

describe('buildCatalogIndex', () => {
  it('returns empty string for empty input', () => {
    expect(buildCatalogIndex([])).toBe('')
  })

  it('formats a single recipe with tags', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'abc-123', title: 'Thai Green Curry', tags: ['thai', 'curry', 'chicken'] },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:abc-123] Thai Green Curry | thai, curry, chicken')
  })

  it('joins multiple recipes with newlines', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'a', title: 'First', tags: ['tag1'] },
      { id: 'b', title: 'Second', tags: [] },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:a] First | tag1\n[r:b] Second | ')
  })

  it('sanitizes pipes and newlines in title to keep lines single-line', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'x', title: 'Pasta | with\nsauce', tags: [] },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:x] Pasta   with sauce | ')
  })

  it('sorts by title ascending for stable caching', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'b', title: 'Beta', tags: [] },
      { id: 'a', title: 'Alpha', tags: [] },
    ]
    expect(buildCatalogIndex(recipes).split('\n')[0]).toContain('Alpha')
  })

  it('appends the out-of-rotation marker to flagged recipes', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'a', title: 'Lasagne', tags: ['italian', 'pasta'], inRotation: false },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:a] Lasagne | italian, pasta [out of rotation]')
  })

  it('does not mark recipes that are in rotation or unflagged', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'a', title: 'Curry', tags: ['thai'], inRotation: true },
      { id: 'b', title: 'Stew', tags: [] },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:a] Curry | thai\n[r:b] Stew | ')
  })

  it('keeps alphabetical order with the marker present', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'c', title: 'Curry', tags: [], inRotation: true },
      { id: 'a', title: 'Apple Pie', tags: [], inRotation: false },
      { id: 'z', title: 'Ziti', tags: [], inRotation: false },
    ]
    expect(buildCatalogIndex(recipes)).toBe(
      '[r:a] Apple Pie |  [out of rotation]\n[r:c] Curry | \n[r:z] Ziti |  [out of rotation]',
    )
  })

  it('exports a marker constant matching the catalog line format', () => {
    expect(OUT_OF_ROTATION_MARKER).toBe('[out of rotation]')
  })
})
