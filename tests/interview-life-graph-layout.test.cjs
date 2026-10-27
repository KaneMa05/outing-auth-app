const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {renderLifeGraph}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('interview-life-graph.js','utf8')).toString('base64'));
 for(const rows of [[],[{id:'one',age:20,satisfaction:25,title:'단일 경험'}],Array.from({length:15},(_,i)=>({id:'same-'+i,age:20,satisfaction:5,title:'같은 나이 경험 '+i})),Array.from({length:30},(_,i)=>({id:'near-'+i,age:20+Math.floor(i/10),satisfaction:25-i%10,title:'가까운 나이의 긴 키워드'}))]){
  const html=renderLifeGraph(rows,{interactive:true});
  const boxes=[...html.matchAll(/class="ip-graph-label-box" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map(m=>m.slice(1).map(Number));
  assert.equal(boxes.length,rows.length);
  const height=Number(html.match(/viewBox="0 0 760 ([^"]+)"/)[1]);
  for(let i=0;i<boxes.length;i++){
   const [x,y,w,h]=boxes[i];assert(x>=0&&x+w<=760&&y>=32&&y+h<=height);
   for(let j=0;j<i;j++){const [a,b,c,d]=boxes[j];assert(!(x<a+c&&x+w>a&&y<b+d&&y+h>b),'keywords must not overlap');}
  }
  for(const row of rows)assert(html.includes('data-life-point="'+row.id+'"'));
  if(rows.length===15){const circles=[...html.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)].map(m=>m.slice(1).join(','));assert.equal(new Set(circles).size,1,'identical age/score remains at the same true coordinate');}
 }
 assert(!renderLifeGraph([{age:20,satisfaction:1,title:'<script>test</script>'}]).includes('<script>'));
 console.log('PASS life graph layout: duplicate ages/scores, dense neighboring ages, bounds, exact point coordinates, interaction and escaping');
})().catch(e=>{console.error(e);process.exitCode=1;});
