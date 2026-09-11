-- Run after add-study-cafe-hair-shop.sql inside a transaction, then ROLLBACK.
-- Uses only a dedicated uncommitted test student; never modifies existing users.
set local statement_timeout = '15s';
set local role service_role;
-- Activate staged products only inside this rolled-back test transaction.
update public.study_cafe_shop_items set is_active=true
where id in ('hair_sport','hair_spiky','hair_mushroom','hair_wave','hair_ponytail');
do $$
declare
  sid constant text := '__hair_shop_contract_20260911__';
  item text;
  result jsonb;
  before_balance integer;
begin
  insert into public.students(id,name,student_category) values(sid,'Hair shop test','lecture');
  insert into public.study_cafe_profiles(student_id,avatar_tone,nickname,status_message)
    values(sid,'rose','Tester','Studying');
  insert into public.study_cafe_point_wallets(student_id,balance) values(sid,49);

  result := public.purchase_study_cafe_item(sid,'hair_sport');
  if result->>'error' is distinct from 'insufficient_points' then raise exception 'Insufficient points check failed'; end if;
  if exists(select 1 from public.study_cafe_inventory where student_id=sid) then raise exception 'Failed purchase granted item'; end if;
  if (select balance from public.study_cafe_point_wallets where student_id=sid) <> 49 then raise exception 'Failed purchase charged points'; end if;
  begin
    update public.study_cafe_profiles set hair_style='wave' where student_id=sid;
    raise exception 'Free profile change bypassed ownership';
  exception when check_violation then null;
  end;

  update public.study_cafe_point_wallets set balance=2000 where student_id=sid;
  result := public.purchase_study_cafe_item(sid,'head_navy_cap');
  if result->>'ok' is distinct from 'true' then raise exception 'Hat purchase regression'; end if;
  result := public.equip_study_cafe_item(sid,'head_navy_cap');
  if result->>'ok' is distinct from 'true' then raise exception 'Hat equip regression'; end if;
  foreach item in array array['hair_sport','hair_spiky','hair_mushroom','hair_wave','hair_ponytail'] loop
    result := public.equip_study_cafe_item(sid,item);
    if result->>'error' is distinct from 'item_not_owned' then raise exception 'Unowned hair equipped'; end if;
    select balance into before_balance from public.study_cafe_point_wallets where student_id=sid;
    result := public.purchase_study_cafe_item(sid,item);
    if result->>'ok' is distinct from 'true' then raise exception 'Hair purchase failed: %',item; end if;
    if (result->>'balance')::integer <> before_balance-(select price from public.study_cafe_shop_items where id=item) then raise exception 'Wrong charge'; end if;
    result := public.purchase_study_cafe_item(sid,item);
    if result->>'error' is distinct from 'already_owned' then raise exception 'Duplicate purchase allowed'; end if;
    result := public.equip_study_cafe_item(sid,item);
    if result->>'ok' is distinct from 'true' then raise exception 'Hair equip failed'; end if;
    if (select hair_style from public.study_cafe_profiles where student_id=sid) is distinct from substring(item from 6) then raise exception 'Profile hair not synchronized'; end if;
    if (select count(*) from public.study_cafe_equipment where student_id=sid and slot='hair')<>1 then raise exception 'Multiple hair items equipped'; end if;
    if not exists(select 1 from public.study_cafe_equipment where student_id=sid and item_id='head_navy_cap') then raise exception 'Hair removed hat'; end if;
  end loop;

  result := public.unequip_study_cafe_item(sid,'hair','hair_ponytail');
  if result->>'ok' is distinct from 'true' then raise exception 'Hair unequip failed'; end if;
  if (select hair_style from public.study_cafe_profiles where student_id=sid)<>'default' then raise exception 'Default hair not restored'; end if;
  result := public.equip_study_cafe_item(sid,'hair_wave');
  if result->>'ok' is distinct from 'true' then raise exception 'Re-equip failed'; end if;
  if (select balance from public.study_cafe_point_wallets where student_id=sid)<>620 then raise exception 'Unexpected total charge'; end if;
  if (select count(*) from public.study_cafe_point_ledger where student_id=sid)<>6 then raise exception 'Duplicate ledger entry'; end if;
  if (select count(*) from public.study_cafe_inventory where student_id=sid)<>6 then raise exception 'Inventory mismatch'; end if;
  if not exists(select 1 from public.study_cafe_profiles where student_id=sid and avatar_tone='rose' and nickname='Tester' and status_message='Studying') then raise exception 'Other profile fields changed'; end if;
  result := public.get_study_cafe_snapshot_data(sid,current_date,date_trunc('day',now()),date_trunc('day',now())+interval '1 day');
  if not exists(select 1 from jsonb_array_elements(result->'profiles') p where p->>'student_id'=sid and p->>'hair_style'='wave') then raise exception 'Snapshot hair mismatch'; end if;
end;
$$;
select 'hair shop purchase, ownership, points, equip, default reset, hat compatibility and snapshot verified' as verification;
