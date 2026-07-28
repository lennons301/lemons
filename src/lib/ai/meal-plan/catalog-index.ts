import { MEAL_GEN_RECIPE_ID_PREFIX } from './config'

export interface CatalogRecipe {
  id: string
  title: string
  tags: string[]
  inRotation?: boolean
}

/** Appended to catalog lines for paused recipes; referenced by the system prompt's standing rule. */
export const OUT_OF_ROTATION_MARKER = '[out of rotation]'

/**
 * Compact one-line-per-recipe index for the model's cached context.
 * Format: [r:<id>] <title> | <tag>, <tag>, ...
 * Out-of-rotation recipes get a trailing marker; in-rotation lines are
 * unchanged so the prompt cache stays warm across rotation toggles elsewhere.
 * Stable order (alphabetical by title) keeps the prompt cache warm.
 */
export function buildCatalogIndex(recipes: CatalogRecipe[]): string {
  if (recipes.length === 0) return ''

  const clean = (s: string) => s.replace(/[|\n\r]/g, ' ')

  return [...recipes]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((r) => {
      const line = `[${MEAL_GEN_RECIPE_ID_PREFIX}${r.id}] ${clean(r.title)} | ${r.tags.map(clean).join(', ')}`
      return r.inRotation === false ? `${line} ${OUT_OF_ROTATION_MARKER}` : line
    })
    .join('\n')
}
