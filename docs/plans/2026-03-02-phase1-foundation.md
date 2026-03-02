# Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up the project scaffolding, database, auth, household management, and app shell — the foundation everything else builds on.

**Architecture:** Next.js 14+ App Router monolith with Supabase (Postgres + Auth + Storage). Server Components by default, Client Components only for interactivity. RLS enforces authorization at the database level.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui, Supabase (local Docker for dev), Vitest, React Testing Library

**Design doc:** `docs/plans/2026-03-02-lemons-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `vitest.config.ts`

**Step 1: Create Next.js project**

Run from the repo root (files already exist so use `--yes` flag):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

If prompted about overwriting README.md, allow it.

**Step 2: Install testing dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Add to `package.json` scripts:

```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 4: Install and initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Select: New York style, Zinc base color, CSS variables for colors.

Then install initial components:

```bash
npx shadcn@latest add button input label card toast sonner
```

**Step 5: Verify it works**

```bash
npm run build && npm run test:run
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind, shadcn/ui, Vitest"
```

---

## Task 2: Supabase Local Setup

**Files:**
- Create: `supabase/config.toml` (via supabase init)
- Create: `.env.local`
- Modify: `.gitignore`

**Step 1: Install Supabase CLI** (if not already installed)

```bash
npm install -D supabase
npx supabase init
```

**Step 2: Create `.env.local`**

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start output>
```

The actual keys come from `npx supabase start` output. For now, create the file with placeholders.

**Step 3: Add to `.gitignore`**

Append:

```
.env.local
.env.production
```

**Step 4: Start Supabase locally and capture keys**

```bash
npx supabase start
```

Update `.env.local` with the actual `anon key` and `service_role key` from the output.

**Step 5: Commit**

```bash
git add supabase/ .gitignore
git commit -m "feat: initialize Supabase local dev environment"
```

Do NOT commit `.env.local`.

---

## Task 3: Database Migration — Profiles, Households, Members

**Files:**
- Create: `supabase/migrations/00001_foundation.sql`
- Create: `supabase/seed.sql`

**Step 1: Write the migration**

Create `supabase/migrations/00001_foundation.sql`:

```sql
-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (auto-created from Supabase Auth via trigger)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  default_household_id uuid,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- HOUSEHOLDS
-- ============================================================
create table public.households (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null
);

alter table public.households enable row level security;

create policy "Members can view their households"
  on public.households for select
  using (
    id in (
      select household_id from public.household_members
      where profile_id = auth.uid()
    )
  );

create policy "Authenticated users can create households"
  on public.households for insert
  with check (auth.uid() = created_by);

create policy "Admins can update their households"
  on public.households for update
  using (
    id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- HOUSEHOLD MEMBERS
-- ============================================================
create table public.household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  joined_at timestamptz default now() not null,
  invited_by uuid references public.profiles(id),
  unique(household_id, profile_id)
);

alter table public.household_members enable row level security;

create policy "Members can view co-members"
  on public.household_members for select
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid()
    )
  );

create policy "Admins can insert members"
  on public.household_members for insert
  with check (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
    or profile_id = auth.uid() -- users can add themselves (for household creation)
  );

create policy "Admins can update members"
  on public.household_members for update
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can remove members"
  on public.household_members for delete
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
    or profile_id = auth.uid() -- users can leave
  );

-- ============================================================
-- HOUSEHOLD MANAGED MEMBERS (non-user members like children)
-- ============================================================
create table public.household_managed_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_by uuid not null references public.profiles(id),
  linked_profile_id uuid references public.profiles(id)
);

alter table public.household_managed_members enable row level security;

create policy "household_isolation"
  on public.household_managed_members for all
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid()
    )
  );

-- ============================================================
-- HOUSEHOLD INVITES
-- ============================================================
create table public.household_invites (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text,
  invite_code text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid not null references public.profiles(id)
);

alter table public.household_invites enable row level security;

create policy "Admins can manage invites"
  on public.household_invites for all
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
  );

-- Public read for invite acceptance (by invite code)
create policy "Anyone can read invites by code"
  on public.household_invites for select
  using (true);

-- ============================================================
-- Add FK for profiles.default_household_id (deferred because households didn't exist yet)
-- ============================================================
alter table public.profiles
  add constraint profiles_default_household_fk
  foreign key (default_household_id) references public.households(id) on delete set null;
```

**Step 2: Write seed data**

Create `supabase/seed.sql`:

```sql
-- Seed data for local development
-- Run after migration. Uses Supabase Auth admin API to create test users.
-- Test users are created via the Supabase dashboard or supabase/config.toml seed.

-- This file seeds data AFTER test users exist.
-- For local dev, create test users via the Auth UI at http://127.0.0.1:54323
-- then run: psql -f supabase/seed.sql

-- Placeholder: will be populated once auth is working and we have test user IDs.
```

**Step 3: Apply migration locally**

```bash
npx supabase db reset
```

Expected: Migration applies cleanly, tables created.

**Step 4: Verify tables exist**

```bash
npx supabase db lint
```

**Step 5: Commit**

```bash
git add supabase/migrations/ supabase/seed.sql
git commit -m "feat: add foundation database migration (profiles, households, members, invites)"
```

---

## Task 4: Supabase Client Libraries

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/middleware.ts`
- Create: `src/types/database.ts`

**Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

**Step 2: Generate TypeScript types from local DB**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

**Step 3: Create server client**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  )
}
```

**Step 4: Create browser client**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 5: Create middleware helper**

Create `src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login (except auth pages)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/signup') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/invite')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

**Step 6: Create Next.js middleware**

Create `src/middleware.ts`:

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Step 7: Verify build**

```bash
npm run build
```

**Step 8: Commit**

```bash
git add src/lib/supabase/ src/middleware.ts src/types/database.ts
git commit -m "feat: add Supabase client libraries and auth middleware"
```

---

## Task 5: Auth Pages (Login & Signup)

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/app/(auth)/auth/callback/route.ts`
- Create: `src/app/(auth)/layout.tsx`

**Step 1: Create auth layout**

Create `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Lemons</h1>
          <p className="mt-2 text-gray-600">Household management, simplified</p>
        </div>
        {children}
      </div>
    </div>
  )
}
```

**Step 2: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </Button>
          <p className="text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary underline">Sign up</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
```

**Step 3: Create signup page**

Create `src/app/(auth)/signup/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
      </CardHeader>
      <form onSubmit={handleSignup}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </Button>
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-primary underline">Log in</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
```

**Step 4: Create auth callback route**

Create `src/app/(auth)/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

**Step 5: Verify build**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat: add login, signup, and auth callback pages"
```

---

## Task 6: Household Creation API + Onboarding

**Files:**
- Create: `src/app/api/households/route.ts`
- Create: `src/app/(dashboard)/onboarding/page.tsx`
- Create: `src/lib/supabase/queries.ts`

**Step 1: Create household queries helper**

Create `src/lib/supabase/queries.ts`:

```ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getUserHouseholds(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, display_name, households(id, name)')
    .eq('profile_id', userId)

  if (error) throw error
  return data
}

export async function createHouseholdWithMember(
  supabase: Client,
  userId: string,
  householdName: string
) {
  // Create household
  const { data: household, error: hError } = await supabase
    .from('households')
    .insert({ name: householdName, created_by: userId })
    .select()
    .single()

  if (hError) throw hError

  // Add creator as admin
  const { error: mError } = await supabase
    .from('household_members')
    .insert({
      household_id: household.id,
      profile_id: userId,
      role: 'admin',
    })

  if (mError) throw mError

  // Set as default household
  await supabase
    .from('profiles')
    .update({ default_household_id: household.id })
    .eq('id', userId)

  return household
}
```

**Step 2: Create households API route**

Create `src/app/api/households/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHouseholdWithMember, getUserHouseholds } from '@/lib/supabase/queries'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const households = await getUserHouseholds(supabase, user.id)
    return NextResponse.json(households)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch households' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await request.json()

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Household name is required' }, { status: 400 })
  }

  try {
    const household = await createHouseholdWithMember(supabase, user.id, name.trim())
    return NextResponse.json(household, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create household' }, { status: 500 })
  }
}
```

**Step 3: Create onboarding page**

Create `src/app/(dashboard)/onboarding/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function OnboardingPage() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Something went wrong')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-4">
        <Card>
          <CardHeader>
            <CardTitle>Welcome to Lemons!</CardTitle>
            <CardDescription>
              Create your household to get started. You can invite family members later.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleCreate}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Household name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder='e.g. "The Smiths"'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating...' : 'Create household'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
```

**Step 4: Verify build**

```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/app/api/households/ src/app/\(dashboard\)/onboarding/ src/lib/supabase/queries.ts
git commit -m "feat: add household creation API and onboarding page"
```

---

## Task 7: Household Context + Active Household

**Files:**
- Create: `src/components/providers/household-provider.tsx`
- Create: `src/app/(dashboard)/layout.tsx`

**Step 1: Create household context provider**

Create `src/components/providers/household-provider.tsx`:

```tsx
'use client'

import { createContext, useContext, useState, useCallback } from 'react'

type Household = {
  id: string
  name: string
  role: string
}

type HouseholdContextType = {
  activeHousehold: Household | null
  households: Household[]
  setActiveHousehold: (household: Household) => void
}

const HouseholdContext = createContext<HouseholdContextType>({
  activeHousehold: null,
  households: [],
  setActiveHousehold: () => {},
})

export function useHousehold() {
  return useContext(HouseholdContext)
}

export function HouseholdProvider({
  children,
  initialHouseholds,
  defaultHouseholdId,
}: {
  children: React.ReactNode
  initialHouseholds: Household[]
  defaultHouseholdId: string | null
}) {
  const [households] = useState(initialHouseholds)
  const [activeHousehold, setActiveHouseholdState] = useState<Household | null>(
    initialHouseholds.find((h) => h.id === defaultHouseholdId) ||
    initialHouseholds[0] || null
  )

  const setActiveHousehold = useCallback(async (household: Household) => {
    setActiveHouseholdState(household)
    // Persist preference to server
    await fetch('/api/profile/default-household', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdId: household.id }),
    })
  }, [])

  return (
    <HouseholdContext.Provider value={{ activeHousehold, households, setActiveHousehold }}>
      {children}
    </HouseholdContext.Provider>
  )
}
```

**Step 2: Create default-household API route**

Create `src/app/api/profile/default-household/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { householdId } = await request.json()

  const { error } = await supabase
    .from('profiles')
    .update({ default_household_id: householdId })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

**Step 3: Create dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserHouseholds } from '@/lib/supabase/queries'
import { HouseholdProvider } from '@/components/providers/household-provider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const memberships = await getUserHouseholds(supabase, user.id)

  // No households — redirect to onboarding
  if (!memberships || memberships.length === 0) {
    redirect('/onboarding')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const households = memberships.map((m) => ({
    id: m.household_id,
    name: (m.households as { id: string; name: string })?.name ?? 'Unknown',
    role: m.role,
  }))

  return (
    <HouseholdProvider
      initialHouseholds={households}
      defaultHouseholdId={profile?.default_household_id ?? null}
    >
      <div className="flex min-h-screen">
        {/* Sidebar will be added in Task 8 */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </HouseholdProvider>
  )
}
```

**Step 4: Create placeholder home page**

Update `src/app/(dashboard)/page.tsx` (or create if needed):

```tsx
export default function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome to Lemons</h1>
      <p className="mt-2 text-gray-600">Your household dashboard will go here.</p>
    </div>
  )
}
```

Move the root `src/app/page.tsx` to redirect to the dashboard:

Update `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  redirect('/')
}
```

Note: Because the `(dashboard)` route group has the same path `/`, this root page may not be needed. The dashboard layout handles auth redirection. The exact routing structure may need adjustment during implementation — the key requirement is:
- Unauthenticated → `/login`
- Authenticated with no household → `/onboarding`
- Authenticated with household → dashboard home

**Step 5: Verify build**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/components/providers/ src/app/\(dashboard\)/ src/app/api/profile/ src/app/page.tsx
git commit -m "feat: add household context provider, dashboard layout, and routing"
```

---

## Task 8: App Shell — Sidebar Navigation

**Files:**
- Create: `src/components/features/sidebar.tsx`
- Create: `src/components/features/household-switcher.tsx`
- Create: `src/components/features/user-menu.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Install icons**

```bash
npm install lucide-react
```

**Step 2: Install additional shadcn/ui components**

```bash
npx shadcn@latest add dropdown-menu avatar separator select sheet
```

**Step 3: Create sidebar component**

Create `src/components/features/sidebar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChefHat,
  Package,
  ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HouseholdSwitcher } from './household-switcher'
import { UserMenu } from './user-menu'

const navItems = [
  { href: '/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/meal-plans', label: 'Meal Plans', icon: ChefHat },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/todos', label: 'Todos', icon: CheckSquare },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/shopping', label: 'Shopping', icon: ShoppingCart },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-xl font-bold">
          Lemons
        </Link>
      </div>

      <div className="px-3 py-3">
        <HouseholdSwitcher />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3">
        <UserMenu />
      </div>
    </aside>
  )
}
```

**Step 4: Create household switcher**

Create `src/components/features/household-switcher.tsx`:

```tsx
'use client'

import { useHousehold } from '@/components/providers/household-provider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function HouseholdSwitcher() {
  const { activeHousehold, households, setActiveHousehold } = useHousehold()

  if (households.length <= 1) {
    return (
      <div className="rounded-md bg-gray-50 px-3 py-2 text-sm font-medium">
        {activeHousehold?.name ?? 'No household'}
      </div>
    )
  }

  return (
    <Select
      value={activeHousehold?.id ?? ''}
      onValueChange={(id) => {
        const h = households.find((h) => h.id === id)
        if (h) setActiveHousehold(h)
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select household" />
      </SelectTrigger>
      <SelectContent>
        {households.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

**Step 5: Create user menu**

Create `src/components/features/user-menu.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { LogOut, Settings, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export function UserMenu() {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <User className="h-4 w-4" />
          <span className="text-sm">Account</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => router.push('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Step 6: Update dashboard layout to include sidebar**

Modify `src/app/(dashboard)/layout.tsx` — replace the `<div className="flex min-h-screen">` section:

```tsx
// Add import at top:
import { Sidebar } from '@/components/features/sidebar'

// Replace the return JSX:
return (
  <HouseholdProvider
    initialHouseholds={households}
    defaultHouseholdId={profile?.default_household_id ?? null}
  >
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  </HouseholdProvider>
)
```

**Step 7: Create placeholder pages for each nav section**

Create placeholder pages so navigation links work:

For each of: `recipes`, `meal-plans`, `calendar`, `todos`, `inventory`, `shopping`

Create `src/app/(dashboard)/[section]/page.tsx` with:

```tsx
export default function Page() {
  return (
    <div>
      <h1 className="text-2xl font-bold">[Section Name]</h1>
      <p className="mt-2 text-gray-600">Coming soon.</p>
    </div>
  )
}
```

Replace `[Section Name]` with the actual name for each page.

**Step 8: Verify build**

```bash
npm run build
```

**Step 9: Commit**

```bash
git add src/components/features/ src/app/\(dashboard\)/
git commit -m "feat: add app shell with sidebar navigation and household switcher"
```

---

## Task 9: Invite Flow

**Files:**
- Create: `src/app/api/households/[id]/invites/route.ts`
- Create: `src/app/(auth)/invite/[code]/page.tsx`

**Step 1: Install nanoid for invite codes**

```bash
npm install nanoid
```

**Step 2: Create invite API route**

Create `src/app/api/households/[id]/invites/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check user is admin of this household
  const { data: membership } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('profile_id', user.id)
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const inviteCode = nanoid(12)

  const { data: invite, error } = await supabase
    .from('household_invites')
    .insert({
      household_id: householdId,
      email: body.email || null,
      invite_code: inviteCode,
      role: body.role || 'member',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  return NextResponse.json(invite, { status: 201 })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: invites, error } = await supabase
    .from('household_invites')
    .select('*')
    .eq('household_id', householdId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }

  return NextResponse.json(invites)
}
```

**Step 3: Create invite acceptance page**

Create `src/app/(auth)/invite/[code]/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteAcceptClient } from './invite-accept-client'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const supabase = await createClient()

  // Look up invite
  const { data: invite } = await supabase
    .from('household_invites')
    .select('*, households(name)')
    .eq('invite_code', code)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invite) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold">Invalid or expired invite</h2>
        <p className="mt-2 text-gray-600">This invite link is no longer valid.</p>
      </div>
    )
  }

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Redirect to signup with invite code preserved
    redirect(`/signup?invite=${code}`)
  }

  const householdName = (invite.households as { name: string })?.name ?? 'a household'

  return <InviteAcceptClient inviteCode={code} householdName={householdName} />
}
```

Create `src/app/(auth)/invite/[code]/invite-accept-client.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function InviteAcceptClient({
  inviteCode,
  householdName,
}: {
  inviteCode: string
  householdName: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleAccept() {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to accept invite')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve been invited!</CardTitle>
        <CardDescription>
          Join <strong>{householdName}</strong> on Lemons.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button onClick={handleAccept} disabled={loading} className="flex-1">
          {loading ? 'Joining...' : 'Accept invite'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/')} className="flex-1">
          Decline
        </Button>
      </CardFooter>
    </Card>
  )
}
```

**Step 4: Create invite accept API**

Create `src/app/api/invites/accept/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { inviteCode } = await request.json()

  // Find valid invite
  const { data: invite, error: findError } = await supabase
    .from('household_invites')
    .select('*')
    .eq('invite_code', inviteCode)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (findError || !invite) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  }

  // Check not already a member
  const { data: existing } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', invite.household_id)
    .eq('profile_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Already a member' }, { status: 409 })
  }

  // Add member
  const { error: joinError } = await supabase
    .from('household_members')
    .insert({
      household_id: invite.household_id,
      profile_id: user.id,
      role: invite.role,
      invited_by: invite.created_by,
    })

  if (joinError) {
    return NextResponse.json({ error: 'Failed to join household' }, { status: 500 })
  }

  // Mark invite accepted
  await supabase
    .from('household_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true })
}
```

**Step 5: Verify build**

```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/app/api/households/ src/app/api/invites/ src/app/\(auth\)/invite/
git commit -m "feat: add household invite creation and acceptance flow"
```

---

## Task 10: Household Settings Page

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/components/features/member-list.tsx`
- Create: `src/components/features/managed-member-form.tsx`
- Create: `src/components/features/invite-link-generator.tsx`

**Step 1: Create settings page**

Create `src/app/(dashboard)/settings/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MemberList } from '@/components/features/member-list'
import { InviteLinkGenerator } from '@/components/features/invite-link-generator'
import { ManagedMemberForm } from '@/components/features/managed-member-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) redirect('/onboarding')

  // Fetch household details
  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .single()

  // Fetch members
  const { data: members } = await supabase
    .from('household_members')
    .select('*, profiles(display_name, email)')
    .eq('household_id', householdId)

  // Fetch managed members
  const { data: managedMembers } = await supabase
    .from('household_managed_members')
    .select('*')
    .eq('household_id', householdId)

  // Check if current user is admin
  const currentMember = members?.find((m) => m.profile_id === user.id)
  const isAdmin = currentMember?.role === 'admin'

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{household?.name ?? 'Settings'}</h1>
        <p className="mt-1 text-gray-600">Manage your household members and settings.</p>
      </div>

      <MemberList members={members ?? []} isAdmin={isAdmin} />

      <ManagedMemberForm
        householdId={householdId}
        managedMembers={managedMembers ?? []}
        isAdmin={isAdmin}
      />

      {isAdmin && <InviteLinkGenerator householdId={householdId} />}
    </div>
  )
}
```

The `MemberList`, `ManagedMemberForm`, and `InviteLinkGenerator` components are Client Components that handle:

- **MemberList:** Displays household members with role badges. Admins can remove members.
- **ManagedMemberForm:** Admins can add/edit managed members (children, etc.) via a simple name input + list.
- **InviteLinkGenerator:** Admins click "Generate invite link" → calls `POST /api/households/[id]/invites` → displays copyable link.

These are standard CRUD form components using the shadcn/ui primitives already installed. Implementation details are straightforward — fetch from the API routes already built in Task 9, render with Cards/Buttons/Inputs.

**Step 2: Implement the three Client Components**

Each is a `'use client'` component using `fetch` against the API routes. Keep them simple — no unnecessary abstractions.

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/settings/ src/components/features/member-list.tsx src/components/features/managed-member-form.tsx src/components/features/invite-link-generator.tsx
git commit -m "feat: add household settings page with member management and invites"
```

---

## Task 11: Managed Members API

**Files:**
- Create: `src/app/api/households/[id]/managed-members/route.ts`

**Step 1: Create managed members API route**

Create `src/app/api/households/[id]/managed-members/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('household_managed_members')
    .select('*')
    .eq('household_id', householdId)

  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { displayName } = await request.json()

  if (!displayName || typeof displayName !== 'string') {
    return NextResponse.json({ error: 'Display name required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('household_managed_members')
    .insert({
      household_id: householdId,
      display_name: displayName.trim(),
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

**Step 2: Commit**

```bash
git add src/app/api/households/\[id\]/managed-members/
git commit -m "feat: add managed members API for non-user household members"
```

---

## Task 12: Supabase Local Config + Seed Script

**Files:**
- Modify: `supabase/config.toml`
- Modify: `supabase/seed.sql`

**Step 1: Configure local auth settings**

In `supabase/config.toml`, ensure these settings for local development:

```toml
[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]

[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false
```

Disabling email confirmations locally means signup works instantly without email verification.

**Step 2: Finalize seed data**

Update `supabase/seed.sql` — this runs after `supabase db reset` to provide test data. Since Supabase local auth creates users via the dashboard/API, the seed focuses on populating data for already-created test users. Add a comment explaining the workflow.

**Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: configure local Supabase auth and seed data"
```

---

## Task 13: End-to-End Smoke Test

**Files:**
- None created — manual testing

**Step 1: Reset and start local Supabase**

```bash
npx supabase db reset
npx supabase start
```

**Step 2: Start Next.js dev server**

```bash
npm run dev
```

**Step 3: Manual smoke test**

1. Visit `http://localhost:3000` — should redirect to `/login`
2. Click "Sign up" — create account with test email
3. After signup — should redirect to `/onboarding`
4. Create a household — should redirect to dashboard
5. Sidebar navigation — all links work (show placeholder pages)
6. Household name shows in sidebar switcher
7. Settings page — shows current user as admin member
8. Generate invite link — link appears, can be copied
9. Log out — returns to login page

**Step 4: Fix any issues found**

**Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during foundation smoke test"
```

---

## Task 14: First Deployment (Vercel + Supabase Staging)

**Goal:** Get the app deployed to Vercel with a Supabase staging project, validating the full hosted environment before building features on top.

**Files:**
- None created — configuration via Vercel dashboard and CLI

**Step 1: Create Supabase staging project**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) and create a new project named `lemons-staging`
2. Note the project URL and keys (anon key, service role key)
3. Run migrations against staging:

```bash
npx supabase link --project-ref <staging-project-ref>
npx supabase db push
```

4. Unlink after pushing (local dev should stay pointed at local Docker):

```bash
npx supabase unlink
```

**Step 2: Link repo to Vercel**

```bash
npx vercel link
```

Select the appropriate Vercel team/account and link to the repo.

**Step 3: Configure environment variables**

Set these in Vercel project settings (or via CLI):

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL        # staging project URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY    # staging anon key
npx vercel env add SUPABASE_SERVICE_ROLE_KEY        # staging service role key
```

Ensure preview deployments and production both have the staging values for now. Production will get its own Supabase project later.

**Step 4: Deploy and verify**

```bash
npx vercel --prod
```

Verify:
1. App loads at the Vercel URL
2. Auth flow works (signup, login, logout) against staging Supabase
3. Household creation and onboarding work
4. Sidebar navigation renders correctly
5. No console errors related to environment variables or Supabase connection

**Step 5: Verify preview deployments**

Push a test branch and confirm Vercel creates a preview deployment automatically. This ensures every future PR gets a preview URL.

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffolding | package.json, Next.js config, Vitest, shadcn/ui |
| 2 | Supabase local setup | supabase/config.toml, .env.local |
| 3 | Database migration | supabase/migrations/00001_foundation.sql |
| 4 | Supabase client libs | src/lib/supabase/{server,client,middleware}.ts |
| 5 | Auth pages | src/app/(auth)/login, signup, auth/callback |
| 6 | Household creation | src/app/api/households/, onboarding page |
| 7 | Household context | HouseholdProvider, dashboard layout |
| 8 | Sidebar navigation | Sidebar, HouseholdSwitcher, UserMenu, placeholder pages |
| 9 | Invite flow | Invite API, invite acceptance page |
| 10 | Settings page | Member list, managed members, invite generator |
| 11 | Managed members API | API route for non-user members |
| 12 | Local config + seed | Supabase config, seed data |
| 13 | Smoke test | Manual end-to-end verification |
| 14 | First deployment | Vercel + Supabase staging, preview deploys |

**After Phase 1:** The app has auth, households, navigation, the complete shell, and a working deployment pipeline. Phase 2 (Recipes) builds on this foundation.
