# Lemons — Household Management Platform

## Project Overview

Household management web app: recipes, meal planning, calendar, todos, inventory, shopping lists. Multi-household, per-person accounts.

## Tech Stack

- **Frontend:** Next.js 14+ (App Router), React, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API routes (server-side logic)
- **Database:** Supabase (PostgreSQL + Row Level Security)
- **Auth:** Supabase Auth (email/password + OAuth)
- **Storage:** Supabase Storage (recipe images, avatars)
- **AI:** Anthropic Claude API (recipe image extraction)
- **Deployment:** Vercel
- **Testing:** Vitest, React Testing Library, Playwright

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build (also runs TypeScript check)
npm run lint         # ESLint
npx vitest           # Unit tests
npx playwright test  # E2E tests (requires dev server running)
```

## Architecture

**Approach A: Next.js Full-Stack Monolith.** All server-side logic lives in `src/app/api/` route handlers and `src/lib/`.

### IMPORTANT: Approach B Escape Hatch

If complexity grows — particularly around AI processing, complex business logic, or performance — the `src/app/api/` routes and `src/lib/` modules are the extraction boundary for a **Python FastAPI backend (Approach B)**.

- `lib/ai/` — Claude API integration. First extraction candidate.
- `lib/utils/` — Business logic (scaling, unit conversion, inventory matching). Second candidate.

**To migrate to Approach B:**
1. Stand up a FastAPI service implementing the same interfaces defined in `lib/`
2. Replace Next.js API routes with thin proxies to the Python service
3. Frontend code doesn't change

**When to consider migrating:**
- AI processing needs exceed Vercel serverless function limits (60s on free tier)
- Business logic becomes too complex for TypeScript (e.g. advanced meal plan optimization)
- Need Python-specific libraries (ML, data processing)
- Performance bottlenecks in serverless cold starts

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Public auth pages
│   ├── (dashboard)/      # Authenticated app (sidebar layout)
│   │   ├── recipes/
│   │   ├── meal-plans/
│   │   ├── calendar/
│   │   ├── todos/
│   │   ├── inventory/
│   │   └── shopping/
│   └── api/              # Server-side route handlers
├── components/
│   ├── ui/               # shadcn/ui base components
│   └── features/         # Feature-specific components
├── lib/
│   ├── supabase/         # Client + helpers
│   ├── ai/               # Claude API (extraction boundary)
│   └── utils/            # Business logic (extraction boundary)
└── types/                # TypeScript types
```

## Deployment

- **Vercel** auto-deploys from `main` (production) and PR branches (preview)
- **Supabase migrations** run automatically on deploy via Supabase GitHub integration
- **Vercel project:** `lennons301s-projects/lemons`
- **Vercel CLI:** use `vercel ls`, `vercel logs <url>` to inspect deployments

## Environment Isolation

**Never develop against the production database.**

```
Local dev:     supabase start    → local Docker Postgres
Preview/PR:    Vercel preview    → staging Supabase project (lemons-staging)
Production:    Vercel production → production Supabase project
```

- Migrations are developed and tested locally first
- Verified on staging before production
- `supabase/seed.sql` provides repeatable test data for local/staging
- Supabase branching can be used if available on the plan
- **Note:** Local Docker/Supabase not always available (WSL2). Type regeneration may need to be done manually.

## Key Conventions

- **Server Components by default.** Client Components only where interactivity is needed.
- **Row Level Security on every table with `household_id`.** Authorization is enforced at the database level, not application level.
- **Ingredient names are normalized** (singular, lowercase, adjectives stripped) for matching across recipes, inventory, and shopping lists.
- **RRULE (RFC 5545)** for all recurrence (calendar events, recurring tasks).
- **Shopping lists are todo lists** with `list_type = 'shopping'`. No separate shopping entity.
- **Meal plan entries are not duplicated into calendar_events.** Calendar views query both tables and composite them.
- **Unified person model:** `household_persons` view unions `household_members` (adults with accounts) and `household_managed_members` (kids, no accounts). All features reference person IDs from this view.
- **Many-to-many relations** (tags, ingredients, recipe_members) use delete-and-reinsert on update. No upsert.
- **Member colors** are deterministic by ID hash (8 colors in `member-colors.ts`). Used for avatars, badges, calendar.
- **Claude API images** must be under 5MB base64. Frontend compresses all images before sending (iterative JPEG quality reduction).
- **Todo list templates** use `is_template` flag on `todo_lists`. Clone via `/api/todos/[id]/clone`. Templates are household-scoped.
- **Item groups** use `group_name` on `todo_items`. UI supports collapsible sections or tabs (persisted in localStorage per list).
- **Event-linked lists** use `event_id` FK on `todo_lists`. One list per event. Calendar events show linked list progress.

## Key Files

- `docs/plans/` — Design docs and implementation plans
- `supabase/migrations/` — Sequential numbered migrations (00001–00015+)
- `src/components/features/` — Feature components organized by domain (recipes, todos, calendar, meal-plan, shopping, inventory, etc.)
- `src/lib/utils/member-colors.ts` — Deterministic member color assignment
- `src/lib/ai/extract-recipe.ts` — Claude API recipe extraction
- `src/app/api/todos/[id]/clone/route.ts` — Clone endpoint for list templates
- `src/app/api/todos/my-tasks/route.ts` — Cross-list "My Tasks" query

## Design Document

Full design: `docs/plans/2026-03-02-lemons-design.md`
