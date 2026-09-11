// Alternative design deliverable; keep the original calm-light proposal intact.
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, 'fire-v2');
fs.mkdirSync(target, {recursive:true});
for (const f of ['character-base.css','preview.css']) fs.copyFileSync(path.join(__dirname,f),path.join(target,f));
let html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const stages = [
 {hours:0,name:'공부 시작',range:'0시간 이상 · 3시간 미만',copy:'나만의 속도로 시작해요',detail:'기존 캐릭터와 책상 그대로 시작합니다. 3시간부터 첫 불꽃이 나타납니다.',change:'기존 캐릭터 · 불꽃 없음',next:3},
 {hours:3,name:'집중의 불씨',range:'3시간 이상 · 5시간 미만',copy:'오늘의 집중에 불이 붙었어요',detail:'몸 뒤에 작고 둥근 노란 불꽃이 피어납니다. 어깨 양옆에서 불씨를 확인할 수 있습니다.',change:'작은 노란 불꽃 · 첫 점화',next:5},
 {hours:5,name:'타오르는 집중',range:'5시간 이상 · 7시간 미만',copy:'집중의 불꽃이 자라고 있어요',detail:'같은 불꽃이 어깨 위로 자라고 주황색으로 깊어집니다. 실루엣과 높이가 함께 달라집니다.',change:'주황 불꽃 · 어깨 위로 성장',next:7},
 {hours:7,name:'몰입의 불꽃',range:'7시간 이상 · 9시간 미만',copy:'꾸준한 몰입이 힘이 되었어요',detail:'불꽃이 머리 위까지 올라오고 양옆으로 넓어집니다. 안쪽의 밝은 불꽃이 또렷해집니다.',change:'짙은 주황 · 머리 위 불꽃',next:9},
 {hours:9,name:'뜨거운 몰입',range:'9시간 이상 · 10시간 미만',copy:'오늘의 노력이 뜨겁게 빛나요',detail:'붉은 바깥 불꽃이 한 겹 더해지고, 작은 불티 두 개가 보입니다. 캐릭터 앞은 계속 깨끗하게 유지합니다.',change:'붉은 외곽 · 작은 불티 2개',next:10},
 {hours:10,name:'황금 불꽃',range:'10시간 이상',copy:'오늘의 불꽃을 완성했어요. 잠깐 쉬어가요',detail:'가장 넓고 풍성한 불꽃에 밝은 황금색 중심이 완성됩니다. 9시간의 붉은 테두리를 유지해 자연스럽게 이어집니다.',change:'황금 중심 · 풍성한 최종 불꽃',next:null}
];
html = html.replace(/const stages = \[[\s\S]*?\n\];/,`const stages = ${JSON.stringify(stages,null,1)};`);
const flame = `<div class="fire-layer" aria-hidden="true"><svg class="fire-svg" viewBox="0 0 120 124" xmlns="http://www.w3.org/2000/svg"><path class="fire-outer" d="M60 120C31 120 8 109 9 87C9 71 21 66 17 48C28 54 34 61 35 70C31 43 56 33 50 4C72 16 82 40 76 60C87 51 93 38 89 29C110 47 115 64 105 81C111 78 115 72 114 68C128 102 101 120 60 120Z"/><path class="fire-middle" d="M61 117C36 117 23 108 24 91C24 81 32 73 30 66C41 73 44 79 44 85C43 60 62 46 61 27C78 43 77 60 72 72C82 68 87 61 88 53C103 69 98 84 92 91C104 88 98 109 85 113C78 116 70 117 61 117Z"/><path class="fire-core" d="M63 117C45 117 39 107 42 96C45 87 54 82 55 70C64 77 68 85 65 94C73 91 77 84 78 78C91 96 83 117 63 117Z"/></svg><i class="ember ember-one"></i><i class="ember ember-two"></i></div>`;
html=html.replace('<div class="aura"></div><div class="achievement-arc"></div><i class="spark a">✦</i><i class="spark b">✦</i><i class="achievement-star">★</i>',flame);
html=html.replace('CHARACTER STUDY / 01','CHARACTER STUDY / 02 · FIRE')
 .replace('같은 나, 조금 더 깊어진 집중.','공부가 쌓일수록, 불꽃도 자라요.')
 .replace('기존 캐릭터를 유지하고, 오늘 쌓은 시간만큼 자세와 공부의 흔적을 더합니다.','작은 노란 불씨에서 풍성한 황금 불꽃까지. 같은 캐릭터 뒤로 집중의 에너지가 자랍니다.')
 .replace('변화는 겹쳐지고, 캐릭터는 유지됩니다.','불꽃은 자라고, 나의 캐릭터는 그대로.')
 .replace('오늘의 집중이<br>모습으로 남도록.','오늘의 집중에<br>불이 붙어요.')
 .replace('공부 흔적과 빛을 단계마다 한 겹씩 더해요.','같은 불꽃의 크기와 색이 조금씩 깊어져요.')
 .replace('<link rel="stylesheet" href="preview.css">','<link rel="stylesheet" href="preview.css"><link rel="stylesheet" href="fire.css">');
fs.writeFileSync(path.join(target,'index.html'),html);
let renderer=fs.readFileSync(path.join(__dirname,'render-preview.cjs'),'utf8')
 .replace('../../tmp/character-preview-browser','../../../tmp/character-fire-preview-browser')
 .replace('.phone .stage-5 .achievement-star','.phone .stage-5 .fire-layer');
fs.writeFileSync(path.join(target,'render-preview.cjs'),renderer);
console.log('Fire v2 preview prepared.');
