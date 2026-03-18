# Lemons

Household management platform: recipes, meal planning, calendar, todos, inventory, shopping lists. Multi-household, per-person accounts.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Local database (optional)

```bash
supabase start        # Requires Docker
supabase db reset     # Applies migrations + seed data
```

If Docker isn't available (e.g. WSL2), the app can run against the staging Supabase project — pull env vars with `vercel env pull`.

## Stack

Next.js 14 (App Router) · Supabase (Postgres + RLS + Auth + Storage) · Tailwind CSS · shadcn/ui · Vercel

## Deployment

- `main` → production (Vercel auto-deploy)
- PR branches → preview deployments
- Supabase migrations run automatically on deploy via GitHub integration

## Documentation

- Project conventions and architecture: [`CLAUDE.md`](CLAUDE.md)
- Full design document: [`docs/plans/2026-03-02-lemons-design.md`](docs/plans/2026-03-02-lemons-design.md)
- Phase plans: [`docs/plans/`](docs/plans/)
