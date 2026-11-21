-- ==============================================================================
-- Fix (20261122020000_fix_save_config_secret_routing.sql)
--
-- Symptom: changing the super admin PIN reports success but the login PIN never
-- changes. Cause: the database's fn_save_config__impl is the older version that
-- routes only adminPin / activeOnSitePin / masterQrToken to app_secrets, so
-- superAdminPin was written to app_config (publicly readable through
-- fn_get_initial_snapshot) while fn_verify_super_admin_pin keeps reading
-- app_secrets. This happens when 20261119000001_rpc_functions.sql (or another
-- file with the old function) ran after 20261120000000_super_admin.sql and
-- before the security hardening renamed it to __impl.
--
-- Fix:
-- 1. Redefine fn_save_config__impl to route all four secret keys to app_secrets
--    and never store adminToken. (The fn_save_config wrapper is NOT replaced.)
-- 2. Remove secret keys that leaked into app_config. Values that leaked were
--    public: set a NEW super admin PIN after applying this file.
-- 3. Trigger that rejects secret keys in app_config, so this cannot recur.
-- Idempotent.
-- ==============================================================================

create or replace function fn_save_config__impl(p_payload jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_key text;
  v_val text;
begin
  for v_key, v_val in select * from jsonb_each_text(p_payload) loop
    if v_key in ('adminPin', 'activeOnSitePin', 'masterQrToken', 'superAdminPin') then
      insert into app_secrets (key, value, updated_at)
      values (v_key, v_val, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    elsif v_key = 'adminToken' then
      continue;
    else
      insert into app_config (key, value, updated_at)
      values (v_key, v_val, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;
  return jsonb_build_object('success', true, 'message', '설정이 저장되었습니다.');
end;
$$;
revoke all on function fn_save_config__impl(jsonb) from public, anon, authenticated;

delete from app_config
 where key in ('adminPin', 'activeOnSitePin', 'masterQrToken', 'superAdminPin', 'adminToken');

create or replace function prevent_secret_in_app_config()
returns trigger
language plpgsql as $$
begin
  if new.key in ('adminPin', 'activeOnSitePin', 'masterQrToken', 'superAdminPin', 'adminToken') then
    raise exception 'Secret key % must be stored in app_secrets, not app_config', new.key;
  end if;
  return new;
end;
$$;
revoke all on function prevent_secret_in_app_config() from public, anon, authenticated;

drop trigger if exists trg_app_config_no_secrets on app_config;
create trigger trg_app_config_no_secrets
  before insert or update on app_config
  for each row execute function prevent_secret_in_app_config();

notify pgrst, 'reload schema';
