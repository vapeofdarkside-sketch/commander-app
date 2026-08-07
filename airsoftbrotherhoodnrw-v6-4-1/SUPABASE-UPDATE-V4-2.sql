-- Einmal im Supabase SQL Editor ausführen, bevor V4.2 verwendet wird.

alter table public.games
add column if not exists website_url text not null default '';

-- Nur normale Website-Links erlauben; leeres Feld bleibt möglich.
alter table public.games
drop constraint if exists games_website_url_http_check;

alter table public.games
add constraint games_website_url_http_check
check (website_url = '' or website_url ~* '^https?://');
