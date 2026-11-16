begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

-- Result visibility is independent of whether the round still accepts answers.
alter table public.ip_aptitude_rounds drop constraint ip_aptitude_rounds_check1;
alter table public.ip_aptitude_rounds
  add constraint ip_aptitude_rounds_results_visibility
  check (not results_released or state in ('open','closed'));

-- Preserve the existing membership checks, private files, grants and invoker mode.
do $patch$
declare
  source text := pg_catalog.pg_get_functiondef('public.ip_aptitude_service(text,jsonb,jsonb)'::regprocedure);
  patch record;
begin
  for patch in select * from (values
    ($before$released:=r.state='closed' and r.results_released and a.state='submitted';$before$,
     $after$released:=r.results_released and a.state='submitted';$after$),
    ($before$if old_r.results_released and p_body->>'state'<>'closed' then raise exception 'results_already_released'; end if;$before$,
     $after$if old_r.results_released and old_r.state='closed' and p_body->>'state'<>'closed' then raise exception 'results_already_released'; end if;$after$)
  ) as replacements(before_text,after_text)
  loop
    if position(patch.before_text in source)=0 then
      raise exception 'aptitude_results_migration_source_mismatch';
    end if;
    source:=replace(source,patch.before_text,patch.after_text);
  end loop;
  execute source;
end
$patch$;
commit;
