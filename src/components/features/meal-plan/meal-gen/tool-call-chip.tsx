'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TOOL_LABELS } from './constants'
import type { MealGenToolCall } from '@/types/meal-gen'

interface Props {
  toolCall: MealGenToolCall
}

export function ToolCallChip({ toolCall }: Props) {
  const [open, setOpen] = useState(false)
  const meta = TOOL_LABELS[toolCall.name] ?? { label: toolCall.name, emoji: '⚙️' }

  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 hover:bg-muted"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>{meta.emoji}</span>
        <span>{meta.label}</span>
      </button>
      {open ? (
        <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px]">
          {JSON.stringify(toolCall.input, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
