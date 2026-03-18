import { notFound } from 'next/navigation'
import { RecipeForm } from '@/components/features/recipes/recipe-form'
import { getPageContext, getHouseholdPersons } from '@/lib/supabase/queries'

export default async function EditRecipePage({
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
        recipe_members(person_id)
      `)
      .eq('id', id)
      .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
      .single(),
  ])

  if (recipeResult.error || !recipeResult.data) notFound()

  return (
    <RecipeForm
      householdId={householdId}
      initialData={recipeResult.data as any}
      persons={persons}
    />
  )
}
