import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecipeCard } from '@/components/features/recipes/recipe-card'
import { RecipeSearch } from '@/components/features/recipes/recipe-search'
import { getPageContext } from '@/lib/supabase/queries'
import { countActiveFilters, filterRecipes, parseRecipeFilters } from '@/lib/utils/recipe-filters'

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseRecipeFilters(params)
  const author = typeof params.author === 'string' ? params.author : undefined
  const book = typeof params.book === 'string' ? params.book : undefined
  const { supabase, householdId } = await getPageContext()

  // Fetch persons and recipes in parallel; filtering is client/JS-side at household scale
  const [personsResult, recipesResult] = await Promise.all([
    supabase
      .from('household_persons')
      .select('id, display_name, date_of_birth, person_type')
      .eq('household_id', householdId),
    supabase
      .from('recipes')
      .select(`
        *,
        recipe_tags(tag_name),
        recipe_images(id, url, type, sort_order),
        recipe_members(person_id)
      `)
      .eq('household_id', householdId)
      .order('created_at', { ascending: false }),
  ])

  const persons = personsResult.data
  const recipes = recipesResult.data
  const personIds = (persons || []).map((p) => p.id)

  let filteredRecipes = filterRecipes(recipes || [], filters, personIds)
  if (author) {
    filteredRecipes = filteredRecipes.filter((r) =>
      r.source_author?.toLowerCase() === author.toLowerCase()
    )
  }
  if (book) {
    filteredRecipes = filteredRecipes.filter((r) =>
      r.source_book?.toLowerCase() === book.toLowerCase()
    )
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

  const hasAnyFilter =
    Boolean(filters.search) || countActiveFilters(filters) > 0 || Boolean(author) || Boolean(book)

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

      <RecipeSearch tagCounts={tagCounts} persons={persons || []} filters={filters} />

      {filteredRecipes.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">
            {hasAnyFilter ? 'No recipes match your search.' : 'No recipes yet.'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {!hasAnyFilter && 'Add your first recipe to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {filteredRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  )
}
