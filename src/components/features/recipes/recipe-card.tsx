import Image from 'next/image'
import Link from 'next/link'
import { Clock, UtensilsCrossed } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { OutOfRotationBadge } from './out-of-rotation-badge'
import { RotationToggle } from './rotation-toggle'

interface RecipeCardProps {
  recipe: {
    id: string
    title: string
    description: string | null
    servings: number
    prep_time: number | null
    cook_time: number | null
    in_rotation?: boolean
    recipe_tags: { tag_name: string }[]
    recipe_images: { url: string; type: string }[]
  }
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)
  const heroImage = recipe.recipe_images?.find(
    (img) => img.type === 'hero' || img.type === 'photo'
  ) || recipe.recipe_images?.[0]
  const inRotation = recipe.in_rotation !== false

  return (
    <div className="relative">
      <Link href={`/recipes/${recipe.id}`}>
        <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
          {heroImage ? (
            <div className="relative aspect-square overflow-hidden">
              <Image
                src={heroImage.url}
                alt={recipe.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 33vw"
              />
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center bg-muted">
              <UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" />
            </div>
          )}
          <div className="p-2.5">
            <h3 className="line-clamp-2 text-sm font-medium leading-tight">
              {recipe.title}
            </h3>
            {totalTime > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {totalTime} min
              </p>
            )}
            <OutOfRotationBadge inRotation={recipe.in_rotation} className="mt-1.5" />
          </div>
        </Card>
      </Link>
      <RotationToggle
        recipeId={recipe.id}
        inRotation={inRotation}
        compact
        className="absolute right-1.5 top-1.5 bg-background/80 shadow-sm backdrop-blur-sm hover:bg-background"
      />
    </div>
  )
}
