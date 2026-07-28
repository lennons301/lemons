import { describe, it, expect } from 'vitest'
import {
  EVERYONE,
  countActiveFilters,
  filterRecipes,
  parseRecipeFilters,
  serializeRecipeFilters,
  type RecipeFilterState,
} from './recipe-filters'

const defaults: RecipeFilterState = { search: '', tags: [], members: [], rotation: 'all' }

function recipe(overrides: {
  title?: string
  tags?: string[]
  members?: string[]
  in_rotation?: boolean
}) {
  return {
    title: overrides.title ?? 'Recipe',
    in_rotation: overrides.in_rotation,
    recipe_tags: (overrides.tags ?? []).map((tag_name) => ({ tag_name })),
    recipe_members: (overrides.members ?? []).map((person_id) => ({ person_id })),
  }
}

describe('parseRecipeFilters', () => {
  it('defaults to no filters', () => {
    expect(parseRecipeFilters({})).toEqual(defaults)
  })

  it('parses comma-separated tag and member lists', () => {
    expect(parseRecipeFilters({ tags: 'quick,veggie', members: 'p1,p2' })).toEqual({
      ...defaults,
      tags: ['quick', 'veggie'],
      members: ['p1', 'p2'],
    })
  })

  it('drops empty entries and duplicates from lists', () => {
    expect(parseRecipeFilters({ tags: 'quick,,quick, ' }).tags).toEqual(['quick'])
  })

  it('accepts legacy single-value tag and member params', () => {
    expect(parseRecipeFilters({ tag: 'quick', member: 'p1' })).toEqual({
      ...defaults,
      tags: ['quick'],
      members: ['p1'],
    })
  })

  it('merges legacy and list params without duplicates', () => {
    expect(parseRecipeFilters({ tags: 'quick,veggie', tag: 'quick' }).tags).toEqual([
      'quick',
      'veggie',
    ])
  })

  it('parses rotation and falls back to all for unknown values', () => {
    expect(parseRecipeFilters({ rotation: 'in' }).rotation).toBe('in')
    expect(parseRecipeFilters({ rotation: 'out' }).rotation).toBe('out')
    expect(parseRecipeFilters({ rotation: 'bogus' }).rotation).toBe('all')
  })
})

describe('serializeRecipeFilters', () => {
  it('round-trips filter state through search params', () => {
    const state: RecipeFilterState = {
      search: 'curry',
      tags: ['quick', 'veggie'],
      members: ['p1', 'p2'],
      rotation: 'out',
    }
    const params = serializeRecipeFilters(state)
    expect(parseRecipeFilters(Object.fromEntries(params.entries()))).toEqual(state)
  })

  it('omits empty filters and the default rotation', () => {
    expect(serializeRecipeFilters(defaults).toString()).toBe('')
  })

  it('preserves unrelated params and drops legacy keys', () => {
    const base = new URLSearchParams('author=Ottolenghi&tag=quick&member=p1')
    const params = serializeRecipeFilters({ ...defaults, tags: ['veggie'] }, base)
    expect(params.get('author')).toBe('Ottolenghi')
    expect(params.get('tag')).toBeNull()
    expect(params.get('member')).toBeNull()
    expect(params.get('tags')).toBe('veggie')
  })
})

describe('countActiveFilters', () => {
  it('counts each selected tag and member plus a non-default rotation', () => {
    expect(countActiveFilters(defaults)).toBe(0)
    expect(
      countActiveFilters({ search: '', tags: ['a', 'b'], members: [EVERYONE], rotation: 'in' })
    ).toBe(4)
  })

  it('does not count title search', () => {
    expect(countActiveFilters({ ...defaults, search: 'curry' })).toBe(0)
  })
})

describe('filterRecipes', () => {
  const persons = ['p1', 'p2', 'p3']

  it('returns everything when no filters are active', () => {
    const recipes = [recipe({ title: 'A' }), recipe({ title: 'B', in_rotation: false })]
    expect(filterRecipes(recipes, defaults, persons)).toEqual(recipes)
  })

  it('matches recipes with ANY selected tag (OR within tags)', () => {
    const quick = recipe({ title: 'Quick', tags: ['quick'] })
    const veggie = recipe({ title: 'Veggie', tags: ['veggie'] })
    const other = recipe({ title: 'Other', tags: ['baking'] })
    const result = filterRecipes(
      [quick, veggie, other],
      { ...defaults, tags: ['quick', 'veggie'] },
      persons
    )
    expect(result).toEqual([quick, veggie])
  })

  it('matches recipes suitable for ALL selected members', () => {
    const both = recipe({ title: 'Both', members: ['p1', 'p2'] })
    const onlyP1 = recipe({ title: 'Only P1', members: ['p1'] })
    const result = filterRecipes(
      [both, onlyP1],
      { ...defaults, members: ['p1', 'p2'] },
      persons
    )
    expect(result).toEqual([both])
  })

  it('expands the everyone shortcut to all household persons', () => {
    const all = recipe({ title: 'All', members: ['p1', 'p2', 'p3'] })
    const some = recipe({ title: 'Some', members: ['p1', 'p2'] })
    const result = filterRecipes([all, some], { ...defaults, members: [EVERYONE] }, persons)
    expect(result).toEqual([all])
  })

  it('filters rotation state: in, out, and all', () => {
    const inRotation = recipe({ title: 'In', in_rotation: true })
    const unset = recipe({ title: 'Unset' })
    const out = recipe({ title: 'Out', in_rotation: false })
    const recipes = [inRotation, unset, out]

    expect(filterRecipes(recipes, { ...defaults, rotation: 'in' }, persons)).toEqual([
      inRotation,
      unset,
    ])
    expect(filterRecipes(recipes, { ...defaults, rotation: 'out' }, persons)).toEqual([out])
    expect(filterRecipes(recipes, { ...defaults, rotation: 'all' }, persons)).toEqual(recipes)
  })

  it('matches title search case-insensitively', () => {
    const curry = recipe({ title: 'Chicken Curry' })
    const pasta = recipe({ title: 'Pasta' })
    expect(filterRecipes([curry, pasta], { ...defaults, search: 'CURRY' }, persons)).toEqual([
      curry,
    ])
  })

  it('combines facet groups with AND', () => {
    const match = recipe({
      title: 'Quick Curry',
      tags: ['quick'],
      members: ['p1', 'p2'],
      in_rotation: true,
    })
    const wrongTag = recipe({
      title: 'Slow Curry',
      tags: ['slow'],
      members: ['p1', 'p2'],
      in_rotation: true,
    })
    const missingMember = recipe({
      title: 'Quick Curry Solo',
      tags: ['quick'],
      members: ['p1'],
      in_rotation: true,
    })
    const outOfRotation = recipe({
      title: 'Quick Curry Retired',
      tags: ['quick'],
      members: ['p1', 'p2'],
      in_rotation: false,
    })
    const wrongTitle = recipe({
      title: 'Quick Stew',
      tags: ['quick'],
      members: ['p1', 'p2'],
      in_rotation: true,
    })

    const filters: RecipeFilterState = {
      search: 'curry',
      tags: ['quick', 'veggie'],
      members: ['p1', 'p2'],
      rotation: 'in',
    }
    const result = filterRecipes(
      [match, wrongTag, missingMember, outOfRotation, wrongTitle],
      filters,
      persons
    )
    expect(result).toEqual([match])
  })

  it('treats recipes without tags or members as non-matching when those filters are active', () => {
    const bare = { title: 'Bare', recipe_tags: null, recipe_members: null }
    expect(filterRecipes([bare], { ...defaults, tags: ['quick'] }, persons)).toEqual([])
    expect(filterRecipes([bare], { ...defaults, members: ['p1'] }, persons)).toEqual([])
  })
})
