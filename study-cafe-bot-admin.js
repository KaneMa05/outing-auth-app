function renderStudyCafeBotAdminEntry() {
  if (!isTeacherAdmin()) return null;
  return el('section', { className: 'study-cafe-admin-section bot-admin-entry' }, [
    el('div', {}, [el('h3', {}, '봇 관리'), el('p', {}, '운영 중인 봇의 포인트로 아이템을 구매하고 꾸며주세요.')]),
    button('봇 관리 열기', 'btn', 'button', openStudyCafeBotAdmin),
  ]);
}

function botAdminError(error) {
  return ({ insufficient_points: '포인트가 부족합니다.', already_owned: '이미 보유한 아이템입니다. 보관함에서 착용해주세요.',
    desk_item_limit: '책상 장식은 최대 4개입니다. 기존 장식을 해제하거나 구매만 진행해주세요.',
    price_changed: '상품 가격이 변경되었습니다. 새 가격을 확인해주세요.', settings_conflict: '다른 관리자가 설정을 변경했습니다. 최신 설정을 다시 불러와주세요.',
    item_not_found: '판매가 종료되었거나 찾을 수 없는 상품입니다.', item_not_owned: '구매한 판매 중 아이템만 착용할 수 있습니다.',
    invalid_request: '입력값을 확인해주세요. 닉네임은 한글·영문·숫자 2~10자, 과목은 20자 이내로 입력해주세요.',
    forbidden: '관리자 권한이 필요합니다.', unauthorized: '다시 로그인해주세요.', bot_not_found: '등록된 봇을 찾을 수 없습니다.',
    request_conflict: '이 요청의 처리 내역이 다릅니다. 최신 상태를 확인해주세요.',
    bots_unavailable: '봇 관리에 연결하지 못했습니다. DB 기능 적용 여부와 연결 상태를 확인해주세요.',
  })[error.message] || '처리 결과를 확인하지 못했습니다. 다시 시도하면 중복 차감 없이 결과를 확인합니다.';
}

async function requestStudyCafeBotAdmin(action, data = {}) {
  const response = await fetch('/api/study-cafe-admin', {
    method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: `bot_${action}`, ...data }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'request_failed');
  return result;
}

function openStudyCafeBotAdmin() {
  if (!isTeacherAdmin()) return;
  const hub = createStudyCafeBotAdmin();
  openInfoModal({ title: '스터디카페 봇 관리', className: 'bot-admin-modal', content: hub.element, confirmLabel: '닫기' });
  hub.start();
}

function createStudyCafeBotAdmin() {
  const actor = teacherAuth.user?.username;
  const element = el('div', { className: 'bot-admin' });
  let revision = 0, busy = false, selected = null, tab = 'shop', category = 'all', purchase = null, retryRequest = null;
  const alive = ticket => element.isConnected && ticket === revision && isTeacherAdmin() && teacherAuth.user?.username === actor;
  const points = n => `${Number(n || 0).toLocaleString('ko-KR')}P`;
  const date = value => value ? new Date(value).toLocaleString('ko-KR') : '—';
  function actionButton(label, fn, disabled = false, secondary = false) {
    const node = button(label, secondary ? 'btn secondary' : 'btn', 'button', fn);
    node.disabled = busy || disabled;
    return node;
  }
  function failure(error, retry) {
    element.replaceChildren(el('p', { role: 'alert' }, botAdminError(error)), actionButton('다시 불러오기', retry));
  }
  async function list() {
    if (busy) return;
    const ticket = ++revision;
    selected = null; purchase = null; retryRequest = null;
    element.replaceChildren(el('p', { role: 'status' }, '기존 봇과 보유 포인트를 불러오는 중…'));
    try {
      const result = await requestStudyCafeBotAdmin('list');
      if (!alive(ticket)) return;
      const cards = el('div', { className: 'bot-admin-grid' });
      for (const bot of result.bots) {
        const state = !bot.enabled ? '운영 중지' : ({ studying: '공부 중', paused: '휴식 중', seated: '착석' })[bot.status] || '퇴실';
        cards.append(el('article', { className: 'bot-admin-card' }, [
          el('span', { className: `bot-admin-status ${bot.enabled ? 'on' : ''}` }, state),
          el('div', { className: 'bot-admin-preview' }, [renderStudyCafeSeatedVisual(bot.avatar_tone, false, {
            studying:false, showWritingArms:false, equipment:bot.equipment || [],
            hairStyle:bot.equipment?.find(i=>i.slot==='hair')?.id.replace(/^hair_/, '') || 'default',
          })]),
          el('h3', {}, bot.name), el('small', {}, bot.student_id),
          el('p', {}, bot.display_name || bot.nickname || '방문별 자동 닉네임'),
          el('strong', { className: 'bot-admin-balance' }, points(bot.balance)),
          el('p', {}, `오늘 적립 ${points(bot.earned_today)} · 순공 ${Math.floor(Number(bot.today_seconds) / 60)}분`),
          el('p', {}, bot.seat_number ? `${bot.seat_number}번 좌석 · ${bot.current_subject || '대기'}` : '현재 좌석 없음'),
          el('small', {}, `정산 ${date(bot.settled_at)}`),
          actionButton('상점 · 봇 관리', () => detail(bot.student_id)),
        ]));
      }
      element.replaceChildren(el('p', {}, '각 봇의 보유 포인트로 구매합니다. 기존 공부 기록도 30분당 5P로 정산됩니다.'),
        actionButton('새로고침', list, false, true), cards,
        ...(!result.bots.length ? [el('p', {}, '등록된 봇이 없습니다.')] : []));
    } catch (error) { if (alive(ticket)) failure(error, list); }
  }
  async function detail(id) {
    if (busy) return;
    const ticket = ++revision;
    purchase = null;
    element.replaceChildren(el('p', { role: 'status' }, '봇의 상점을 불러오는 중…'));
    try {
      const data = await requestStudyCafeBotAdmin('detail', { studentId: id });
      if (!alive(ticket)) return;
      selected = data; draw();
    } catch (error) { if (alive(ticket)) failure(error, () => detail(id)); }
  }
  async function mutate(action, payload) {
    if (busy || !selected) return;
    const ticket = revision;
    const studentId = selected.bot.student_id;
    const key = JSON.stringify({ action, studentId, payload });
    if (!retryRequest || retryRequest.key !== key) retryRequest = { key, requestId: crypto.randomUUID() };
    busy = true;
    const disabledBefore = new Map([...element.querySelectorAll('button, input, select, textarea')].map(n => [n,n.disabled]));
    disabledBefore.forEach((_, n) => n.disabled = true);
    const message = el('p', { role: 'status' }, '처리 중…'); element.append(message);
    try {
      await requestStudyCafeBotAdmin(action, { studentId, payload, requestId: retryRequest.requestId });
      if (!alive(ticket)) return;
      retryRequest = null; purchase = null;
      message.textContent = '저장되었습니다. 최신 상태를 확인하는 중…';
      selected = await requestStudyCafeBotAdmin('detail', { studentId });
      if (!alive(ticket)) return;
      busy = false; draw();
      element.append(el('p', { role: 'status' }, '저장되었습니다. 좌석 화면은 다음 갱신에 반영됩니다.'));
    } catch (error) {
      if (!alive(ticket)) return;
      busy = false;
      // Preserve the form and request ID when the network response was lost.
      disabledBefore.forEach((disabled, n) => n.disabled = disabled);
      message.setAttribute('role', 'alert'); message.textContent = botAdminError(error);
      message.append(actionButton('최신 상태 불러오기', () => detail(studentId), false, true));
    } finally { busy = false; }
  }
  function preview(equipment = selected.equipment) {
    const items = equipment.map(e => selected.items.find(i => i.id === e.item_id)).filter(Boolean);
    return el('div', { className: 'bot-admin-preview' }, [renderStudyCafeSeatedVisual(selected.bot.avatar_tone, false, {
      studying: false, showWritingArms: false, equipment: items,
      hairStyle: items.find(i => i.slot === 'hair')?.id.replace(/^hair_/, '') || 'default',
    })]);
  }
  function draw() {
    const data = selected, bot = data.bot;
    const tabs = [['shop','상점'],['inventory','보관함'],['settings','운영 설정'],['history','내역']];
    element.replaceChildren(actionButton('‹ 봇 목록', list, false, true),
      el('div', { className: 'bot-admin-detail-head' }, [preview(), el('div', {}, [el('h3', {}, bot.name),
        el('p', {}, `${bot.student_id} · ${bot.enabled ? '운영 중' : '운영 중지'}`),
        el('strong', { className: 'bot-admin-balance' }, points(data.wallet.balance))])]),
      el('nav', { className: 'bot-admin-tabs', ariaLabel: '봇 관리 메뉴' }, tabs.map(([value,label]) => {
        const b = actionButton(label, () => { tab=value; purchase=null; draw(); }, false, tab!==value);
        b.setAttribute('aria-pressed', String(tab===value)); return b;
      })));
    if (tab==='settings') return settings();
    if (tab==='history') {
      const names = {purchase:'아이템 구매',equip:'아이템 착용',unequip:'착용 해제',save:'설정 변경',toggle:'운영 상태 변경'};
      element.append(el('h4', {}, '최근 포인트 내역'), el('div', { className: 'bot-admin-history' },
        data.history.length ? data.history.map(h => el('p', {}, `${date(h.created_at)} · ${h.description} · ${h.amount>0?'+':''}${points(h.amount)}`)) : [el('p', {}, '내역이 없습니다.')]),
        el('h4', {}, '최근 관리자 작업'), el('div', { className: 'bot-admin-history' },
          data.actions.map(h => el('p', {}, `${date(h.created_at)} · ${h.actor} · ${names[h.action] || h.action}`))));
      return;
    }
    if (purchase) {
      const item = purchase;
      const equipped = data.equipment.filter(e => item.slot==='desk' || e.slot!==item.slot).concat({ item_id: item.id, slot:item.slot });
      element.append(el('section', { className: 'bot-admin-checkout' }, [el('h4', {}, `${bot.name} · ${item.name}`), preview(equipped),
        el('p', {}, `${points(data.wallet.balance)} − ${points(item.price)} = 구매 후 ${points(data.wallet.balance-item.price)}`),
        actionButton('구매', () => mutate('purchase', { itemId:item.id, expectedPrice:item.price, equip:false })),
        actionButton('구매 후 착용', () => mutate('purchase', { itemId:item.id, expectedPrice:item.price, equip:true })),
        actionButton('취소', () => { purchase=null; draw(); }, false, true)]));
      return;
    }
    const categories = [['all','전체'],['hair','머리'],['outfit','의상'],['head','머리 장식'],['desk','책상'],['chair','의자']];
    element.append(el('div', { className: 'bot-admin-tabs' }, categories.map(([value,label]) =>
      actionButton(label, () => { category=value; draw(); }, false, category!==value))));
    const items = data.items.filter(i => (category==='all'||i.slot===category) && (tab==='inventory' ? data.inventory.includes(i.id) : i.is_active));
    const grid = el('div', { className: 'bot-admin-grid' });
    items.forEach(item => {
      const owned = data.inventory.includes(item.id), equipped = data.equipment.some(e => e.item_id===item.id);
      const shortage = Math.max(0,item.price-data.wallet.balance);
      grid.append(el('article', { className: 'bot-admin-card' }, [
        el('div', { className: 'bot-admin-item-icon', ariaHidden:'true' }, item.icon),
        el('h4', {}, item.name), el('p', {}, item.description), el('strong', {}, points(item.price)),
        el('small', {}, equipped ? '착용 중' : owned ? '보유 중' : shortage ? `${points(shortage)} 부족` : '구매 가능'),
        owned ? actionButton(equipped ? '착용 해제' : '착용', () => mutate(equipped?'unequip':'equip', { itemId:item.id }), !equipped&&!item.is_active)
          : actionButton('구매하기', () => { purchase=item; draw(); }, shortage>0),
      ]));
    });
    element.append(grid);
    if (!items.length) element.append(el('p', {}, tab==='inventory'?'보유한 아이템이 없습니다.':'이 분류에 판매 중인 상품이 없습니다.'));
  }
  function settings() {
    const bot=selected.bot;
    const form=el('form', { className:'bot-admin-settings' });
    const fields={};
    const field=(key,label,value,type='text',max=100) => {
      const input=el('input',{type,value,maxLength:max}); fields[key]=input;
      form.append(el('label',{},[el('span',{},label),input])); return input;
    };
    field('name','관리용 이름',bot.name,'text',40);
    field('nickname','고정 닉네임 (비워두면 방문별 자동)',bot.nickname||'','text',10);
    field('track','직렬',bot.track);
    field('subjects','공부 과목 (쉼표로 구분, 최대 8개)',bot.subjects.join(', '),'text',180);
    const tone=el('select',{},[['navy','네이비'],['blue','블루'],['mint','민트'],['purple','퍼플'],['orange','오렌지'],['rose','로즈']].map(([value,label])=>el('option',{value},label)));
    tone.value=bot.avatar_tone;
    form.append(el('label',{},[el('span',{},'기본 색상'),tone]));
    const seat=field('seat','선호 좌석 (1~48)',String(bot.preferred_seat),'number'); seat.min='1'; seat.max='48';
    form.append(el('p',{},'한국 시간 기준입니다. 00:00~03:59는 익일로 처리하며, 실제 입·퇴실은 기존처럼 약 14분의 변동이 있습니다.'));
    const timeValue=n=>`${String(Math.floor(((n+240)%1440)/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
    for(let i=1;i<=3;i++) {field(`start${i}`,`${i}번째 시작`,timeValue(bot[`start_${i}`]),'time'); field(`end${i}`,`${i}번째 종료`,timeValue(bot[`end_${i}`]),'time');}
    const save=el('button',{type:'submit',className:'btn'},'설정 저장');
    const error=el('p',{role:'alert'});
    form.append(save,error);
    form.addEventListener('submit',event=>{
      event.preventDefault(); if(busy) return;
      const minute=v=>{if(!/^\d{2}:\d{2}$/.test(v)) return NaN; const [h,m]=v.split(':').map(Number); return (h*60+m-240+1440)%1440;};
      const windows=[1,2,3].map(i=>[minute(fields[`start${i}`].value),minute(fields[`end${i}`].value)]);
      if(!windows.flat().every((v,i,arr)=>Number.isInteger(v)&&(i===0||v>arr[i-1]))) {error.textContent='시간대를 순서대로, 서로 겹치지 않게 입력해주세요.';return;}
      mutate('save',{ version:bot.admin_version,name:fields.name.value.trim(),nickname:fields.nickname.value.trim(),track:fields.track.value.trim(),
        subjects:fields.subjects.value.split(',').map(s=>s.trim()).filter(Boolean),avatarTone:tone.value,preferredSeat:Number(seat.value),windows });
    });
    element.append(el('p',{},'운영 중지는 공부를 종료하고 좌석을 반환합니다. 재개하면 기존 시간표에 따라 다음 자동 실행부터 운영됩니다.'),
      actionButton(bot.enabled?'운영 중지':'운영 재개',()=>mutate('toggle',{version:bot.admin_version,enabled:!bot.enabled}),false,true),form);
  }
  return { element, start:list };
}
