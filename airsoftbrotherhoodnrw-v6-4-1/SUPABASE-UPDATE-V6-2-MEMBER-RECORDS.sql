-- COMMANDER V6.2 – VERTRAULICHE MITGLIEDSAKTEN
-- Einmal vollständig im Supabase SQL Editor ausführen.

begin;

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists entry_date date,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists tshirt_size text,
  add column if not exists hoodie_size text,
  add column if not exists headwear_size text,
  add column if not exists medical_notes text,
  add column if not exists rules_accepted boolean not null default false,
  add column if not exists privacy_accepted boolean not null default false;

-- Übernimmt die Registrierungsdaten aus den sicheren Auth-Metadaten,
-- nachdem das vorhandene Profil durch den bestehenden Trigger angelegt wurde.
create or replace function public.apply_member_registration_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    birth_date = nullif(new.raw_user_meta_data->>'birth_date', '')::date,
    entry_date = nullif(new.raw_user_meta_data->>'entry_date', '')::date,
    phone = nullif(new.raw_user_meta_data->>'phone', ''),
    address = nullif(new.raw_user_meta_data->>'address', ''),
    emergency_contact_name = nullif(new.raw_user_meta_data->>'emergency_contact_name', ''),
    emergency_contact_phone = nullif(new.raw_user_meta_data->>'emergency_contact_phone', ''),
    tshirt_size = nullif(new.raw_user_meta_data->>'tshirt_size', ''),
    hoodie_size = nullif(new.raw_user_meta_data->>'hoodie_size', ''),
    headwear_size = nullif(new.raw_user_meta_data->>'headwear_size', ''),
    medical_notes = nullif(new.raw_user_meta_data->>'medical_notes', ''),
    rules_accepted = coalesce((new.raw_user_meta_data->>'rules_accepted')::boolean, false),
    privacy_accepted = coalesce((new.raw_user_meta_data->>'privacy_accepted')::boolean, false)
  where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists zz_apply_member_registration_data on auth.users;
create trigger zz_apply_member_registration_data
after insert on auth.users
for each row
execute function public.apply_member_registration_data();

commit;
