-- Add the is_admin column to profiles. Run this in the Supabase SQL editor.
--
-- The admin panel (app/admin/page.tsx) checks profiles.is_admin, but no
-- migration ever created that column, so the lookup fails and the page shows
-- "Admin access only". This fixes the schema (idempotent).

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Grant yourself admin rights. Replace the email with the account you sign
-- in with. (Or run the second statement with your user's UUID if you know it.)
-- Run this first if you're not sure of your email:
--   select id, email from auth.users;
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'YOU@EXAMPLE.COM');

-- Verify (email is in auth.users, not profiles):
--   select p.id, u.email, p.is_admin
--   from public.profiles p
--   join auth.users u on u.id = p.id;
