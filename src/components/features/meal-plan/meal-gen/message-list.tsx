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
    <ScrollArea className="flex-1 pr-2">
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
