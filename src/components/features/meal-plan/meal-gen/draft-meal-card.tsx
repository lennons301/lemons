'use client'

import { Sparkles } from 'lucide-react'
import type { DraftRow } from './use-meal-gen-chat'

interface Props {
  draft: DraftRow
  recipeTitleById?: Record<string, string>
}

export function DraftMealCard({ draft, recipeTitleById }: Props) {
  let displayName = ''
  if (draft.source === 'recipe' && draft.recipe_id) {
    displayName = recipeTitleById?.[draft.recipe_id] ?? '(recipe)'
  } else if (draft.source === 'leftover') {
    displayName = draft.custom_name ?? '(leftover)'
  } else {
    displayName = draft.custom_name ?? '(custom)'
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-dashed border-primary/60 bg-primary/5 px-2 py-1 text-xs">
      <Sparkles className="h-3 w-3 text-primary" />
      <span className="flex-1 truncate">{displayName}</span>
      <span className="text-[10px] text-muted-foreground">
        {draft.servings}×
      </span>
    </div>
  )
}
