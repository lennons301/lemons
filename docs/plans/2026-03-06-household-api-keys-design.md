# Per-Household Anthropic API Key — Design

**Goal:** Let household admins optionally configure their own Anthropic API key. Recipe extraction uses the household key if set, falls back to the server-wide `ANTHROPIC_API_KEY`.

## Database

Add `anthropic_api_key` column to `households` table. Nullable text, only readable/writable by household admins (via RLS policy using `get_my_admin_household_ids()`). New migration `00004_household_api_keys.sql`.

## API

- `GET /api/households/[id]/api-key` — returns `{ masked: "sk-ant-...xxxx", hasKey: true }` or `{ masked: null, hasKey: false }`. Admin-only.
- `PUT /api/households/[id]/api-key` — accepts `{ apiKey: string | null }`. Admin-only. Stores the key (or clears it with null). Returns masked version.

## Extraction Change

Modify `extractRecipeFromImage` to accept an optional `apiKey` parameter. The `/api/recipes/extract` route looks up the household's key, passes it if found, otherwise uses the env var default.

## Settings UI

New `ApiKeySettings` client component on the settings page (admin-only). Shows:
- Current status: "Using household key (sk-ant-...xxxx)" or "Using default server key"
- Input to set/replace key
- Button to remove key (revert to server default)

## Security

- RLS on `anthropic_api_key` column: only household admins can read/write
- Regular members can't see the key — the column is excluded from non-admin queries
- The extract route reads the key server-side, never exposes it to the client
- Key is masked after save (show last 4 chars only)
