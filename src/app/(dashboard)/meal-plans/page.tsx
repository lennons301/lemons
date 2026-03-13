import { WeeklyGrid } from '@/components/features/meal-plan/weekly-grid'
import { getPageContext } from '@/lib/supabase/queries'

export default async function MealPlansPage() {
  const { supabase, householdId } = await getPageContext()

  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name, date_of_birth, person_type')
    .eq('household_id', householdId)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Meal Plans</h1>
      <WeeklyGrid householdId={householdId} persons={persons || []} />
    </div>
  )
}
