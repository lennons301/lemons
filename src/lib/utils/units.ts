export const UNIT_ALIASES: Record<string, string> = {
  // Volume - metric
  ml: 'millilitre',
  milliliter: 'millilitre',
  milliliters: 'millilitre',
  millilitres: 'millilitre',
  l: 'litre',
  liter: 'litre',
  liters: 'litre',
  litres: 'litre',
  // Volume - imperial
  tsp: 'teaspoon',
  teaspoons: 'teaspoon',
  tbsp: 'tablespoon',
  tablespoons: 'tablespoon',
  cup: 'cup',
  cups: 'cup',
  'fl oz': 'fluid ounce',
  'fluid ounces': 'fluid ounce',
  pint: 'pint',
  pints: 'pint',
  // Weight - metric
  g: 'gram',
  grams: 'gram',
  kg: 'kilogram',
  kilograms: 'kilogram',
  // Weight - imperial
  oz: 'ounce',
  ounces: 'ounce',
  lb: 'pound',
  lbs: 'pound',
  pounds: 'pound',
}

export function normalizeUnit(unit: string): string {
  if (!unit) return ''
  const cleaned = unit.trim().toLowerCase()
  if (!cleaned) return ''
  return UNIT_ALIASES[cleaned] ?? cleaned
}

// Base units: millilitre (volume), gram (weight)
// All conversions go through base unit
type UnitGroup = 'volume' | 'weight'

export const UNIT_TO_BASE: Record<string, { group: UnitGroup; factor: number }> = {
  // Volume → millilitre
  millilitre: { group: 'volume', factor: 1 },
  litre: { group: 'volume', factor: 1000 },
  teaspoon: { group: 'volume', factor: 4.92892 },
  tablespoon: { group: 'volume', factor: 14.7868 },
  'fluid ounce': { group: 'volume', factor: 29.5735 },
  cup: { group: 'volume', factor: 236.588 },
  pint: { group: 'volume', factor: 473.176 },
  // Weight → gram
  gram: { group: 'weight', factor: 1 },
  kilogram: { group: 'weight', factor: 1000 },
  ounce: { group: 'weight', factor: 28.3495 },
  pound: { group: 'weight', factor: 453.592 },
}

export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const from = UNIT_TO_BASE[fromUnit]
  const to = UNIT_TO_BASE[toUnit]
  if (!from || !to) return null
  if (from.group !== to.group) return null
  return (quantity * from.factor) / to.factor
}
