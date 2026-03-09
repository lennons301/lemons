-- Add source attribution fields to recipes
alter table public.recipes add column if not exists source_author text;
alter table public.recipes add column if not exists source_book text;
