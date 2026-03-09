'use client'

import { Badge } from '@/components/ui/badge'
import { getMemberBgClass } from '@/lib/utils/member-colors'
import { getAgeCategory } from '@/lib/utils/age-category'

export interface Person {
  id: string
  display_name: string | null
  date_of_birth: string | null
  person_type: string
}

interface MemberPickerProps {
  persons: Person[]
  selected: string[]   // person IDs
  onChange: (selected: string[]) => void
}

export function MemberPicker({ persons, selected, onChange }: MemberPickerProps) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Select who this recipe is suitable for. Untagged recipes are treated as general / adults only.
      </p>
      <div className="space-y-1">
        {persons.map((person) => {
          const isSelected = selected.includes(person.id)
          const ageCategory = getAgeCategory(person.date_of_birth)
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => toggle(person.id)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:bg-accent'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${getMemberBgClass(person.id)}`}
              >
                {(person.display_name || '?')[0].toUpperCase()}
              </span>
              <span className="text-sm font-medium">
                {person.display_name || 'Unknown'}
              </span>
              {ageCategory && (
                <Badge variant="outline" className="text-xs">
                  {ageCategory}
                </Badge>
              )}
              {isSelected && (
                <span className="ml-auto text-primary text-sm">&#10003;</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
