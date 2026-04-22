'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useMealGenChat, type DraftRow } from './use-meal-gen-chat'
import { MessageList } from './message-list'
import { MessageInput } from './message-input'
import { AcceptPlanModal } from './accept-plan-modal'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  householdId: string
  weekStart: string
  resumeConversationId?: string | null
  onDraftsChange: (drafts: DraftRow[]) => void
  onAccepted: () => void
}

export function ChatDrawer({
  open,
  onOpenChange,
  householdId,
  weekStart,
  resumeConversationId,
  onDraftsChange,
  onAccepted,
}: Props) {
  const chat = useMealGenChat({ household_id: householdId, week_start: weekStart })
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [accepting, setAccepting] = useState(false)

  // Bootstrap on open: resume if id provided, else start fresh.
  useEffect(() => {
    if (!open) return
    if (chat.conversationId) return
    if (resumeConversationId) {
      void chat.resume(resumeConversationId)
    } else {
      void chat.start()
    }
  }, [open, resumeConversationId, chat])

  // Push drafts up to the grid.
  useEffect(() => {
    onDraftsChange(chat.drafts)
  }, [chat.drafts, onDraftsChange])

  // Surface errors via toast.
  useEffect(() => {
    if (chat.error) toast.error(chat.error)
  }, [chat.error])

  async function handleAccept() {
    setAccepting(true)
    try {
      await chat.accept()
      if (!chat.error) {
        toast.success('Plan accepted')
        onAccepted()
        onOpenChange(false)
        chat.reset()
      }
    } finally {
      setAccepting(false)
      setAcceptOpen(false)
    }
  }

  async function handleDiscard() {
    await chat.discard()
    if (!chat.error) {
      toast.message('Plan discarded')
      onOpenChange(false)
      chat.reset()
    }
  }

  const canAccept = chat.drafts.length > 0 && chat.status === 'active' && !chat.sending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-xl sm:w-[min(32rem,90vw)]"
      >
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Plan for week of {weekStart}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Badge variant={chat.status === 'active' ? 'default' : 'secondary'}>
                {chat.status ?? 'loading…'}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="sm:hidden"
                onClick={() => onOpenChange(false)}
              >
                Show plan
              </Button>
            </div>
          </div>
        </SheetHeader>

        <MessageList messages={chat.messages} sending={chat.sending} />

        <MessageInput
          onSend={chat.send}
          disabled={chat.sending || chat.status !== 'active'}
          showSuggestions={chat.messages.length === 0}
        />

        <div className="flex items-center justify-between gap-2 border-t p-3">
          <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={chat.status !== 'active'}>
            <X className="h-4 w-4 mr-1" /> Discard
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {chat.drafts.length} draft{chat.drafts.length === 1 ? '' : 's'}
            </span>
            <Button size="sm" disabled={!canAccept} onClick={() => setAcceptOpen(true)}>
              Accept plan
            </Button>
          </div>
        </div>

        <AcceptPlanModal
          open={acceptOpen}
          onOpenChange={setAcceptOpen}
          draftCount={chat.drafts.length}
          onConfirm={handleAccept}
          confirming={accepting}
        />
      </SheetContent>
    </Sheet>
  )
}
