/**
 * Recipe library filter state: parsing/serializing URL search params and the
 * composition logic. Facet groups combine with AND:
 * (any selected tag) ∧ (all selected members) ∧ (rotation state) ∧ (title search)
 */

export const EVERYONE = 'everyone'

export type RotationFilter = 'all' | 'in' | 'out'

export interface RecipeFilterState {
  search: string
  /** OR semantics: a recipe matches if it has any selected tag */
  tags: string[]
  /** Match-all semantics: person ids, may include the EVERYONE shortcut */
  members: string[]
  rotation: RotationFilter
}

export interface FilterableRecipe {
  title: string
  in_rotation?: boolean | null
  recipe_tags?: { tag_name: string }[] | null
  recipe_members?: { person_id: string }[] | null
}

type ParamValue = string | string[] | undefined

function firstValue(value: ParamValue): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function parseList(value: ParamValue): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '')
  return [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))]
}

/**
 * Parse filter state from URL search params. Accepts the legacy single-value
 * `tag`/`member` keys as aliases so old shared links keep working.
 */
export function parseRecipeFilters(
  params: Record<string, ParamValue>
): RecipeFilterState {
  const rotation = firstValue(params.rotation)
  return {
    search: firstValue(params.search),
    tags: [...new Set([...parseList(params.tags), ...parseList(params.tag)])],
    members: [...new Set([...parseList(params.members), ...parseList(params.member)])],
    rotation: rotation === 'in' || rotation === 'out' ? rotation : 'all',
  }
}

/**
 * Write filter state onto search params (lists comma-separated). Unrelated
 * params from `base` (e.g. author, book) are preserved; legacy `tag`/`member`
 * keys are dropped in favor of the list params.
 */
export function serializeRecipeFilters(
  filters: RecipeFilterState,
  base?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(base?.toString())
  params.delete('tag')
  params.delete('member')

  const entries: [string, string][] = [
    ['search', filters.search],
    ['tags', filters.tags.join(',')],
    ['members', filters.members.join(',')],
    ['rotation', filters.rotation === 'all' ? '' : filters.rotation],
  ]
  for (const [key, value] of entries) {
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }
  return params
}

export function countActiveFilters(filters: RecipeFilterState): number {
  return (
    filters.tags.length +
    filters.members.length +
    (filters.rotation === 'all' ? 0 : 1)
  )
}

/** Selected member ids with the EVERYONE shortcut expanded to all household persons. */
function effectiveMemberIds(members: string[], allPersonIds: string[]): string[] {
  if (!members.includes(EVERYONE)) return members
  return [...new Set([...allPersonIds, ...members.filter((m) => m !== EVERYONE)])]
}

export function filterRecipes<T extends FilterableRecipe>(
  recipes: T[],
  filters: RecipeFilterState,
  allPersonIds: string[]
): T[] {
  const search = filters.search.toLowerCase()
  const tagSet = new Set(filters.tags)
  const memberIds = effectiveMemberIds(filters.members, allPersonIds)

  return recipes.filter((recipe) => {
    if (search && !recipe.title.toLowerCase().includes(search)) return false
    if (tagSet.size > 0 && !recipe.recipe_tags?.some((t) => tagSet.has(t.tag_name))) {
      return false
    }
    if (
      memberIds.length > 0 &&
      !memberIds.every((id) => recipe.recipe_members?.some((rm) => rm.person_id === id))
    ) {
      return false
    }
    if (filters.rotation === 'in' && recipe.in_rotation === false) return false
    if (filters.rotation === 'out' && recipe.in_rotation !== false) return false
    return true
  })
}
