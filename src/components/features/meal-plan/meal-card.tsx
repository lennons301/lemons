'use client'

import { X } from 'lucide-react'
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
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}
