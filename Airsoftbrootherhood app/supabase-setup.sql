
-- ============================================================
-- COMMANDER - SUPABASE SETUP
-- Dieses Skript komplett im Supabase SQL Editor ausführen.
-- ============================================================

create extension if not exists pgcrypto;

-- Rollen und Status
do $$ begin
  create type public.app_role as enum ('admin', 'member');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.member_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.vote_response as enum ('yes', 'no');
exception when duplicate_object then null;
end $$;

-- Profile
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  callsign text not null default '',
  position text not null default 'Rekrut',
  skillpoints integer not null default 0 check (skillpoints >= 0),
  is_developer boolean not null default false,
  role public.app_role not null default 'member',
  status public.member_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Spieltage
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time time not null,
  location text not null,
  description text not null default '',
  website_url text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Abstimmungen
create table if not exists public.votes (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response public.vote_response not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- Zeitstempel automatisch aktualisieren
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

drop trigger if exists votes_set_updated_at on public.votes;
create trigger votes_set_updated_at
before update on public.votes
for each row execute function public.set_updated_at();

-- Sicherheitsfunktionen, damit RLS nicht rekursiv wird
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and (role = 'admin' or is_developer = true)
      and status = 'approved'
  );
$$;

create or replace function public.current_user_is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and status = 'approved'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_is_approved() from public;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_is_approved() to authenticated;

-- Neues Auth-Konto automatisch als Profil anlegen.
-- Die angegebene E-Mail wird automatisch erster Admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_admin boolean;
begin
  is_first_admin := lower(new.email) = lower('vapeofdarkside@gmail.com');

  insert into public.profiles (
    user_id,
    email,
    name,
    callsign,
    position,
    role,
    status
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'callsign', ''),
    case when is_first_admin then 'Team Leader' else 'Rekrut' end,
    case when is_first_admin then 'admin'::public.app_role else 'member'::public.app_role end,
    case when is_first_admin then 'approved'::public.member_status else 'pending'::public.member_status end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS aktivieren
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.votes enable row level security;

-- Vorhandene Policies entfernen, damit erneutes Ausführen funktioniert
drop policy if exists "profile own read" on public.profiles;
drop policy if exists "admin profiles read" on public.profiles;
drop policy if exists "admin profiles update" on public.profiles;

drop policy if exists "approved games read" on public.games;
drop policy if exists "admin games insert" on public.games;
drop policy if exists "admin games update" on public.games;
drop policy if exists "admin games delete" on public.games;

drop policy if exists "own votes read" on public.votes;
drop policy if exists "admin votes read" on public.votes;
drop policy if exists "own votes insert" on public.votes;
drop policy if exists "own votes update" on public.votes;
drop policy if exists "own votes delete" on public.votes;

-- Profile: Jeder sieht nur sich selbst, Admins sehen und bearbeiten alle
create policy "profile own read"
on public.profiles for select
to authenticated
using (user_id = auth.uid());

create policy "admin profiles read"
on public.profiles for select
to authenticated
using (public.current_user_is_admin());

create policy "admin profiles update"
on public.profiles for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

-- Spieltage: freigegebene Mitglieder lesen, nur Admins schreiben
create policy "approved games read"
on public.games for select
to authenticated
using (public.current_user_is_approved());

create policy "admin games insert"
on public.games for insert
to authenticated
with check (public.current_user_is_admin() and created_by = auth.uid());

create policy "admin games update"
on public.games for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "admin games delete"
on public.games for delete
to authenticated
using (public.current_user_is_admin());

-- Abstimmungen: Mitglieder nur eigene, Admins alle
create policy "own votes read"
on public.votes for select
to authenticated
using (user_id = auth.uid() and public.current_user_is_approved());

create policy "admin votes read"
on public.votes for select
to authenticated
using (public.current_user_is_admin());

create policy "own votes insert"
on public.votes for insert
to authenticated
with check (user_id = auth.uid() and public.current_user_is_approved());

create policy "own votes update"
on public.votes for update
to authenticated
using (user_id = auth.uid() and public.current_user_is_approved())
with check (user_id = auth.uid() and public.current_user_is_approved());

create policy "own votes delete"
on public.votes for delete
to authenticated
using (user_id = auth.uid() and public.current_user_is_approved());

-- Tabellenrechte
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.games to authenticated;
grant select, insert, update, delete on public.votes to authenticated;

-- Falls dein Admin-Konto schon vor diesem SQL-Skript erstellt wurde,
-- wird es hier nachträglich als Profil angelegt bzw. zum Admin gemacht.
insert into public.profiles (
  user_id, email, name, callsign, position, role, status
)
select
  id,
  lower(email),
  coalesce(raw_user_meta_data->>'name', ''),
  coalesce(raw_user_meta_data->>'callsign', 'Darkside'),
  'Team Leader',
  'admin'::public.app_role,
  'approved'::public.member_status
from auth.users
where lower(email) = lower('vapeofdarkside@gmail.com')
on conflict (user_id) do update set
  role = 'admin',
  status = 'approved',
  position = 'Team Leader';

-- Fertig.
