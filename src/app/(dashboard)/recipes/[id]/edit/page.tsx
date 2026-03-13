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

  const persons = await getHouseholdPersons(supabase, householdId)

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_members(person_id)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .single()

  if (error || !recipe) notFound()

  return (
    <RecipeForm
      householdId={householdId}
      initialData={recipe as any}
      persons={persons}
    />
  )
}
