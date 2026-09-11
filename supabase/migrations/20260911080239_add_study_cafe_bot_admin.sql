-- Existing agents only. Does not seed/reset students, profiles, schedules or wallets.
-- Apply after the existing agents, shop and hair shop migrations.
begin;
set local lock_timeout = '5s';

alter table private.study_cafe_agents add column if not exists admin_version bigint not null default 0;
create table if not exists private.study_cafe_bot_settlements (
  student_id text primary key references private.study_cafe_agents(student_id),
  settled_date date,
  updated_at timestamptz,
  last_error text
);
create table if not exists private.study_cafe_bot_actions (
  request_id uuid primary key,
  student_id text not null references private.study_cafe_agents(student_id),
  actor text not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists study_cafe_bot_actions_student_time_idx
  on private.study_cafe_bot_actions(student_id, created_at desc);
alter table private.study_cafe_bot_settlements enable row level security;
alter table private.study_cafe_bot_actions enable row level security;
revoke all on private.study_cafe_bot_settlements, private.study_cafe_bot_actions from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, update on private.study_cafe_agents to service_role;
grant select, insert, update on private.study_cafe_bot_settlements to service_role;
grant select, insert on private.study_cafe_bot_actions to service_role;

create or replace function private.settle_study_cafe_bot(p_id text, p_now timestamptz default now())
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_date date := ((p_now at time zone 'Asia/Seoul') - interval '4 hours')::date;
  v_from date;
  v_day record;
  v_paid integer;
  v_target integer;
  v_balance integer;
begin
  if not exists(select 1 from private.study_cafe_agents where student_id=p_id) then
    raise exception 'bot_not_found';
  end if;
  insert into public.study_cafe_point_wallets(student_id) values(p_id) on conflict do nothing;
  perform 1 from public.study_cafe_point_wallets where student_id=p_id for update;
  select settled_date into v_from from private.study_cafe_bot_settlements where student_id=p_id;
  -- Revisit the previous settlement day and any older open session; catch up missed days.
  if v_from is not null then
    select least(v_from, min(((started_at at time zone 'Asia/Seoul')-interval '4 hours')::date))
      into v_from from public.study_cafe_sessions where student_id=p_id and status in ('running','paused');
  end if;
  for v_day in
    select ((s.started_at at time zone 'Asia/Seoul')-interval '4 hours')::date as study_date,
      sum(greatest(0,s.elapsed_seconds) + case when s.status='running' and s.active_started_at is not null
        then greatest(0,floor(extract(epoch from (p_now-s.active_started_at)))) else 0 end)::bigint as seconds
    from public.study_cafe_sessions s
    where s.student_id=p_id and s.started_at<=p_now
      and (v_from is null or s.started_at >= ((v_from::timestamp+interval '4 hours') at time zone 'Asia/Seoul'))
    group by 1 order by 1
  loop
    v_target := floor(v_day.seconds/1800.0)::integer*5;
    -- Both the original shop and bot-specific receipts use the same study-day key.
    select coalesce(sum(amount),0)::integer into v_paid from public.study_cafe_point_ledger
      where student_id=p_id and source_type='study_time'
        and (source_key like 'study:'||v_day.study_date::text||':%'
          or source_key like 'bot-study:'||v_day.study_date::text||':%');
    if v_target>v_paid then
      update public.study_cafe_point_wallets set balance=balance+v_target-v_paid,
        lifetime_earned=lifetime_earned+v_target-v_paid, updated_at=p_now
        where student_id=p_id returning balance into v_balance;
      insert into public.study_cafe_point_ledger(student_id,source_type,source_key,amount,balance_after,description,created_at)
        values(p_id,'study_time','bot-study:'||v_day.study_date::text||':'||v_target,
          v_target-v_paid,v_balance,v_day.study_date::text||' 봇 순공시간 적립',p_now);
    end if;
  end loop;
  select coalesce(sum(amount),0)::integer into v_paid from public.study_cafe_point_ledger
    where student_id=p_id and source_type='study_time'
      and (source_key like 'study:'||v_date::text||':%' or source_key like 'bot-study:'||v_date::text||':%');
  update public.study_cafe_point_wallets set study_date=v_date, awarded_study_points=v_paid where student_id=p_id;
  insert into private.study_cafe_bot_settlements(student_id,settled_date,updated_at,last_error)
    values(p_id,v_date,p_now,null) on conflict(student_id) do update
    set settled_date=excluded.settled_date,updated_at=excluded.updated_at,last_error=null;
end;
$$;

-- Keep the installed automation intact and its existing cron entry unchanged.
do $$ begin
  if to_regprocedure('private.run_study_cafe_agents_core(timestamptz)') is null then
    alter function private.run_study_cafe_agents(timestamptz) rename to run_study_cafe_agents_core;
  end if;
end $$;
create or replace function private.run_study_cafe_agents(p_now timestamptz default clock_timestamp())
returns void language plpgsql security invoker set search_path = '' as $$
declare v_id text;
begin
  perform pg_advisory_xact_lock(299997,1);
  perform private.run_study_cafe_agents_core(p_now);
  update public.study_cafe_presence p set display_name=a.nickname
    from private.study_cafe_agents a where p.student_id=a.student_id and a.nickname is not null
      and p.display_name is distinct from a.nickname;
  for v_id in select student_id from private.study_cafe_agents order by student_id loop
    begin
      perform private.settle_study_cafe_bot(v_id,p_now);
    exception when others then
      insert into private.study_cafe_bot_settlements(student_id,last_error)
        values(v_id,'settlement_failed') on conflict(student_id) do update set last_error=excluded.last_error;
    end;
  end loop;
end;
$$;

create or replace function public.study_cafe_bot_admin(
  p_action text, p_student_id text default null, p_payload jsonb default '{}'::jsonb,
  p_actor text default '', p_request_id uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  a private.study_cafe_agents%rowtype;
  v_item public.study_cafe_shop_items%rowtype;
  v_old private.study_cafe_bot_actions%rowtype;
  v_result jsonb;
  v_list jsonb;
  v_now timestamptz := now();
  v_id text;
  v_slot text;
begin
  if p_action not in ('list','detail','save','toggle','purchase','equip','unequip') then
    return jsonb_build_object('ok',false,'error','invalid_action');
  end if;
  perform pg_advisory_xact_lock(299997,1);
  if p_action='list' then
    for v_id in select student_id from private.study_cafe_agents order by student_id loop
      perform private.settle_study_cafe_bot(v_id,v_now);
    end loop;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.student_id),'[]') into v_list from (
      select agent_row.*, w.balance,w.awarded_study_points as earned_today,
        coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'slot',i.slot,'icon',i.icon))
          from public.study_cafe_equipment e join public.study_cafe_shop_items i on i.id=e.item_id
          where e.student_id=agent_row.student_id),'[]') as equipment,
        p.status,p.seat_number,p.current_subject,p.display_name,s.updated_at as settled_at,s.last_error,
        coalesce((select sum(greatest(0,c.elapsed_seconds)+case when c.status='running'
          then greatest(0,floor(extract(epoch from (v_now-c.active_started_at)))) else 0 end)
          from public.study_cafe_sessions c where c.student_id=agent_row.student_id
            and c.started_at>=((((v_now at time zone 'Asia/Seoul')-interval '4 hours')::date::timestamp+interval '4 hours') at time zone 'Asia/Seoul')),0) as today_seconds
      from private.study_cafe_agents agent_row left join public.study_cafe_point_wallets w using(student_id)
      left join public.study_cafe_presence p using(student_id)
      left join private.study_cafe_bot_settlements s using(student_id)
    ) t;
    return jsonb_build_object('ok',true,'bots',v_list);
  end if;
  select * into a from private.study_cafe_agents where student_id=p_student_id for update;
  if not found then return jsonb_build_object('ok',false,'error','bot_not_found'); end if;
  if p_action<>'detail' then
    if p_request_id is null or length(trim(p_actor))=0 then
      return jsonb_build_object('ok',false,'error','invalid_request');
    end if;
    select * into v_old from private.study_cafe_bot_actions where request_id=p_request_id;
    if found then
      if v_old.student_id<>p_student_id or v_old.action<>p_action or v_old.actor<>p_actor or v_old.payload<>p_payload then
        return jsonb_build_object('ok',false,'error','request_conflict');
      end if;
      return v_old.result;
    end if;
  end if;
  perform private.settle_study_cafe_bot(p_student_id,v_now);
  if p_action='detail' then
    return jsonb_build_object('ok',true,'bot',to_jsonb(a),
      'wallet',(select to_jsonb(w) from public.study_cafe_point_wallets w where student_id=p_student_id),
      'items',coalesce((select jsonb_agg(to_jsonb(i) order by sort_order,id) from public.study_cafe_shop_items i
        where is_active or exists(select 1 from public.study_cafe_inventory v where v.student_id=p_student_id and v.item_id=i.id)),'[]'),
      'inventory',coalesce((select jsonb_agg(item_id) from public.study_cafe_inventory where student_id=p_student_id),'[]'),
      'equipment',coalesce((select jsonb_agg(to_jsonb(e)) from public.study_cafe_equipment e where student_id=p_student_id),'[]'),
      'history',coalesce((select jsonb_agg(to_jsonb(h)) from (select amount,description,created_at from public.study_cafe_point_ledger
        where student_id=p_student_id order by created_at desc,id desc limit 30) h),'[]'),
      'actions',coalesce((select jsonb_agg(to_jsonb(h)) from (select actor,action,created_at from private.study_cafe_bot_actions
        where student_id=p_student_id order by created_at desc limit 30) h),'[]'));
  end if;
  -- A subtransaction rolls purchase back if equipping fails.
  begin
    if p_action in ('save','toggle') then
      if (p_payload->>'version')::bigint is distinct from a.admin_version then
        return jsonb_build_object('ok',false,'error','settings_conflict');
      end if;
      if p_action='toggle' then
        update private.study_cafe_agents set enabled=(p_payload->>'enabled')::boolean,
          admin_version=admin_version+1 where student_id=p_student_id;
        if (p_payload->>'enabled')::boolean=false then
          perform private.finish_study_cafe_agent_session(p_student_id,v_now);
          delete from public.study_cafe_presence where student_id=p_student_id;
          perform private.settle_study_cafe_bot(p_student_id,v_now);
        end if;
      else
        update private.study_cafe_agents set
          name=trim(p_payload->>'name'), nickname=nullif(trim(p_payload->>'nickname'),''),
          track=trim(p_payload->>'track'), subjects=array(select jsonb_array_elements_text(p_payload->'subjects')),
          avatar_tone=p_payload->>'avatarTone', preferred_seat=(p_payload->>'preferredSeat')::integer,
          start_1=(p_payload->'windows'->0->>0)::integer,end_1=(p_payload->'windows'->0->>1)::integer,
          start_2=(p_payload->'windows'->1->>0)::integer,end_2=(p_payload->'windows'->1->>1)::integer,
          start_3=(p_payload->'windows'->2->>0)::integer,end_3=(p_payload->'windows'->2->>1)::integer,
          admin_version=admin_version+1 where student_id=p_student_id returning * into a;
        update public.students set name=a.name,track=a.track where id=p_student_id;
        insert into public.study_cafe_profiles(student_id,avatar_tone,nickname,updated_at)
          values(p_student_id,a.avatar_tone,a.nickname,v_now) on conflict(student_id) do update
          set avatar_tone=excluded.avatar_tone,nickname=excluded.nickname,updated_at=excluded.updated_at;
        delete from public.study_cafe_subjects where student_id=p_student_id;
        insert into public.study_cafe_subjects(student_id,name,sort_order,updated_at)
          select p_student_id,s.name,s.ordinality-1,v_now from unnest(a.subjects) with ordinality s(name,ordinality);
      end if;
      v_result:=jsonb_build_object('ok',true);
    else
      select * into v_item from public.study_cafe_shop_items where id=p_payload->>'itemId' for share;
      if not found then return jsonb_build_object('ok',false,'error','item_not_found'); end if;
      if p_action='purchase' then
        if (p_payload->>'expectedPrice')::integer is distinct from v_item.price then
          return jsonb_build_object('ok',false,'error','price_changed');
        end if;
        v_result:=public.purchase_study_cafe_item(p_student_id,v_item.id,v_now);
        if v_result->>'ok'<>'true' then return v_result; end if;
        if p_payload->>'equip'='true' then
          v_result:=public.equip_study_cafe_item(p_student_id,v_item.id,v_now);
          if v_result->>'ok'<>'true' then raise exception using message=v_result->>'error'; end if;
        end if;
      elsif p_action='equip' then
        v_result:=public.equip_study_cafe_item(p_student_id,v_item.id,v_now);
        if v_result->>'ok'<>'true' then return v_result; end if;
      else
        v_slot:=v_item.slot;
        delete from public.study_cafe_equipment where student_id=p_student_id and item_id=v_item.id;
        if v_slot='hair' and found then
          update public.study_cafe_profiles set hair_style='default',updated_at=v_now where student_id=p_student_id;
        end if;
        v_result:=jsonb_build_object('ok',true);
      end if;
    end if;
    v_result:=v_result||jsonb_build_object('balance',(select balance from public.study_cafe_point_wallets where student_id=p_student_id));
    insert into private.study_cafe_bot_actions(request_id,student_id,actor,action,payload,result)
      values(p_request_id,p_student_id,p_actor,p_action,p_payload,v_result);
    return v_result;
  exception when raise_exception then
    return jsonb_build_object('ok',false,'error',SQLERRM);
  end;
end;
$$;

-- Public room payload exposes appearance only, never wallet/inventory or bot settings.
create or replace function public.study_cafe_bot_appearance()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (
    select a.student_id,p.seat_number,a.avatar_tone,
      coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'slot',i.slot,'icon',i.icon))
        from public.study_cafe_equipment e join public.study_cafe_shop_items i on i.id=e.item_id
        where e.student_id=a.student_id),'[]') as equipment
    from private.study_cafe_agents a join public.study_cafe_presence p using(student_id)
  ) t;
$$;
revoke all on function public.study_cafe_bot_appearance() from public,anon,authenticated;
grant execute on function public.study_cafe_bot_appearance() to service_role;
revoke all on function private.settle_study_cafe_bot(text,timestamptz) from public,anon,authenticated;
revoke all on function private.run_study_cafe_agents(timestamptz) from public,anon,authenticated;
revoke all on function private.run_study_cafe_agents_core(timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.study_cafe_bot_admin(text,text,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function private.settle_study_cafe_bot(text,timestamptz) to service_role;
grant execute on function private.finish_study_cafe_agent_session(text,timestamptz) to service_role;
grant execute on function public.study_cafe_bot_admin(text,text,jsonb,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
