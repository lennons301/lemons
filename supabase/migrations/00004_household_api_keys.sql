-- Add optional Anthropic API key to households
-- Admin-only access enforced at the application layer (API routes check admin role).
-- The existing household RLS policies cover SELECT/UPDATE.
alter table public.households add column if not exists anthropic_api_key text;
