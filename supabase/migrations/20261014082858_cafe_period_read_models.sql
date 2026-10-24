-- Additive, server-only read models. Authentication, seat cleanup, date rollover,
-- and point settlement stay in their existing separate transactions.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create function public.get_study_cafe_period_totals(
  p_start timestamptz, p_end timestamptz, p_now timestamptz
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_start is null or p_end is null or p_now is null
    or not isfinite(p_start) or not isfinite(p_end) or not isfinite(p_now)
    or p_end <= p_start or p_end - p_start > interval '366 days' then
    raise exception 'invalid_study_period' using errcode = '22023';
  end if;
  with totals as materialized (
    select s.student_id,
      sum(floor(greatest(0, coalesce(s.elapsed_seconds, 0)) +
        case when s.status = 'running' and s.active_started_at is not null
          then greatest(0, extract(epoch from (p_now - s.active_started_at))) else 0 end)) as elapsed_seconds,
      min(s.started_at) as first_started_at
    from public.study_cafe_sessions s
    where s.started_at >= p_start and s.started_at < p_end
    group by s.student_id
  )
  select jsonb_build_object(
    'totals', coalesce((select jsonb_agg(jsonb_build_object(
      'student_id', t.student_id, 'elapsed_seconds', t.elapsed_seconds, 'status', 'completed'
    ) order by t.first_started_at, t.student_id) from totals t), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(jsonb_build_object(
      'student_id', p.student_id, 'nickname', p.nickname, 'avatar_tone', p.avatar_tone, 'hair_style', p.hair_style
    )) from public.study_cafe_profiles p join totals t using (student_id)), '[]'::jsonb),
    'presence', coalesce((select jsonb_agg(jsonb_build_object('student_id', p.student_id, 'display_name', p.display_name))
      from public.study_cafe_presence p), '[]'::jsonb),
    'onlineStudents', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name))
      from public.students s join totals t on t.student_id = s.id
      where s.student_category in ('online_managed', 'lecture') and s.is_active), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.get_study_cafe_student_stats(
  p_student_id text, p_start timestamptz, p_end timestamptz, p_now timestamptz
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_student_id is null or length(p_student_id) = 0 or p_start is null or p_end is null or p_now is null
    or not isfinite(p_start) or not isfinite(p_end) or not isfinite(p_now)
    or p_end <= p_start or p_end - p_start > interval '62 days' then
    raise exception 'invalid_study_period' using errcode = '22023';
  end if;
  with sessions as (
    select ((s.started_at at time zone 'Asia/Seoul') - interval '4 hours')::date as study_date,
      s.subject_name as subject,
      floor(greatest(0, coalesce(s.elapsed_seconds, 0)) +
        case when s.status = 'running' and s.active_started_at is not null
          then greatest(0, extract(epoch from (p_now - s.active_started_at))) else 0 end) as seconds,
      s.started_at,
      coalesce(s.ended_at, case when s.status = 'running' then p_now else coalesce(s.updated_at, s.started_at) end) as last_ended_at
    from public.study_cafe_sessions s
    where s.student_id = p_student_id and s.started_at >= p_start and s.started_at < p_end
  ), groups as (
    select study_date, subject, sum(seconds) as total_seconds, max(seconds) as longest_seconds,
      count(*) as session_count, min(started_at) as first_started_at, max(last_ended_at) as last_ended_at
    from sessions group by study_date, subject
  ) select jsonb_build_object('groups', coalesce((select jsonb_agg(to_jsonb(g) order by study_date, subject) from groups g), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.get_study_cafe_shop_read_model(p_student_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by sort_order, id) from (
      select id, name, description, slot, icon, price, sort_order from public.study_cafe_shop_items where is_active
    ) i), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(to_jsonb(i) order by purchased_at desc, item_id)
      from (select item_id, purchased_at from public.study_cafe_inventory where student_id = p_student_id) i), '[]'::jsonb),
    'equipment', coalesce((select jsonb_agg(to_jsonb(e) order by equipped_at, item_id)
      from (select slot, item_id, equipped_at from public.study_cafe_equipment where student_id = p_student_id) e), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by created_at desc, id desc) from (
      select id, source_type, amount, balance_after, item_id, description, created_at
      from public.study_cafe_point_ledger where student_id = p_student_id order by created_at desc, id desc limit 30
    ) h), '[]'::jsonb)
  );
$$;
revoke all on function public.get_study_cafe_period_totals(timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.get_study_cafe_student_stats(text,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.get_study_cafe_shop_read_model(text) from public, anon, authenticated;
grant execute on function public.get_study_cafe_period_totals(timestamptz,timestamptz,timestamptz) to service_role;
grant execute on function public.get_study_cafe_student_stats(text,timestamptz,timestamptz,timestamptz) to service_role;
grant execute on function public.get_study_cafe_shop_read_model(text) to service_role;
notify pgrst, 'reload schema';
commit;
