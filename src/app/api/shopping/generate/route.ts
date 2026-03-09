import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateIngredients, type MealPlanIngredient } from '@/lib/utils/aggregate-ingredients'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { household_id, from, to } = await request.json()

  if (!household_id || !from || !to) {
    return NextResponse.json({ error: 'household_id, from, and to are required' }, { status: 400 })
  }

  // 1. Fetch meal plan entries with recipe ingredients
  const { data: entries, error: entriesError } = await supabase
    .from('meal_plan_entries')
    .select(`
      *,
      recipes(
        id, title, servings,
        recipe_ingredients(name, quantity, unit)
      )
    `)
    .eq('household_id', household_id)
    .gte('date', from)
    .lte('date', to)
    .neq('status', 'skipped')

  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 })

  // 2. Collect all ingredients with scaling info
  const allIngredients: MealPlanIngredient[] = []

  for (const entry of entries || []) {
    if (!entry.recipes?.recipe_ingredients) continue
    for (const ing of entry.recipes.recipe_ingredients) {
      if (!ing.name) continue
      allIngredients.push({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        servings: entry.servings,
        recipeServings: entry.recipes.servings,
      })
    }
  }

  // 3. Aggregate
  const aggregated = aggregateIngredients(allIngredients)

  // 4. Fetch household staples and merge
  const { data: staples } = await supabase
    .from('household_staples')
    .select('*')
    .eq('household_id', household_id)

  const stapleItems = (staples || []).map((s) => ({
    name: s.name,
    quantity: s.default_quantity,
    unit: s.default_unit,
    isStaple: true,
  }))

  // Merge: if a staple name already exists in aggregated, mark it; otherwise add it
  const draft = aggregated.map((item) => ({
    ...item,
    isStaple: false,
  }))

  for (const staple of stapleItems) {
    const existing = draft.find((d) => d.name.toLowerCase() === staple.name.toLowerCase())
    if (existing) {
      existing.isStaple = true
    } else {
      draft.push(staple)
    }
  }

  return NextResponse.json({
    from,
    to,
    entry_count: (entries || []).length,
    items: draft,
  })
}
