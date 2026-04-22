'use client'

import { ToolCallChip } from './tool-call-chip'
import type { MealGenMessage } from '@/types/meal-gen'
import { cn } from '@/lib/utils'

interface Props {
  message: MealGenMessage
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      {message.content ? (
        <div
          className={cn(
            'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {message.content}
        </div>
      ) : null}
      {message.tool_calls && message.tool_calls.length > 0 ? (
        <div className="flex flex-col gap-1">
          {message.tool_calls.map((tc) => (
            <ToolCallChip key={tc.id} toolCall={tc} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
