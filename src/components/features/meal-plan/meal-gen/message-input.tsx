'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { SUGGESTED_PROMPTS } from './constants'

interface Props {
  onSend: (text: string) => void | Promise<void>
  disabled?: boolean
  showSuggestions?: boolean
}

export function MessageInput({ onSend, disabled, showSuggestions }: Props) {
  const [text, setText] = useState('')

  async function submit(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    setText('')
    await onSend(trimmed)
  }

  return (
    <div className="flex flex-col gap-2 border-t p-3">
      {showSuggestions ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
              onClick={() => submit(p)}
              disabled={disabled}
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your week…"
          rows={2}
          className="flex-1 resize-none"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(text)
            }
          }}
        />
        <Button onClick={() => submit(text)} disabled={disabled || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
