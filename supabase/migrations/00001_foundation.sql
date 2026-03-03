-- gen_random_uuid() is built into Postgres 13+ (no extension needed)

-- ============================================================
-- TABLES (created first, policies added after all tables exist)
-- ============================================================

-- PROFILES (auto-created from Supabase Auth via trigger)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  default_household_id uuid,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

-- HOUSEHOLDS
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null
);

-- HOUSEHOLD MEMBERS
create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  joined_at timestamptz default now() not null,
  invited_by uuid references public.profiles(id),
  unique(household_id, profile_id)
);

-- HOUSEHOLD MANAGED MEMBERS (non-user members like children)
create table if not exists public.household_managed_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_by uuid not null references public.profiles(id),
  linked_profile_id uuid references public.profiles(id)
);

-- HOUSEHOLD INVITES
create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text,
  invite_code text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid not null references public.profiles(id)
);

-- ============================================================
-- DEFERRED FOREIGN KEYS
-- ============================================================
alter table public.profiles
  add constraint profiles_default_household_fk
  foreign key (default_household_id) references public.households(id) on delete set null;

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- HELPERS: security definer functions to get current user's household IDs
-- without triggering RLS on household_members (avoids infinite recursion)
-- ============================================================
create or replace function public.get_my_household_ids()
returns setof uuid as $$
  select household_id from public.household_members
  where profile_id = auth.uid()
$$ language sql security definer stable;

create or replace function public.get_my_admin_household_ids()
returns setof uuid as $$
  select household_id from public.household_members
  where profile_id = auth.uid() and role = 'admin'
$$ language sql security definer stable;

-- ============================================================
-- ROW LEVEL SECURITY (all tables exist now, safe to reference)
-- ============================================================

-- Profiles RLS
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Households RLS
alter table public.households enable row level security;

create policy "Members can view their households"
  on public.households for select
  using (
    created_by = auth.uid()
    or id in (
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
    id in (select public.get_my_admin_household_ids())
  );

-- Household Members RLS
alter table public.household_members enable row level security;

create policy "Members can view co-members"
  on public.household_members for select
  using (household_id in (select public.get_my_household_ids()));

create policy "Admins can insert members"
  on public.household_members for insert
  with check (
    profile_id = auth.uid() -- users can add themselves (for household creation)
    or household_id in (select public.get_my_admin_household_ids())
  );

create policy "Admins can update members"
  on public.household_members for update
  using (
    household_id in (select public.get_my_admin_household_ids())
  );

create policy "Admins can remove members"
  on public.household_members for delete
  using (
    household_id in (select public.get_my_admin_household_ids())
    or profile_id = auth.uid() -- users can leave
  );

-- Household Managed Members RLS
alter table public.household_managed_members enable row level security;

create policy "household_isolation"
  on public.household_managed_members for all
  using (household_id in (select public.get_my_household_ids()));

-- Household Invites RLS
alter table public.household_invites enable row level security;

create policy "Admins can manage invites"
  on public.household_invites for all
  using (household_id in (select public.get_my_admin_household_ids()));

create policy "Anyone can read invites by code"
  on public.household_invites for select
  using (true);
