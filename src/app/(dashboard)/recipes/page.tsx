import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { RecipeCard } from '@/components/features/recipe-card'
import { RecipeSearch } from '@/components/features/recipe-search'

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tag?: string; author?: string; book?: string; member?: string }>
}) {
  const { search, tag, author, book, member } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Get user's default household
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

  // Fetch household persons for member filter
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name, date_of_birth, person_type')
    .eq('household_id', householdId)

  // Fetch recipes
  let query = supabase
    .from('recipes')
    .select(`
      *,
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order),
      recipe_members(person_id)
    `)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  const { data: recipes } = await query

  let filteredRecipes = recipes || []
  if (tag) {
    filteredRecipes = filteredRecipes.filter((r: any) =>
      r.recipe_tags?.some((t: any) => t.tag_name === tag)
    )
  }
  if (author) {
    filteredRecipes = filteredRecipes.filter((r: any) =>
      r.source_author?.toLowerCase() === author.toLowerCase()
    )
  }
  if (book) {
    filteredRecipes = filteredRecipes.filter((r: any) =>
      r.source_book?.toLowerCase() === book.toLowerCase()
    )
  }
  if (member) {
    if (member === 'everyone') {
      // Recipes where ALL household persons are tagged
      const personIds = (persons || []).map((p: any) => p.id)
      filteredRecipes = filteredRecipes.filter((r: any) =>
        personIds.every((pid: string) =>
          r.recipe_members?.some((rm: any) => rm.person_id === pid)
        )
      )
    } else {
      filteredRecipes = filteredRecipes.filter((r: any) =>
        r.recipe_members?.some((rm: any) => rm.person_id === member)
      )
    }
  }

  // Collect tags with counts for the filter, sorted by frequency
  const tagCountMap = new Map<string, number>()
  for (const r of recipes || []) {
    for (const t of r.recipe_tags || []) {
      tagCountMap.set(t.tag_name, (tagCountMap.get(t.tag_name) || 0) + 1)
    }
  }
  const tagCounts = Array.from(tagCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <Link href="/recipes/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Recipe
          </Button>
        </Link>
      </div>

      <RecipeSearch
        tagCounts={tagCounts}
        activeTag={tag || null}
        persons={persons || []}
        activeMember={member || null}
      />

      {filteredRecipes.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">
            {search || tag || author || book || member ? 'No recipes match your search.' : 'No recipes yet.'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {!search && !tag && !author && !book && !member && 'Add your first recipe to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {filteredRecipes.map((recipe: any) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  )
}
