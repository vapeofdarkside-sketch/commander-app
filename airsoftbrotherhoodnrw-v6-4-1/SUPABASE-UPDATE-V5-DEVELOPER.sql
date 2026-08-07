-- COMMANDER V5: geschützte Developer-Konten
-- Dieses Skript einmal vollständig im Supabase SQL Editor ausführen.

alter table public.profiles
add column if not exists is_developer boolean not null default false;

-- Bestehende oder später registrierte Entwicklerkonten.
update public.profiles
set is_developer = true,
    role = 'admin'::public.app_role,
    status = 'approved'::public.member_status
where lower(email) in (
  lower('vapeofdarkside@gmail.com'),
  lower('missvannigrill@gmail.com')
);

create or replace function public.current_user_is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and is_developer = true
      and status = 'approved'
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and (role = 'admin' or is_developer = true)
      and status = 'approved'
  );
$$;

revoke all on function public.current_user_is_developer() from public;
grant execute on function public.current_user_is_developer() to authenticated;

-- Schützt Developer vor Änderungen durch normale Admins und vor Degradierung/Löschung.
create or replace function public.protect_developer_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_developer then
      raise exception 'Developer-Konten können nicht gelöscht werden.';
    end if;
    return old;
  end if;

  if old.is_developer and not public.current_user_is_developer() then
    raise exception 'Developer-Konten können von Admins nicht bearbeitet werden.';
  end if;

  if old.is_developer then
    new.is_developer := true;
    new.role := 'admin'::public.app_role;
    new.status := 'approved'::public.member_status;
    new.email := old.email;
  end if;

  if new.is_developer and lower(new.email) not in (
    lower('vapeofdarkside@gmail.com'),
    lower('missvannigrill@gmail.com')
  ) then
    raise exception 'Developer-Status ist nur für die festgelegten Konten erlaubt.';
  end if;

  if not old.is_developer and new.is_developer and not public.current_user_is_developer() then
    raise exception 'Nur ein Developer kann Developer-Rechte vergeben.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_developer_profile_trigger on public.profiles;
create trigger protect_developer_profile_trigger
before update or delete on public.profiles
for each row execute function public.protect_developer_profile();

-- Registrierung: beide festgelegten E-Mail-Adressen werden automatisch Developer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_protected_developer boolean;
begin
  is_protected_developer := lower(new.email) in (
    lower('vapeofdarkside@gmail.com'),
    lower('missvannigrill@gmail.com')
  );

  insert into public.profiles (
    user_id, email, name, callsign, position, role, status, is_developer
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'callsign', ''),
    case when is_protected_developer then 'Team Leader' else 'Rekrut' end,
    case when is_protected_developer then 'admin'::public.app_role else 'member'::public.app_role end,
    case when is_protected_developer then 'approved'::public.member_status else 'pending'::public.member_status end,
    is_protected_developer
  )
  on conflict (user_id) do update set
    is_developer = excluded.is_developer or public.profiles.is_developer,
    role = case when excluded.is_developer then 'admin'::public.app_role else public.profiles.role end,
    status = case when excluded.is_developer then 'approved'::public.member_status else public.profiles.status end;

  return new;
end;
$$;

-- Falls eines der beiden Auth-Konten bereits existiert, Profil sicher aktualisieren.
insert into public.profiles (user_id,email,name,callsign,position,role,status,is_developer)
select id,lower(email),coalesce(raw_user_meta_data->>'name',''),coalesce(raw_user_meta_data->>'callsign',''),
       'Team Leader','admin'::public.app_role,'approved'::public.member_status,true
from auth.users
where lower(email) in (lower('vapeofdarkside@gmail.com'),lower('missvannigrill@gmail.com'))
on conflict (user_id) do update set
  is_developer=true,
  role='admin'::public.app_role,
  status='approved'::public.member_status;
