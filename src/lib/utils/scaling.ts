export function scaleQuantity(
  quantity: number | null,
  baseServings: number,
  desiredServings: number
): number | null {
  if (quantity === null || quantity === undefined) return null
  if (!baseServings || baseServings === 0) return null
  const scaled = (quantity * desiredServings) / baseServings
  return Math.round(scaled * 100) / 100
}

export interface Ingredient {
  id: string
  recipe_id: string
  raw_text: string
  quantity: number | null
  unit: string | null
  name: string | null
  group: string | null
  optional: boolean
  notes: string | null
  sort_order: number
}

export function scaleIngredients(
  ingredients: Ingredient[],
  baseServings: number,
  desiredServings: number
): Ingredient[] {
  return ingredients.map((ing) => ({
    ...ing,
    quantity: scaleQuantity(ing.quantity, baseServings, desiredServings),
  }))
}
