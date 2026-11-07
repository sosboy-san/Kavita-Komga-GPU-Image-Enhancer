// Real MAIN/ISOLATED worlds, sandbox CSP and WebGL/Worker. Extension APIs use the real SW harness.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{chromium}=require('playwright');
const project=path.resolve(__dirname,'..'),projectRoot=process.env.GPUIE_MODULE_ROOT||project,root=path.join(projectRoot,'extension'),baseline=process.env.GPUIE_MODULE_BASELINE==='1',runs=Number(process.env.GPUIE_MODULE_RUNS)||8;
const prefix=fs.readFileSync(path.join(projectRoot,'tests/dev2-sites.test.cjs'),'utf8').split('(async()=>{')[0],box={require:createRequire(path.join(projectRoot,'tests/dev2-sites.test.cjs')),__dirname:path.join(projectRoot,'tests'),console,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,setImmediate};vm.createContext(box);vm.runInContext(prefix+';globalThis.harness=harness',box);
const source=id=>`globalThis.moduleEvaluations??={};globalThis.moduleEvaluations['${id}']=(globalThis.moduleEvaluations['${id}']||0)+1;(globalThis.__KKGR_MODULES__??=[]).push({moduleApiVersion:1,executionApiVersion:1,id:'${id}',kind:'filter',name:'Probe',version:'1.0.0',implementationRevision:'probe',parameters:[],supportedStages:['pre','post'],translations:{en:{name:'Probe',description:'Probe',readme:'Probe',labels:{}}},create(){globalThis.moduleCallbacks??={};moduleCallbacks.create=(moduleCallbacks.create||0)+1;return {prepare(){moduleCallbacks.prepare=(moduleCallbacks.prepare||0)+1;return {supported:true}},execute(){moduleCallbacks.execute=(moduleCallbacks.execute||0)+1;return {kind:'passthrough'}},dispose(){moduleCallbacks.dispose=(moduleCallbacks.dispose||0)+1}}}});`;
function metadata(code){const c=vm.createContext({URL,TextEncoder});for(const f of ['package-metadata','parameter-schema','analysis-contract','module-contract'])vm.runInContext(fs.readFileSync(path.join(root,'ui',f+'.js'),'utf8'),c);vm.runInContext(code,c);return c.__KKGR_MODULE_CONTRACT__.validatePublic(c.__KKGR_MODULES__[0]);}
(async()=>{const browser=await chromium.launch({executablePath:process.env.TEST_CHROME||'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const reports=[];
try{for(const mobile of [false,true]){
 const h=await box.harness(mobile,{sites:[{id:'k',origin:'https://nas.example:3627',basePath:'/kavita/',app:'kavita'}]});h.grants.add('https://nas.example/*');h.ctx.chrome.tabs.query=async()=>[];
 for(const id of ['probe.selected','probe.unselected']){const code=source(id);assert((await h.send({type:'ADD_PACKAGE',metadata:metadata(code),code})).ok);}
 const paperCode=fs.readFileSync(path.join(projectRoot,'reference-packages/Paper-Restoration-1.0.0.txt'),'utf8'),paper=metadata(paperCode);
 if(!(await h.send({type:'GET_SAVED'})).config.filterCatalog.some(d=>(d.packageId||d.id)===paper.id)){const added=await h.send({type:'ADD_PACKAGE',metadata:vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(paper))+')',h.ctx),code:paperCode});assert(added.ok,added.error);}
 const change=async m=>{const r=await h.send(m);assert(!r.error,r.error);return r;};
 await change({type:'SET_FILTER_CANDIDATES',filterCandidates:{pre:[paper.id],post:['probe.selected']}});await change({type:'SET_FILTER',stage:'pre',filterId:paper.id});await change({type:'SET_FILTER',stage:'post',filterId:'probe.selected'});await change({type:'SET_RENDERER',renderer:'lohalo'});
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1300,height:900},isMobile:mobile,hasTouch:mobile});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://nas.example:3627/**',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><app-manga-reader></app-manga-reader>'}));
 const csp=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_security_policy.sandbox;
 await page.route('https://extension.test/**',r=>{const file=path.resolve(root,'.'+new URL(r.request().url()).pathname);assert(file.startsWith(root+path.sep));return r.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':'text/html',headers:file.endsWith('worker-frame.html')?{'Content-Security-Policy':csp}:{}});});
 await page.goto(h.tabs.get(1).url);
 // Install MAIN platform and the same packaged GPU foundation as hello().
 await page.addScriptTag({path:path.join(root,'content/main.js')});
 for(const f of ['ui/package-metadata.js','ui/parameter-schema.js','ui/analysis-contract.js','ui/module-contract.js','ui/developer-diagnostics.js','gpu/processing-client.js','gpu/main-runtime.js','gpu/cpu-analysis.js','gpu/host.js','gpu/lohalo-jr.js','gpu/nohalo-jr.js',...(baseline?['gpu/usm.js']:[]),'gpu/reader-adapter.js'])await page.addScriptTag({path:path.join(root,f)});
 await page.evaluate(()=>{globalThis.__KKGR_CORE__={syncRenderers(){},syncFilters(){__KKGR_PROCESSING__.cancelAll()},ids:()=>[],apply(){},stop(){globalThis.stoppedReaders=(globalThis.stoppedReaders||0)+1},status:()=>({site:'KAVITA'})};globalThis.__KKGR_RENDERER_CATALOG__=[];globalThis.__KKGR_MODULE_STAMPS__={};});
 let apiCalls=0,revoked=false;
 h.ctx.chrome.userScripts={getScripts:async()=>{if(revoked)throw Error('User scripts disabled');return [];},execute:async args=>{apiCalls++;for(const script of args.js)await page.addScriptTag({content:script.code});return [{result:null}];}};
 h.ctx.chrome.scripting.executeScript=async args=>{if(args.files){for(const f of args.files)await page.addScriptTag({path:path.join(root,f)});return [{result:null}];}return [{result:await page.evaluate(({func,args})=>(0,eval)('('+func+')')(...args),{func:args.func.toString(),args:JSON.parse(JSON.stringify(args.args||[]))})}];};
 const target={tabId:1,documentIds:['reader']},sender={id:'dev',tab:{id:1},documentId:'reader',frameId:0,url:h.tabs.get(1).url};
 let runtime,cdp,isolated,authorizationGate;
 async function sync(){runtime=await h.ctx.syncRuntimeModules(target);const c=(await h.send({type:'GET_SAVED'})).config;await page.evaluate(c=>Object.assign(__KKGR_PLATFORM__.settings,c),JSON.parse(JSON.stringify(c)));if(cdp)await cdp.send('Runtime.evaluate',{contextId:isolated,awaitPromise:true,expression:'new Promise(resolve=>globalThis.bridgeRuntimeListener({type:"APPLY",config:'+JSON.stringify({...c,allowed:true,moduleRuntime:runtime})+'},{},resolve))'});}
 console.log('Stage: prepare metadata',mobile);await sync();console.log('Stage: metadata ready',mobile);if(!baseline){assert.equal(apiCalls,0);assert.equal(await page.evaluate(()=>Object.keys(globalThis.moduleEvaluations||{}).length),0);}
 // The actual bridge runs in a Chromium isolated world. Only chrome.* is mocked.
 cdp=await context.newCDPSession(page);const tree=await cdp.send('Page.getFrameTree');({executionContextId:isolated}=await cdp.send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'gpuie-module-test'}));
 await cdp.send('Runtime.enable');
 await cdp.send('Runtime.addBinding',{name:'moduleChromeMessage',executionContextId:isolated});
 cdp.on('Runtime.bindingCalled',async e=>{if(e.name!=='moduleChromeMessage')return;const {id,message}=JSON.parse(e.payload);let result;try{if(message.type==='HELLO'){result={...(await h.send({type:'GET_SAVED'})).config,allowed:true,moduleRuntime:runtime};}else if(message.type==='STATUS')result={ok:true};else{if(message.type==='AUTHORIZE_MODULE_JOB'&&authorizationGate){const gate=authorizationGate;authorizationGate=null;gate.started();await gate.release;result=await h.send(message,sender);gate.checked?.(result);if(gate.deliver)await gate.deliver;}else result=await h.send(message,sender);}}catch(error){result={error:String(error.message)}}try{await cdp.send('Runtime.evaluate',{contextId:isolated,expression:'globalThis.resolveChrome('+JSON.stringify(id)+','+JSON.stringify(result)+')'});}catch{}});
 await cdp.send('Runtime.evaluate',{contextId:isolated,expression:`(()=>{let serial=0;const pending=new Map();globalThis.resolveChrome=(id,r)=>{pending.get(id)?.(r);pending.delete(id)};globalThis.chrome={storage:{local:{get:async()=>({})},onChanged:{addListener(){}}},runtime:{id:'dev',getURL:p=>'https://extension.test/'+p,sendMessage:m=>new Promise(resolve=>{const id=++serial;pending.set(id,resolve);moduleChromeMessage(JSON.stringify({id,message:m}))}),onMessage:{addListener:f=>globalThis.bridgeRuntimeListener=f}}}})()`});
 await cdp.send('Runtime.evaluate',{contextId:isolated,expression:fs.readFileSync(path.join(root,'content/bridge.js'),'utf8')});
 console.log('Stage: bridge installed',mobile);await page.waitForFunction(()=>__KKGR_PLATFORM__.settings.filters?.post==='probe.selected');
 await page.evaluate(()=>{const source=document.createElement('canvas');source.width=768;source.height=1024;const ctx=source.getContext('2d');ctx.fillStyle='#d9c595';ctx.fillRect(0,0,768,1024);ctx.fillStyle='#23313e';for(let i=0;i<64;i++)ctx.fillRect(i*13%768,i*47%1024,8,80);globalThis.benchSource=source;});
 const digest=async blob=>page.evaluate(async blobData=>{const blob=new Blob([Uint8Array.from(blobData)],{type:'image/png'}),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();let hash=2166136261;for(const n of ctx.getImageData(0,0,canvas.width,canvas.height).data)hash=Math.imul(hash^n,16777619);return (hash>>>0).toString(16)},Array.from(blob));
 for(const mode of ['worker','speed']){console.log('Stage: benchmark',mobile,mode);
  if(mode==='speed'){await change({type:'SET_PROCESSING_MODE',processingMode:mode});await sync();}
  const result=await page.evaluate(async runs=>{const durations=[];let last;for(let i=0;i<runs;i++){const start=performance.now();last=await __KKGR_PROCESSING__.start('lohalo',benchSource,768,1024,512,683,'image/png',__KKGR_PLATFORM__.settings);if(i>=2)durations.push(performance.now()-start);}return {durations,bytes:Array.from(new Uint8Array(await last.arrayBuffer())),callbacks:globalThis.moduleCallbacks||{},evaluations:globalThis.moduleEvaluations||{},isolated:__KKGR_GPU_LAST_JOB__.isolated};},runs);
  const hash=await digest(result.bytes);reports.push({baseline,mobile,mode,hash,bytes:result.bytes.length,durations:result.durations,apiCalls,callbacks:result.callbacks,evaluations:result.evaluations});assert.equal(result.isolated,mode==='worker');
  if(!baseline){if(mode==='worker'){assert.equal(apiCalls,0);assert.equal(result.evaluations['probe.selected'],undefined);}else{assert.equal(apiCalls,1);assert.equal(result.evaluations['probe.selected'],1);assert.equal(result.evaluations['probe.unselected'],undefined);assert(result.callbacks.execute>=runs);}}
  if(!baseline){
   // Core's selected provider and the settings echo can change at different times.
   // A valid job must render identically even when the unused settings.renderer is stale.
   const consistent=await page.evaluate(async()=>{const settings={...__KKGR_PLATFORM__.settings,renderer:'nohalo'};const blob=await __KKGR_PROCESSING__.start('lohalo',benchSource,768,1024,512,683,'image/png',settings);return {bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),id:__KKGR_GPU_LAST_JOB__.id};});
   assert.equal(consistent.id,'lohalo');assert.equal(await digest(consistent.bytes),hash,'A delayed settings echo must not cancel the selected renderer');
   const stale=await page.evaluate(()=>__KKGR_PROCESSING__.start('nohalo',benchSource,768,1024,512,683,'image/png',__KKGR_PLATFORM__.settings).then(()=>({ok:true}),e=>({code:e.code})));
   assert.equal(stale.code,'ANALYSIS_CANCELLED','A fresh settings mirror must not authorize a stale provider');
  }
 }
 if(!baseline){
  // A delayed denial for the previous mode must not revoke the newly prepared mode.
  let releaseAuthorization,startedAuthorization;
  const started=new Promise(resolve=>{startedAuthorization=resolve;});
  authorizationGate={started:startedAuthorization,release:new Promise(resolve=>{releaseAuthorization=resolve;})};
  await page.evaluate(()=>{globalThis.staleModuleJob=__KKGR_PROCESSING__.start('lohalo',benchSource,768,1024,512,683,'image/png',__KKGR_PLATFORM__.settings).then(()=>({ok:true}),e=>({code:e.code,message:e.message}));});
  await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error('Authorization gate not reached')),5000))]);
  await change({type:'SET_PROCESSING_MODE',processingMode:'worker'});await sync();releaseAuthorization();
  assert.equal((await page.evaluate(()=>staleModuleJob)).code,'ANALYSIS_CANCELLED');
  assert.equal(await page.evaluate(()=>__KKGR_MODULE_RUNTIME__.ready),true,'A stale job denial must not invalidate the current runtime');
  await page.evaluate(()=>__KKGR_PROCESSING__.start('lohalo',benchSource,768,1024,512,683,'image/png',__KKGR_PLATFORM__.settings).then(blob=>blob.size));
  await change({type:'SET_PROCESSING_MODE',processingMode:'speed'});await sync();
  // A denied old request can also arrive after leaving and returning to the same mode/key.
  let beginABA,checkABA,checkedABA,deliverABA;
  const abaStarted=new Promise(resolve=>{beginABA=resolve;}),abaChecked=new Promise(resolve=>{checkedABA=resolve;});
  authorizationGate={started:beginABA,release:new Promise(resolve=>{checkABA=resolve;}),checked:checkedABA,deliver:new Promise(resolve=>{deliverABA=resolve;})};
  const originalKey=await page.evaluate(()=>__KKGR_MODULE_RUNTIME__.key);
  await page.evaluate(()=>{globalThis.staleModuleJob=__KKGR_PROCESSING__.start('lohalo',benchSource,768,1024,512,683,'image/png',__KKGR_PLATFORM__.settings).then(()=>({ok:true}),e=>({code:e.code,message:e.message}));});
  await Promise.race([abaStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('ABA authorization not reached')),5000))]);
  await change({type:'SET_PROCESSING_MODE',processingMode:'worker'});await sync();checkABA();assert((await abaChecked).error);
  await change({type:'SET_PROCESSING_MODE',processingMode:'speed'});await sync();assert.equal(await page.evaluate(()=>__KKGR_MODULE_RUNTIME__.key),originalKey);deliverABA();
  assert.equal((await page.evaluate(()=>staleModuleJob)).code,'ANALYSIS_CANCELLED');
  assert.equal(await page.evaluate(()=>__KKGR_MODULE_RUNTIME__.ready),true,'Returning to the same selection must ignore the previous instance denial');
  const preparedCalls=apiCalls;
  revoked=true;await assert.rejects(()=>page.evaluate(()=>__KKGR_PROCESSING__.start('lohalo',benchSource,768,1024,512,683,'image/png',__KKGR_PLATFORM__.settings)),/revoked/);
  assert.equal(await page.evaluate(()=>Object.keys(globalThis.__KKGR_FILTER_MODULES__||{}).length),0,'Revocation releases MAIN descriptors');
  revoked=false;await change({type:'SET_PROCESSING_MODE',processingMode:'worker'});await sync();assert.equal(await page.evaluate(()=>__KKGR_MODULE_RUNTIME__.mode),'worker');assert.equal(apiCalls,preparedCalls);assert(await page.evaluate(()=>moduleCallbacks.dispose>=1),'Mode switch disposes prepared MAIN instance');
  // Invalidate the real isolated-world API after normal processing; an old worker listener must retire without uncaught JS errors.
  await change({type:'SET_FILTER',stage:'pre',filterId:null});await change({type:'SET_FILTER',stage:'post',filterId:null});await sync();
  await cdp.send('Runtime.evaluate',{contextId:isolated,expression:'globalThis.chrome.runtime=undefined'});
  await assert.rejects(()=>page.evaluate(()=>__KKGR_PROCESSING__.start('lohalo',benchSource,768,1024,512,683,'image/png',__KKGR_PLATFORM__.settings)),/invalidated|cancelled/i);
  await page.waitForFunction(()=>__KKGR_MODULE_RUNTIME__.ready===false&&__KKGR_PLATFORM__.processingSession()===null);assert.equal(await page.evaluate(()=>stoppedReaders),1);assert.equal(await page.evaluate(()=>document.querySelectorAll('iframe').length),0);
 }
 assert.deepEqual(errors,[]);await cdp.detach();await context.close();console.log('PASS module execution '+(mobile?'touch':'desktop')+(baseline?' baseline':' candidate'));
 }
 const out=process.env.GPUIE_MODULE_REPORT;if(out)fs.writeFileSync(out,JSON.stringify(reports,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
