import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecipeForm } from '@/components/features/recipe-form'

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .single()

  if (error || !recipe) notFound()

  return (
    <RecipeForm
      householdId={profile.default_household_id}
      initialData={recipe as any}
    />
  )
}
