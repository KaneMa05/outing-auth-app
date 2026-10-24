begin;
set local lock_timeout = '2s';
drop function if exists public.get_study_cafe_period_totals(timestamptz,timestamptz,timestamptz);
drop function if exists public.get_study_cafe_student_stats(text,timestamptz,timestamptz,timestamptz);
drop function if exists public.get_study_cafe_shop_read_model(text);
notify pgrst, 'reload schema';
commit;
