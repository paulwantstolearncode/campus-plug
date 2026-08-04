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

-- Update the function that runs on new-user insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, is_seller, whatsapp_number)
  values (new.id, false, null)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Recreate the trigger so it uses the updated function.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
