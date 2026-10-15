-- Travel Anchor P0 network schema
-- Run this in the Supabase SQL editor after creating a project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Traveller',
  age_range text,
  gender text,
  city text,
  pace text,
  social text,
  independence text,
  budget text,
  interests text[] not null default '{}',
  bio text,
  social_proof text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  destination text not null,
  country text,
  status text not null check (status in ('Interested','Flexible','Confirmed')),
  start_date date not null,
  end_date date not null,
  flex text,
  activities text[] not null default '{}',
  description text,
  visibility text not null default 'network' check (visibility in ('network','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_id),
  check (end_date >= start_date)
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  intent text not null default 'Travel together',
  message text,
  status text not null default 'Requested' check (status in ('Requested','Accepted','Declined','Blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> receiver_id)
);

create index if not exists trips_destination_dates_idx
  on public.trips(destination, start_date, end_date);
create index if not exists trips_user_idx on public.trips(user_id);
create index if not exists connections_requester_idx on public.connections(requester_id);
create index if not exists connections_receiver_idx on public.connections(receiver_id);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.connections enable row level security;

-- Anonymous sign-ins use the authenticated role in Supabase.
-- Profiles and visible trips are discoverable by signed-in anonymous/permanent users.
drop policy if exists "profiles readable by network" on public.profiles;
create policy "profiles readable by network"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "visible trips readable by network" on public.trips;
create policy "visible trips readable by network"
  on public.trips for select
  to authenticated
  using (visibility = 'network' or (select auth.uid()) = user_id);

drop policy if exists "users insert own trips" on public.trips;
create policy "users insert own trips"
  on public.trips for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own trips" on public.trips;
create policy "users update own trips"
  on public.trips for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own trips" on public.trips;
create policy "users delete own trips"
  on public.trips for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "participants read connections" on public.connections;
create policy "participants read connections"
  on public.connections for select
  to authenticated
  using ((select auth.uid()) in (requester_id, receiver_id));

drop policy if exists "requester creates connection" on public.connections;
create policy "requester creates connection"
  on public.connections for insert
  to authenticated
  with check ((select auth.uid()) = requester_id);

drop policy if exists "participants update connection" on public.connections;
create policy "participants update connection"
  on public.connections for update
  to authenticated
  using ((select auth.uid()) in (requester_id, receiver_id))
  with check ((select auth.uid()) in (requester_id, receiver_id));

-- Explicit grants for the Data API.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update on public.connections to authenticated;

-- Optional helper view. security_invoker keeps underlying RLS in force.
create or replace view public.trip_network
with (security_invoker = true)
as
select
  t.id,
  t.user_id,
  t.destination,
  t.country,
  t.status,
  t.start_date,
  t.end_date,
  t.flex,
  t.activities,
  t.description,
  p.nickname,
  p.age_range,
  p.gender,
  p.city,
  p.pace,
  p.social,
  p.independence,
  p.budget,
  p.interests,
  p.bio,
  p.social_proof
from public.trips t
join public.profiles p on p.id = t.user_id
where t.visibility = 'network';

grant select on public.trip_network to authenticated;
