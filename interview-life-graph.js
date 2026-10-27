const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed=n=>n>0?'+'+n:String(n);
export function experienceText(row){
 const content=Object.hasOwn(row,'content')?row.content:[['period','시기'],['affiliation','소속'],['situation','상황'],['action','행동'],['result','결과']].filter(([key])=>row[key]).map(([key,label])=>`${label}: ${row[key]}`).join('\n\n');
 return {...row,content,appeal:Object.hasOwn(row,'appeal')?row.appeal:row.learning||''};
}
const keyword=title=>{const words=String(title||'경험').trim().split(/\s+/).slice(0,2).join(' ');return [...words].length>12?[...words].slice(0,11).join('')+'…':words;};
export function lifeGraphPoints(rows){
 return rows.filter(r=>/^\d{1,3}$/.test(String(r.age??''))&&Number(r.age)<=120&&/^(-([1-9]|1[0-9]|2[0-5])|[0-9]|1[0-9]|2[0-5])$/.test(String(r.satisfaction??'')))
  .map((r,index)=>({...r,index,age:Number(r.age),score:Number(r.satisfaction)}))
  .sort((a,b)=>a.age-b.age||a.index-b.index);
}
export function renderLifeGraph(rows,{interactive=false}={}){
 const points=lifeGraphPoints(rows),minAge=points.length?points[0].age:0,maxAge=points.length?points.at(-1).age:0;
 const W=760,left=55,right=25,bottom=55;
 let H=380,top=65;
 const span=maxAge-minAge;
 const x=age=>span?left+(age-minAge)/span*(W-left-right):left+(W-left-right)/2,y=score=>top+(25-score)/50*(H-top-bottom);
 // Keep age/score coordinates exact; move only labels when their boxes collide.
 const labels=[];
 const overlaps=(a,b)=>a.x<b.x+b.width+8&&a.x+a.width+8>b.x&&a.y<b.y+b.height+8&&a.y+a.height+8>b.y;
 for(const p of points){
  const title=keyword(p.title),width=Math.max(56,[...title].length*12+16);
  const label={x:Math.max(8,Math.min(W-width-8,x(p.age)-width/2)),y:y(p.score)-48,width,height:36,title};
  while(labels.some(other=>overlaps(label,other))||points.some(other=>overlaps(label,{x:x(other.age)-10,y:y(other.score)-10,width:20,height:20})))label.y-=44;
  labels.push(label);
 }
 const extraTop=Math.max(0,32-Math.min(32,...labels.map(l=>l.y)));
 top+=extraTop;H+=extraTop;
 labels.forEach(l=>l.y+=extraTop);
 const step=Math.max(1,Math.ceil(span/6));
 const ages=points.length?Array.from({length:Math.floor(span/step)+1},(_,i)=>minAge+i*step):[];
 if(points.length&&ages.at(-1)!==maxAge){if(ages.length>1&&maxAge-ages.at(-1)<step/2)ages.pop();ages.push(maxAge);}
 const pointLabel=(p,i)=>`${i+1}번 · ${p.age}세 · 만족도 ${signed(p.score)}점 · ${p.title||'제목 미작성'}`;
 return `<section class="ip-panel ip-life-graph"><div class="ip-row"><h3>나의 인생그래프</h3><span class="ip-help">${points.length} / ${rows.length}개 경험</span></div><p class="ip-help">가로축은 나이, 세로축은 내가 느낀 만족도입니다. −25점부터 +25점까지 직접 입력해주세요.</p>
 <div class="ip-life-chart-scroll" tabindex="0" aria-label="나이별 만족도 그래프. 좁은 화면에서는 가로로 이동할 수 있습니다."><svg class="ip-life-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="가로축 나이, 세로축 만족도 −25점부터 +25점"><text x="${left}" y="18" class="ip-graph-axis-title">만족도 (점)</text>
 ${Array.from({length:11},(_,i)=>25-i*5).map(score=>`<line x1="${left}" x2="${W-right}" y1="${y(score)}" y2="${y(score)}" class="${score===0?'ip-graph-zero':'ip-graph-grid'}"/><text x="${left-12}" y="${y(score)+4}" text-anchor="end">${signed(score)}</text>`).join('')}
 ${ages.map(age=>`<line x1="${x(age)}" x2="${x(age)}" y1="${top}" y2="${H-bottom}" class="ip-graph-grid"/><text x="${x(age)}" y="${H-bottom+24}" text-anchor="middle">${age}</text>`).join('')}<text x="${W-right}" y="${H-8}" text-anchor="end" class="ip-graph-axis-title">나이 (세)</text>
 ${points.length>1?`<polyline points="${points.map(p=>`${x(p.age)},${y(p.score)}`).join(' ')}" class="ip-graph-line"/>`:''}
 ${points.map((p,i)=>`<line x1="${x(p.age)}" y1="${labels[i].y+36}" x2="${x(p.age)}" y2="${y(p.score)-10}" stroke="#91aab5" stroke-width="1" pointer-events="none"/>`).join('')}
 ${points.map((p,i)=>{const l=labels[i];return `<g class="ip-graph-point ${p.score<0?'is-negative':''}" ${interactive?`data-life-point="${esc(p.id)}" role="button" tabindex="0"`:''} aria-label="${esc(pointLabel(p,i))}"><title>${esc(pointLabel(p,i))}</title><circle cx="${x(p.age)}" cy="${y(p.score)}" r="10"/><rect class="ip-graph-label-box" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="5" fill="#fbfdfe"/><text x="${l.x+l.width/2}" y="${l.y+14}" text-anchor="middle" class="ip-graph-keyword">${esc(l.title)}</text><text x="${l.x+l.width/2}" y="${l.y+30}" text-anchor="middle" class="ip-graph-score">${signed(p.score)}</text></g>`;}).join('')}</svg></div>
 ${!points.length?'<p class="ip-empty">경험의 나이와 만족도를 입력하면 그래프에 표시됩니다.</p>':`<ol class="ip-life-timeline ip-graph-legend">${points.map((p,i)=>`<li>${interactive?`<button type="button" class="ip-graph-experience" data-life-point="${esc(p.id)}">`:'<div class="ip-graph-experience">'}<strong>${i+1}. ${p.age}세 · ${signed(p.score)}점</strong><span>${esc(p.title||'제목 미작성')}</span>${interactive?'</button>':'</div>'}</li>`).join('')}</ol>`}
 ${rows.length>points.length?`<p class="ip-help">나이 또는 만족도가 없는 ${rows.length-points.length}개 경험은 아직 그래프에 표시되지 않습니다.</p>`:''}<p class="ip-help">학생이 직접 기록한 만족도이며 면접 평가 점수가 아닙니다.${interactive?' 점이나 경험 제목을 누르면 상세 내용을 볼 수 있습니다.':''}</p></section>`;
}
