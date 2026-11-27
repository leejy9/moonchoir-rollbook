-- ==============================================================================
-- Moonchoir Rollbook — Supabase Database Migration (20261120000000_super_admin.sql)
-- Two-Tier Admin (Staff Admin vs Super Admin) & Admin Secrets Management
-- ==============================================================================

-- 1. Seed initial superAdminPin into app_secrets if not present (Default: 2315)
insert into app_secrets (key, value, updated_at)
values ('superAdminPin', '2315', now())
on conflict (key) do nothing;

-- 2. Verify Super Admin PIN RPC
create or replace function fn_verify_super_admin_pin(p_pin text)
returns jsonb
security definer
language plpgsql as $$
declare
  v_real_pin text;
begin
  select value into v_real_pin from app_secrets where key = 'superAdminPin';
  if v_real_pin is null then
    -- Fallback default for smooth zero-downtime transition
    v_real_pin := '2315';
  end if;

  if trim(p_pin) = trim(v_real_pin) then
    return jsonb_build_object('success', true, 'message', '최고 관리자 인증 성공');
  else
    return jsonb_build_object('success', false, 'message', '최고 관리자 PIN 번호가 일치하지 않습니다.');
  end if;
end;
$$;

-- 3. Read Admin Secrets (Universal active on-site PIN & admin PIN for authenticated admin sessions)
create or replace function fn_get_admin_secrets()
returns jsonb
security definer
language plpgsql as $$
declare
  v_admin_pin text;
  v_on_site_pin text;
  v_super_pin text;
begin
  select value into v_admin_pin from app_secrets where key = 'adminPin';
  select value into v_on_site_pin from app_secrets where key = 'activeOnSitePin';
  select value into v_super_pin from app_secrets where key = 'superAdminPin';

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'adminPin', coalesce(v_admin_pin, '1004'),
      'activeOnSitePin', coalesce(v_on_site_pin, '5027'),
      'superAdminPin', coalesce(v_super_pin, '2315')
    )
  );
end;
$$;

-- 4. Update fn_save_config to route superAdminPin into app_secrets
create or replace function fn_save_config(p_payload jsonb)
returns jsonb
security definer
language plpgsql as $$
declare
  v_key text;
  v_val text;
begin
  for v_key, v_val in select * from jsonb_each_text(p_payload) loop
    if v_key in ('adminPin', 'activeOnSitePin', 'masterQrToken', 'superAdminPin') then
      -- Sensitive values routed to app_secrets
      insert into app_secrets (key, value, updated_at)
      values (v_key, v_val, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    else
      -- Public settings routed to app_config
      insert into app_config (key, value, updated_at)
      values (v_key, v_val, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
    end if;
  end loop;

  return jsonb_build_object('success', true, 'message', '설정이 저장되었습니다.');
end;
$$;

-- Grant EXECUTE permissions
grant execute on function fn_verify_super_admin_pin to anon, authenticated;
grant execute on function fn_get_admin_secrets to anon, authenticated;
grant execute on function fn_save_config to anon, authenticated;
