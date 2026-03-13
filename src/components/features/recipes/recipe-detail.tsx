'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ChevronDown, Clock, Edit, Minus, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { scaleIngredients } from '@/lib/utils/scaling'
import type { Person } from '@/types/person'
import { getMemberBgClass } from '@/lib/utils/member-colors'

interface RecipeDetailProps {
  persons?: Person[]
  recipe: {
    id: string
    title: string
    description: string | null
    servings: number
    prep_time: number | null
    cook_time: number | null
    instructions: string[]
    source_url: string | null
    source_author: string | null
    source_book: string | null
    recipe_ingredients: {
      id: string
      recipe_id: string
      raw_text: string
      quantity: number | null
      unit: string | null
      name: string | null
      group: string | null
      optional: boolean
      notes: string | null
      sort_order: number
    }[]
    recipe_tags: { tag_name: string }[]
    recipe_images: { id: string; url: string; type: string }[]
    recipe_members?: { person_id: string }[]
  }
}

export function RecipeDetail({ recipe, persons = [] }: RecipeDetailProps) {
  const router = useRouter()
  const [desiredServings, setDesiredServings] = useState(recipe.servings)
  const [deleting, setDeleting] = useState(false)

  const scaledIngredients = scaleIngredients(
    recipe.recipe_ingredients,
    recipe.servings,
    desiredServings
  )

  const handleDelete = async () => {
    if (!confirm('Delete this recipe? This cannot be undone.')) return
    setDeleting(true)
    const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/recipes')
      router.refresh()
    } else {
      setDeleting(false)
      toast.error('Failed to delete recipe')
    }
  }

  // Group ingredients
  const groups = new Map<string, typeof scaledIngredients>()
  for (const ing of scaledIngredients) {
    const group = ing.group || ''
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(ing)
  }

  const heroImage = recipe.recipe_images?.find(
    (img) => img.type === 'hero' || img.type === 'photo'
  ) || recipe.recipe_images?.find((img) => img.type !== 'source')

  const sourceImages = recipe.recipe_images?.filter((img) => img.type === 'source') || []

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/recipes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex-1" />
        <Link href={`/recipes/${recipe.id}/edit`}>
          <Button variant="outline" size="sm">
            <Edit className="mr-1 h-4 w-4" />
            Edit
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-destructive"
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
      </div>

      {heroImage && (
        <div className="relative aspect-video overflow-hidden rounded-lg">
          <Image
            src={heroImage.url}
            alt={recipe.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
            priority
          />
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
        {recipe.description && (
          <p className="text-muted-foreground mt-2">{recipe.description}</p>
        )}
        <div className="mt-3 flex items-center gap-4 text-sm">
          {recipe.prep_time && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Prep: {recipe.prep_time} min
            </span>
          )}
          {recipe.cook_time && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Cook: {recipe.cook_time} min
            </span>
          )}
          {totalTime > 0 && (
            <span className="text-muted-foreground font-medium">
              Total: {totalTime} min
            </span>
          )}
        </div>
        {recipe.recipe_tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {recipe.recipe_tags.map((t) => (
              <Badge key={t.tag_name} variant="secondary">
                {t.tag_name}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Suitable for:</span>
          <div className="flex flex-wrap gap-1">
            {recipe.recipe_members && recipe.recipe_members.length > 0 ? (
              recipe.recipe_members.map((rm) => {
                const person = persons.find((p) => p.id === rm.person_id)
                if (!person) return null
                return (
                  <span
                    key={person.id}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${getMemberBgClass(person.id)}`}
                  >
                    {person.display_name || 'Unknown'}
                  </span>
                )
              })
            ) : (
              <Badge variant="secondary">Adults</Badge>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Ingredients */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ingredients</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDesiredServings((s) => Math.max(1, s - 1))}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="flex min-w-[4rem] items-center justify-center gap-1 text-sm">
                <Users className="h-4 w-4" />
                {desiredServings}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDesiredServings((s) => s + 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {Array.from(groups.entries()).map(([group, ings]) => (
            <div key={group} className="mb-4 last:mb-0">
              {group && (
                <h4 className="mb-2 text-sm font-medium">{group}</h4>
              )}
              <ul className="space-y-1.5">
                {ings.map((ing) => (
                  <li key={ing.id} className={`text-sm ${ing.optional ? 'text-muted-foreground' : ''}`}>
                    {ing.quantity != null && (
                      <span className="font-medium">
                        {formatQuantity(ing.quantity)}
                      </span>
                    )}{' '}
                    {ing.unit && <span>{ing.unit}</span>}{' '}
                    <span>{ing.name || ing.raw_text}</span>
                    {ing.notes && (
                      <span className="text-muted-foreground">, {ing.notes}</span>
                    )}
                    {ing.optional && (
                      <span className="text-muted-foreground"> (optional)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="text-sm leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {(recipe.source_book || recipe.source_author || recipe.source_url) && (
        <div className="text-muted-foreground text-sm">
          {(recipe.source_book || recipe.source_author) && (
            <p>
              {recipe.source_book && (
                <>
                  From{' '}
                  <Link
                    href={`/recipes?book=${encodeURIComponent(recipe.source_book)}`}
                    className="font-medium italic text-foreground hover:underline"
                  >
                    {recipe.source_book}
                  </Link>
                </>
              )}
              {recipe.source_author && (
                <>
                  {recipe.source_book ? ' by ' : 'By '}
                  <Link
                    href={`/recipes?author=${encodeURIComponent(recipe.source_author)}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {recipe.source_author}
                  </Link>
                </>
              )}
            </p>
          )}
          {recipe.source_url && (
            <p className={recipe.source_book || recipe.source_author ? 'mt-1' : ''}>
              Source:{' '}
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {recipe.source_url}
              </a>
            </p>
          )}
        </div>
      )}

      {sourceImages.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4" />
            View original source ({sourceImages.length} {sourceImages.length === 1 ? 'image' : 'images'})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {sourceImages.map((img) => (
              <div key={img.id} className="relative overflow-hidden rounded-lg border">
                <Image
                  src={img.url}
                  alt="Original recipe source"
                  width={768}
                  height={1024}
                  className="w-full object-contain"
                />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

function formatQuantity(n: number): string {
  if (n === Math.floor(n)) return n.toString()
  // Common fractions
  const fractions: Record<string, string> = {
    '0.25': '1/4',
    '0.33': '1/3',
    '0.5': '1/2',
    '0.67': '2/3',
    '0.75': '3/4',
  }
  const decimal = (n % 1).toFixed(2)
  const whole = Math.floor(n)
  const frac = fractions[decimal]
  if (frac) {
    return whole > 0 ? `${whole} ${frac}` : frac
  }
  return n.toFixed(1)
}
