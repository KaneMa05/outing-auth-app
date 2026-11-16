begin;
-- Uses the existing private attempt audit JSON. No student-visible cost fields.
create or replace function public.ip_practice_usage_service(p_action text,p_actor jsonb,p_body jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ip_openai_practice_attempts; e jsonb:=p_body->'event'; old jsonb; k text:=e->>'eventKey'; a jsonb;
begin
 if p_action<>'record' then raise exception 'unsupported_action'; end if;
 if p_actor->>'type' is distinct from 'server' or p_body->'testApp' is distinct from 'true'::jsonb then raise exception 'forbidden'; end if;
 if jsonb_typeof(e) is distinct from 'object' or octet_length(e::text)>6000
  or not(e ?& array['eventKey','kind','model','status','usage','rates','usd'])
  or k is null or k!~'^(report|transcription):[a-f0-9-]{36}$'
  or jsonb_typeof(e->'kind') is distinct from 'string' or jsonb_typeof(e->'status') is distinct from 'string'
  or e->>'kind' not in ('backend','transcription') or e->>'status' not in ('unconfirmed','reported','estimated','unpriced')
  or jsonb_typeof(e->'model') is distinct from 'string' or length(e->>'model') not between 1 and 120
  or jsonb_typeof(e->'usage') is distinct from 'object' or jsonb_typeof(e->'rates') is distinct from 'object'
  or jsonb_typeof(e->'usd') not in ('number','null') then raise exception 'invalid_usage'; end if;
 if e->'usd'<>'null'::jsonb and ((e->>'usd')::numeric<0 or (e->>'usd')::numeric>1000) then raise exception 'invalid_usage'; end if;
 select * into r from public.ip_openai_practice_attempts where id=(p_body->>'id')::uuid for update;
 if not found or r.state<>'running' or r.execution_token is distinct from (p_body->>'token')::uuid
  or r.question->>'category' is distinct from 'personality' then raise exception 'lease_lost'; end if;
 a:=coalesce(r.report->'audit','{}'::jsonb);old:=a#>array['usageEvents',k];
 if old->>'status'='reported' then return jsonb_build_object('ok',true); end if;
 a:=a||jsonb_build_object('usageEvents',coalesce(a->'usageEvents','{}'::jsonb)||jsonb_build_object(k,e));
 update public.ip_openai_practice_attempts set report=coalesce(report,'{}'::jsonb)||jsonb_build_object('audit',a) where id=r.id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.ip_practice_usage_service(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ip_practice_usage_service(text,jsonb,jsonb) to service_role;
commit;
