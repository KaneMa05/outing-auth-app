-- DB-only preparation after add_study_character_hair.
-- Hair products stay inactive until the matching app/API is deployed.
begin;
set local lock_timeout = '5s';

alter table public.study_cafe_shop_items drop constraint study_cafe_shop_items_slot_check;
alter table public.study_cafe_shop_items add constraint study_cafe_shop_items_slot_check
  check (slot in ('outfit', 'head', 'desk', 'chair', 'hair'));
alter table public.study_cafe_equipment drop constraint study_cafe_equipment_slot_check;
alter table public.study_cafe_equipment add constraint study_cafe_equipment_slot_check
  check (slot in ('outfit', 'head', 'desk', 'chair', 'hair'));
create unique index if not exists study_cafe_equipment_one_hair_idx
  on public.study_cafe_equipment(student_id) where slot = 'hair';

insert into public.study_cafe_shop_items
  (id, name, description, slot, icon, price, sort_order, is_active)
values
  ('hair_sport', '스포츠 컷', '깔끔하고 가벼운 짧은 머리입니다.', 'hair', '✂', 50, 10, false),
  ('hair_spiky', '삐죽 숏컷', '삐죽한 앞머리로 활기를 더해요.', 'hair', '✂', 80, 20, false),
  ('hair_mushroom', '버섯 머리', '동글동글 귀여운 실루엣의 머리입니다.', 'hair', '✂', 100, 30, false),
  ('hair_wave', '내추럴 웨이브', '부드럽고 자연스러운 웨이브입니다.', 'hair', '✂', 150, 40, false),
  ('hair_ponytail', '하이 포니테일', '높게 묶어 발랄한 포니테일입니다.', 'hair', '✂', 200, 50, false)
on conflict (id) do update set
  name=excluded.name, description=excluded.description, slot=excluded.slot,
  icon=excluded.icon, price=excluded.price, sort_order=excluded.sort_order,
  is_active=excluded.is_active, updated_at=now();

-- Protect against older clients attempting to select an unpurchased hairstyle.
create or replace function public.require_owned_study_cafe_hair()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.hair_style <> 'default' and not exists (
    select 1 from public.study_cafe_inventory as inventory
    join public.study_cafe_shop_items as item on item.id=inventory.item_id
    where inventory.student_id=new.student_id
      and item.id='hair_' || new.hair_style and item.slot='hair'
  ) then
    raise exception 'hair_style_not_owned' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists study_cafe_profile_owned_hair on public.study_cafe_profiles;
create trigger study_cafe_profile_owned_hair
before insert or update of hair_style on public.study_cafe_profiles
for each row execute function public.require_owned_study_cafe_hair();
revoke execute on function public.require_owned_study_cafe_hair() from public, anon, authenticated;
grant execute on function public.require_owned_study_cafe_hair() to service_role;

-- Purchase uses the existing wallet lock, inventory uniqueness and points ledger.
-- Equipment and profile hair changes commit in the same transaction.
create or replace function public.equip_study_cafe_item(
  p_student_id text, p_item_id text, p_now timestamptz default now()
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_item public.study_cafe_shop_items%rowtype;
  v_desk_count integer := 0;
begin
  perform 1 from public.study_cafe_point_wallets where student_id=p_student_id for update;
  select item.* into v_item
  from public.study_cafe_shop_items as item
  join public.study_cafe_inventory as inventory
    on inventory.item_id=item.id and inventory.student_id=p_student_id
  where item.id=p_item_id and item.is_active=true;
  if not found then
    return jsonb_build_object('ok',false,'error','item_not_owned');
  end if;

  if v_item.slot='desk' then
    select count(*) into v_desk_count from public.study_cafe_equipment
    where student_id=p_student_id and slot='desk' and item_id<>p_item_id;
    if v_desk_count>=4 then
      return jsonb_build_object('ok',false,'error','desk_item_limit');
    end if;
    insert into public.study_cafe_equipment(student_id,slot,item_id,equipped_at)
    values(p_student_id,v_item.slot,p_item_id,p_now)
    on conflict(student_id,slot,item_id) do update set equipped_at=excluded.equipped_at;
  else
    delete from public.study_cafe_equipment where student_id=p_student_id and slot=v_item.slot;
    insert into public.study_cafe_equipment(student_id,slot,item_id,equipped_at)
    values(p_student_id,v_item.slot,p_item_id,p_now);
  end if;

  if v_item.slot='hair' then
    insert into public.study_cafe_profiles(student_id,hair_style,updated_at)
    values(p_student_id,substring(p_item_id from 6),p_now)
    on conflict(student_id) do update set hair_style=excluded.hair_style,updated_at=excluded.updated_at;
  end if;
  return jsonb_build_object('ok',true,'slot',v_item.slot,'itemId',p_item_id);
end;
$$;

create or replace function public.unequip_study_cafe_item(
  p_student_id text, p_slot text, p_item_id text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_student_id is null or not exists (
    select 1 from public.students where id=p_student_id and is_active=true and student_category='lecture'
  ) then
    return jsonb_build_object('ok',false,'error','invalid_student_id');
  end if;
  if p_slot not in ('outfit','head','desk','chair','hair') then
    return jsonb_build_object('ok',false,'error','invalid_shop_slot');
  end if;
  perform 1 from public.study_cafe_point_wallets where student_id=p_student_id for update;
  delete from public.study_cafe_equipment
  where student_id=p_student_id and slot=p_slot and (p_slot<>'desk' or item_id=p_item_id);
  if p_slot='hair' then
    update public.study_cafe_profiles set hair_style='default',updated_at=now() where student_id=p_student_id;
  end if;
  return jsonb_build_object('ok',true,'slot',p_slot);
end;
$$;

revoke execute on function public.equip_study_cafe_item(text,text,timestamptz) from public,anon,authenticated;
revoke execute on function public.unequip_study_cafe_item(text,text,text) from public,anon,authenticated;
grant execute on function public.equip_study_cafe_item(text,text,timestamptz) to service_role;
grant execute on function public.unequip_study_cafe_item(text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
