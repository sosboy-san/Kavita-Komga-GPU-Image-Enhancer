const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const prefix=fs.readFileSync(__dirname+'/dev2-sites.test.cjs','utf8').split('(async()=>{')[0];
const box={require,__dirname,console,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,setImmediate};
vm.createContext(box);vm.runInContext(prefix+';globalThis.harness=harness',box);
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
(async()=>{
 const motionBox={URL,location:{href:'https://reader.test/kavita/manga/1',origin:'https://reader.test'}};vm.createContext(motionBox);vm.runInContext(fs.readFileSync(__dirname+'/../extension/content/kavita-page-motion.js','utf8'),motionBox);
 const motion=motionBox.__KKGR_KAVITA_MOTION__,revoked=[],leases=motion.createURLLeases(url=>revoked.push(url));
 const releaseA=leases.acquire('blob:processed',64),releaseB=leases.acquire('blob:processed',64);
 leases.releaseOwned('blob:processed');assert.equal(leases.pendingBytes(),64);assert.equal(leases.count(),2);assert.equal(revoked.length,0);
 releaseA();releaseA();assert.equal(leases.count(),1);releaseB();assert.deepEqual(revoked,['blob:processed']);assert.equal(leases.count(),0);assert.equal(leases.pendingBytes(),0);
 const native=leases.acquire('https://reader.test/image');native();assert.equal(leases.count(),0);
 const identity=motion.identity('https://reader.test/kavita/api/reader/image?chapterId=1&page=3');assert.equal(identity.page,3);assert.equal(motion.identity('https://other.test/kavita/api/reader/image?chapterId=1&page=3'),null);
 const root={},before={root,chapter:'one',page:0,direction:'ltr',signature:''},after={...before,page:1};
 assert.equal(motion.classify(before,after).sign,-1);assert.equal(motion.classify(after,before).sign,1);
 assert.equal(motion.classify({...before,direction:'rtl'},{...after,direction:'rtl'}).sign,1);
 assert.equal(motion.classify(before,{...after,page:4}),null);assert.equal(motion.classify(before,{...after,chapter:'two'}),null);
 assert.equal(motion.classify({...before,layout:'double',pages:[0,1]},{...after,layout:'double',pages:[2,3]}).forward,true);
 for(const mobile of [false,true]){
  const h=await box.harness(mobile,{sites:[{id:'k',origin:'https://nas.example:3627',basePath:'/kavita/',app:'kavita'},{id:'c',origin:'https://nas.example:3627',basePath:'/komga/',app:'komga'}]});h.grants.add('https://nas.example/*');
  let opened=0;h.ctx.chrome.tabs.sendMessage=async(id,m)=>{if(m.type==='OPEN_READER_SETTINGS')opened++;return {ok:true};};
  const initial=await h.send({type:'GET'});assert.equal(initial.config.kavitaAutoFullscreen,false);assert.equal(initial.config.kavitaPageTurnAnimation,false);
  for(const [type,key] of [['SET_KAVITA_AUTO_FULLSCREEN','kavitaAutoFullscreen'],['SET_KAVITA_PAGE_TURN_ANIMATION','kavitaPageTurnAnimation']]){
   assert((await h.send({type,[key]:'true'})).error);assert.equal((await h.send({type,[key]:true})).config[key],true);
   assert.equal((await h.send({type:'GET'})).config[key],true);
   assert.equal((await h.send({type,[key]:false})).config[key],false);
  }
  for(const id of [1,2]){
   for(const fn of h.events.activated)fn({tabId:id});await tick();
   assert.equal(h.calls.filter(x=>x.tabId===id&&'popup'in x).at(-1).popup,mobile?'':'ui/popup.html');
   const before=opened,popups=h.calls.filter(x=>x.openedPopup).length;
   h.events.click[0](h.tabs.get(id));await tick();assert.equal(opened,before+(mobile?1:0));
   if(!mobile)assert.equal(h.calls.filter(x=>x.openedPopup).length,popups+1);
   assert.equal((await h.send({type:'OPEN_SETTINGS',targetTabId:id})).embedded,true);
   assert.equal(opened,before+(mobile?2:1));assert.equal(h.tabs.size,4);
  }
  const parent={id:'dev',tab:{id:1},url:h.tabs.get(1).url,frameId:0,documentId:'reader'};h.session['tab:1']={documentId:'reader'};
  assert((await h.send({type:'PREPARE_EMBEDDED_SETTINGS'},{...parent,frameId:2})).error);
  const launch=await h.send({type:'PREPARE_EMBEDDED_SETTINGS'},parent);assert(launch.token);
  const frame={id:'dev',url:'chrome-extension://dev/ui/embedded-settings.html',tab:{id:1},frameId:3,documentId:'settings'};
  const send=(m,s=frame)=>h.send({embeddedToken:launch.token,...m},s);
  assert((await send({type:'GET_SAVED',embeddedToken:'wrong'})).error);
  assert((await send({type:'GET_SAVED'},{...frame,tab:{id:2}})).error);
  assert.equal((await send({type:'EMBEDDED_CONTEXT'})).targetTabId,1);
  assert.equal((await send({type:'SET_KAVITA_PAGE_TURN_ANIMATION',kavitaPageTurnAnimation:true})).config.kavitaPageTurnAnimation,true);
  assert((await send({type:'GET_SAVED'},{...frame,documentId:'replacement'})).error);
  await tick();await h.send({type:'HELLO'},parent);
  await h.send({type:'CLOSE_EMBEDDED_SETTINGS',token:launch.token},parent);assert((await send({type:'GET_SAVED'})).error);
  h.tabs.get(1).url='https://nas.example:3627/kavita/library/2/series/3/manga/456';
  const spa=await h.send({type:'PREPARE_EMBEDDED_SETTINGS'},parent);assert(spa.token,spa.error);
  const resumed=await h.send({type:'EMBEDDED_CONTEXT',embeddedToken:spa.token},frame);assert.equal(resumed.targetTabId,1,resumed.error);
  h.tabs.get(1).url='https://nas.example:3627/kavita/library/2/series/3/manga/789';
  assert((await h.send({type:'GET_SAVED',embeddedToken:spa.token},frame)).error);
 }
 console.log('PASS reader settings defaults/save, PC/mobile toolbar routing, embedded authorization, close and SPA context');
})().catch(e=>{console.error(e);process.exitCode=1;});
