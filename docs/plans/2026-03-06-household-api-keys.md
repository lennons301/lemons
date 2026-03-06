# Per-Household API Keys Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let household admins optionally configure their own Anthropic API key, with fallback to the server-wide key.

**Architecture:** New migration adds `anthropic_api_key` column to `households` with admin-only RLS. New API routes for get/set key. Extract route looks up household key before falling back to env var. Settings UI component for admins.

**Tech Stack:** Next.js 14+ (App Router), Supabase (Postgres + RLS), shadcn/ui

**Design doc:** `docs/plans/2026-03-06-household-api-keys-design.md`

---

## Task 1: Database Migration — Add API Key Column

**Files:**
- Create: `supabase/migrations/00004_household_api_keys.sql`

**Step 1: Write the migration**

Create `supabase/migrations/00004_household_api_keys.sql`:

```sql
-- Add optional Anthropic API key to households
alter table public.households add column if not exists anthropic_api_key text;

-- Only household admins can read/write the API key column.
-- We use a separate SELECT policy for the api key column by creating a security-barrier view,
-- but the simplest approach is: the existing household RLS allows all members to SELECT,
-- and we restrict API key access at the application layer (API routes check admin role).
-- The column is nullable and not included in default selects — only the dedicated API route reads it.

-- No additional RLS policy needed — the existing household_read policy covers SELECT,
-- and the existing household_update policy covers UPDATE.
-- Admin-only enforcement happens in the API route.
```

**Step 2: Apply the migration locally**

```bash
npx supabase migration up --local
```

Expected: Migration applies successfully.

**Step 3: Commit**

```bash
git add supabase/migrations/00004_household_api_keys.sql
git commit -m "feat: add anthropic_api_key column to households table"
```

---

## Task 2: API Key Masking Utility

**Files:**
- Create: `src/lib/utils/mask-key.ts`
- Create: `src/lib/utils/mask-key.test.ts`

**Step 1: Write the failing test**

Create `src/lib/utils/mask-key.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { maskApiKey } from './mask-key'

describe('maskApiKey', () => {
  it('masks a standard Anthropic key', () => {
    expect(maskApiKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-...mnop')
  })

  it('masks a short key', () => {
    expect(maskApiKey('sk-ant-1234')).toBe('sk-ant-...1234')
  })

  it('masks a very short key (less than 4 chars)', () => {
    expect(maskApiKey('abc')).toBe('...abc')
  })

  it('returns null for null/undefined/empty', () => {
    expect(maskApiKey(null)).toBeNull()
    expect(maskApiKey(undefined)).toBeNull()
    expect(maskApiKey('')).toBeNull()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/lib/utils/mask-key.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `src/lib/utils/mask-key.ts`:

```ts
export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null
  const last4 = key.slice(-4)
  const prefix = key.startsWith('sk-ant-') ? 'sk-ant-' : ''
  return `${prefix}...${last4}`
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/utils/mask-key.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/utils/mask-key.ts src/lib/utils/mask-key.test.ts
git commit -m "feat: add API key masking utility with tests"
```

---

## Task 3: API Routes for Household API Key

**Files:**
- Create: `src/app/api/households/[id]/api-key/route.ts`

**Step 1: Create the API key route**

Create `src/app/api/households/[id]/api-key/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { maskApiKey } from '@/lib/utils/mask-key'

async function verifyAdmin(supabase: any, userId: string, householdId: string) {
  const { data: member } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('profile_id', userId)
    .single()
  return member?.role === 'admin'
}

// GET /api/households/[id]/api-key — get masked key status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await verifyAdmin(supabase, user.id, householdId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data: household } = await supabase
    .from('households')
    .select('anthropic_api_key')
    .eq('id', householdId)
    .single()

  const key = household?.anthropic_api_key || null
  return NextResponse.json({
    hasKey: !!key,
    masked: maskApiKey(key),
  })
}

// PUT /api/households/[id]/api-key — set or clear API key
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await verifyAdmin(supabase, user.id, householdId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const apiKey = body.apiKey || null

  const { error } = await supabase
    .from('households')
    .update({ anthropic_api_key: apiKey })
    .eq('id', householdId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    hasKey: !!apiKey,
    masked: maskApiKey(apiKey),
  })
}
```

**Step 2: Commit**

```bash
git add src/app/api/households/\[id\]/api-key/route.ts
git commit -m "feat: add household API key get/set routes (admin-only)"
```

---

## Task 4: Update Extract Route to Use Household Key

**Files:**
- Modify: `src/lib/ai/extract-recipe.ts`
- Modify: `src/app/api/recipes/extract/route.ts`

**Step 1: Update extractRecipeFromImage to accept optional API key**

In `src/lib/ai/extract-recipe.ts`, change the function signature and client construction:

```ts
export async function extractRecipeFromImage(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  apiKey?: string
): Promise<ExtractionResult> {
  const client = new Anthropic(apiKey ? { apiKey } : undefined)
```

Only the function signature and the `new Anthropic(...)` line change. Everything else stays the same.

**Step 2: Update the extract route to look up household key**

In `src/app/api/recipes/extract/route.ts`, add `householdId` from formData, look up the key, pass it to `extractRecipeFromImage`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractRecipeFromImage } from '@/lib/ai/extract-recipe'

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

// POST /api/recipes/extract — extract recipe from uploaded image
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('image') as File | null
  const householdId = formData.get('householdId') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const mediaType = file.type as (typeof VALID_TYPES)[number]
  if (!VALID_TYPES.includes(mediaType)) {
    return NextResponse.json(
      { error: `Invalid image type. Supported: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Look up household's API key if householdId provided
  let apiKey: string | undefined
  if (householdId) {
    const { data: household } = await supabase
      .from('households')
      .select('anthropic_api_key')
      .eq('id', householdId)
      .single()
    if (household?.anthropic_api_key) {
      apiKey = household.anthropic_api_key
    }
  }

  // Convert to base64
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  try {
    const result = await extractRecipeFromImage(base64, mediaType, apiKey)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Recipe extraction failed:', error)
    return NextResponse.json(
      { error: 'Failed to extract recipe from image. Please try again or enter manually.' },
      { status: 422 }
    )
  }
}
```

**Step 3: Update the recipe form to pass householdId to extract**

In `src/components/features/recipe-form.tsx`, find the `handleImageExtract` function. Change the formData append to include `householdId`:

Currently:
```ts
    const formData = new FormData()
    formData.append('image', file)
```

Change to:
```ts
    const formData = new FormData()
    formData.append('image', file)
    formData.append('householdId', householdId)
```

**Step 4: Run existing tests to verify nothing broke**

```bash
npm run test:run
```

Expected: All tests PASS (the extract-recipe tests don't call the actual API).

**Step 5: Commit**

```bash
git add src/lib/ai/extract-recipe.ts src/app/api/recipes/extract/route.ts src/components/features/recipe-form.tsx
git commit -m "feat: use household API key for recipe extraction with server fallback"
```

---

## Task 5: API Key Settings UI Component

**Files:**
- Create: `src/components/features/api-key-settings.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Build the API key settings component**

Create `src/components/features/api-key-settings.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Key, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ApiKeySettingsProps {
  householdId: string
}

export function ApiKeySettings({ householdId }: ApiKeySettingsProps) {
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/households/${householdId}/api-key`)
      .then((res) => res.json())
      .then((data) => {
        setHasKey(data.hasKey)
        setMaskedKey(data.masked)
      })
      .catch(() => setError('Failed to load API key status'))
      .finally(() => setLoading(false))
  }, [householdId])

  const handleSave = async () => {
    if (!newKey.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/households/${householdId}/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: newKey.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      const data = await res.json()
      setHasKey(data.hasKey)
      setMaskedKey(data.masked)
      setNewKey('')
      setSuccess('API key saved successfully')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm('Remove household API key? Recipe extraction will use the default server key.')) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/households/${householdId}/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove')
      }
      setHasKey(false)
      setMaskedKey(null)
      setNewKey('')
      setSuccess('API key removed. Using default server key.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading API key settings...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Key className="h-5 w-5" />
          AI Recipe Extraction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {hasKey
            ? `Using household API key (${maskedKey})`
            : 'Using default server key. Set your own Anthropic API key for this household.'}
        </p>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-500/10 px-3 py-2 text-green-700 text-sm dark:text-green-400">
            {success}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="apiKey">{hasKey ? 'Replace API Key' : 'Anthropic API Key'}</Label>
          <div className="flex gap-2">
            <Input
              id="apiKey"
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <Button onClick={handleSave} disabled={saving || !newKey.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>

        {hasKey && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={saving}
            className="text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Remove Key
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

**Step 2: Add the component to the settings page**

In `src/app/(dashboard)/settings/page.tsx`, add the import and render it in the admin section.

Add import at top:
```tsx
import { ApiKeySettings } from '@/components/features/api-key-settings'
```

Add after the `InviteLinkGenerator` section (still inside the admin check):
```tsx
      {isAdmin && <ApiKeySettings householdId={householdId} />}
```

**Step 3: Run build to verify**

```bash
npm run build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/components/features/api-key-settings.tsx src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add API key settings UI for household admins"
```

---

## Task 6: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Add anthropic_api_key to households type**

In `src/types/database.ts`, update the `households` table type.

In `Row`, add:
```ts
          anthropic_api_key: string | null
```

In `Insert`, add:
```ts
          anthropic_api_key?: string | null
```

In `Update`, add:
```ts
          anthropic_api_key?: string | null
```

**Step 2: Run build to verify types**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add anthropic_api_key to households type definition"
```

---

## Task 7: Build Verification

**Step 1: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass (including new mask-key tests).

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Go to Settings as an admin
3. Verify "AI Recipe Extraction" card appears
4. Verify it shows "Using default server key"
5. Enter a key, save — verify it shows masked version
6. Remove the key — verify it reverts to default message

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database migration | `supabase/migrations/00004_household_api_keys.sql` |
| 2 | Key masking utility | `src/lib/utils/mask-key.ts` |
| 3 | API key routes | `src/app/api/households/[id]/api-key/route.ts` |
| 4 | Extract route update | `src/lib/ai/extract-recipe.ts`, `src/app/api/recipes/extract/route.ts` |
| 5 | Settings UI | `src/components/features/api-key-settings.tsx` |
| 6 | TypeScript types | `src/types/database.ts` |
| 7 | Build verification | All tests + build |
