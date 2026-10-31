begin;
-- Notebook links are optional. Preserve legacy unclassified links and their
-- history; do not activate the placeholder topic or publish any questions here.
do $migration$
declare
 definition text := pg_catalog.pg_get_functiondef('public.ip_service(text,jsonb,jsonb)'::regprocedure);
 old_check text := $old$if (p_body->>'category'='personality' and cardinality(v_topic_ids)=0) or
      (p_body->>'category'='job' and cardinality(v_topic_ids)>0) or
      exists(select 1 from unnest(v_topic_ids) t where not exists(select 1 from ip_topics where id=t and active)) then raise exception 'invalid_topic'; end if;$old$;
 new_check text := $new$if (p_body->>'category'='job' and cardinality(v_topic_ids)>0) or
      exists(select 1 from unnest(v_topic_ids) as link(topic_id)
        where not (p_body->>'category'='personality' and link.topic_id='unclassified')
        and not exists(select 1 from ip_topics t where t.id=link.topic_id and t.active))
      then raise exception 'invalid_topic'; end if;$new$;
begin
 if pg_catalog.strpos(definition,old_check)>0 then
  execute pg_catalog.replace(definition,old_check,new_check);
 elsif pg_catalog.strpos(definition,new_check)=0 then
  raise exception 'ip_service topic validation changed; review optional-topic migration';
 end if;
end;
$migration$;
commit;
