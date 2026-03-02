-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (auto-created from Supabase Auth via trigger)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  default_household_id uuid,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Trigger: auto-create profile on signup
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- HOUSEHOLDS
-- ============================================================
create table public.households (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null
);

alter table public.households enable row level security;

create policy "Members can view their households"
  on public.households for select
  using (
    id in (
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
    id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
-- HOUSEHOLD MEMBERS
-- ============================================================
create table public.household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  joined_at timestamptz default now() not null,
  invited_by uuid references public.profiles(id),
  unique(household_id, profile_id)
);

alter table public.household_members enable row level security;

create policy "Members can view co-members"
  on public.household_members for select
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid()
    )
  );

create policy "Admins can insert members"
  on public.household_members for insert
  with check (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
    or profile_id = auth.uid() -- users can add themselves (for household creation)
  );

create policy "Admins can update members"
  on public.household_members for update
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can remove members"
  on public.household_members for delete
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
    or profile_id = auth.uid() -- users can leave
  );

-- ============================================================
-- HOUSEHOLD MANAGED MEMBERS (non-user members like children)
-- ============================================================
create table public.household_managed_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_by uuid not null references public.profiles(id),
  linked_profile_id uuid references public.profiles(id)
);

alter table public.household_managed_members enable row level security;

create policy "household_isolation"
  on public.household_managed_members for all
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid()
    )
  );

-- ============================================================
-- HOUSEHOLD INVITES
-- ============================================================
create table public.household_invites (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text,
  invite_code text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid not null references public.profiles(id)
);

alter table public.household_invites enable row level security;

create policy "Admins can manage invites"
  on public.household_invites for all
  using (
    household_id in (
      select household_id from public.household_members
      where profile_id = auth.uid() and role = 'admin'
    )
  );

-- Public read for invite acceptance (by invite code)
create policy "Anyone can read invites by code"
  on public.household_invites for select
  using (true);

-- ============================================================
-- Add FK for profiles.default_household_id (deferred because households didn't exist yet)
-- ============================================================
alter table public.profiles
  add constraint profiles_default_household_fk
  foreign key (default_household_id) references public.households(id) on delete set null;
