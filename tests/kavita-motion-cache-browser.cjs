// Real Reader Core/cache/motion and GPU filters. Only Kavita HTTP and the Worker
// transport are fixtures; a delayed native binding exposes the cache handoff race.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../extension');
const foundation=['ui/parameter-schema.js','ui/package-metadata.js','ui/analysis-contract.js','ui/module-contract.js','ui/developer-diagnostics.js','gpu/processing-client.js','gpu/main-runtime.js','gpu/cpu-analysis.js','gpu/host.js','gpu/lohalo-jr.js','gpu/nohalo-jr.js','gpu/usm.js','gpu/reader-adapter.js','ui/parameter-editor.js','ui/candidate-policy.js','ui/i18n.js','ui/diagnostics-view.js','ui/panel.js','ui/komga-pages.js','ui/kavita-pages.js','ui/cache-state.js','ui/hud-model.js','ui/host-display.js'];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TEST_CHROME||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const reports=[];
 try{for(const mode of ['speed','worker'])for(const layout of ['single','double','manga'])for(const direction of ['rtl','ltr'])for(const full of [true,false]){
  if(process.env.GPUIE_MOTION_MODE&&process.env.GPUIE_MOTION_MODE!==mode||process.env.GPUIE_MOTION_LAYOUT&&process.env.GPUIE_MOTION_LAYOUT!==layout||process.env.GPUIE_MOTION_DIRECTION&&process.env.GPUIE_MOTION_DIRECTION!==direction||process.env.GPUIE_MOTION_FULL&&process.env.GPUIE_MOTION_FULL!==String(full))continue;
  const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const dimensions=Array.from({length:28},(_,pageNumber)=>({pageNumber,width:240,height:320,isWide:false})),pairs={};
  for(let n=0;n<28;n++)pairs[n]=n;
  for(let n=1;n<26;n+=2)pairs[n+1]=n;
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=320;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,240,320);return c.toDataURL().split(',')[1];}),'base64');
  await page.route('https://reader.test/**',r=>{
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('chapter-info'))return r.fulfill({json:{pages:28,pageDimensions:dimensions,doublePairs:pairs}});
   if(u.pathname.endsWith('/image'))return r.fulfill({body:png,contentType:'image/png'});
   return r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#222}app-manga-reader{display:block}.image-container{display:flex;width:1000px;height:600px}img.full-height{width:500px;height:600px;object-fit:scale-down;flex-shrink:0}</style><app-manga-reader><div class="pagination-area"><div class="left"></div><div class="right"></div></div><button aria-describedby="reading-direction"><i></i></button></app-manga-reader>'});
  });
  const csp=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_security_policy.sandbox;
  await page.route('https://extension.test/**',r=>{const file=path.resolve(root,'.'+new URL(r.request().url()).pathname);assert(file.startsWith(root+path.sep));return r.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':'text/html',headers:file.endsWith('worker-frame.html')?{'Content-Security-Policy':csp}:{}});});
  await page.goto('https://reader.test/kavita/manga/42');
  await page.evaluate(({mode,layout,direction})=>{
   localStorage.setItem('kavita-user',JSON.stringify({token:'fixture-token'}));
   document.querySelector('[aria-describedby] i').className=direction==='rtl'?'fa-angle-double-left':'fa-angle-double-right';
   const renderer=document.createElement(layout==='single'?'app-single-renderer':layout==='double'?'app-double-renderer':'app-double-no-cover-renderer');
   renderer.innerHTML='<div class="image-container full-height"></div>';document.querySelector('app-manga-reader').append(renderer);
   globalThis.__KKGR_PLATFORM__={settings:{enabled:true,hud:false,renderer:'lohalo',processingMode:mode,outputFormat:'png',processingTimeoutMs:60000,filters:{pre:null,post:null},filterCatalog:[],filterParameters:{pre:{},post:{}},rendererOrder:['lohalo','nohalo'],disabledRenderers:[],quick:{visible:[],order:[]},decodedForward:8,decodedBack:8,kavitaPageTurnAnimation:true},change:()=>Promise.resolve()};
   globalThis.showSpread=async(n,hold=null)=>{
    const container=document.querySelector('.image-container'),native=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
    const images=await Promise.all(Array.from({length:layout==='single'?1:2},async(_,index)=>{
     const number=n+index,img=new Image();img.className='full-height';img.src='https://reader.test/kavita/api/reader/image?chapterId=42&page='+number;
     await img.decode();
     if(number===hold)Object.defineProperty(img,'src',{get(){return native.get.call(this)},set(url){if(this.isConnected&&url.startsWith('blob:'))setTimeout(()=>native.set.call(this,url),50);else native.set.call(this,url);}});
     return img;
    }));container.replaceChildren(...images);
   };
   globalThis.pixel=img=>{if(!img.complete||!img.naturalWidth)return null;const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.drawImage(img,0,0,1,1);return [...x.getImageData(0,0,1,1).data];};
   // Observe real borrowing/revocation without changing cache ownership.
   globalThis.liveLeases=new Map();globalThis.badRevokes=[];const revoke=URL.revokeObjectURL.bind(URL);
   URL.revokeObjectURL=url=>{if(liveLeases.has(url))badRevokes.push(url);return revoke(url);};
  },{mode,layout,direction});
  await page.addScriptTag({path:path.join(root,'content/kavita-page-motion.js')});
  await page.evaluate(()=>{const motion=__KKGR_KAVITA_MOTION__;globalThis.__KKGR_KAVITA_MOTION__={...motion,create(adapter){const acquire=adapter.acquire;return globalThis.motion=motion.create({...adapter,acquire(url,bytes){const release=acquire(url,bytes);liveLeases.set(url,(liveLeases.get(url)||0)+1);let returned=false;return ()=>{if(returned)return;returned=true;const count=liveLeases.get(url)-1;if(count)liveLeases.set(url,count);else liveLeases.delete(url);release();};}});}};});
  for(const file of foundation)await page.addScriptTag({path:path.join(root,file)});
  const filterCode=fs.readFileSync(path.join(root,'modules/defaults/Monochrome-Line-Color-Filter-1.0.0.js'),'utf8');
  await page.addScriptTag({content:filterCode});
  await page.evaluate(({mode,filterCode})=>{
   const d=__KKGR_MODULES__.find(x=>x.id==='sosboy-san.monochrome-line-color'),metadata=__KKGR_MODULE_CONTRACT__.validatePublic(d),c=__KKGR_PLATFORM__.settings;
   c.filters.pre=d.id;c.filterCatalog=[metadata];c.filterParameters.pre={[d.id]:{mode:'force',lineColor:'#0000FF',lineStrength:100}};
   __KKGR_BUILTIN_FILTER_MODULES__={...__KKGR_BUILTIN_FILTER_MODULES__,[d.id]:d};__KKGR_FILTER_MODULES__={[d.id]:d};
   __KKGR_MODULE_RUNTIME__={mode,ready:true,allowed:true,active:true,needsUserScripts:false,errors:[],slots:{renderer:'lohalo',pre:d.id,post:null}};
   if(mode==='worker'){
    globalThis.__KKGR_PACKAGE_SOURCES__={[d.id]:{id:d.id,kind:'filter',metadata,code:filterCode,stamp:'fixture'}};
    const frame=document.createElement('iframe'),ports=[];let ready=false;frame.hidden=true;
    addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.data?.type==='KKGR_WORKER_FRAME_READY'){ready=true;for(const port of ports.splice(0))frame.contentWindow.postMessage({type:'KKGR_WORKER_CONNECT'},'*',[port]);}else if(e.source===window&&e.origin===location.origin&&e.data?.channel==='kkgr-processing-connect'&&e.ports.length===1){const port=e.ports[0];if(ready)frame.contentWindow.postMessage({type:'KKGR_WORKER_CONNECT'},'*',[port]);else ports.push(port);}});
    frame.src='https://extension.test/gpu/worker-frame.html';document.documentElement.append(frame);
   }
   const processing=__KKGR_PROCESSING__;globalThis.jobs=[];globalThis.__KKGR_PROCESSING__={...processing,start(...args){jobs.push({role:args[9]?.role,source:args[1]?.src});return processing.start(...args);}};
  },{mode,filterCode});
  await page.addScriptTag({path:process.env.GPUIE_MOTION_CORE_FILE||path.join(root,'content/reader-core.js')});
  if(full)await page.evaluate(()=>document.documentElement.requestFullscreen());
  const start=layout==='double'?11:12,step=layout==='single'?1:2;
  await page.evaluate(async n=>{await showSpread(n);__crispImages.sweep();__KKGR_CORE__.apply(__KKGR_PLATFORM__.settings);},start);
  const ready=async()=>{await page.waitForFunction(()=>{const s=__crispImages.kavitaCacheState();return s?.near.filter(e=>e.offset>0).length===8&&s.near.filter(e=>e.offset<0).length===8&&s.near.every(e=>e.decoded)&&[...document.querySelectorAll('.image-container img')].every(i=>i.src.startsWith('blob:')&&__crispImages.state(i)?.presentation?.phase==='ready'&&!__crispImages.state(i)?.busy);},{},{timeout:60000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  await ready();
  for(const n of [start+step,start]){
   const before=await page.evaluate(()=>({starts:motion.status().starts,jobs:jobs.length}));
   await page.evaluate(()=>{globalThis.frames=[];globalThis.sampling=true;function sample(){const layer=document.querySelector('[data-gpuie-motion]');if(layer)frames.push([...layer.querySelectorAll('img')].map(i=>({url:i.src,pixel:pixel(i)})));if(sampling)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
   const entered=await page.evaluate(async({n,hold})=>{await showSpread(n,hold);await Promise.resolve();await Promise.resolve();return motion.status();},{n,hold:n===start+step?n+step-1:n});
   if(n===start+step){
    assert.equal(entered.waiting,false,'An unseen 8/8-ready spread must not lose its decoded image and wait for the native binding');
    assert.equal(entered.running,true,'Use the prepared unseen spread immediately');
   }
   await page.waitForFunction(count=>motion.status().starts===count+1,before.starts,{timeout:5000});
   const frozen=await page.evaluate(()=>[...document.querySelectorAll('[data-gpuie-motion] img')].map(i=>i.src));
   assert.equal(frozen.length,step*2);assert(frozen.every(u=>u.startsWith('blob:')),'Borrow prepared images, never the native source');
   await page.waitForFunction(()=>!motion.status().running&&!motion.status().waiting,{},{timeout:5000});
   const observed=await page.evaluate(({before})=>{sampling=false;return {frames,jobs:jobs.slice(before.jobs),native:[...document.querySelectorAll('.image-container img')].map(i=>pixel(i)),badRevokes};},{before});
   assert(observed.frames.some(frame=>frame.length===step*2&&frame.every(image=>JSON.stringify(image.pixel)==='[0,0,255,255]')),'Sample a complete processed spread during the slide');
   for(const frame of observed.frames)for(const image of frame){assert(image.url.startsWith('blob:'));assert(frozen.includes(image.url),'The slide keeps its borrowed URLs');if(image.pixel)assert.deepEqual(image.pixel,[0,0,255,255]);}
   for(const color of observed.native)assert.deepEqual(color,[0,0,255,255]);
   assert(!observed.jobs.some(j=>j.role!=='ahead'),'No image processing for the displayed pages');assert.deepEqual(observed.badRevokes,[]);
   await ready();
  }
  if(mode==='worker'&&layout==='double'&&direction==='rtl'&&full){
   // A second native turn interrupts the borrowed presentation; the latest
   // prepared spread wins without keeping the old layer or revoking a loan.
   const count=await page.evaluate(()=>motion.status().starts);
   await page.evaluate(n=>showSpread(n,n),start+step);
   await page.waitForFunction(count=>motion.status().starts===count+1,count,{timeout:5000});
   await page.evaluate(n=>showSpread(n,n),start+step*2);
   await page.waitForFunction(()=>!motion.status().running&&!motion.status().waiting&&[...document.querySelectorAll('.image-container img')].every(i=>i.src.startsWith('blob:')&&__crispImages.state(i)?.presentation?.phase==='ready'),{},{timeout:5000});
   assert.equal(await page.locator('[data-gpuie-motion]').count(),0);
   for(const color of await page.evaluate(()=>[...document.querySelectorAll('.image-container img')].map(pixel)))assert.deepEqual(color,[0,0,255,255]);
   assert.deepEqual(await page.evaluate(()=>badRevokes),[]);await ready();
  }
  // OFF during a slide cancels presentation and releases every borrowed URL.
  const count=await page.evaluate(()=>motion.status().starts);await page.evaluate(n=>showSpread(n,n),start+step);
  await page.waitForFunction(count=>motion.status().starts===count+1,count,{timeout:5000});
  await page.evaluate(()=>{const c=__KKGR_PLATFORM__.settings;c.kavitaPageTurnAnimation=false;__KKGR_CORE__.apply(c);});
  assert.equal(await page.locator('[data-gpuie-motion]').count(),0);assert.equal(await page.evaluate(()=>liveLeases.size),0);
  await page.evaluate(()=>__KKGR_CORE__.stop());assert.deepEqual(await page.evaluate(()=>badRevokes),[]);assert.deepEqual(errors,[]);
  reports.push({mode,layout,direction,full});await page.close();console.log('PASS cached motion',mode,layout,direction,full?'fullscreen':'normal','blue frames, borrowed URLs, no foreground recompute, OFF cleanup');
 }
 if(process.env.GPUIE_MOTION_REPORT)fs.writeFileSync(process.env.GPUIE_MOTION_REPORT,JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
