-- COMMANDER V6.3.1 – EINTRITTSDATUM KOMPLETT ENTFERNT
-- Einmal vollständig im Supabase SQL Editor ausführen.
-- Die Spalte entry_date darf in der Datenbank bestehen bleiben, wird aber nicht mehr verwendet.

begin;

drop function if exists public.developer_update_member_data(
  uuid,text,text,date,date,text,text,text,text,text,text,text,text
);

create or replace function public.developer_update_member_data(
  target_user_id uuid,
  new_name text,
  new_callsign text,
  new_birth_date date,
  new_phone text,
  new_address text,
  new_emergency_contact_name text,
  new_emergency_contact_phone text,
  new_tshirt_size text,
  new_hoodie_size text,
  new_headwear_size text,
  new_medical_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_developer() then
    raise exception 'Nur Developer dürfen persönliche Mitgliedsdaten bearbeiten.';
  end if;

  if not exists (
    select 1 from public.profiles where user_id = target_user_id
  ) then
    raise exception 'Mitglied wurde nicht gefunden.';
  end if;

  update public.profiles
  set
    name = trim(new_name),
    callsign = trim(new_callsign),
    birth_date = new_birth_date,
    phone = trim(new_phone),
    address = trim(new_address),
    emergency_contact_name = trim(new_emergency_contact_name),
    emergency_contact_phone = trim(new_emergency_contact_phone),
    tshirt_size = trim(new_tshirt_size),
    hoodie_size = trim(new_hoodie_size),
    headwear_size = trim(new_headwear_size),
    medical_notes = trim(new_medical_notes)
  where user_id = target_user_id;
end;
$$;

revoke all on function public.developer_update_member_data(
  uuid,text,text,date,text,text,text,text,text,text,text,text
) from public;

grant execute on function public.developer_update_member_data(
  uuid,text,text,date,text,text,text,text,text,text,text,text
) to authenticated;

commit;
