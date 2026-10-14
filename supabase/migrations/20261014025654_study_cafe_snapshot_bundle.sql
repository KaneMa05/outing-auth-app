-- Additive, server-only read path. Old apps and the existing RPC keep working.
-- Device validation, stale-seat handling and point writes remain separate.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create or replace function public.get_study_cafe_snapshot_bundle(
  p_student_id text, p_study_date date,
  p_day_start timestamptz, p_day_end timestamptz
)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_equipment jsonb;
  v_bots jsonb;
begin
  v_snapshot := public.get_study_cafe_snapshot_data(
    p_student_id, p_study_date, p_day_start, p_day_end);
  -- Optional shop/bot modules may not be installed on older environments.
  -- Null asks the server to use its existing optional-feature fallback.
  begin
    select coalesce(jsonb_agg(to_jsonb(e) order by e.equipped_at), '[]'::jsonb)
    into v_equipment
    from (select slot, item_id, equipped_at from public.study_cafe_equipment
          where student_id = p_student_id) e;
  exception when undefined_table or undefined_column then
    v_equipment := null;
  end;
  begin
    v_bots := public.study_cafe_bot_appearance();
  exception when undefined_function or undefined_table or undefined_column then
    v_bots := null;
  end;
  return jsonb_build_object('snapshot', v_snapshot,
    'equipment', v_equipment, 'botAppearances', v_bots);
end;
$$;

revoke all on function public.get_study_cafe_snapshot_bundle(text,date,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_study_cafe_snapshot_bundle(text,date,timestamptz,timestamptz)
  to service_role;
notify pgrst, 'reload schema';
commit;
