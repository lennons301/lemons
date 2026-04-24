import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { aggregateIngredients, type MealPlanIngredient } from '@/lib/utils/aggregate-ingredients'
import { roundToPacket, type PacketChoice, type PackRoundResult } from '@/lib/utils/pack-round'

export interface ShoppingLine extends PackRoundResult {
  is_staple: boolean
}

export interface ShoppingTotals {
  line_count: number
  waste_qty_total: number
  pack_total: number
}

export interface ShoppingForDraftsResult {
  items: ShoppingLine[]
  totals: ShoppingTotals
}

export async function buildShoppingFromDrafts(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ShoppingForDraftsResult | null> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, household_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conversation) return null

  const { data: drafts } = await supabase
    .from('meal_gen_drafts')
    .select('id, date, meal_type, source, recipe_id, inventory_item_id, custom_name, custom_ingredients, servings')
    .eq('conversation_id', conversationId)
    .order('date', { ascending: true })

  const draftRows = drafts ?? []

  // Collect recipe ids to fetch their ingredients.
  const recipeIds = Array.from(
    new Set(draftRows.filter((d) => d.source === 'recipe' && d.recipe_id).map((d) => d.recipe_id as string)),
  )

  const [recipesRes, staplesRes] = await Promise.all([
    recipeIds.length > 0
      ? supabase
          .from('recipes')
          .select('id, servings, recipe_ingredients(name, quantity, unit)')
          .in('id', recipeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; servings: number; recipe_ingredients: Array<{ name: string | null; quantity: number | null; unit: string | null }> }>, error: null }),
    supabase.from('household_staples').select('name, default_quantity, default_unit').eq('household_id', conversation.household_id),
  ])

  const recipeById = new Map<string, { servings: number; ingredients: Array<{ name: string | null; quantity: number | null; unit: string | null }> }>()
  for (const r of recipesRes.data ?? []) {
    recipeById.set(r.id, {
      servings: r.servings,
      ingredients: (r.recipe_ingredients ?? []) as Array<{ name: string | null; quantity: number | null; unit: string | null }>,
    })
  }

  // Build the scaled ingredient list.
  const items: MealPlanIngredient[] = []
  for (const d of draftRows) {
    if (d.source === 'recipe' && d.recipe_id) {
      const r = recipeById.get(d.recipe_id)
      if (!r) continue
      for (const ing of r.ingredients) {
        if (!ing.name) continue
        items.push({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          servings: d.servings,
          recipeServings: r.servings || 1,
        })
      }
    } else if (d.source === 'custom_with_ingredients' && Array.isArray(d.custom_ingredients)) {
      for (const ing of d.custom_ingredients as Array<{ name: string; quantity: number | null; unit: string | null }>) {
        if (!ing.name) continue
        items.push({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          servings: 1,
          recipeServings: 1,
        })
      }
    }
    // 'custom' and 'leftover' contribute nothing to the shopping list.
  }

  const aggregated = aggregateIngredients(items)

  // Collect unique ingredient names to pre-fetch packet sizes. Include both
  // names from aggregated ingredients AND staples so staples that aren't in
  // any draft still get packet rounding applied when we merge them in below.
  const stapleNamesLower = (staplesRes.data ?? [])
    .map((s) => (s.name || '').toLowerCase().trim())
    .filter(Boolean)
  const uniqueNames = Array.from(new Set([...aggregated.map((a) => a.name), ...stapleNamesLower]))

  const { data: packetRows } = uniqueNames.length > 0
    ? await supabase
        .from('packet_sizes')
        .select('ingredient_name, pack_quantity, pack_unit, is_default, household_id')
        .or(`household_id.is.null,household_id.eq.${conversation.household_id}`)
        .in('ingredient_name', uniqueNames)
    : { data: [] as Array<{ ingredient_name: string; pack_quantity: number; pack_unit: string; is_default: boolean; household_id: string | null }> }

  const packsByName = new Map<string, PacketChoice[]>()
  for (const row of packetRows ?? []) {
    const choice: PacketChoice = {
      pack_quantity: Number(row.pack_quantity),
      pack_unit: row.pack_unit,
      is_default: row.is_default,
      is_household: row.household_id !== null,
    }
    if (!packsByName.has(row.ingredient_name)) packsByName.set(row.ingredient_name, [])
    packsByName.get(row.ingredient_name)!.push(choice)
  }

  const stapleNamesSet = new Set(stapleNamesLower)

  // Round each line.
  const rounded: ShoppingLine[] = aggregated.map((line) => {
    const packs = packsByName.get(line.name) ?? []
    const r = roundToPacket(line, packs)
    return { ...r, is_staple: stapleNamesSet.has(line.name.toLowerCase()) }
  })

  // Merge staples not yet included (lowercase normalized to match packet_sizes rows).
  for (const s of staplesRes.data ?? []) {
    const lcName = (s.name || '').toLowerCase().trim()
    if (!lcName) continue
    if (rounded.some((r) => r.name.toLowerCase() === lcName)) continue
    const packs = packsByName.get(lcName) ?? []
    const r = roundToPacket({ name: lcName, quantity: s.default_quantity, unit: s.default_unit }, packs)
    rounded.push({ ...r, is_staple: true })
  }

  const totals: ShoppingTotals = {
    line_count: rounded.length,
    waste_qty_total: rounded.reduce((acc, l) => acc + (l.waste_qty || 0), 0),
    pack_total: rounded.reduce((acc, l) => acc + (l.pack_count || 0), 0),
  }

  return { items: rounded, totals }
}
