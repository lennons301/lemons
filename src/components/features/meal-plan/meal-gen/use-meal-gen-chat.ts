'use client'

import { useCallback, useMemo, useState } from 'react'
import type { MealGenMessage } from '@/types/meal-gen'

type ConversationStatus = 'active' | 'accepted' | 'abandoned' | null

export interface UseMealGenChatArgs {
  household_id: string
  week_start: string
}

export interface DraftRow {
  id: string
  conversation_id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  source: 'recipe' | 'custom' | 'custom_with_ingredients' | 'leftover'
  recipe_id: string | null
  inventory_item_id: string | null
  custom_name: string | null
  custom_ingredients: unknown
  servings: number
  assigned_to: string[]
  notes: string | null
  created_at: string
}

function isoNow() {
  return new Date().toISOString()
}

export function useMealGenChat({ household_id, week_start }: UseMealGenChatArgs) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MealGenMessage[]>([])
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [status, setStatus] = useState<ConversationStatus>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shoppingPreview, setShoppingPreview] = useState<{
    items: Array<{
      name: string
      required_qty: number | null
      required_unit: string | null
      packed_qty: number | null
      packed_unit: string | null
      waste_qty: number
      pack_size: { quantity: number; unit: string } | null
      pack_count: number
      is_staple: boolean
    }>
    totals: { line_count: number; waste_qty_total: number; pack_total: number }
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const body = await res.json()
      return body?.error ?? fallback
    } catch {
      return fallback
    }
  }

  const start = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/meal-plans/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id, week_start }),
    })
    if (!res.ok) {
      setError(await readError(res, 'Failed to start conversation'))
      return
    }
    const body = await res.json()
    setConversationId(body.id)
    setStatus('active')
    setMessages([])
    setDrafts([])
  }, [household_id, week_start])

  const send = useCallback(async (text: string) => {
    if (!conversationId) {
      setError('No active conversation')
      return
    }
    setError(null)
    setSending(true)
    const optimisticUser: MealGenMessage = { role: 'user', content: text, ts: isoNow() }
    setMessages((prev) => [...prev, optimisticUser])
    try {
      const res = await fetch(`/api/meal-plans/generate/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        // Roll back the optimistic user message so MessageInput can restore
        // the text and the user can retry cleanly.
        setMessages((prev) => (prev[prev.length - 1] === optimisticUser ? prev.slice(0, -1) : prev))
        const errMsg = await readError(res, 'Model turn failed')
        setError(errMsg)
        throw new Error(errMsg)
      }
      const body = await res.json()
      setMessages((prev) => [...prev, ...(body.assistantMessages as MealGenMessage[])])
      setDrafts(body.drafts as DraftRow[])
    } finally {
      setSending(false)
    }
  }, [conversationId])

  const accept = useCallback(async () => {
    if (!conversationId) return
    setError(null)
    const res = await fetch(`/api/meal-plans/generate/${conversationId}/accept`, { method: 'POST' })
    if (!res.ok) {
      setError(await readError(res, 'Accept failed'))
      return
    }
    setStatus('accepted')
  }, [conversationId])

  const discard = useCallback(async () => {
    if (!conversationId) return
    setError(null)
    const res = await fetch(`/api/meal-plans/generate/${conversationId}/discard`, { method: 'POST' })
    if (!res.ok) {
      setError(await readError(res, 'Discard failed'))
      return
    }
    setStatus('abandoned')
  }, [conversationId])

  const refreshShoppingPreview = useCallback(async () => {
    if (!conversationId) return
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/meal-plans/generate/${conversationId}/shopping-preview`)
      if (!res.ok) return
      const body = await res.json()
      setShoppingPreview(body)
    } finally {
      setPreviewLoading(false)
    }
  }, [conversationId])

  const resume = useCallback(async (id: string) => {
    setError(null)
    const res = await fetch(`/api/meal-plans/generate/${id}`)
    if (!res.ok) {
      setError(await readError(res, 'Resume failed'))
      return
    }
    const body = await res.json()
    setConversationId(id)
    setStatus(body.conversation.status)
    setMessages((body.conversation.messages as MealGenMessage[]) ?? [])
    setDrafts(body.drafts as DraftRow[])
  }, [])

  const reset = useCallback(() => {
    setConversationId(null)
    setMessages([])
    setDrafts([])
    setStatus(null)
    setError(null)
    setShoppingPreview(null)
  }, [])

  // Stable object identity — protects consumer effects that depend on `chat`
  // from firing on every render while state is unchanged.
  return useMemo(
    () => ({
      conversationId,
      messages,
      drafts,
      status,
      sending,
      error,
      shoppingPreview,
      previewLoading,
      start,
      send,
      accept,
      discard,
      resume,
      reset,
      refreshShoppingPreview,
    }),
    [
      conversationId,
      messages,
      drafts,
      status,
      sending,
      error,
      shoppingPreview,
      previewLoading,
      start,
      send,
      accept,
      discard,
      resume,
      reset,
      refreshShoppingPreview,
    ],
  )
}
