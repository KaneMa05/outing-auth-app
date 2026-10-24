const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {lifeGraphPoints,renderLifeGraph,experienceText}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('interview-life-graph.js','utf8')).toString('base64'));
 const legacy={period:'시기',affiliation:'동아리',situation:'갈등',action:'경청',result:'합의',learning:'협동심'};
 const adapted=experienceText(legacy);
 for(const key of ['period','affiliation','situation','action','result'])assert(adapted.content.includes(legacy[key]));
 assert.equal(adapted.appeal,'협동심');assert.equal(experienceText({...legacy,content:'',appeal:''}).content,'');
 const rows=[
  {id:'high',age:'30',satisfaction:'25',title:'<script>alert(1)</script>'},
  {id:'zero',age:'20',satisfaction:'0'},
  {id:'low',age:'20',satisfaction:'-25'},
  {id:'blank',age:'23',satisfaction:''},
  {id:'missing',age:'24'},
  {id:'invalid',age:'25',satisfaction:'26'},
  {id:'decimal',age:'25',satisfaction:'1.5'},
  {id:'age',age:'',satisfaction:'5'},
 ];
 assert.deepEqual(lifeGraphPoints(rows).map(p=>[p.id,p.score]),[['zero',0],['low',-25],['high',25]]);
 const html=renderLifeGraph(rows,{interactive:true});
 assert.equal((html.match(/<circle /g)||[]).length,3);
 assert(html.includes('cy="65"')&&html.includes('cy="325"'),'Extreme scores stay within the plot');
 assert(html.includes('ip-graph-keyword')&&html.includes('ip-graph-score'));
 assert(html.includes('cx="55"')&&html.includes('cx="735"'),'Youngest and oldest experiences use the full plot width');
 assert(!html.includes('NaN'));
 const single=renderLifeGraph([{id:'single',age:'23',satisfaction:'0'}]);
 assert(single.includes('cx="395"'),'A single age is centered without division by zero');
 const sameAge=renderLifeGraph([{id:'a',age:'23',satisfaction:'0'},{id:'b',age:'23',satisfaction:'5'}]);
 assert.equal((sameAge.match(/cx="395"/g)||[]).length,2);
 assert(html.includes('&lt;script&gt;')&&!html.includes('<script>'),'Stored titles are escaped');
 assert(html.includes('data-life-point="zero"')&&html.includes('tabindex="0"'));
 assert(!renderLifeGraph(rows).includes('data-life-point='),'Admin graph is read-only');
 assert(!renderLifeGraph([]).includes('<circle '));
 console.log('PASS life graph: -25/0/+25, age ordering, same-age points, missing/invalid values, accessible interaction and escaping.');
})().catch(e=>{console.error(e);process.exitCode=1;});
