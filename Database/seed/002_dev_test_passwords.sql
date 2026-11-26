-- =============================================================================
-- DEVELOPMENT / TESTING ONLY - gives the 18 SAMPLE accounts a password
-- -----------------------------------------------------------------------------
-- Run in the Supabase SQL editor of a project that has the development seed
-- (001_dev_seed.sql). It touches only the sample accounts (@campusserve.test,
-- marked campusserve_dev_seed in their metadata), never real users.
--
--   Default password for every sample account:  CampusServe@2026
--
-- WARNING: anyone who knows this password can sign in as the sample
-- ADMINISTRATOR. Use it only while testing. When you finish testing, run
-- 901_remove_dev_test_passwords.sql, and before real use remove the sample data
-- entirely with 900_remove_dev_seed.sql. To use your own password, change it on
-- the line marked "PASSWORD" below before running.
-- =============================================================================
update auth.users
   set encrypted_password = extensions.crypt('CampusServe@2026', extensions.gen_salt('bf')),   -- PASSWORD
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       updated_at = now()
 where raw_user_meta_data ->> 'campusserve_dev_seed' = 'true'
   and email like '%@campusserve.test';

-- Email sign-in needs an identity row for each account.
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
  from auth.users u
 where u.raw_user_meta_data ->> 'campusserve_dev_seed' = 'true'
   and u.email like '%@campusserve.test'
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

select u.email, p.full_name, p.is_active, u.email_confirmed_at is not null as can_sign_in
  from auth.users u join public.profiles p on p.id = u.id
 where u.raw_user_meta_data ->> 'campusserve_dev_seed' = 'true'
 order by u.email;
