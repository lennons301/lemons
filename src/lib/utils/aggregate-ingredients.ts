import { normalizeUnit, convertUnit, UNIT_TO_BASE } from './units'
import { scaleQuantity } from './scaling'

export interface MealPlanIngredient {
  name: string
  quantity: number | null
  unit: string | null
  servings: number       // desired servings from meal plan entry
  recipeServings: number // base servings from recipe
}

export interface AggregatedItem {
  name: string
  quantity: number | null
  unit: string | null
}

export function aggregateIngredients(items: MealPlanIngredient[]): AggregatedItem[] {
  if (items.length === 0) return []

  // Scale each item first
  const scaled = items.map((item) => ({
    name: item.name,
    quantity: scaleQuantity(item.quantity, item.recipeServings, item.servings),
    unit: item.unit ? normalizeUnit(item.unit) : null,
  }))

  // Group by normalized name
  const groups = new Map<string, typeof scaled>()
  for (const item of scaled) {
    const key = item.name.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  const result: AggregatedItem[] = []

  for (const [name, group] of groups) {
    // Separate items with null quantity
    const withQty = group.filter((g) => g.quantity !== null)
    const withoutQty = group.filter((g) => g.quantity === null)

    if (withQty.length === 0) {
      // All null quantity — keep one entry
      result.push({ name, quantity: null, unit: group[0].unit })
      continue
    }

    // Sub-group by unit compatibility (same UNIT_TO_BASE group)
    const unitBuckets = new Map<string, { quantity: number; unit: string }[]>()

    for (const item of withQty) {
      const unitInfo = item.unit ? UNIT_TO_BASE[item.unit] : null
      const bucketKey = unitInfo ? unitInfo.group : (item.unit || '__none__')

      if (!unitBuckets.has(bucketKey)) unitBuckets.set(bucketKey, [])
      unitBuckets.get(bucketKey)!.push({
        quantity: item.quantity!,
        unit: item.unit || '',
      })
    }

    for (const [bucketKey, bucket] of unitBuckets) {
      if (bucket.length === 1) {
        result.push({ name, quantity: bucket[0].quantity, unit: bucket[0].unit || null })
        continue
      }

      // Check if all units are the same
      const allSameUnit = bucket.every((b) => b.unit === bucket[0].unit)
      if (allSameUnit) {
        const total = bucket.reduce((sum, b) => sum + b.quantity, 0)
        result.push({ name, quantity: Math.round(total * 100) / 100, unit: bucket[0].unit || null })
        continue
      }

      // Convert all to base unit (ml for volume, g for weight)
      const baseUnit = bucketKey === 'volume' ? 'millilitre' : bucketKey === 'weight' ? 'gram' : null
      if (baseUnit) {
        let total = 0
        for (const b of bucket) {
          const converted = convertUnit(b.quantity, b.unit, baseUnit)
          if (converted !== null) {
            total += converted
          }
        }
        result.push({ name, quantity: Math.round(total * 100) / 100, unit: baseUnit })
      } else {
        // Unknown unit group — keep separate
        for (const b of bucket) {
          result.push({ name, quantity: b.quantity, unit: b.unit || null })
        }
      }
    }

    // Add null-quantity entries if any
    if (withoutQty.length > 0) {
      result.push({ name, quantity: null, unit: withoutQty[0].unit })
    }
  }

  return result
}
