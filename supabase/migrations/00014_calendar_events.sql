-- Migration: 00014_calendar_events.sql
-- Calendar events table for household calendar

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  all_day boolean not null default false,
  location text,
  assigned_to uuid[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  category text not null check (category in ('chore', 'appointment', 'birthday', 'holiday', 'social', 'custom')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_datetime > start_datetime)
);

create index idx_calendar_events_household on public.calendar_events(household_id);
create index idx_calendar_events_date_range on public.calendar_events(household_id, start_datetime, end_datetime);
create index idx_calendar_events_assigned on public.calendar_events using gin (assigned_to);

create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.update_updated_at();

alter table public.calendar_events enable row level security;

create policy "household_read" on public.calendar_events
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.calendar_events
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.calendar_events
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.calendar_events
  for delete using (household_id in (select public.get_my_household_ids()));
