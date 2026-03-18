import { notFound } from 'next/navigation'
import { RecipeDetail } from '@/components/features/recipes/recipe-detail'
import { getPageContext, getHouseholdPersons } from '@/lib/supabase/queries'

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, householdId } = await getPageContext()

  const [persons, recipeResult] = await Promise.all([
    getHouseholdPersons(supabase, householdId),
    supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients(*),
        recipe_tags(tag_name),
        recipe_images(id, url, type, sort_order),
        recipe_members(person_id)
      `)
      .eq('id', id)
      .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
      .order('sort_order', { referencedTable: 'recipe_images', ascending: true })
      .single(),
  ])

  if (recipeResult.error || !recipeResult.data) notFound()

  return <RecipeDetail recipe={recipeResult.data as any} persons={persons} />
}
