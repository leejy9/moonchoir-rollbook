-- Verify V3-21 merge validation and alias-preserving remerge behavior.
begin;

do $$
declare
  v_token text;
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  v_token := fn_issue_admin_session('admin')->>'token';

  insert into members (id, name, status, merged_into_id) values
    ('test_v3_rg_z7_rep_active', 'Z7 active representative', 'ACTIVE', null),
    ('test_v3_rg_z7_target_active', 'Z7 active target', 'ACTIVE', null),
    ('test_v3_rg_z7_rep_inactive', 'Z7 inactive representative', 'INACTIVE', null),
    ('test_v3_rg_z7_rep_merged', 'Z7 merged representative', 'MERGED', 'test_v3_rg_z7_external_rep'),
    ('test_v3_rg_z7_external_rep', 'Z7 external representative', 'ACTIVE', null),
    ('test_v3_rg_z7_cycle_rep', 'Z7 cycle representative', 'ACTIVE', 'test_v3_rg_z7_cycle_target'),
    ('test_v3_rg_z7_cycle_target', 'Z7 cycle target', 'ACTIVE', null),
    ('test_v3_rg_z7_normal_rep', 'Z7 normal representative', 'ACTIVE', null),
    ('test_v3_rg_z7_normal_target', 'Z7 normal target', 'ACTIVE', null),
    ('test_v3_rg_z7_remerge_rep', 'Z7 remerge representative', 'ACTIVE', null),
    ('test_v3_rg_z7_remerge_x', 'Z7 remerge intermediate', 'ACTIVE', null),
    ('test_v3_rg_z7_remerge_y', 'Z7 existing alias', 'MERGED', 'test_v3_rg_z7_remerge_x'),
    ('test_v3_rg_z7_legacy_rep', 'Z7 legacy representative', 'ACTIVE', null),
    ('test_v3_rg_z7_legacy_target', 'Z7 legacy target', 'ACTIVE', null);

  select jsonb_agg(jsonb_build_array(id, status, merged_into_id) order by id)
    into v_before
    from members
   where id like 'test_v3_rg_z7_%';

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_missing_rep',
    'secondaryId', 'test_v3_rg_z7_target_active',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'INVALID_MERGE'
     or nullif(v_result->>'message', '') is null then
    raise exception 'FAIL: missing representative should be rejected: %', v_result;
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_rep_inactive',
    'secondaryId', 'test_v3_rg_z7_target_active',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'INVALID_MERGE'
     or nullif(v_result->>'message', '') is null then
    raise exception 'FAIL: non-ACTIVE representative should be rejected: %', v_result;
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_rep_merged',
    'secondaryId', 'test_v3_rg_z7_target_active',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'INVALID_MERGE'
     or nullif(v_result->>'message', '') is null then
    raise exception 'FAIL: already-merged representative should be rejected: %', v_result;
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_rep_active',
    'secondaryId', 'test_v3_rg_z7_rep_active',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'INVALID_MERGE'
     or nullif(v_result->>'message', '') is null then
    raise exception 'FAIL: representative cannot be included among merge targets: %', v_result;
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_rep_active',
    'secondaryId', 'test_v3_rg_z7_missing_target',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'INVALID_MERGE'
     or nullif(v_result->>'message', '') is null then
    raise exception 'FAIL: missing merge target should be rejected: %', v_result;
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_cycle_rep',
    'secondaryId', 'test_v3_rg_z7_cycle_target',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'false'
     or v_result->>'code' is distinct from 'INVALID_MERGE'
     or nullif(v_result->>'message', '') is null then
    raise exception 'FAIL: merge that creates a cycle should be rejected: %', v_result;
  end if;

  select jsonb_agg(jsonb_build_array(id, status, merged_into_id) order by id)
    into v_after
    from members
   where id like 'test_v3_rg_z7_%';
  if v_after is distinct from v_before then
    raise exception 'FAIL: invalid merge request changed member state';
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_normal_rep',
    'secondaryId', 'test_v3_rg_z7_normal_target',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true'
     or not exists (
       select 1 from members
        where id = 'test_v3_rg_z7_normal_target'
          and status = 'MERGED'
          and merged_into_id = 'test_v3_rg_z7_normal_rep'
     ) then
    raise exception 'FAIL: valid merge did not update its target: %', v_result;
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'canonicalId', 'test_v3_rg_z7_remerge_rep',
    'secondaryId', 'test_v3_rg_z7_remerge_x',
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true'
     or not exists (
       select 1 from members
        where id = 'test_v3_rg_z7_remerge_x'
          and status = 'MERGED'
          and merged_into_id = 'test_v3_rg_z7_remerge_rep'
     )
     or not exists (
       select 1 from members
        where id = 'test_v3_rg_z7_remerge_y'
          and status = 'MERGED'
          and merged_into_id = 'test_v3_rg_z7_remerge_x'
     ) then
    raise exception 'FAIL: remerge must preserve the prior alias link: %', v_result;
  end if;

  v_result := fn_merge_members(jsonb_build_object(
    'representativeId', 'test_v3_rg_z7_legacy_rep',
    'mergedMemberIds', jsonb_build_array('test_v3_rg_z7_legacy_target'),
    'adminToken', v_token
  ));
  if v_result->>'success' is distinct from 'true'
     or not exists (
       select 1 from members
        where id = 'test_v3_rg_z7_legacy_target'
          and status = 'MERGED'
          and merged_into_id = 'test_v3_rg_z7_legacy_rep'
     ) then
    raise exception 'FAIL: legacy merge payload keys were not accepted: %', v_result;
  end if;
end
$$;

rollback;
