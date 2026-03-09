import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecipeDetail } from '@/components/features/recipe-detail'

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name, date_of_birth, person_type')
    .eq('household_id', profile?.default_household_id ?? '')

  const { data: recipe, error } = await supabase
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
    .single()

  if (error || !recipe) notFound()

  return <RecipeDetail recipe={recipe as any} persons={persons || []} />
}
