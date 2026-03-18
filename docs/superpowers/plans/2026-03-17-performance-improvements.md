# Performance Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate slow page transitions by adding streaming skeletons, parallelizing data fetches, and removing redundant auth calls on every page.

**Architecture:** Three-pronged approach: (1) Add `loading.tsx` with skeleton UI to every dashboard route so navigation feels instant, (2) Deduplicate auth/profile fetching that currently happens twice per page load (once in layout, once in `getPageContext()`), (3) Parallelize all sequential Supabase queries within pages. The layout already fetches auth + profile; pages should reuse that via `React.cache` instead of re-fetching.

**Tech Stack:** Next.js 16 App Router (streaming/Suspense), shadcn/ui Skeleton component, React `cache()`, Supabase SSR client

**Existing code to reference:**
- Supabase server client: `src/lib/supabase/server.ts`
- Page context helper: `src/lib/supabase/queries.ts`
- Dashboard layout: `src/app/(dashboard)/layout.tsx`
- All page files: `src/app/(dashboard)/*/page.tsx`
- UI components: `src/components/ui/`

---

## Task 1: Add shadcn Skeleton component

**Files:**
- Create: `src/components/ui/skeleton.tsx`

- [ ] **Step 1: Install the skeleton component**

Run: `npx shadcn@latest add skeleton`
Expected: Creates `src/components/ui/skeleton.tsx`

- [ ] **Step 2: Verify the file exists**

Run: `cat src/components/ui/skeleton.tsx`
Expected: A component exporting `Skeleton` with `cn()` and animate-pulse styling

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/skeleton.tsx
git commit -m "feat: add shadcn skeleton component for loading states"
```

---

## Task 2: Cache auth lookups with React.cache

The layout already calls `createClient()` + `auth.getUser()` + profile fetch. Every page then calls `getPageContext()` which does the **exact same 3 calls again**. React's `cache()` deduplicates these within a single request, so the second call is free.

**Files:**
- Modify: `src/lib/supabase/queries.ts`

- [ ] **Step 1: Write test for getPageContext caching behavior**

We can't easily unit-test React.cache deduplication directly, but we can verify `getPageContext` still returns the expected shape. Create a simple test:

Create: `src/lib/supabase/__tests__/queries.test.ts`

```typescript
import { describe, it, expect } from 'vitest'

// We test the exported helper types/shape, not the cache behavior
// (cache dedup is a React framework guarantee, not app logic)
describe('queries module', () => {
  it('exports getPageContext', async () => {
    const mod = await import('../queries')
    expect(mod.getPageContext).toBeDefined()
    expect(typeof mod.getPageContext).toBe('function')
  })

  it('exports getHouseholdPersons', async () => {
    const mod = await import('../queries')
    expect(mod.getHouseholdPersons).toBeDefined()
    expect(typeof mod.getHouseholdPersons).toBe('function')
  })

  it('exports getCachedClient', async () => {
    const mod = await import('../queries')
    expect(mod.getCachedClient).toBeDefined()
    expect(typeof mod.getCachedClient).toBe('function')
  })

  it('exports getCachedProfile', async () => {
    const mod = await import('../queries')
    expect(mod.getCachedProfile).toBeDefined()
    expect(typeof mod.getCachedProfile).toBe('function')
  })
})
```

Run: `npx vitest run src/lib/supabase/__tests__/queries.test.ts`
Expected: FAIL — `getCachedClient` not yet exported

- [ ] **Step 2: Wrap client creation and auth in React.cache**

Modify `src/lib/supabase/queries.ts`:

```typescript
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createClient } from './server'

type Client = SupabaseClient<Database>

/**
 * Cached per-request: creates Supabase client + validates auth.
 * React.cache ensures this runs once per server request even if
 * called from both layout.tsx and page.tsx.
 */
export const getCachedClient = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
})

/**
 * Cached per-request: fetches user profile.
 * Exported so layout.tsx can call it directly, sharing the cache with getPageContext.
 */
export const getCachedProfile = cache(async (supabase: Client, userId: string) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id, display_name')
    .eq('id', userId)
    .single()
  return profile
})

/**
 * Common page-level context: authenticated user + active household.
 * Redirects to /login or /onboarding if prerequisites are missing,
 * so callers can trust the returned values are non-null.
 */
export async function getPageContext() {
  const { supabase, user } = await getCachedClient()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(supabase, user.id)

  const householdId = profile?.default_household_id
  if (!householdId) redirect('/onboarding')

  return { supabase, user, householdId, profile: profile! }
}
```

Keep all other exports (`getHouseholdPersons`, `getUserHouseholds`, `createHouseholdWithMember`) unchanged.

- [ ] **Step 3: Update layout to use getCachedClient**

Modify `src/app/(dashboard)/layout.tsx` to reuse the cached helpers instead of calling `createClient()` and `auth.getUser()` directly:

```typescript
import { redirect } from 'next/navigation'
import { getCachedClient, getCachedProfile, getUserHouseholds } from '@/lib/supabase/queries'
import { HouseholdProvider } from '@/components/providers/household-provider'
import { Sidebar } from '@/components/features/navigation/sidebar'
import { MobileHeader } from '@/components/features/navigation/mobile-header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getCachedClient()

  if (!user) redirect('/login')

  // Parallel fetch: memberships + profile (profile uses React.cache, shared with getPageContext)
  const [memberships, profile] = await Promise.all([
    getUserHouseholds(supabase, user.id),
    getCachedProfile(supabase, user.id),
  ])

  if (!memberships || memberships.length === 0) {
    redirect('/onboarding')
  }

  const households = memberships.map((m) => ({
    id: m.household_id,
    name: (m.households as unknown as { id: string; name: string })?.name ?? 'Unknown',
    role: m.role,
  }))

  return (
    <HouseholdProvider
      initialHouseholds={households}
      defaultHouseholdId={profile?.default_household_id ?? null}
    >
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <MobileHeader />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </HouseholdProvider>
  )
}
```

Key changes: (a) Uses `getCachedClient()` so auth is shared with child pages, (b) Uses `getCachedProfile()` so profile fetch is shared with `getPageContext()`, (c) `Promise.all` for memberships + profile in parallel.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/supabase/__tests__/queries.test.ts`
Expected: PASS

- [ ] **Step 5: Manual verification**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/queries.ts src/lib/supabase/__tests__/queries.test.ts src/app/\(dashboard\)/layout.tsx
git commit -m "perf: deduplicate auth calls with React.cache across layout and pages"
```

---

## Task 3: Parallelize data fetches in page server components

Every page currently does sequential awaits. Most of these can run in parallel with `Promise.all`.

**Files:**
- Modify: `src/app/(dashboard)/page.tsx` (home — move memberRow into Promise.all)
- Modify: `src/app/(dashboard)/recipes/page.tsx` (persons + recipes in parallel)
- Modify: `src/app/(dashboard)/calendar/page.tsx` (events + persons in parallel)
- Modify: `src/app/(dashboard)/todos/page.tsx` (lists + persons in parallel)
- Modify: `src/app/(dashboard)/recipes/[id]/page.tsx` (persons + recipe in parallel)
- Modify: `src/app/(dashboard)/recipes/[id]/edit/page.tsx` (persons + recipe in parallel)
- Modify: `src/app/(dashboard)/todos/[id]/page.tsx` (list + persons in parallel using householdId from context)
- Modify: `src/app/(dashboard)/settings/page.tsx` (household + members + managed members + staples in parallel)

### 3a: Home page — move memberRow into Promise.all

- [ ] **Step 1: Fix the waterfall**

In `src/app/(dashboard)/page.tsx`, the `household_members` query (lines 76-81) runs after `Promise.all`. Move it inside:

Replace lines 20-54 and 76-81 with:

```typescript
  const [eventsResult, listsResult, mealsResult, inventoryResult, memberResult] = await Promise.all([
    // Events this week
    supabase
      .from('calendar_events')
      .select('*')
      .eq('household_id', householdId)
      .lt('start_datetime', weekEndIso)
      .gt('end_datetime', weekStartIso)
      .order('start_datetime', { ascending: true }),

    // Todo lists with items
    supabase
      .from('todo_lists')
      .select('*, todo_items(*)')
      .eq('household_id', householdId)
      .neq('list_type', 'shopping')
      .eq('archived', false),

    // Meals today
    supabase
      .from('meal_plan_entries')
      .select('*, recipes(id, title)')
      .eq('household_id', householdId)
      .eq('date', today),

    // Expiring inventory
    supabase
      .from('inventory_items')
      .select('*')
      .eq('household_id', householdId)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', threeDaysStr)
      .gte('expiry_date', today)
      .order('expiry_date', { ascending: true }),

    // Current user's person ID
    supabase
      .from('household_members')
      .select('id')
      .eq('household_id', householdId)
      .eq('profile_id', user.id)
      .single(),
  ])
```

Then replace `const currentPersonId = memberRow?.id || null` with:

```typescript
  const currentPersonId = memberResult.data?.id || null
```

And remove the old standalone `memberRow` query block.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "perf: parallelize home page data fetches"
```

### 3b: Recipes page — parallel persons + recipes

- [ ] **Step 1: Parallelize the two independent queries**

In `src/app/(dashboard)/recipes/page.tsx`, the persons query (lines 17-20) and recipes query (lines 23-38) are independent. Run them in parallel:

Replace the sequential queries with:

```typescript
  // Fetch persons and recipes in parallel
  const [personsResult, recipesResult] = await Promise.all([
    supabase
      .from('household_persons')
      .select('id, display_name, date_of_birth, person_type')
      .eq('household_id', householdId),
    supabase
      .from('recipes')
      .select(`
        *,
        recipe_tags(tag_name),
        recipe_images(id, url, type, sort_order),
        recipe_members(person_id)
      `)
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .then((result) => {
        // Apply search filter at database level
        return result
      }),
  ])

  const persons = personsResult.data
  const recipes = recipesResult.data
```

Note: keep the `if (search)` `.ilike` filter on the query builder (before the Promise.all). Build the query first, then execute it in Promise.all:

```typescript
  let recipesQuery = supabase
    .from('recipes')
    .select(`
      *,
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order),
      recipe_members(person_id)
    `)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  if (search) {
    recipesQuery = recipesQuery.ilike('title', `%${search}%`)
  }

  const [personsResult, recipesResult] = await Promise.all([
    supabase
      .from('household_persons')
      .select('id, display_name, date_of_birth, person_type')
      .eq('household_id', householdId),
    recipesQuery,
  ])

  const persons = personsResult.data
```

Keep the rest of the JS filtering (tag, author, book, member) unchanged — those filter on joined relations where Supabase filtering is complex.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/recipes/page.tsx
git commit -m "perf: parallelize recipes page data fetches"
```

### 3c: Calendar page — parallel events + persons

- [ ] **Step 1: Parallelize**

In `src/app/(dashboard)/calendar/page.tsx`, run events and persons queries in parallel:

```typescript
export default async function CalendarPage() {
  const { supabase, householdId } = await getPageContext()

  const now = new Date()
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth())

  const [eventsResult, personsResult] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .eq('household_id', householdId)
      .lt('start_datetime', end)
      .gt('end_datetime', start)
      .order('start_datetime', { ascending: true }),
    supabase
      .from('household_persons')
      .select('id, display_name')
      .eq('household_id', householdId),
  ])

  return (
    <CalendarView
      initialEvents={eventsResult.data || []}
      householdId={householdId}
      persons={personsResult.data || []}
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth()}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/calendar/page.tsx
git commit -m "perf: parallelize calendar page data fetches"
```

### 3d: Todos page — parallel lists + persons

- [ ] **Step 1: Parallelize**

In `src/app/(dashboard)/todos/page.tsx`:

```typescript
export default async function TodosPage() {
  const { supabase, householdId } = await getPageContext()

  const [listsResult, personsResult] = await Promise.all([
    supabase
      .from('todo_lists')
      .select(`*, todo_items(id, status, priority, due_date)`)
      .eq('household_id', householdId)
      .neq('list_type', 'shopping')
      .eq('archived', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('household_persons')
      .select('id, display_name')
      .eq('household_id', householdId),
  ])

  const today = new Date().toISOString().split('T')[0]
  const todoLists = (listsResult.data || []).map((list) => ({
    ...list,
    todo_items: undefined,
    ...getListStats(list.todo_items || [], today),
  }))

  return <TodoListView lists={todoLists} householdId={householdId} persons={personsResult.data || []} />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/todos/page.tsx
git commit -m "perf: parallelize todos page data fetches"
```

### 3e: Recipe detail + edit — parallel persons + recipe

- [ ] **Step 1: Parallelize recipe detail page**

In `src/app/(dashboard)/recipes/[id]/page.tsx`:

```typescript
export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, householdId } = await getPageContext()

  const [persons, recipeResult] = await Promise.all([
    getHouseholdPersons(supabase, householdId),
    supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients(*),
        recipe_tags(tag_name),
        recipe_images(id, url, type, sort_order),
        recipe_members(person_id)
      `)
      .eq('id', id)
      .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
      .order('sort_order', { referencedTable: 'recipe_images', ascending: true })
      .single(),
  ])

  if (recipeResult.error || !recipeResult.data) notFound()

  return <RecipeDetail recipe={recipeResult.data as any} persons={persons} />
}
```

- [ ] **Step 2: Parallelize recipe edit page**

Same pattern in `src/app/(dashboard)/recipes/[id]/edit/page.tsx`:

```typescript
export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, householdId } = await getPageContext()

  const [persons, recipeResult] = await Promise.all([
    getHouseholdPersons(supabase, householdId),
    supabase
      .from('recipes')
      .select(`
        *,
        recipe_ingredients(*),
        recipe_tags(tag_name),
        recipe_members(person_id)
      `)
      .eq('id', id)
      .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
      .single(),
  ])

  if (recipeResult.error || !recipeResult.data) notFound()

  return (
    <RecipeForm
      householdId={householdId}
      initialData={recipeResult.data as any}
      persons={persons}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/recipes/\[id\]/page.tsx src/app/\(dashboard\)/recipes/\[id\]/edit/page.tsx
git commit -m "perf: parallelize recipe detail and edit page data fetches"
```

### 3f: Todo detail — parallel list + persons using householdId from context

The todo detail page currently fetches the list first, then uses `list.household_id` for the persons query. But `getPageContext()` already provides `householdId` (same value, enforced by RLS), so we can parallelize.

- [ ] **Step 1: Parallelize**

In `src/app/(dashboard)/todos/[id]/page.tsx`:

```typescript
import { TodoDetail } from '@/components/features/todos/todo-detail'
import { notFound } from 'next/navigation'
import { getPageContext } from '@/lib/supabase/queries'

export default async function TodoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, householdId } = await getPageContext()

  const [listResult, personsResult] = await Promise.all([
    supabase
      .from('todo_lists')
      .select(`*, todo_items(*)`)
      .eq('id', id)
      .neq('list_type', 'shopping')
      .order('sort_order', { referencedTable: 'todo_items', ascending: true })
      .single(),
    supabase
      .from('household_persons')
      .select('id, display_name')
      .eq('household_id', householdId),
  ])

  if (listResult.error || !listResult.data) notFound()

  return <TodoDetail list={listResult.data as any} persons={personsResult.data || []} />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/todos/\[id\]/page.tsx
git commit -m "perf: parallelize todo detail page data fetches"
```

### 3g: Settings page — parallel all 4 queries

- [ ] **Step 1: Parallelize**

In `src/app/(dashboard)/settings/page.tsx`:

```typescript
import { MemberList } from '@/components/features/members/member-list'
import { InviteLinkGenerator } from '@/components/features/settings/invite-link-generator'
import { ManagedMemberForm } from '@/components/features/members/managed-member-form'
import { ApiKeySettings } from '@/components/features/settings/api-key-settings'
import { StaplesManager } from '@/components/features/settings/staples-manager'
import { getPageContext } from '@/lib/supabase/queries'

export default async function SettingsPage() {
  const { supabase, user, householdId } = await getPageContext()

  const [householdResult, membersResult, managedMembersResult, staplesResult] = await Promise.all([
    supabase.from('households').select('*').eq('id', householdId).single(),
    supabase
      .from('household_members')
      .select('*, profiles!household_members_profile_id_fkey(display_name, email)')
      .eq('household_id', householdId),
    supabase.from('household_managed_members').select('*').eq('household_id', householdId),
    supabase
      .from('household_staples')
      .select('*')
      .eq('household_id', householdId)
      .order('name', { ascending: true }),
  ])

  const household = householdResult.data
  const members = membersResult.data
  const managedMembers = managedMembersResult.data
  const staples = staplesResult.data

  const currentMember = members?.find((m) => m.profile_id === user.id)
  const isAdmin = currentMember?.role === 'admin'

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{household?.name ?? 'Settings'}</h1>
        <p className="mt-1 text-muted-foreground">Manage your household members and settings.</p>
      </div>

      <MemberList members={members ?? []} isAdmin={isAdmin} />

      <ManagedMemberForm
        householdId={householdId}
        managedMembers={managedMembers ?? []}
        isAdmin={isAdmin}
      />

      {isAdmin && <InviteLinkGenerator householdId={householdId} />}

      {isAdmin && <ApiKeySettings householdId={householdId} />}

      <StaplesManager householdId={householdId} initialStaples={staples || []} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "perf: parallelize settings page data fetches"
```

---

## Task 4: Add loading.tsx skeletons to all dashboard routes

This is the highest-impact perceived performance improvement. When a user clicks a nav link, they'll immediately see a skeleton instead of staring at the previous page.

**Files:**
- Create: `src/components/ui/page-skeleton.tsx` (reusable skeleton layouts)
- Create: `src/app/(dashboard)/loading.tsx` (dashboard root — covers home)
- Create: `src/app/(dashboard)/recipes/loading.tsx`
- Create: `src/app/(dashboard)/recipes/[id]/loading.tsx`
- Create: `src/app/(dashboard)/calendar/loading.tsx`
- Create: `src/app/(dashboard)/todos/loading.tsx`
- Create: `src/app/(dashboard)/todos/[id]/loading.tsx`
- Create: `src/app/(dashboard)/meal-plans/loading.tsx`
- Create: `src/app/(dashboard)/inventory/loading.tsx`
- Create: `src/app/(dashboard)/shopping/loading.tsx`
- Create: `src/app/(dashboard)/shopping/[id]/loading.tsx`
- Create: `src/app/(dashboard)/settings/loading.tsx`
- Create: `src/app/(dashboard)/recipes/new/loading.tsx`
- Create: `src/app/(dashboard)/recipes/[id]/edit/loading.tsx`

### 4a: Create reusable skeleton building blocks

- [ ] **Step 1: Create page-skeleton component**

Create `src/components/ui/page-skeleton.tsx`:

```typescript
import { Skeleton } from '@/components/ui/skeleton'

/** Page header: title bar with optional action button placeholder */
export function PageHeaderSkeleton({ hasAction = false }: { hasAction?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-9 w-40" />
      {hasAction && <Skeleton className="h-10 w-32" />}
    </div>
  )
}

/** Grid of card skeletons (recipes, shopping lists, etc.) */
export function CardGridSkeleton({ count = 6, cols = 'grid-cols-2 lg:grid-cols-3' }: { count?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** List of row skeletons (todos, inventory, etc.) */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Dashboard home skeleton */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Calendar skeleton */
export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg border overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-8" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  )
}

/** Meal plan weekly grid skeleton */
export function MealPlanSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-9" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="hidden md:grid grid-cols-[100px_repeat(7,1fr)] gap-px rounded-lg border overflow-hidden">
        {/* Header row */}
        <Skeleton className="h-12" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
        {/* 4 meal type rows x 8 cols */}
        {Array.from({ length: 32 }).map((_, i) => (
          <Skeleton key={`r-${i}`} className="h-20" />
        ))}
      </div>
    </div>
  )
}

/** Detail page skeleton (recipe detail, todo detail, etc.) */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/page-skeleton.tsx
git commit -m "feat: add reusable skeleton building blocks for loading states"
```

### 4b: Add loading.tsx files to every route

- [ ] **Step 1: Dashboard root loading**

Create `src/app/(dashboard)/loading.tsx`:

```typescript
import { DashboardSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <DashboardSkeleton />
}
```

- [ ] **Step 2: Recipes loading**

Create `src/app/(dashboard)/recipes/loading.tsx`:

```typescript
import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasAction />
      <CardGridSkeleton />
    </div>
  )
}
```

- [ ] **Step 3: Recipe detail loading**

Create `src/app/(dashboard)/recipes/[id]/loading.tsx`:

```typescript
import { DetailSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <DetailSkeleton />
}
```

- [ ] **Step 4: Calendar loading**

Create `src/app/(dashboard)/calendar/loading.tsx`:

```typescript
import { CalendarSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <CalendarSkeleton />
}
```

- [ ] **Step 5: Todos loading**

Create `src/app/(dashboard)/todos/loading.tsx`:

```typescript
import { PageHeaderSkeleton, ListSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasAction />
      <ListSkeleton />
    </div>
  )
}
```

- [ ] **Step 6: Todo detail loading**

Create `src/app/(dashboard)/todos/[id]/loading.tsx`:

```typescript
import { DetailSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <DetailSkeleton />
}
```

- [ ] **Step 7: Meal plans loading**

Create `src/app/(dashboard)/meal-plans/loading.tsx`:

```typescript
import { PageHeaderSkeleton, MealPlanSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <MealPlanSkeleton />
    </div>
  )
}
```

- [ ] **Step 8: Inventory loading**

Create `src/app/(dashboard)/inventory/loading.tsx`:

```typescript
import { PageHeaderSkeleton, ListSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasAction />
      <ListSkeleton count={8} />
    </div>
  )
}
```

- [ ] **Step 9: Shopping loading**

Create `src/app/(dashboard)/shopping/loading.tsx`:

```typescript
import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasAction />
      <CardGridSkeleton count={4} cols="grid-cols-1 md:grid-cols-2" />
    </div>
  )
}
```

- [ ] **Step 10: Shopping detail loading**

Create `src/app/(dashboard)/shopping/[id]/loading.tsx`:

```typescript
import { DetailSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <DetailSkeleton />
}
```

- [ ] **Step 11: Settings loading**

Create `src/app/(dashboard)/settings/loading.tsx`:

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1 h-5 w-72" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 12: Recipe new/edit loading**

Create `src/app/(dashboard)/recipes/new/loading.tsx`:

```typescript
import { DetailSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <DetailSkeleton />
}
```

Create `src/app/(dashboard)/recipes/[id]/edit/loading.tsx`:

```typescript
import { DetailSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return <DetailSkeleton />
}
```

- [ ] **Step 13: Verify build**

Run: `npm run build`
Expected: Build succeeds, no errors

- [ ] **Step 14: Commit**

```bash
git add src/app/\(dashboard\)/loading.tsx src/app/\(dashboard\)/recipes/loading.tsx src/app/\(dashboard\)/recipes/\[id\]/loading.tsx src/app/\(dashboard\)/recipes/\[id\]/edit/loading.tsx src/app/\(dashboard\)/recipes/new/loading.tsx src/app/\(dashboard\)/calendar/loading.tsx src/app/\(dashboard\)/todos/loading.tsx src/app/\(dashboard\)/todos/\[id\]/loading.tsx src/app/\(dashboard\)/meal-plans/loading.tsx src/app/\(dashboard\)/inventory/loading.tsx src/app/\(dashboard\)/shopping/loading.tsx src/app/\(dashboard\)/shopping/\[id\]/loading.tsx src/app/\(dashboard\)/settings/loading.tsx
git commit -m "feat: add loading skeletons to all dashboard routes for instant transitions"
```

---

## Task 5: Narrow Supabase select columns

Reduce payload size by selecting only needed columns instead of `select('*')`.

**Files:**
- Modify: `src/app/(dashboard)/page.tsx` (events and inventory queries)
- Modify: `src/app/(dashboard)/inventory/page.tsx`

- [ ] **Step 1: Narrow home page event select**

In `src/app/(dashboard)/page.tsx`, replace `.select('*')` on calendar_events with:

```typescript
    supabase
      .from('calendar_events')
      .select('id, title, start_datetime, end_datetime, all_day, category, assigned_to')
      .eq('household_id', householdId)
      // ... rest unchanged
```

- [ ] **Step 2: Narrow home page inventory select**

Replace `.select('*')` on inventory_items with:

```typescript
    supabase
      .from('inventory_items')
      .select('id, display_name, quantity, unit, expiry_date, location')
      .eq('household_id', householdId)
      // ... rest unchanged
```

- [ ] **Step 3: Narrow inventory page select**

In `src/app/(dashboard)/inventory/page.tsx`, check what `InventoryList` actually uses and narrow accordingly. If it uses most fields, leave as-is. At minimum, remove any `created_at`/`updated_at` fields if they're not displayed.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No type errors. If type errors appear, the component expects a field we removed — add it back.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx src/app/\(dashboard\)/inventory/page.tsx
git commit -m "perf: narrow Supabase select columns to reduce payload size"
```

---

## Task 6: Final build + manual verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 2: Verify loading states work**

Start dev server: `npm run dev`

Test each route transition:
1. Navigate to /recipes — should show card grid skeleton briefly
2. Navigate to /calendar — should show calendar skeleton
3. Navigate to /todos — should show list skeleton
4. Navigate to /meal-plans — should show meal plan skeleton
5. Navigate to /inventory — should show list skeleton
6. Navigate to /shopping — should show card grid skeleton
7. Click a recipe — should show detail skeleton
8. Navigate back to / — should show dashboard skeleton

Each transition should show the skeleton immediately instead of hanging on the previous page.

- [ ] **Step 3: Final commit if any fixes needed**
