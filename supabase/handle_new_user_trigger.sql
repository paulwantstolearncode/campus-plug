-- handle_new_user trigger: create a profiles row for every new auth user.
--
-- Every user — including @ug.edu.gh and @st.ug.edu.gh emails — must go
-- through the /become-seller page and add a WhatsApp number before they can
-- sell. This trigger NEVER auto-grants selling rights; it always creates the
-- profile with is_seller = false.
--
-- Run this in the Supabase SQL editor. It replaces any existing
-- handle_new_user function/trigger that may have derived is_seller from the
-- email domain.

-- Schema prerequisite: the admin panel (app/admin/page.tsx) reads is_admin.
-- Idempotent, so new databases get the column automatically. To promote an
-- account to admin, run the grant in add_admin_column.sql (or:
-- update public.profiles set is_admin = true where id = '<user-uuid>').
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Update the function that runs on new-user insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, is_seller, is_admin, whatsapp_number)
  values (new.id, false, false, null)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Recreate the trigger so it uses the updated function.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
