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

## Key Conventions

- **Server Components by default.** Client Components only where interactivity is needed.
- **Row Level Security on every table with `household_id`.** Authorization is enforced at the database level, not application level.
- **Ingredient names are normalized** (singular, lowercase, adjectives stripped) for matching across recipes, inventory, and shopping lists.
- **RRULE (RFC 5545)** for all recurrence (calendar events, recurring tasks).
- **Shopping lists are todo lists** with `list_type = 'shopping'`. No separate shopping entity.
- **Meal plan entries are not duplicated into calendar_events.** Calendar views query both tables and composite them.

## Design Document

Full design: `docs/plans/2026-03-02-lemons-design.md`
