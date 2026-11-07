const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../extension'),prefix=fs.readFileSync(__dirname+'/dev2-sites.test.cjs','utf8').split('(async()=>{')[0];
const box={require,__dirname,console,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,setImmediate};vm.createContext(box);vm.runInContext(prefix+';globalThis.harness=harness',box);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TEST_CHROME||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const app of ['kavita','komga'])for(const mobile of [false,true]){
  const id=app==='kavita'?1:2,h=await box.harness(mobile,{sites:[{id:app,origin:'https://nas.example:3627',basePath:'/'+app+'/',app}]});
  h.grants.add('https://nas.example/*');h.data.uiLanguage='ja';h.ctx.chrome.runtime.getURL=p=>'https://extension.test/'+p;
  h.ctx.chrome.tabs.sendMessage=async()=>({ok:true,status:{ready:true}});
  const parent={id:'dev',tab:{id},url:h.tabs.get(id).url,frameId:0,documentId:'reader'},child={id:'dev',tab:{id},url:'https://extension.test/ui/embedded-settings.html',frameId:2,documentId:'settings'};
  h.session['tab:'+id]={documentId:'reader',status:{ready:true}};
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1300,height:900},isMobile:mobile,hasTouch:mobile,locale:'ja-JP'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeBinding('sendFixture',async({frame},m)=>h.send(m,frame===page.mainFrame()?parent:child));
  await page.exposeBinding('storageFixture',async(_,operation,key,value)=>{if(operation==='set'){await h.ctx.chrome.storage.local.set(value);return;}if(Array.isArray(key))return Object.fromEntries(key.map(k=>[k,h.data[k]]));return {[key]:h.data[key]};});
  await page.addInitScript(()=>{globalThis.chrome={runtime:{getURL:p=>'https://extension.test/'+p,getManifest:()=>({version:'0.9.6'}),sendMessage:m=>sendFixture(m)},storage:{local:{get:k=>storageFixture('get',k),set:v=>storageFixture('set',null,v)},onChanged:{addListener:()=>{}}},tabs:{getCurrent:async()=>({id:1})}};});
  await page.route('https://extension.test/**',async r=>{const file=path.resolve(root,'.'+new URL(r.request().url()).pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.abort();await r.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});});
  await page.route('https://nas.example:3627/**',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;background:rgb(100,80,50)}app-manga-reader,.v-carousel{display:block;width:100%;height:100%}</style><button id="quick">Settings</button>'+(app==='kavita'?'<app-manga-reader></app-manga-reader>':'<div class="v-carousel"></div>')}));
  await page.goto(parent.url);await page.addScriptTag({path:path.join(root,'content/reader-settings.js')});
  await page.evaluate(()=>document.querySelector('#quick').onclick=()=>__KKGR_READER_SETTINGS__.open());await page.click('#quick');
  await page.waitForSelector('[data-gpu-reader-settings][data-state=ready]',{state:'attached'});let frame=page.frames().find(f=>f.url().startsWith('https://extension.test/ui/embedded-settings.html'));
  assert(frame);await frame.getByRole('button',{name:'オプション',exact:true}).click();
  await frame.locator('[data-motion-value="true"]').click();await page.waitForFunction(()=>true);assert.equal(h.data.config.kavitaPageTurnAnimation,true);
  await frame.locator('[data-fullscreen-value="true"]').click();assert.equal(h.data.config.kavitaAutoFullscreen,true);
  const surfaces=await frame.evaluate(()=>({html:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor}));assert.equal(surfaces.html,'rgba(0, 0, 0, 0)');assert.equal(surfaces.body,'rgba(0, 0, 0, 0)');
  for(const viewport of [{width:600,height:960},{width:840,height:1100},{width:1280,height:800},{width:844,height:390},{width:390,height:844}]){
   await page.setViewportSize(viewport);const element=await frame.frameElement();await page.waitForFunction(({el,w})=>Math.abs(el.getBoundingClientRect().width-(w<600?w:Math.min(820,w-48)-2))<2,{el:element,w:viewport.width});assert(await frame.locator('[data-reader-back]').isVisible());
  }
  await frame.locator('[data-reader-back]').click();await page.waitForSelector('[data-gpu-reader-settings]',{state:'detached'});assert.equal(h.tabs.size,4);
  // Simulate another work in the same SPA document without reloading the bridge.
  const next=app==='kavita'?'https://nas.example:3627/kavita/library/2/series/3/manga/789':'https://nas.example:3627/komga/book/next/read?page=1';h.tabs.get(id).url=next;
  await page.evaluate(url=>history.pushState({},'',url),next);await page.click('#quick');await page.waitForSelector('[data-gpu-reader-settings][data-state=ready]',{state:'attached'});
  frame=page.frames().find(f=>f.url().startsWith('https://extension.test/ui/embedded-settings.html'));await frame.getByRole('button',{name:'オプション',exact:true}).click();assert.equal(await frame.locator('[data-motion-value="true"]').getAttribute('aria-pressed'),'true');
  await frame.locator('[data-motion-value="false"]').click();assert.equal(h.data.config.kavitaPageTurnAnimation,false);await frame.locator('[data-reader-back]').click();await page.waitForSelector('[data-gpu-reader-settings]',{state:'detached'});
  await page.evaluate(()=>document.documentElement.requestFullscreen());await page.evaluate(()=>__KKGR_READER_SETTINGS__.open());await page.waitForSelector('[data-gpu-reader-settings][data-state=ready]',{state:'attached'});frame=page.frames().find(f=>f.url().startsWith('https://extension.test/ui/embedded-settings.html'));await frame.locator('[data-reader-back]').click();await page.waitForSelector('[data-gpu-reader-settings]',{state:'detached'});assert(await page.evaluate(()=>!!document.fullscreenElement));
  await page.evaluate(()=>document.exitFullscreen());assert.deepEqual(errors,[]);await page.close();console.log('PASS embedded settings',app,mobile?'touch':'desktop','save, transparency, resize/Fold, close, SPA reopen, fullscreen');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
