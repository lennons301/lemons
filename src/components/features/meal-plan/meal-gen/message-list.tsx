'use client'

import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './message-bubble'
import type { MealGenMessage } from '@/types/meal-gen'

interface Props {
  messages: MealGenMessage[]
  sending?: boolean
}

export function MessageList({ messages, sending }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, sending])

  return (
    // `min-h-0` is load-bearing: in a flex-col parent, flex-1 alone defaults to
    // `min-height: auto`, which lets the ScrollArea grow past the viewport instead
    // of clipping and scrolling. Keep min-h-0 or the drawer overflows.
    <ScrollArea className="flex-1 min-h-0 pr-2">
      <div className="flex flex-col gap-3 p-3">
        {messages.map((m, idx) => (
          <MessageBubble key={idx} message={m} />
        ))}
        {sending ? (
          <div className="text-xs text-muted-foreground italic">Claude is thinking…</div>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
