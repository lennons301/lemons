# LLM Meal Generation — Chunk 3: UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire chunk 2b's HTTP surface into a working chat experience on `/meal-plans` — drawer, grid draft overlay, accept flow, and resume dropdown. Feature-flag gated so prod stays dormant until chunk 4 lands.

**Architecture:** A client-side `useMealGenChat` hook owns conversation state and all API calls. A `ChatDrawer` (shadcn `Sheet` on desktop, full-screen sheet on mobile) hosts the chat; draft entries returned by each turn overlay into the existing `WeeklyGrid`. Accept flow is a small confirmation modal. No streaming — the model turn is a single await that resolves with the full assistant message(s) and updated drafts.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui (sheet, dialog, dropdown-menu, button, textarea, badge, scroll-area), lucide-react, Vitest + React Testing Library.

**Spec:** `docs/plans/2026-04-20-llm-meal-generation-design.md`
**Chunk 2a (merged):** library layer
**Chunk 2b (merged):** HTTP routes

---

## Scope

### In This Chunk

- Client-side hook `useMealGenChat` for all API interactions.
- Chat drawer with message list, tool-call chips, input, suggested prompts, accept/discard buttons.
- Draft overlay on the week grid (distinct visual treatment).
- Accept modal (simple confirmation — no shopping list preview yet).
- Recent-plans dropdown to resume active/abandoned conversations.
- Mobile responsive: full-screen sheet + a "Show plan" toggle to swap between chat and grid.
- "Generate plan ✨" entry button on `/meal-plans`, only rendered when the server-side flag is on.

### Deferred

- **Streaming** — turn responses arrive in a single JSON. Chunk 3 can always be extended later to stream.
- **Shopping list preview card** — requires packet rounding → chunk 4.
- **Conflict resolution on accept** (when existing `meal_plan_entries` overlap target slots) — chunk 4, UI-driven.
- **Draft editing from the grid UI** — the API exists (`PATCH /draft`) but wiring the existing meal dialog to call it is chunk 4 polish.
- **Playwright e2e** — internal staging dogfood first; e2e comes with chunk 4 when shopping closes the loop.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts` | React hook: conversation state + API orchestration (`start`, `sendMessage`, `accept`, `discard`, `resume`). Exposes `{ conversationId, messages, drafts, status, sending, send, accept, discard, error }` |
| `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx` | Hook unit tests with mocked `fetch` |
| `src/components/features/meal-plan/meal-gen/tool-call-chip.tsx` | Collapsed chip rendering a single tool call (name + input summary) |
| `src/components/features/meal-plan/meal-gen/message-bubble.tsx` | User/assistant message bubble with tool-call chips |
| `src/components/features/meal-plan/meal-gen/message-list.tsx` | Scrollable message list |
| `src/components/features/meal-plan/meal-gen/message-input.tsx` | Textarea + send button + suggested-prompt chips |
| `src/components/features/meal-plan/meal-gen/accept-plan-modal.tsx` | Confirmation modal |
| `src/components/features/meal-plan/meal-gen/recent-plans-dropdown.tsx` | Dropdown menu listing recent conversations to resume |
| `src/components/features/meal-plan/meal-gen/chat-drawer.tsx` | Drawer shell: header, `MessageList`, `MessageInput`, footer with accept/discard/close |
| `src/components/features/meal-plan/meal-gen/draft-meal-card.tsx` | Visually distinct draft card (dashed border + sparkle) |
| `src/components/features/meal-plan/meal-gen/constants.ts` | Shared UI constants: suggested prompts, chip labels |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/(dashboard)/meal-plans/page.tsx` | Read `MEAL_GEN_ENABLED`, pass `mealGenEnabled` prop to `WeeklyGrid` |
| `src/components/features/meal-plan/weekly-grid.tsx` | Accept `mealGenEnabled` prop; when true, render Generate button + ChatDrawer; accept `drafts` array; pass to `MealCell` |
| `src/components/features/meal-plan/meal-cell.tsx` | Accept `drafts` array; render `DraftMealCard` items alongside real `MealCard` items |

---

## Conventions Already in This Repo

- Client components start with `'use client'`.
- Components take plain-JS props (`any[]` for entries is current style — match it, don't introduce new typings for existing shapes).
- Inline `fetch` is the norm; there is no SWR / react-query layer.
- shadcn primitives live in `src/components/ui/`; feature components in `src/components/features/<domain>/`.
- Tests are colocated; Vitest + React Testing Library + jsdom are already wired (see `src/lib/utils/*.test.ts` for plain-TS, `@testing-library/react` available per `package.json`).
- Icons from `lucide-react`. Use `Sparkles` for the Generate button.

---

## Tasks

### Task 1: `useMealGenChat` hook — state + API orchestration

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts`
- Create: `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`:

```tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMealGenChat } from './use-meal-gen-chat'

describe('useMealGenChat', () => {
  const household_id = 'h1'
  const week_start = '2026-04-20'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: any }>) {
    let i = 0
    global.fetch = vi.fn(() => {
      const r = responses[i++]
      return Promise.resolve({
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 500),
        json: () => Promise.resolve(r.body),
      }) as any
    }) as any
  }

  it('start() creates a conversation and sets conversationId', async () => {
    mockFetchSequence([{ ok: true, body: { id: 'c1', status: 'active' } }])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.conversationId).toBe('c1')
    expect(result.current.status).toBe('active')
    expect(result.current.error).toBeNull()
  })

  it('send() posts a message and appends assistant messages + drafts', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      {
        ok: true,
        body: {
          assistantMessages: [{ role: 'assistant', content: 'Proposed 3 meals.', ts: 't1', tool_calls: [] }],
          stoppedReason: 'end_turn',
          toolCallsMade: 1,
          tokensIn: 500,
          tokensOut: 20,
          drafts: [
            { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', custom_name: null, servings: 4, assigned_to: [], notes: null, custom_ingredients: null, inventory_item_id: null, conversation_id: 'c1', created_at: 't1' },
          ],
        },
      },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.send('Plan 3 dinners') })

    expect(result.current.messages).toHaveLength(2) // user + assistant
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'Plan 3 dinners' })
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', content: 'Proposed 3 meals.' })
    expect(result.current.drafts).toHaveLength(1)
  })

  it('accept() promotes drafts and flips status to accepted', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      { ok: true, body: { inserted_ids: ['e1', 'e2'] } },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.accept() })

    expect(result.current.status).toBe('accepted')
  })

  it('discard() marks abandoned', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      { ok: true, body: { ok: true } },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.discard() })

    expect(result.current.status).toBe('abandoned')
  })

  it('surfaces error on 429 from start()', async () => {
    mockFetchSequence([
      { ok: false, status: 429, body: { error: 'Daily meal-gen conversation limit reached for this household' } },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })

    expect(result.current.conversationId).toBeNull()
    expect(result.current.error).toMatch(/Daily meal-gen/)
  })

  it('resume() loads an existing conversation + drafts', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          conversation: {
            id: 'c7',
            status: 'active',
            messages: [
              { role: 'user', content: 'earlier question', ts: 't0' },
              { role: 'assistant', content: 'earlier answer', ts: 't1' },
            ],
          },
          drafts: [],
        },
      },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.resume('c7') })

    expect(result.current.conversationId).toBe('c7')
    expect(result.current.status).toBe('active')
    expect(result.current.messages).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts`:

```typescript
'use client'

import { useCallback, useState } from 'react'
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
        setError(await readError(res, 'Model turn failed'))
        return
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
  }, [])

  return {
    conversationId,
    messages,
    drafts,
    status,
    sending,
    error,
    start,
    send,
    accept,
    discard,
    resume,
    reset,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx
git commit -m "feat(meal-gen-ui): add useMealGenChat hook"
```

---

### Task 2: Shared UI constants

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/constants.ts`

- [ ] **Step 1: Create the file**

```typescript
export const SUGGESTED_PROMPTS: string[] = [
  'Plan 4 dinners this week, nothing too heavy',
  "Tuesday we're out — skip dinner that night",
  'Something veggie for Wednesday',
  "Use what we've got in the freezer",
  'Something quick for 2 adults + 2 kids (ages 4 and 7)',
]

// Tool names mapped to a short human label + emoji for chat-chip display.
export const TOOL_LABELS: Record<string, { label: string; emoji: string }> = {
  get_recipe: { label: 'looked up recipe', emoji: '📖' },
  scrape_and_save_recipe: { label: 'saved a web recipe', emoji: '🌐' },
  search_inventory_leftovers: { label: 'checked leftovers', emoji: '🧊' },
  get_calendar_events: { label: 'checked calendar', emoji: '📅' },
  check_packet_sizes: { label: 'checked packet sizes', emoji: '📦' },
  propose_plan: { label: 'proposed slots', emoji: '✨' },
  remove_slot: { label: 'removed a slot', emoji: '🗑️' },
  web_search: { label: 'searched the web', emoji: '🔍' },
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/constants.ts
git commit -m "feat(meal-gen-ui): add UI constants (prompts, tool labels)"
```

---

### Task 3: Tool-call chip component

Renders one collapsed chip per tool call. Click to expand and show input (JSON).

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/tool-call-chip.tsx`

- [ ] **Step 1: Implement**

```tsx
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
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/tool-call-chip.tsx
git commit -m "feat(meal-gen-ui): add tool-call chip"
```

---

### Task 4: Message bubble + list

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/message-bubble.tsx`
- Create: `src/components/features/meal-plan/meal-gen/message-list.tsx`

- [ ] **Step 1: Implement message-bubble.tsx**

```tsx
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
```

- [ ] **Step 2: Implement message-list.tsx**

```tsx
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
```

- [ ] **Step 3: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/message-bubble.tsx src/components/features/meal-plan/meal-gen/message-list.tsx
git commit -m "feat(meal-gen-ui): add message bubble + list"
```

---

### Task 5: Message input with suggested-prompt chips

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/message-input.tsx`

- [ ] **Step 1: Implement**

```tsx
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
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/message-input.tsx
git commit -m "feat(meal-gen-ui): add message input with suggested prompts"
```

---

### Task 6: Accept-plan confirmation modal

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/accept-plan-modal.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftCount: number
  onConfirm: () => void | Promise<void>
  confirming?: boolean
}

export function AcceptPlanModal({ open, onOpenChange, draftCount, onConfirm, confirming }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept plan?</DialogTitle>
          <DialogDescription>
            This will create {draftCount} meal plan {draftCount === 1 ? 'entry' : 'entries'} for the target week.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Accepting…' : 'Accept'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/accept-plan-modal.tsx
git commit -m "feat(meal-gen-ui): add accept-plan confirmation modal"
```

---

### Task 7: Recent-plans dropdown

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/recent-plans-dropdown.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { History, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface RecentConversation {
  id: string
  week_start: string
  status: 'active' | 'abandoned'
  last_activity_at: string
}

interface Props {
  householdId: string
  onResume: (conversationId: string) => void | Promise<void>
}

export function RecentPlansDropdown({ householdId, onResume }: Props) {
  const [items, setItems] = useState<RecentConversation[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/meal-plans/generate/recent?householdId=${householdId}`)
      if (res.ok && !cancelled) {
        setItems(await res.json())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, householdId])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-1" />
          Recent
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Resume a plan</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <DropdownMenuItem disabled>(no in-progress plans)</DropdownMenuItem>
        ) : (
          items.map((it) => (
            <DropdownMenuItem key={it.id} onClick={() => onResume(it.id)}>
              <div className="flex flex-col">
                <span className="text-sm">Week of {it.week_start}</span>
                <span className="text-xs text-muted-foreground">
                  {it.status === 'active' ? 'in progress' : 'abandoned'} · {new Date(it.last_activity_at).toLocaleString()}
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/recent-plans-dropdown.tsx
git commit -m "feat(meal-gen-ui): add recent-plans dropdown for resume"
```

---

### Task 8: Chat drawer shell

Wires everything together: `useMealGenChat` hook, message list, input, footer with accept/discard. Uses `Sheet` from shadcn as the drawer.

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/chat-drawer.tsx`

- [ ] **Step 1: Implement**

```tsx
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
        className="flex w-full flex-col sm:max-w-xl"
      >
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Plan for week of {weekStart}
            </SheetTitle>
            <Badge variant={chat.status === 'active' ? 'default' : 'secondary'}>
              {chat.status ?? 'loading…'}
            </Badge>
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
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/chat-drawer.tsx
git commit -m "feat(meal-gen-ui): add chat drawer shell"
```

---

### Task 9: Draft meal card (distinct styling)

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/draft-meal-card.tsx`

- [ ] **Step 1: Implement**

```tsx
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
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/draft-meal-card.tsx
git commit -m "feat(meal-gen-ui): add distinct draft meal card"
```

---

### Task 10: Render drafts in MealCell

**Files:**
- Modify: `src/components/features/meal-plan/meal-cell.tsx`

- [ ] **Step 1: Read the current file**

Run: `cat src/components/features/meal-plan/meal-cell.tsx`
Expected: 39 lines (current version at the time of writing).

- [ ] **Step 2: Replace contents**

Overwrite `src/components/features/meal-plan/meal-cell.tsx` with:

```tsx
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
```

- [ ] **Step 3: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/meal-plan/meal-cell.tsx
git commit -m "feat(meal-gen-ui): render draft entries in meal cells"
```

---

### Task 11: Wire Generate button + drafts through WeeklyGrid

**Files:**
- Modify: `src/components/features/meal-plan/weekly-grid.tsx`

The change is additive: new prop `mealGenEnabled`, new local draft state, new drafts + recipeTitleById pushed to `MealCell`, new drawer + button.

- [ ] **Step 1: Open `src/components/features/meal-plan/weekly-grid.tsx`** and read it end-to-end. Identify:
  - The `interface WeeklyGridProps` declaration (near top).
  - The `fetchEntries` function (loads entries for the week).
  - The rendering of the grid — where `<MealCell … />` is called.
  - The header row with "Copy Week" button.

- [ ] **Step 2: Apply the following targeted edits**

**Add import (with other imports):**

```typescript
import { Sparkles } from 'lucide-react'
import { ChatDrawer } from './meal-gen/chat-drawer'
import { RecentPlansDropdown } from './meal-gen/recent-plans-dropdown'
import type { DraftRow } from './meal-gen/use-meal-gen-chat'
```

**Extend `WeeklyGridProps`:**

Add `mealGenEnabled?: boolean` to the interface.

**Extend the component signature:**

```typescript
export function WeeklyGrid({ householdId, persons, weekStartDay = 1, mealGenEnabled = false }: WeeklyGridProps) {
```

**Add state for chat drawer + drafts, just after the existing state hooks:**

```typescript
const [drawerOpen, setDrawerOpen] = useState(false)
const [resumeConversationId, setResumeConversationId] = useState<string | null>(null)
const [drafts, setDrafts] = useState<DraftRow[]>([])
const [recipeTitleById, setRecipeTitleById] = useState<Record<string, string>>({})
```

**Fetch recipe titles whenever drafts include recipe_ids not yet in the map:**

Add this effect just after the existing `useEffect(() => { fetchEntries() }, ...)`. Drafts are small (≤28 per week), so individual fetches to the existing `/api/recipes/[id]` endpoint are fine and avoid adding an `ids` query param that endpoint doesn't currently support:

```typescript
useEffect(() => {
  const missing = drafts
    .filter((d) => d.source === 'recipe' && d.recipe_id && !recipeTitleById[d.recipe_id])
    .map((d) => d.recipe_id as string)
  if (missing.length === 0) return
  let cancelled = false
  ;(async () => {
    const fetched: Array<{ id: string; title: string }> = []
    for (const id of missing) {
      const res = await fetch(`/api/recipes/${id}`)
      if (!res.ok) continue
      const body = await res.json()
      if (body?.id && body?.title) fetched.push({ id: body.id, title: body.title })
    }
    if (cancelled || fetched.length === 0) return
    setRecipeTitleById((prev) => {
      const next = { ...prev }
      for (const r of fetched) next[r.id] = r.title
      return next
    })
  })()
  return () => {
    cancelled = true
  }
}, [drafts, recipeTitleById])
```

**Derive draftsByCell helper:** add near other helpers (above the return):

```typescript
const draftsByCell: Record<string, DraftRow[]> = {}
for (const d of drafts) {
  const key = `${d.date}|${d.meal_type}`
  ;(draftsByCell[key] ??= []).push(d)
}
```

**In the header — where the "Copy Week" button is rendered — add siblings:**

```tsx
{mealGenEnabled ? (
  <>
    <RecentPlansDropdown
      householdId={householdId}
      onResume={(id) => {
        setResumeConversationId(id)
        setDrawerOpen(true)
      }}
    />
    <Button
      size="sm"
      onClick={() => {
        setResumeConversationId(null)
        setDrawerOpen(true)
      }}
    >
      <Sparkles className="h-4 w-4 mr-1" />
      Generate plan
    </Button>
  </>
) : null}
```

**At each `<MealCell />` call site, pass drafts and the title map:**

```tsx
<MealCell
  entries={entriesForCell}
  drafts={draftsByCell[`${date}|${mealType}`] ?? []}
  recipeTitleById={recipeTitleById}
  persons={persons}
  onAdd={() => handleAdd(date, mealType)}
  onEdit={handleEdit}
  onDelete={handleDelete}
/>
```

(Where `entriesForCell`, `date`, and `mealType` are the names already used in the current rendering block — keep them as-is.)

**Mount the drawer at the bottom of the returned JSX (before the closing wrapping div):**

```tsx
{mealGenEnabled ? (
  <ChatDrawer
    open={drawerOpen}
    onOpenChange={setDrawerOpen}
    householdId={householdId}
    weekStart={weekDays[0]}
    resumeConversationId={resumeConversationId}
    onDraftsChange={setDrafts}
    onAccepted={() => {
      setDrafts([])
      fetchEntries()
    }}
  />
) : null}
```

- [ ] **Step 3: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/meal-plan/weekly-grid.tsx
git commit -m "feat(meal-gen-ui): wire Generate button + drafts through WeeklyGrid"
```

---

### Task 12: Pass `MEAL_GEN_ENABLED` from the meal-plans page

**Files:**
- Modify: `src/app/(dashboard)/meal-plans/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { WeeklyGrid } from '@/components/features/meal-plan/weekly-grid'
import { getPageContext } from '@/lib/supabase/queries'

export default async function MealPlansPage() {
  const { supabase, householdId } = await getPageContext()

  const [{ data: persons }, { data: household }] = await Promise.all([
    supabase
      .from('household_persons')
      .select('id, display_name, date_of_birth, person_type')
      .eq('household_id', householdId),
    supabase
      .from('households')
      .select('week_start_day')
      .eq('id', householdId)
      .single(),
  ])

  const weekStartDay = household?.week_start_day ?? 5
  const mealGenEnabled = process.env.MEAL_GEN_ENABLED === 'true'

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Meal Plans</h1>
      <WeeklyGrid
        householdId={householdId}
        persons={persons || []}
        weekStartDay={weekStartDay}
        mealGenEnabled={mealGenEnabled}
      />
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/meal-plans/page.tsx
git commit -m "feat(meal-gen-ui): gate meal-gen UI on MEAL_GEN_ENABLED"
```

---

### Task 13: Mobile responsive polish — full-screen sheet + plan/chat toggle

The default `Sheet` is already mobile-friendly (slides in from the right). Two adjustments for small screens:
1. On mobile, make the drawer occupy the full viewport width.
2. When open on mobile, hide the week grid underneath by toggling a state prop.

**Files:**
- Modify: `src/components/features/meal-plan/meal-gen/chat-drawer.tsx`

- [ ] **Step 1: Adjust drawer width classes**

Open `src/components/features/meal-plan/meal-gen/chat-drawer.tsx`. Locate the `<SheetContent>` opening tag and update its `className`:

**Before:**
```tsx
<SheetContent
  side="right"
  className="flex w-full flex-col sm:max-w-xl"
>
```

**After:**
```tsx
<SheetContent
  side="right"
  className="flex w-full flex-col sm:max-w-xl sm:w-[min(32rem,90vw)]"
>
```

This keeps mobile full-width while capping desktop at ~32rem.

- [ ] **Step 2: Add a "Show plan" toggle button in the drawer header for mobile**

Inside the `<SheetHeader>` block, add a close-action sibling that's only visible on small screens. Replace the current `SheetHeader` body with:

```tsx
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
```

This "Show plan" button just closes the drawer on mobile — the user sees the week grid underneath (with drafts overlaid). They can re-open the drawer with the Generate button again. This approximates the spec's mobile toggle without adding new state.

- [ ] **Step 3: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/chat-drawer.tsx
git commit -m "feat(meal-gen-ui): mobile full-screen drawer + show-plan toggle"
```

---

### Task 14: Final verification

- [ ] **Step 1: Full test suite**

Run: `doppler run -- npm run test:run`
Expected: all pass (should be prior count + 6 new from the hook tests).

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds, no TS errors.

- [ ] **Step 3: Lint on touched files only**

Run: `doppler run -- npm run lint 2>&1 | awk '/\/src\/components\/features\/meal-plan\/meal-gen|\/weekly-grid\.tsx|\/meal-cell\.tsx|\/meal-plans\/page\.tsx/{file=$0; next} /error|warning/{if(file) print file": "$0}'`
Expected: no error-level output from these paths.

- [ ] **Step 4: Directory sanity check**

Run: `ls src/components/features/meal-plan/meal-gen/`
Expected:
```
accept-plan-modal.tsx
chat-drawer.tsx
constants.ts
draft-meal-card.tsx
message-bubble.tsx
message-input.tsx
message-list.tsx
recent-plans-dropdown.tsx
tool-call-chip.tsx
use-meal-gen-chat.test.tsx
use-meal-gen-chat.ts
```

- [ ] **Step 5: Git log sanity check**

Run: `git log --oneline main..HEAD | head -20`
Expected: 13 commits from tasks 1–13 plus the plan commit.

No commit for this task — gate only.

---

## Post-Chunk-3 Notes

- Feature is runnable on staging with `MEAL_GEN_ENABLED=true`. Existing meal-plan users see no change when the flag is off.
- The drawer mounts only when `mealGenEnabled` is true on the page prop — if the flag flips off, drafts aren't surfaced and the button disappears.
- No new migrations.

## To test manually (after merge + staging deploy)

1. Set `MEAL_GEN_ENABLED=true` in Doppler `stg` config; redeploy preview.
2. Navigate to `/meal-plans`. You should see the **Generate plan ✨** button in the header.
3. Click it → drawer opens → suggested prompts visible.
4. Send a prompt → wait 10–30s → assistant reply + drafts appear in the grid with dashed borders.
5. Click **Accept plan** → confirmation modal → confirm → drafts commit to `meal_plan_entries` and drawer closes.
6. Refresh `/meal-plans` — the accepted meals now show as normal cards.

## Flag for Chunk 4 (shopping + packet rounding)

- Accept modal needs a shopping-list preview section once chunk 4 lands. Modal structure is already in place — just add a `<ShoppingPreview />` section above the footer buttons.
- Draft editing from the grid (clicking a draft card) currently does nothing. Chunk 4 polish: wire a click handler on `DraftMealCard` to open the existing `AddMealDialog` in edit mode with an adapter layer that translates DraftRow ↔ dialog shape, then PATCH `/api/meal-plans/generate/[id]/draft` on save.
- Conflict resolution: if accept detects overlapping `meal_plan_entries`, current UX just fails with the API's 500. Chunk 4 should pre-check and render "N slots already have meals — replace them?" in the accept modal.

## Flag for Chunk 5 (optional streaming)

- `useMealGenChat.send` currently awaits the full response before rendering. If token streaming becomes desirable, this hook is the clean extraction point: swap its fetch for an EventSource and emit partial assistant messages to `messages` as they arrive. No component change above it.
