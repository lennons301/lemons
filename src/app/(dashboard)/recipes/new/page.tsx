import { RecipeForm } from '@/components/features/recipes/recipe-form'
import { getPageContext, getHouseholdPersons } from '@/lib/supabase/queries'

export default async function NewRecipePage() {
  const { supabase, householdId } = await getPageContext()

  const persons = await getHouseholdPersons(supabase, householdId)

  return <RecipeForm householdId={householdId} persons={persons} />
}
