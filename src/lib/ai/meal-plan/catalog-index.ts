import { MEAL_GEN_RECIPE_ID_PREFIX } from './config'

export interface CatalogRecipe {
  id: string
  title: string
  tags: string[]
}

/**
 * Compact one-line-per-recipe index for the model's cached context.
 * Format: [r:<id>] <title> | <tag>, <tag>, ...
 * Stable order (alphabetical by title) keeps the prompt cache warm.
 */
export function buildCatalogIndex(recipes: CatalogRecipe[]): string {
  if (recipes.length === 0) return ''

  const clean = (s: string) => s.replace(/[|\n\r]/g, ' ')

  return [...recipes]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((r) => `[${MEAL_GEN_RECIPE_ID_PREFIX}${r.id}] ${clean(r.title)} | ${r.tags.map(clean).join(', ')}`)
    .join('\n')
}
