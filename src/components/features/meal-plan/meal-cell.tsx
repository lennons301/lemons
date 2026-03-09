'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MealCard } from './meal-card'

interface MealCellProps {
  entries: any[]
  persons: { id: string; display_name: string }[]
  onAdd: () => void
  onEdit: (entry: any) => void
  onDelete: (entryId: string) => void
}

export function MealCell({ entries, persons, onAdd, onEdit, onDelete }: MealCellProps) {
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
