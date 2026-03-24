'use client'

import { X, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getMemberBgClass } from '@/lib/utils/member-colors'

interface MealCardProps {
  entry: {
    id: string
    recipe_id: string | null
    custom_name: string | null
    servings: number
    assigned_to: string[]
    status: string
    recipes?: { id: string; title: string; recipe_images?: { url: string; type: string }[] } | null
  }
  persons: { id: string; display_name: string | null }[]
  onEdit: () => void
  onDelete: () => void
}

export function MealCard({ entry, persons, onEdit, onDelete }: MealCardProps) {
  const title = entry.recipes?.title || entry.custom_name || 'Untitled'
  const thumbnail = entry.recipes?.recipe_images?.find((img) => img.type === 'photo')?.url
  const assignedPersons = persons.filter((p) => entry.assigned_to.includes(p.id))

  return (
    <div
      className="group relative flex items-start gap-2 rounded-md border bg-card p-2 text-sm cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onEdit}
    >
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          className="h-8 w-8 rounded object-cover flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{title}</p>
        {assignedPersons.length > 0 && assignedPersons.length < persons.length && (
          <div className="flex gap-0.5 mt-0.5">
            {assignedPersons.map((p) => (
              <span
                key={p.id}
                className={`inline-block h-4 w-4 rounded-full text-[10px] leading-4 text-center text-white ${getMemberBgClass(p.id)}`}
                title={p.display_name || 'Unknown'}
              >
                {(p.display_name || '?')[0]}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0">
        {entry.recipe_id && (
          <Link
            href={`/recipes/${entry.recipe_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent hover:text-accent-foreground"
            title="View recipe"
          >
            <BookOpen className="h-3 w-3" />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
