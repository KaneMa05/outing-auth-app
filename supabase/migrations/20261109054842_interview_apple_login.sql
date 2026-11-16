begin;
-- Preserve existing Kakao subjects, owner IDs, enrollments and study records.
-- One person may connect one identity per provider; emails are never identity keys.
alter table public.ip_web_identities add column provider text generated always as
  (case when app_id like 'apple:%' then 'apple' else 'kakao' end) stored;
alter table public.ip_web_identities drop constraint ip_web_identities_owner_id_key;
create unique index ip_web_identities_owner_provider on public.ip_web_identities(owner_id,provider);

do $$
declare src text;
  old_check text := 'if exists(select 1 from ip_web_identities where owner_id=v_owner and id<>v_identity.id) then';
  new_check text := 'if exists(select 1 from ip_web_identities where owner_id=v_owner and provider=v_identity.provider and id<>v_identity.id) then';
begin
  select pg_get_functiondef('public.ip_portal_service(text,jsonb,jsonb)'::regprocedure) into src;
  if (length(src)-length(replace(src,old_check,'')))/length(old_check) <> 2 then
    raise exception 'Unexpected portal identity checks: review Apple migration before applying';
  end if;
  execute replace(src,old_check,new_check);
end;
$$;

create or replace function public.ip_web_session(p_hash text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('identityId',s.identity_id,'ownerId',coalesce(i.owner_id,s.owner_id),'name',d.name,
   'linked',s.identity_id is not null or exists(select 1 from ip_web_identities linked where linked.owner_id=o.id),
   'appleLinked',exists(select 1 from ip_web_identities linked where linked.owner_id=o.id and linked.provider='apple'),
   'kakaoLinked',exists(select 1 from ip_web_identities linked where linked.owner_id=o.id and linked.provider='kakao'),
   'legacy',o.legacy_student_id is not null)
 from ip_web_sessions s left join ip_web_identities i on i.id=s.identity_id
 left join ip_owners o on o.id=coalesce(i.owner_id,s.owner_id)
 left join ip_student_directory d on d.id=o.id
 where s.token_hash=p_hash and s.expires_at>now()
 and (coalesce(i.owner_id,s.owner_id) is null or (o.active and d.is_active and d.account_type='student'))
$$;

-- Revocation credentials are encrypted by the server with AES-256-GCM.
-- Never expose this table, raw tokens or the encryption key to a browser.
create table public.ip_apple_grants (
 identity_id uuid primary key references public.ip_web_identities(id) on delete cascade,
 encrypted_refresh_token text not null check(length(encrypted_refresh_token) between 20 and 10000),
 updated_at timestamptz not null default now()
);
alter table public.ip_apple_grants enable row level security;
revoke all on public.ip_apple_grants from public,anon,authenticated;
grant select,insert,update,delete on public.ip_apple_grants to service_role;

-- Session creation and storing the revocable grant must succeed atomically.
create function public.ip_apple_login(p_body jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare identity_uuid uuid;
begin
 if coalesce(p_body->>'appId','') not like 'apple:%'
   or nullif(p_body->>'subject','') is null
   or coalesce(p_body->>'newHash','') !~ '^[a-f0-9]{64}$'
   or coalesce(p_body->>'encryptedRefreshToken','') not like 'v1.%' then raise exception 'invalid_request'; end if;
 perform ip_portal_service('oauth_login','{"type":"server"}'::jsonb,p_body);
 select id into strict identity_uuid from ip_web_identities where app_id=p_body->>'appId' and subject=p_body->>'subject';
 insert into ip_apple_grants(identity_id,encrypted_refresh_token) values(identity_uuid,p_body->>'encryptedRefreshToken')
 on conflict(identity_id) do update set encrypted_refresh_token=excluded.encrypted_refresh_token,updated_at=now();
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.ip_apple_login(jsonb) from public,anon,authenticated;
grant execute on function public.ip_apple_login(jsonb) to service_role;
commit;
