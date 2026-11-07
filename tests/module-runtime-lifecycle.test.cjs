const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const prefix=fs.readFileSync(__dirname+'/dev2-sites.test.cjs','utf8').split('(async()=>{')[0],box={require,__dirname,console,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,setImmediate};vm.createContext(box);vm.runInContext(prefix+';globalThis.harness=harness',box);
(async()=>{
 const h=await box.harness(false,{sites:[{id:'k',origin:'https://nas.example:3627',basePath:'/kavita/',app:'kavita'}]});h.grants.add('https://nas.example/*');h.ctx.chrome.tabs.query=async()=>[];
 const main=vm.createContext({console,URL,TextEncoder});
 vm.runInContext(`globalThis.evaluated={};globalThis.cancelled=0;globalThis.synced=0;globalThis.__KKGR_MODULES__=[];globalThis.__KKGR_BUILTIN_FILTER_MODULES__={};globalThis.__KKGR_PLATFORM__={settings:{}};globalThis.__KKGR_PROCESSING__={cancelAll(){cancelled++}};globalThis.__KKGR_CORE__={syncRenderers(){},syncFilters(){synced++}}`,main);
 for(const file of ['ui/package-metadata.js','ui/parameter-schema.js','ui/analysis-contract.js','ui/module-contract.js'])vm.runInContext(fs.readFileSync(__dirname+'/../extension/'+file,'utf8'),main);
 const code=(id,kind='filter',version='1.0.0')=>`globalThis.evaluated??={};globalThis.evaluated['${id}']=(globalThis.evaluated['${id}']||0)+1;(globalThis.__KKGR_MODULES__??=[]).push({moduleApiVersion:1,executionApiVersion:1,id:'${id}',kind:'${kind}',name:'${id}',version:'${version}',implementationRevision:'test',parameters:[],${kind==='filter'?"supportedStages:['pre','post'],":''}translations:{en:{name:'Test',description:'Test module',readme:'Test module',labels:{}}},create(){return {prepare(){return {supported:true}},execute(){return {kind:'passthrough'}},dispose(){}}}});`;
 const metadata=source=>{const c=vm.createContext({URL,TextEncoder});for(const f of ['package-metadata.js','parameter-schema.js','analysis-contract.js','module-contract.js'])vm.runInContext(fs.readFileSync(__dirname+'/../extension/ui/'+f,'utf8'),c);vm.runInContext(source,c);return c.__KKGR_MODULE_CONTRACT__.validatePublic(c.__KKGR_MODULES__[0]);};
 for(const [id,kind] of [['test.renderer','renderer'],['test.selected','filter'],['test.unselected','filter']]){const source=code(id,kind);assert((await h.send({type:'ADD_PACKAGE',metadata:metadata(source),code:source})).ok);}
 const files=[],injections=[];let revoked=false;
 h.ctx.chrome.userScripts={getScripts:async()=>{if(revoked)throw Error('Access revoked');return [];},execute:async args=>{injections.push(args);for(const script of args.js)vm.runInContext(script.code,main);return [{result:null}];}};
 h.ctx.chrome.scripting.executeScript=async args=>{
  if(args.files){for(const file of args.files){files.push(file);vm.runInContext(fs.readFileSync(__dirname+'/../extension/'+file,'utf8'),main);}return [{result:null}];}
  main.__arguments=JSON.parse(JSON.stringify(args.args||[]));return [{result:vm.runInContext('('+args.func.toString()+')(...__arguments)',main)}];
 };
 const change=async m=>{const r=await h.send(m);assert(!r.error,r.error);return r;};
 await change({type:'SET_RENDERERS',disabledRenderers:[]});await change({type:'SET_RENDERER',renderer:'test.renderer'});
 await change({type:'SET_FILTER_CANDIDATES',filterCandidates:{pre:['test.selected'],post:['sosboy-san.gpu-usm']}});await change({type:'SET_FILTER',stage:'pre',filterId:'test.selected'});await change({type:'SET_FILTER',stage:'post',filterId:'sosboy-san.gpu-usm'});
 const target={tabId:1,documentIds:['reader']},sender={id:'dev',tab:{id:1},frameId:0,documentId:'reader',url:h.tabs.get(1).url};
 const sync=async()=>h.ctx.syncRuntimeModules(target);
 let state=await sync();assert(state.ready);assert.equal(injections.length,0);assert.equal(Object.keys(main.evaluated).length,0,'Worker must not evaluate even selected external source in MAIN');assert(!files.includes('gpu/usm.js'),'Worker must not pre-evaluate packaged filters either');assert(main.__KKGR_RENDERER_PROVIDERS__===undefined);assert(main.__KKGR_PACKAGE_SOURCES__['test.selected'].code);
 const source=h.data.managedRenderers.items.find(p=>p.registrationId==='test.selected');
 const job=()=>({type:'AUTHORIZE_MODULE_JOB',runtimeKey:state.key,mode:state.mode,packages:[{id:'test.selected',stamp:source.installation}]});
 assert((await h.send(job(),sender)).ok);assert((await h.send({...job(),packages:[{id:'test.unselected',stamp:'wrong'}]},sender)).error);
 const originalWorker=state.key;await change({type:'SET_PROCESSING_MODE',processingMode:'speed'});state=await sync();assert(state.ready);assert.equal(injections.length,2);assert.equal(main.evaluated['test.renderer'],1);assert.equal(main.evaluated['test.selected'],1);assert.equal(main.evaluated['test.unselected'],undefined);assert.equal(files.filter(f=>f==='gpu/usm.js').length,1);
 const key=state.key;await sync();assert.equal(injections.length,2,'Unchanged selection must not re-evaluate modules');assert.equal(main.__KKGR_MODULE_RUNTIME__.key,key);
 revoked=true;assert((await h.send(job(),sender)).error);state=await sync();assert(!state.allowed);assert(!state.ready);assert.equal(Object.keys(main.__KKGR_RENDERER_MODULES__).length,0);assert.equal(main.evaluated['test.unselected'],undefined);
 revoked=false;await change({type:'SET_PROCESSING_MODE',processingMode:'worker'});state=await sync();assert(state.ready);assert.equal(injections.length,2);assert.equal(state.key,originalWorker);
 const updated=code('test.selected','filter','1.0.1');await change({type:'UPDATE_PACKAGE',packageId:'test.selected',metadata:metadata(updated),code:updated});const prior=state.key;state=await sync();assert.notEqual(state.key,prior);assert.equal(main.evaluated['test.selected'],1,'Worker updates must not evaluate source in MAIN');assert((await h.send({type:'AUTHORIZE_MODULE_JOB',runtimeKey:prior,mode:'worker',packages:[]},sender)).error);
 await change({type:'DELETE_PACKAGE',packageId:'test.selected'});state=await sync();assert.equal(main.__KKGR_PACKAGE_SOURCES__['test.selected'],undefined);assert.equal(h.data.config.filters.pre,null);
 await change({type:'SET_ENABLED',enabled:false});state=await sync();assert(!state.active);assert.equal(injections.length,2);
 await change({type:'SET_ENABLED',enabled:true});await change({type:'SET_PROCESSING_MODE',processingMode:'speed'});state=await sync();assert(state.ready);
 let checks=0;h.ctx.chrome.userScripts.getScripts=async()=>{if(++checks===2)throw Error('Revoked during unchanged sync');return [];};
 state=await sync();assert(!state.ready);assert.equal(main.__KKGR_MODULE_RUNTIME__.ready,false,'Revocation during unchanged sync must invalidate MAIN');assert.equal(Object.keys(main.__KKGR_RENDERER_MODULES__).length,0);
 h.ctx.chrome.userScripts.getScripts=async()=>[];state=await sync();assert(state.ready,'Permission restoration prepares the current selection again');
 const readerURL=h.tabs.get(1).url;h.tabs.get(1).url='https://nas.example:3627/kavita/library';assert((await h.send({type:'CHECK_MODULE_ACCESS',runtimeKey:state.key},sender)).error,'The live tab must still be a reader');h.tabs.get(1).url=readerURL;
 h.grants.clear();assert((await h.send({type:'CHECK_MODULE_ACCESS',runtimeKey:state.key},sender)).error);
 assert(main.cancelled>=5);console.log('PASS real background + MAIN VM: zero Worker evaluation, selected speed only, bundled paths, stable registration, update/delete/OFF/revocation identities');
})().catch(e=>{console.error(e);process.exitCode=1;});
