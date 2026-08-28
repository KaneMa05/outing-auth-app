-- Emergency rollback for supabase/add-study-cafe.sql.
-- Run manually only after confirming that study-cafe data can be discarded.

begin;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'study_cafe_presence'
  ) then
    alter publication supabase_realtime drop table public.study_cafe_presence;
  end if;
end
$$;

drop function if exists public.replace_study_cafe_subjects(text, jsonb);
drop function if exists public.equip_study_cafe_item(text, text, timestamptz);
drop function if exists public.unequip_study_cafe_item(text, text, text);
drop function if exists public.unequip_study_cafe_item(text, text);
drop function if exists public.purchase_study_cafe_item(text, text, timestamptz);
drop function if exists public.award_study_cafe_time_points(text, timestamptz);
drop table if exists public.study_cafe_equipment;
drop table if exists public.study_cafe_inventory;
drop table if exists public.study_cafe_point_ledger;
drop table if exists public.study_cafe_point_wallets;
drop table if exists public.study_cafe_shop_items;
drop table if exists public.study_cafe_presence;
drop table if exists public.study_cafe_sessions;
drop table if exists public.study_cafe_todos;
drop table if exists public.study_cafe_subjects;
drop table if exists public.study_cafe_profiles;

commit;
