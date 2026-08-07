-- COMMANDER V6.3 – MITGLIEDSDATEN NUR DURCH DEVELOPER BEARBEITBAR
-- Einmal vollständig im Supabase SQL Editor ausführen.

begin;

-- Verhindert, dass normale Admins persönliche Daten direkt verändern.
-- Änderungen über Server-Trigger (z. B. Registrierung) bleiben erlaubt.
create or replace function public.protect_private_member_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (
    new.name is distinct from old.name
    or new.callsign is distinct from old.callsign
    or new.email is distinct from old.email
    or new.birth_date is distinct from old.birth_date
    or new.entry_date is distinct from old.entry_date
    or new.phone is distinct from old.phone
    or new.address is distinct from old.address
    or new.emergency_contact_name is distinct from old.emergency_contact_name
    or new.emergency_contact_phone is distinct from old.emergency_contact_phone
    or new.tshirt_size is distinct from old.tshirt_size
    or new.hoodie_size is distinct from old.hoodie_size
    or new.headwear_size is distinct from old.headwear_size
    or new.medical_notes is distinct from old.medical_notes
    or new.rules_accepted is distinct from old.rules_accepted
    or new.privacy_accepted is distinct from old.privacy_accepted
  ) and not public.current_user_is_developer() then
    raise exception 'Persönliche Mitgliedsdaten dürfen nur Developer bearbeiten.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_private_member_data_trigger on public.profiles;
create trigger protect_private_member_data_trigger
before update on public.profiles
for each row
execute function public.protect_private_member_data();

-- Sichere Update-Funktion für Developer.
create or replace function public.developer_update_member_data(
  target_user_id uuid,
  new_name text,
  new_callsign text,
  new_birth_date date,
  new_entry_date date,
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
    entry_date = new_entry_date,
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
  uuid,text,text,date,date,text,text,text,text,text,text,text,text
) from public;

grant execute on function public.developer_update_member_data(
  uuid,text,text,date,date,text,text,text,text,text,text,text,text
) to authenticated;

commit;
