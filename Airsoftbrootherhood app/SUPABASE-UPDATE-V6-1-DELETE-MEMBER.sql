-- COMMANDER V6.1
-- Einmal vollständig im Supabase SQL Editor ausführen.

create or replace function public.admin_delete_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles%rowtype;
begin
  if not public.current_user_is_admin() then
    raise exception 'Nur Admins dürfen Mitglieder löschen.';
  end if;

  select *
  into target_profile
  from public.profiles
  where user_id = target_user_id;

  if not found then
    raise exception 'Mitglied wurde nicht gefunden.';
  end if;

  if target_profile.is_developer = true then
    raise exception 'Developer-Konten können nicht gelöscht werden.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Das eigene Konto kann hier nicht gelöscht werden.';
  end if;

  delete from auth.users
  where id = target_user_id;
end;
$$;

revoke all on function public.admin_delete_member(uuid) from public;
grant execute on function public.admin_delete_member(uuid) to authenticated;
