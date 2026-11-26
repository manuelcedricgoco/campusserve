-- Reverts 017_service_role_error_helper.sql.
revoke execute on function private.fail(text, text, text) from service_role;
