-- Removes the testing passwords from the SAMPLE accounts and signs them out everywhere.
-- Run when you finish testing (002_dev_test_passwords.sql). Real users are not touched.
delete from auth.sessions where user_id in (select id from auth.users where raw_user_meta_data ->> 'campusserve_dev_seed' = 'true');
delete from auth.identities where provider = 'email'
   and user_id in (select id from auth.users where raw_user_meta_data ->> 'campusserve_dev_seed' = 'true');
update auth.users set encrypted_password = null, updated_at = now()
 where raw_user_meta_data ->> 'campusserve_dev_seed' = 'true' and email like '%@campusserve.test';
select count(*) as sample_accounts_without_password from auth.users
 where raw_user_meta_data ->> 'campusserve_dev_seed' = 'true' and encrypted_password is null;
