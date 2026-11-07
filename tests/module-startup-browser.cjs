// Production HELLO -> foundation -> metadata candidates -> readiness -> actual Reader Core.
// Chrome APIs are mocked; no fake Core or preloaded GPU foundation is used.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../extension');
const prefix=fs.readFileSync(path.join(__dirname,'dev2-sites.test.cjs'),'utf8').split('(async()=>{')[0],box={require,__dirname,console,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,setImmediate};vm.createContext(box);vm.runInContext(prefix+';globalThis.harness=harness',box);
const code=fs.readFileSync(path.resolve(__dirname,'../reference-packages/Lanczos3-1.0.0.txt'),'utf8');
function metadata(h){const c=vm.createContext({URL,TextEncoder});for(const f of ['package-metadata','parameter-schema','analysis-contract','module-contract'])vm.runInContext(fs.readFileSync(path.join(root,'ui',f+'.js'),'utf8'),c);vm.runInContext(code,c);return vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(c.__KKGR_MODULE_CONTRACT__.validatePublic(c.__KKGR_MODULES__[0])))+')',h.ctx);}
(async()=>{const browser=await chromium.launch({executablePath:process.env.TEST_CHROME||'/usr/bin/chromium',args:['--no-sandbox']});
try{for(const app of ['kavita','komga'])for(const mobile of [false,true])for(const mode of ['worker','speed']){
 const h=await box.harness(mobile,{sites:[{id:'reader',origin:'https://nas.example:3627',basePath:'/'+app+'/',app}]});h.grants.add('https://nas.example/*');h.ctx.chrome.tabs.query=async()=>[];
 const url='https://nas.example:3627/'+app+(app==='kavita'?'/library/7/series/5056/manga/45211?incognitoMode=false':'/book/abc/read?page=1');h.tabs.get(1).url=url;
 const change=async m=>{const r=await h.send(m);assert(!r.error,r.error);return r;},d=metadata(h);
 await change({type:'ADD_PACKAGE',metadata:d,code});await change({type:'SET_RENDERERS',disabledRenderers:[]});await change({type:'SET_RENDERER',renderer:d.id});await change({type:'SET_PROCESSING_MODE',processingMode:mode});
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1300,height:900},isMobile:mobile,hasTouch:mobile});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://nas.example:3627/**',r=>r.fulfill({contentType:'text/html',body:app==='kavita'?'<app-manga-reader></app-manga-reader>':'<div class="reader"></div>'}));await page.goto(url);
 let apiCalls=0,failFile=null;
 h.ctx.chrome.userScripts={getScripts:async()=>[],execute:async args=>{apiCalls++;for(const script of args.js)await page.addScriptTag({content:script.code});return [{result:null}];}};
 h.ctx.chrome.scripting.executeScript=async args=>{if(args.files){for(const file of args.files){if(file===failFile){failFile=null;throw Error('Simulated startup interruption');}await page.addScriptTag({path:path.join(root,file)});}return [{result:null}];}return [{result:await page.evaluate(({func,args})=>(0,eval)('('+func+')')(...args),{func:args.func.toString(),args:JSON.parse(JSON.stringify(args.args||[]))})}];};
 const sender={id:'dev',tab:{id:1},frameId:0,documentId:'reader',url},hello=()=>h.send({type:'HELLO'},sender);
 const check=async selected=>{const result=await hello();assert(!result.error,result.error);assert(result.moduleRuntime.ready);assert(await page.evaluate(()=>!!globalThis.__KKGR_CORE__));assert.deepEqual(await page.evaluate(()=>__KKGR_CORE__.ids().filter(id=>id!=='browser').sort()),['lohalo','nohalo',...(selected?[d.id]:[])].sort());await page.evaluate(c=>__KKGR_CORE__.apply(c),JSON.parse(JSON.stringify({...result,rendererCatalog:(await h.send({type:'GET_SAVED'})).config.rendererCatalog})));assert.equal(await page.evaluate(()=>__KKGR_CORE__.status().renderer),selected?d.id:'browser');assert.deepEqual(errors,[]);};
 // Cold boot and an unchanged reconnection must both retain the complete registry.
 await check(true);const prepared=apiCalls;assert.equal(prepared,mode==='worker'?0:1);await check(true);assert.equal(apiCalls,prepared);
 // Interrupt after preparation, change the catalog, then retry from partial startup.
 await page.reload();sender.documentId='retry';failFile='content/providers-ready.js';assert.match((await hello()).error,/Simulated startup interruption/);await change({type:'DELETE_PACKAGE',packageId:d.id});await check(false);
 // Hot registration/removal must still reconcile the real Core registry.
 await change({type:'ADD_PACKAGE',metadata:d,code});await change({type:'SET_RENDERERS',disabledRenderers:[]});await change({type:'SET_RENDERER',renderer:d.id});await check(true);await change({type:'DELETE_PACKAGE',packageId:d.id});await check(false);
 // A foundation file failure must be reported before publishing ready, and be retryable.
 await page.reload();sender.documentId='foundation';failFile='gpu/reader-adapter.js';assert.match((await hello()).error,/GPU provider initialization failed/);assert.equal(await page.evaluate(()=>!!globalThis.__KKGR_DEV4_1_4_READY__),false);await check(false);
 // An old client left by an interrupted extension update must require a tab reload.
 await page.reload();sender.documentId='old-client';await page.evaluate(()=>{globalThis.__KKGR_PROCESSING__={moduleRuntimeVersion:1,cancelAll(){}};});assert.match((await hello()).error,/再読み込み/);assert.equal(await page.evaluate(()=>!!globalThis.__KKGR_CORE__),false);
 // A readiness marker without Core is an incomplete startup, not a completed one.
 await page.reload();sender.documentId='marker';await page.evaluate(()=>Object.defineProperty(globalThis,'__KKGR_DEV4_1_4_READY__',{value:true}));await check(false);
 assert.equal(apiCalls,mode==='worker'?0:3);assert.deepEqual(errors,[]);await page.close();console.log('PASS production startup/retry/hot catalog/foundation failure/partial marker '+app+' '+(mobile?'touch':'desktop')+' '+mode);
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
