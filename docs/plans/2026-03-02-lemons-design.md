# Lemons — Household Management Platform Design

**Date**: 2026-03-02
**Status**: Approved

## Overview

Lemons is a household management web application for families. It handles recipe collation, meal planning, shared calendar, task management, inventory tracking, and shopping lists. Designed for multi-household use with per-person accounts.

## Architecture

**Approach A: Next.js Full-Stack Monolith** — single Next.js 14+ App Router application deployed to Vercel. Supabase provides database (PostgreSQL), auth, file storage, and realtime sync. Claude API handles AI recipe extraction.

### Approach B Escape Hatch

This app starts as a Next.js full-stack monolith (Approach A). All server-side logic lives in `src/app/api/` route handlers and `src/lib/`. If complexity grows — particularly around AI processing, complex business logic, or performance — these modules are the extraction boundary for a Python FastAPI backend (Approach B).

The `lib/ai/` and `lib/utils/` modules define the interface contracts. To migrate:
1. Stand up a FastAPI service implementing the same interfaces
2. Replace Next.js API routes with thin proxies to the Python service
3. Frontend code doesn't change

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Server + Client Components), Tailwind CSS, shadcn/ui |
| Backend | Next.js API routes |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (email/password + OAuth) |
| File storage | Supabase Storage |
| AI | Anthropic Claude API (vision) |
| Deployment | Vercel |
| Realtime | Supabase Realtime |
| Testing | Vitest + React Testing Library + Playwright |
| Drag & drop | dnd-kit |
| Virtual scrolling | @tanstack/react-virtual |
| Recurrence | rrule.js |

## Project Structure

```
lemons/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth pages (login, signup, invite)
│   │   ├── (dashboard)/        # Authenticated app shell
│   │   │   ├── recipes/
│   │   │   ├── meal-plans/
│   │   │   ├── calendar/
│   │   │   ├── todos/
│   │   │   ├── inventory/
│   │   │   └── shopping/
│   │   └── api/                # Route Handlers (server-side)
│   │       ├── recipes/        # Recipe extraction (Claude API)
│   │       ├── meal-plans/
│   │       └── inventory/
│   ├── components/
│   │   ├── ui/                 # Base components (shadcn/ui)
│   │   └── features/           # Feature-specific components
│   ├── lib/
│   │   ├── supabase/           # Supabase client + helpers
│   │   ├── ai/                 # Claude API integration
│   │   └── utils/              # Unit conversion, scaling, etc.
│   └── types/                  # TypeScript type definitions
├── supabase/
│   ├── migrations/             # Database migrations
│   └── seed.sql                # Test data for local/staging
├── public/
└── docs/
    └── plans/
```

## Data Model

### Tables

**profiles** — Auto-created from Supabase Auth via database trigger.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Matches auth.users.id |
| email | text | |
| display_name | text | |
| avatar_url | text | Supabase Storage |
| default_household_id | uuid | Last-used household |
| preferences | jsonb | Theme, default views, notification settings |
| created_at | timestamptz | |

**households**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| name | text | "The Smiths" |
| created_by | uuid | FK → profiles |
| created_at | timestamptz | |

**household_members**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| household_id | uuid | FK → households |
| profile_id | uuid | FK → profiles |
| role | text | admin / member |
| display_name | text | Override ("Dad" instead of "Sean") |
| joined_at | timestamptz | |
| invited_by | uuid | FK → profiles |

**household_managed_members** — Non-user members (children, grandparents without accounts).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| household_id | uuid | FK → households |
| display_name | text | |
| avatar_url | text | |
| created_by | uuid | FK → profiles |
| linked_profile_id | uuid | Null until merged with a real account |

**household_invites**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| household_id | uuid | FK → households |
| email | text | Optional — can be a generic link |
| invite_code | text | Unique, URL-safe token |
| role | text | Role granted on accept |
| expires_at | timestamptz | 7 days default |
| accepted_at | timestamptz | |
| created_by | uuid | FK → profiles |

**recipes**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| title | text | |
| description | text | |
| servings | integer | Base serving count |
| prep_time | integer | Minutes |
| cook_time | integer | Minutes |
| instructions | jsonb | Array of step strings |
| source_url | text | |
| household_id | uuid | FK → households |
| created_by | uuid | FK → profiles |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**recipe_ingredients**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| recipe_id | uuid | FK → recipes |
| raw_text | text | "2 large onions, diced" |
| quantity | numeric | 2 |
| unit | text | Normalized unit |
| name | text | Normalized, singular ("onion") |
| group | text | "For the sauce" |
| optional | boolean | |
| notes | text | "diced" |
| sort_order | integer | |

**recipe_tags**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| recipe_id | uuid | FK → recipes |
| tag_name | text | Lowercase, trimmed |

Unique constraint on (recipe_id, tag_name).

**recipe_images**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| recipe_id | uuid | FK → recipes |
| url | text | Supabase Storage URL |
| type | text | photo / screenshot / ai_source |
| sort_order | integer | |

**meal_plan_entries**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| household_id | uuid | FK → households |
| date | date | |
| meal_type | text | breakfast / lunch / dinner / snack |
| recipe_id | uuid | FK → recipes (nullable) |
| custom_name | text | For non-recipe meals (nullable) |
| servings | integer | |
| assigned_to | uuid[] | Array of profile/managed_member IDs |
| created_by | uuid | FK → profiles |
| status | text | planned / cooked / skipped |
| notes | text | |

**calendar_events**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| household_id | uuid | FK → households |
| title | text | |
| description | text | |
| start_datetime | timestamptz | |
| end_datetime | timestamptz | Null for all-day |
| all_day | boolean | |
| location | text | |
| assigned_to | uuid[] | Array of profile/managed_member IDs |
| created_by | uuid | FK → profiles |
| color | text | |
| category | text | meal / chore / appointment / birthday / holiday / custom |
| recurrence_rule | text | RRULE string |
| recurrence_exceptions | date[] | Dates to skip |
| parent_event_id | uuid | FK → calendar_events (for edited instances) |
| reminders | jsonb | [{type, minutes_before}] |
| metadata | jsonb | Flexible extra data |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**todo_lists**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| household_id | uuid | FK → households |
| title | text | |
| event_id | uuid | FK → calendar_events (nullable) |
| list_type | text | general / shopping / checklist / project |
| created_by | uuid | FK → profiles |
| color | text | |
| pinned | boolean | |
| archived | boolean | |
| created_at | timestamptz | |

**todo_items** — Also serves as shopping list items when parent list_type = 'shopping'.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| list_id | uuid | FK → todo_lists |
| title | text | |
| description | text | |
| status | text | pending / in_progress / completed |
| priority | text | none / low / medium / high / urgent |
| due_date | date | |
| assigned_to | uuid | Single profile/managed_member ID |
| created_by | uuid | FK → profiles |
| sort_order | integer | Manual drag ordering |
| parent_item_id | uuid | FK → todo_items (subtasks) |
| recurrence_rule | text | RRULE |
| completed_at | timestamptz | |
| quantity | numeric | For shopping items |
| unit | text | For shopping items |
| tags | jsonb | Array of strings |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**inventory_items**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| household_id | uuid | FK → households |
| name | text | Normalized ("onion") |
| display_name | text | What the user sees ("Large red onions") |
| quantity | numeric | |
| unit | text | |
| location | text | fridge / freezer / pantry / cupboard / other |
| category | text | produce / dairy / meat / fish / grain / tinned / spice / condiment / etc. |
| expiry_date | date | Optional |
| is_cooked_meal | boolean | Batch cook / leftover |
| source_recipe_id | uuid | FK → recipes (for cooked meals) |
| cooked_servings | numeric | Remaining servings (for cooked meals) |
| added_date | date | |
| added_from | text | manual / shopping_list / smart_deduction |
| notes | text | |
| updated_at | timestamptz | |

### Row Level Security

Every table with `household_id` uses the same RLS pattern:

```sql
CREATE POLICY "household_isolation" ON [table]
  FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE profile_id = auth.uid()
    )
  );
```

### Storage Buckets

- `recipe-images/{household_id}/{recipe_id}/{filename}` — authenticated read
- `avatars/{profile_id}/{filename}` — public read

## Feature Design

### 1. Recipes

**Entry methods:**
- Manual entry form with structured ingredient input (quantity + unit + name + notes)
- AI image extraction: upload photo/screenshot → Claude vision API → structured JSON → pre-populated form for user review/edit
- URL import deferred to post-v1

**AI extraction flow:**
1. Client uploads image to `POST /api/recipes/extract`
2. API route sends to Claude with structured prompt requesting JSON output
3. Response validated/sanitized, returned to client
4. User reviews in standard recipe form, edits, saves

**Ingredient model:** Dual storage — `raw_text` for human display, parsed fields (`quantity`, `unit`, `name`) for scaling and inventory matching. AI extraction populates both. `name` field is normalized (singular, lowercase, adjectives stripped).

**Scaling:** `desired_servings / base_servings` multiplier on all quantities. Unit conversion (metric ↔ imperial) via client-side conversion table.

**Tags:** Free-form, stored in `recipe_tags`. Auto-suggested common tags (cuisine, dietary, meal type, difficulty, season). Search/filter by tags.

### 2. Meal Planning

**No separate meal plan entity** — query `meal_plan_entries` by household + date range.

**Per-person assignments:** Each entry has `assigned_to[]` array. Different household members can have different meals in the same slot (e.g. curry for adults, fish fingers for kids). "Whole household" shortcut assigns everyone.

**Adding meals:** From recipes (search/browse), custom text entry, from inventory (leftovers/batch cooks), or drag-and-drop to rearrange. Copy week to duplicate previous plans.

**Meal plan generation:**
- v1: Search-based — filter recipes by tags, constraints, avoid recent repeats, prefer near-expiry inventory. Ranked suggestions per slot.
- v2: LLM-assisted — Claude API receives recipes, members, constraints, natural language preferences, recent history. Returns proposed plan with reasoning.
- Both versions share the same UI: parameter dialog → review/edit → confirm.

### 3. Shopping Lists

Unified as `todo_lists` with `list_type = 'shopping'`. No separate shopping table.

**Generation:** Collect recipe ingredients from meal plan entries for a date range → scale by servings → aggregate by normalized name (sum compatible units) → subtract inventory quantities → present draft for review.

**Features:** Real-time sync via Supabase Realtime (two people splitting the shop). Grouped by category. Manual items. "Add to inventory" bulk action on completion.

### 4. Calendar

Full calendar replacement with day/week/month/agenda views.

**Events:** Support all-day and timed events, per-person assignment, colour coding, categories, location, RRULE recurrence, reminders (in-app + browser push).

**Recurrence:** RRULE (RFC 5545) strings expanded by `rrule.js`. Editing single instances creates child events with `parent_event_id`, original gets recurrence exception.

**Meal plan integration:** Meal plan entries surface as read-only "meal" category events via composite query — not duplicated into `calendar_events`. Click navigates to meal planner.

**Interactions:** Click to create, click to edit, drag to reschedule, resize to change duration, right-click for quick actions.

### 5. Todos & Task Management

**Four list types:** general (full task management), shopping (quantity/unit fields), checklist (simple tick-off), project (subtask nesting).

**Task features:** Priority (none/low/medium/high/urgent), due dates, single-person assignment, RRULE recurrence, subtasks via `parent_item_id`, manual sort ordering.

**Event-linked lists:** `todo_list.event_id` links to calendar event. List appears on event detail. Calendar shows progress indicator.

**"My Tasks" view:** Aggregate across all lists, filtered to current user, sorted by overdue → due today → due this week → priority.

### 6. Inventory Management

**Locations:** fridge, freezer, pantry, cupboard, other.

**Manual CRUD:** Add, edit, delete items directly. Quick +/- quantity adjustment inline. No requirement to go through meal plan flows.

**Three automated flows:**
1. Shopping → Inventory: checked shopping items bulk-create/increment inventory items
2. Cooking → Inventory (smart deduction): marking meal as cooked deducts scaled recipe ingredients from inventory. Surplus servings optionally saved as leftover.
3. Leftovers → Meal plan: select cooked meals from inventory for future meals, servings deducted when eaten.

**Name matching (v1):** Exact match on normalized name → contains match → user confirmation for ambiguous matches. `ingredient_mappings` table deferred to post-v1.

**Expiry tracking:** Optional date field. Dashboard widget shows items expiring within 3 days. Meal plan generation can prioritise near-expiry ingredients.

## UI/UX

**App shell:** Persistent sidebar on desktop, collapsible on tablet, bottom tab bar on mobile. Five primary nav items: Recipes, Meal Plan, Calendar, Todos, Inventory.

**Home dashboard:** Today's meals, expiring inventory, my tasks due today, week overview, quick actions.

**Component layers:**
1. UI primitives (shadcn/ui + Tailwind) — buttons, inputs, cards, modals
2. Feature components — RecipeCard, MealPlanGrid, CalendarView, etc.
3. Page layouts — route-level composition and data fetching

**Design language:** Clean, warm, practical. Rounded corners, soft shadows, warm colour palette (citrus/lemon brand). Light + dark mode via CSS variables.

**State management:** Server Components for data fetching. React Context for UI state (active household, sidebar, filters). Supabase Realtime for live sync. URL params for shareable filter/view state.

## Auth & Household Management

**Supabase Auth:** Email/password + Google OAuth. Profile auto-created via database trigger.

**Household roles:** Admin (full control + member management) and Member (full content access). Two roles only.

**Invite flow:** Admin generates invite link with unique code. Shares via any channel (WhatsApp, text, etc.). No email service dependency. Links expire in 7 days.

**Managed members:** Non-user household members (children, etc.) created by admins. Appear in assignment dropdowns. Can be merged with real accounts later.

**Household switching:** Users can belong to multiple households. Active household stored in profile preference + React Context. All views filter by active household.

## Environment Isolation

**Development workflow:**
- **Local dev:** `supabase start` → local Docker Postgres + Auth + Storage. Fully isolated, free, instant. Use `supabase/seed.sql` for test data.
- **Staging:** Separate Supabase project ("lemons-staging"). Vercel preview deployments point here. Safe to test migrations and features without touching production.
- **Production:** Primary Supabase project. Vercel production deployment.

**Supabase branching:** If available on your plan, use database branches tied to git branches for migration testing. Falls back to local dev + staging project approach.

**Migration safety:** Migrations developed and tested locally (`supabase start` + `supabase migration`). Verified on staging. Applied to production via `supabase db push` before deploying dependent code.

```
Local dev:     supabase start    → local Docker Postgres
Preview/PR:    Vercel preview    → staging Supabase project
Production:    Vercel production → production Supabase project
```

## Error Handling

1. **Database:** RLS + constraints prevent invalid data
2. **API routes:** Consistent `{ error, code }` responses. AI failures return partial data with clear messages.
3. **Client:** Error boundaries per feature. Toast notifications for action failures. Retry only for network errors.
4. **Logging:** Console in dev, Vercel log drain in production. No external service for v1.

## Testing

- **Unit (Vitest):** Utility functions — unit conversion, scaling, RRULE, name normalization
- **Component (Vitest + RTL):** Key interactive components — IngredientInput, MealPlanGrid, TodoItem
- **Integration (Playwright):** Critical flows — signup → household → recipe → meal plan → shopping → cooking → inventory
- No coverage targets. Test business logic and critical flows.

## Build Order

1. **Foundation:** Project scaffolding, Supabase setup, auth, household management, UI shell [DONE]
2. **Recipes:** CRUD, manual entry, AI extraction, tagging, search, scaling [DONE]
3. **UX Overhaul:** Warm lemon theme, mobile responsive layout (hamburger drawer), multi-image extraction with text hints, recipe image display, source image preservation [IN PROGRESS]
4. **Meal Planning + Shopping:** Weekly grid, per-person assignment, shopping list generation
5. **Inventory:** Manual CRUD, smart deduction, leftover tracking, shopping → inventory
6. **Calendar:** Full views, event CRUD, recurrence, meal plan integration, reminders
7. **Todos:** List CRUD, four types, full task management, event-linked lists
8. **Polish:** Home dashboard, cross-feature search, v2 LLM meal generation, supermarket API exploration
