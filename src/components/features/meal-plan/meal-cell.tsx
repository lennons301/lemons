'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MealCard } from './meal-card'
import { DraftMealCard } from './meal-gen/draft-meal-card'
import type { DraftRow } from './meal-gen/use-meal-gen-chat'

interface MealCellProps {
  entries: any[]
  drafts?: DraftRow[]
  recipeTitleById?: Record<string, string>
  persons: { id: string; display_name: string | null }[]
  onAdd: () => void
  onEdit: (entry: any) => void
  onDelete: (entryId: string) => void
}

export function MealCell({ entries, drafts, recipeTitleById, persons, onAdd, onEdit, onDelete }: MealCellProps) {
  return (
    <div className="min-h-[60px] space-y-1 p-1">
      {entries.map((entry) => (
        <MealCard
          key={entry.id}
          entry={entry}
          persons={persons}
          onEdit={() => onEdit(entry)}
          onDelete={() => onDelete(entry.id)}
        />
      ))}
      {(drafts ?? []).map((draft) => (
        <DraftMealCard key={draft.id} draft={draft} recipeTitleById={recipeTitleById} />
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
        onClick={onAdd}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add
      </Button>
    </div>
  )
}
