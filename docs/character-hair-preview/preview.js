'use strict';

const styles = [
  { id: 'sport', name: '스포츠 컷', mood: '짧고 산뜻한', tags: '짧은 윗머리 · 시원한 이마', description: '옆머리와 윗머리를 짧게 정리한 스포츠 스타일이에요. 이마를 시원하게 드러내서 작고 또렷한 인상을 줍니다.', path: 'M11 23 L11 17 Q11 8 20 8 L29 8 Q38 9 38 17 L38 23 L35 21 L34 16 Q25 14 15 16 L14 22 Z', shine: 'M17 11 L18 12 M22 10 L23 11 M27 10 L28 11 M32 11 L33 12' },
  { id: 'spiky', name: '삐죽 숏컷', mood: '보송하고 장난스러운', tags: '부드러운 세 갈래 · 가벼운 앞머리', description: '뾰족한 가시 대신 부드럽게 휘는 세 갈래 머리로 다듬었어요. 옆머리는 둥글게 정리하고 앞머리를 살짝 내려 귀여운 느낌을 더했습니다.', path: 'M10 24 Q7 18 11 13 Q13 10 15 10 Q12 7 14 4 Q17 8 21 7 Q19 3 22 1 Q24 6 28 7 Q28 3 31 4 Q31 8 35 11 Q40 14 39 20 L37 25 Q34 23 34 18 Q31 22 27 19 Q25 23 22 19 Q19 22 15 18 L13 25 Z', shine: 'M15 13 Q18 11 21 12 M25 11 Q30 10 34 14' },
  { id: 'mushroom', name: '버섯 머리', mood: '폭신하고 수줍은', tags: '풍성한 볼륨 · 옆으로 흐르는 앞머리', description: '폭신하게 퍼지는 버섯 모양에 옆으로 흐르는 긴 앞머리를 더했어요. 양옆을 둥글게 감싸는 실루엣으로 수줍고 부드러운 인상을 줍니다.', path: 'M8 27 Q3 25 6 17 Q5 6 17 3 Q30 0 38 7 Q44 12 43 20 Q46 26 39 28 L35 27 L34 17 Q31 20 27 20 L30 15 Q23 24 13 23 L13 28 Z', shine: 'M11 13 Q16 6 25 7 M17 18 Q25 15 29 10 M35 11 Q39 15 38 20' },
  { id: 'wave', name: '내추럴 웨이브', mood: '포근하고 자유로운', tags: '잔잔한 곡선 · 풍성한 볼륨', description: '둥글게 이어지는 웨이브로 포근한 느낌을 만들었어요. 다섯 시안 중 머리 윤곽이 가장 풍성합니다.', path: 'M10 26 Q6 24 8 19 Q4 13 10 10 Q8 5 15 5 Q18 0 23 4 Q29 0 33 5 Q40 3 40 11 Q45 15 40 20 Q42 25 37 27 L34 21 Q30 23 28 18 Q23 23 20 18 Q15 23 13 20 L13 26 Z', shine: 'M13 11 Q15 7 19 9 M25 8 Q29 6 32 10' },
  { id: 'ponytail', name: '하이 포니테일', mood: '경쾌하고 발랄한', tags: '높게 묶은 머리 · 살짝 말린 끝', description: '한쪽 위에서 높게 묶어 찰랑이는 포니테일이에요. 이마를 드러낸 단정한 앞머리와 바깥으로 말린 꼬리가 경쾌한 느낌을 줍니다.', path: 'M31 7 Q31 0 39 2 Q47 4 45 15 Q43 24 48 28 Q42 34 37 28 Q33 24 36 15 Q38 9 33 11 Z M10 25 Q7 16 11 9 Q15 3 25 4 Q36 4 39 14 L39 25 L35 25 L34 16 Q29 15 25 11 Q21 16 15 17 L14 25 Z', shine: 'M13 13 Q16 8 22 8 M29 8 Q33 10 35 13 M38 6 Q43 9 40 17 Q38 23 42 27', ties: 'M32 5 L36 9' }
];
const colors = [
  { name: '블루', value: '#5d95d4' }, { name: '민트', value: '#52b99c' },
  { name: '로즈', value: '#cf6f83' }, { name: '퍼플', value: '#8d77c9' }
];
let selected = 2;
let color = 0;

function hair(index) {
  if (index === -1) return '<i class="study-cafe-avatar-hair"></i>';
  const style = styles[index];
  return `<svg class="hair-design" viewBox="0 0 48 66" aria-hidden="true"><path fill="#2e3642" d="${style.path}"/><path d="${style.shine}" fill="none" stroke="#515966" stroke-width="1.25" stroke-linecap="round"/>${style.ties ? `<path d="${style.ties}" fill="none" stroke="#d995a3" stroke-width="2" stroke-linecap="round"/>` : ''}</svg>`;
}

function avatar(index) {
  return `<span class="study-cafe-avatar"><i class="study-cafe-avatar-shadow"></i><i class="study-cafe-avatar-body"></i><i class="study-cafe-avatar-face"></i>${hair(index)}</span>`;
}

function scene(index) {
  return `<div class="scene" aria-hidden="true"><span class="study-cafe-seat-visual"><span class="study-cafe-chair-back"></span>${avatar(index)}<span class="study-cafe-desk"><i class="study-cafe-desk-book"></i><i class="study-cafe-desk-cup"></i></span><span class="study-cafe-writing-arms"><i class="study-cafe-avatar-arm left"></i><i class="study-cafe-avatar-arm right"></i><i class="pencil"></i></span></span></div>`;
}

document.getElementById('styles').innerHTML = styles.map((style, index) => `<button class="style-card" data-style="${index}" aria-pressed="false"><div class="card-top"><span class="card-number">0${index + 1}</span><span class="revision-tag ${['wave', 'sport', 'spiky'].includes(style.id) ? 'fixed' : ''}">${style.id === 'wave' ? '픽스 · 유지' : ['sport', 'spiky'].includes(style.id) ? '유지' : '새 시안'}</span><span class="selected-check" aria-hidden="true">✓</span></div><div class="card-scene">${scene(index)}</div><div class="card-copy"><small>${style.mood}</small><h3>${style.name}</h3><p>${style.tags}</p></div></button>`).join('') + '<div class="collection-note"><span class="note-icon" aria-hidden="true">✳</span><h3>두 가지 새로운<br>스타일을 만나보세요.</h3><p>폭신한 버섯 머리와<br>발랄한 하이 포니테일.</p><span class="note-line"></span><small>옷 색상도 바꾸며 취향을 찾아보세요.</small></div>';
document.getElementById('before').innerHTML = avatar(-1);
document.getElementById('colors').innerHTML = colors.map((item, index) => `<button data-color="${index}" style="--swatch:${item.value}" aria-label="${item.name}" aria-pressed="false"><span aria-hidden="true">✓</span></button>`).join('');

function render() {
  const style = styles[selected];
  document.documentElement.style.setProperty('--outfit', colors[color].value);
  document.querySelectorAll('[data-style]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.style) === selected)));
  document.querySelectorAll('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.color) === color)));
  document.getElementById('hero').innerHTML = scene(selected);
  document.getElementById('after').innerHTML = avatar(selected);
  document.getElementById('after-label').textContent = style.name;
  document.getElementById('selected-number').textContent = `STYLE 0${selected + 1}`;
  document.getElementById('selected-name').textContent = style.name;
  document.getElementById('selected-description').textContent = style.description;
  document.getElementById('selection-label').textContent = `${String(selected + 1).padStart(2, '0')} ${style.name} 미리보는 중`;
  document.getElementById('seats').innerHTML = ['나', '수강생 A', '수강생 B', '수강생 C'].map((name, index) => `<div class="seat ${index === 0 ? 'my-seat' : ''}"><div class="seat-top"><span>${index + 1}</span><b>${name}</b></div><time>${['02:34:18', '02:18:42', '01:52:07', '01:36:25'][index]}</time>${scene(selected)}</div>`).join('');
}
document.getElementById('styles').addEventListener('click', event => {
  const button = event.target.closest('[data-style]');
  if (!button) return;
  selected = Number(button.dataset.style);
  render();
});
document.getElementById('colors').addEventListener('click', event => {
  const button = event.target.closest('[data-color]');
  if (!button) return;
  color = Number(button.dataset.color);
  render();
});
render();
