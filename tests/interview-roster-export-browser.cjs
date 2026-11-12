// Local synthetic records only; no production accounts or database requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/W11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const root=path.resolve(__dirname,'..'),output=path.join(root,'output/interview-roster');fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/qa'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/interview-prep.css"><main id="host"></main>');}
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)||!['.js','.mjs','.css'].includes(path.extname(file))||!fs.existsSync(file)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type',path.extname(file)==='.css'?'text/css':'text/javascript');res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage({acceptDownloads:true,serviceWorkers:'block',viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/qa');
    await page.evaluate(async()=>{
      const {mountAdmin}=await import('/interview-prep-ui.js');
      window.calls=[];window.mode='normal';
      const members=Array.from({length:65},(_,i)=>({id:'qa-'+i,name:'가상 수강생 '+i,track:i%2?'기관':'공채',exam_number:'000'+i,access_product:i%2?'aptitude_only':'interview_package',enabled:true,notes:[]}));
      const request=async(action,body={})=>{
        calls.push({action,body});
        if(action==='admin_catalog')return {topics:[],counts:{},enabled:true};
        if(action==='admin_applications')return {applications:[],summary:{students:65,pending:0,approved:65,rejected:0}};
        if(action==='admin_members'){
          if(mode==='failure'&&body.page===1)throw Error('unauthorized');
          if(mode==='empty')return {members:[]};
          if(body.search)return {members:[]};
          return {members:members.slice(body.page*30,(body.page+1)*30)};
        }
        throw Error(action);
      };
      window.view=await mountAdmin(document.querySelector('#host'),{initialSection:'applications',request,canWrite:false});
    });
    const downloadButton=()=>page.getByRole('button',{name:'수강 명단 엑셀 다운로드',exact:true});
    assert.equal(await downloadButton().isEnabled(),true,'Read permission is enough to export');
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('roster-export.mjs'))),false,'Export loads only on click');
    await page.evaluate(()=>{calls=[];});
    const [download]=await Promise.all([page.waitForEvent('download'),downloadButton().click()]);
    assert.match(download.suggestedFilename(),/^면접반_수강명단_\d{4}-\d{2}-\d{2}\.xlsx$/);
    await download.saveAs(path.join(output,'synthetic-roster.xlsx'));
    await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('65명의 엑셀'));
    assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.body)),[0,1,2].map(page=>({registeredOnly:true,page})));
    await page.screenshot({path:path.join(output,'applications-desktop.png'),fullPage:true});
    await page.locator('[data-filter] [name=search]').fill('검색 결과 없음');await page.locator('[data-filter] button').click();
    await page.getByText('신청 내역이 없습니다.',{exact:true}).waitFor();
    await page.evaluate(()=>{calls=[];});
    const [allDownload]=await Promise.all([page.waitForEvent('download'),downloadButton().click()]);
    assert.equal(await allDownload.failure(),null);
    await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('65명의 엑셀'));
    assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.body)),[0,1,2].map(page=>({registeredOnly:true,page})));
    let downloads=0;page.on('download',()=>downloads++);
    await page.evaluate(()=>{mode='failure';});await downloadButton().click();
    await page.getByText('로그인이 만료되었습니다. 다시 로그인해주세요.',{exact:true}).waitFor();
    assert.equal(downloads,0,'A failed second page must never download a partial roster');assert.equal(await downloadButton().isEnabled(),true);
    await page.evaluate(()=>{mode='empty';});await downloadButton().click();
    await page.getByText('다운로드할 등록 수강생이 없습니다.',{exact:true}).waitFor();assert.equal(downloads,0);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await downloadButton().isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(output,'applications-mobile.png'),fullPage:true});
    await page.evaluate(()=>view.openSection('members'));
    assert.equal(await downloadButton().count(),0,'Only the application approval tab has a download button');
    assert.deepEqual(errors,[]);
    console.log('PASS browser: application approval tab only, read-only access, 65-row XLSX download, unfiltered full roster, lazy loading, failure/empty recovery, desktop/mobile layout.');
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
