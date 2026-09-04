# Lemons

Household management platform: recipes, meal planning, calendar, todos, inventory, shopping lists. Multi-household, per-person accounts.

## Tech Stack

Next.js 16 (App Router) · React 19 · Supabase (Postgres + RLS + Auth + Storage) · Tailwind CSS · shadcn/ui · Anthropic Claude API (recipe extraction, meal-plan generation) · Vercel

## Prerequisites

- Node.js 22 and npm
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) with access to the `lemons` project. Doppler is the source of truth for every secret — never hand-write a `.env.local`.
- [Docker](https://www.docker.com/) and the [Supabase CLI](https://supabase.com/docs/guides/cli) for a local database (optional, see below)

## Quick Start

```bash
npm install
doppler setup                  # once: project lemons, config dev (reads doppler.yaml)
doppler run -- npm run dev
```

Open <http://localhost:3000>.

### Local database (optional)

```bash
supabase start        # Requires Docker
supabase db reset     # Applies migrations + seed data
```

The Doppler `dev` config points at this local instance. If Docker isn't available (e.g. WSL2), run against the staging Supabase project with the `stg` config instead: `doppler run -c stg -- npm run dev`. Never develop against production.

## Commands

| Command | Description |
|---------|-------------|
| `doppler run -- npm run dev` | Start dev server |
| `doppler run -- npm run build` | Production build (also type-checks) |
| `npm run lint` | ESLint |
| `doppler run -- npm run test:run` | Vitest, single run (`npm run test` for watch mode) |

## Deployment

- `main` → production (Vercel auto-deploy); PR branches → preview deployments
- Supabase migrations run automatically on deploy via the Supabase GitHub integration
- Secrets: Doppler `prd` syncs to Vercel production, `stg` to previews

## Documentation

- Technical reference (conventions, structure, secrets and environments): [`AGENTS.md`](AGENTS.md)
- Design document: [`docs/plans/2026-03-02-lemons-design.md`](docs/plans/2026-03-02-lemons-design.md)
- Phase plans and feature designs: [`docs/plans/`](docs/plans/)
