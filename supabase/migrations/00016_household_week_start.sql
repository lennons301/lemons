-- Add configurable week start day to households
-- 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
-- Default is Friday (5) to support Fri–Thu meal planning weeks

alter table public.households
  add column if not exists week_start_day smallint not null default 5
  constraint week_start_day_range check (week_start_day >= 0 and week_start_day <= 6);
