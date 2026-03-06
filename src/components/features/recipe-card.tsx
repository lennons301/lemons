import Image from 'next/image'
import Link from 'next/link'
import { Clock, Users, UtensilsCrossed } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface RecipeCardProps {
  recipe: {
    id: string
    title: string
    description: string | null
    servings: number
    prep_time: number | null
    cook_time: number | null
    recipe_tags: { tag_name: string }[]
    recipe_images: { url: string; type: string }[]
  }
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)
  const heroImage = recipe.recipe_images?.find(
    (img) => img.type === 'hero' || img.type === 'photo'
  ) || recipe.recipe_images?.[0]

  return (
    <Link href={`/recipes/${recipe.id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        {heroImage ? (
          <div className="relative aspect-video overflow-hidden rounded-t-lg">
            <Image
              src={heroImage.url}
              alt={recipe.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-t-lg bg-muted">
            <UtensilsCrossed className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <CardHeader className="pb-3">
          <CardTitle className="line-clamp-2 text-lg">{recipe.title}</CardTitle>
          {recipe.description && (
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {recipe.description}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {totalTime} min
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {recipe.servings}
            </span>
          </div>
          {recipe.recipe_tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {recipe.recipe_tags.slice(0, 4).map((t) => (
                <Badge key={t.tag_name} variant="secondary" className="text-xs">
                  {t.tag_name}
                </Badge>
              ))}
              {recipe.recipe_tags.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{recipe.recipe_tags.length - 4}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
