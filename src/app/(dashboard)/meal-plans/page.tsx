import { createClient } from '@/lib/supabase/server'
import { WeeklyGrid } from '@/components/features/meal-plan/weekly-grid'

export default async function MealPlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

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
