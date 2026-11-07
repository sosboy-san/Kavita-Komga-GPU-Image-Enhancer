// E3 lifecycle/settings adapter. Image processing belongs to the adopted Reader Core.
(() => {
  'use strict';
  // HTTP LAN pages may lack randomUUID; getRandomValues remains available.
  function newId() {
    if(typeof crypto.randomUUID==='function') return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }

  const KEY='__KKGR_E2_MAIN__', CHANNEL='kkgr-e2-v1';
  if(window[KEY]) return;
  let session=null, revision=-1, enabled=false, observer=null, starts=0, stops=0;
  const documentToken=newId(),changes=new Map();
  const settings={enabled:false,hud:true,renderer:'lanczos3',hudMode:'normal',disabledRenderers:[]};
  Object.defineProperty(globalThis,'__KKGR_PLATFORM__',{value:{settings,processingSession:()=>session,
    authorizeModules(payload){return new Promise((resolve,reject)=>{if(!session){reject(Error('Module bridge unavailable'));return;}const changeId=newId(),timer=setTimeout(()=>{changes.delete(changeId);reject(Error('Module authorization timed out'));},5000);changes.set(changeId,{resolve,reject,timer,moduleRuntime:globalThis.__KKGR_MODULE_RUNTIME__});window.postMessage({channel:CHANNEL,from:'main',session,type:'AUTHORIZE_MODULE_JOB',changeId,...payload},location.origin);});},
    change(key,value) {
      if(!session) return;
      if(['kavitaAutoFullscreen','kavitaPageTurnAnimation','processingMode','outputFormat','filters','filterParameters','developerMode','diagnosticRecording','diagnosticClearRevision','hudMode'].includes(key))return new Promise((resolve,reject)=>{const changeId=newId(),timer=setTimeout(()=>{changes.delete(changeId);reject(Error('Filter change timed out'));},12000);changes.set(changeId,{resolve,reject,timer});window.postMessage({channel:CHANNEL,from:'main',session,type:'SETTING',documentToken,key,value,changeId},location.origin);});
      window.postMessage({channel:CHANNEL,from:'main',session,type:'SETTING',
        documentToken,key,value},location.origin);
    }},configurable:false});
  const site=()=>globalThis.__KKGR_CORE__?.status().site || 'IDLE';
  const reply=id=>window.postMessage({channel:CHANNEL,from:'main',session,id,
    status:{theme:globalThis.__KKGR_CORE__?.uiSnapshot?.().theme,locale:globalThis.__KKGR_CORE__?.uiSnapshot?.().locale,documentToken,revision,enabled,site:enabled?site():'IDLE',starts,stops,
      shellOnly:false,phase:'E3 HUD DEV',coreReady:!!globalThis.__KKGR_CORE__,renderer:globalThis.__KKGR_CORE__?.status().renderer,providersReady:!!globalThis.__KKGR_E3_PROVIDERS_READY__,providerIds:globalThis.__KKGR_CORE__?.ids() || [],pipeline:globalThis.__KKGR_CORE__?.status().pipeline||null,moduleDiagnostics:globalThis.__KKGR_MODULE_DIAGNOSTICS__||[],mainConnected:true}},location.origin);
  const onMessage=e=>{
    const m=e.data;
    if(e.source!==window || e.origin!==location.origin || !m || m.channel!==CHANNEL ||
       m.from!=='bridge' || typeof m.session!=='string') return;
    if(m.type==='BRIDGE_DISCONNECTED'&&m.session===session){
      const error=Error(m.error||'Extension updated. Reload the reader tab.'),state=globalThis.__KKGR_MODULE_RUNTIME__;
      if(state){state.ready=false;state.allowed=false;state.errors=[{message:error.message}];}
      globalThis.__KKGR_RENDERER_MODULES__={};globalThis.__KKGR_FILTER_MODULES__={};globalThis.__KKGR_MODULES__=[];
      globalThis.__KKGR_PROCESSING__?.retry();globalThis.__KKGR_CORE__?.stop();enabled=false;settings.enabled=false;observer?.disconnect();observer=null;
      for(const change of changes.values()){clearTimeout(change.timer);change.reject(error);}changes.clear();session=null;return;
    }
    if(m.type==='MODULE_RUNTIME_INVALIDATED'&&m.session===session){const state=globalThis.__KKGR_MODULE_RUNTIME__;if((m.runtimeKey&&m.runtimeKey!==state?.key)||(m.changeId&&changes.get(m.changeId)?.moduleRuntime!==state))return;if(state){state.ready=false;state.allowed=false;state.errors=[{message:m.error||'Module access revoked'}];globalThis.__KKGR_FILTER_SIGNATURE__=state.key+':revoked';}globalThis.__KKGR_RENDERER_MODULES__={};globalThis.__KKGR_FILTER_MODULES__={...(globalThis.__KKGR_BUILTIN_FILTER_MODULES__||{})};globalThis.__KKGR_MODULES__=[];globalThis.__KKGR_PROCESSING__?.retry();globalThis.__KKGR_CORE__?.syncFilters();return;}
    if(m.type==='MODULE_AUTHORIZATION_RESULT'&&m.session===session){const pending=changes.get(m.changeId);if(pending){clearTimeout(pending.timer);changes.delete(m.changeId);m.result?.ok?pending.resolve(m.result):pending.reject(Error(m.result?.error||'Module access revoked'));}return;}
    if(m.type==='SETTING_RESULT'&&m.session===session){const pending=changes.get(m.changeId);if(pending){clearTimeout(pending.timer);changes.delete(m.changeId);m.error?pending.reject(Error(m.error)):pending.resolve();}return;}
    if(typeof m.id!=='string')return;
    if(m.type==='HELLO') {if(session&&session!==m.session)globalThis.__KKGR_PROCESSING__?.cancelAll();session=m.session;reply(m.id);return;}
    if(m.session!==session) return;
    if(m.type==='REANALYZE'){Promise.resolve().then(()=>globalThis.__KKGR_CORE__?.reanalyze(m.stage,m.filterId)).then(diagnostics=>window.postMessage({channel:CHANNEL,from:'main',session,id:m.id,type:'DIAGNOSTICS',diagnostics},location.origin),error=>window.postMessage({channel:CHANNEL,from:'main',session,id:m.id,type:'DIAGNOSTICS',error:String(error.message||error)},location.origin));return;}
    if(m.type==='DIAGNOSTICS'){window.postMessage({channel:CHANNEL,from:'main',session,id:m.id,type:'DIAGNOSTICS',diagnostics:globalThis.__KKGR_DIAGNOSTICS__?.snapshot()||null},location.origin);return;}
    if(m.type==='STOP') {
      globalThis.__KKGR_CORE__?.stop();
      if(enabled) stops++; enabled=false;observer?.disconnect();observer=null;reply(m.id);return;
    }
    if(m.type!=='CONFIG' || !Number.isSafeInteger(m.revision) || m.revision<revision ||
       typeof m.enabled!=='boolean') return;
    revision=m.revision;
    Object.assign(settings,{appVersion:m.appVersion,revision:m.revision,enabled:m.enabled,developerMode:m.developerMode,diagnosticRecording:m.diagnosticRecording,diagnosticClearRevision:m.diagnosticClearRevision,hud:m.hud,renderer:m.renderer,hudMode:m.hudMode,hudPosition:m.hudPosition,uiLanguage:m.uiLanguage,disabledRenderers:m.disabledRenderers,quick:m.quick,rendererOrder:m.rendererOrder,filters:m.filters,kavitaAutoFullscreen:m.kavitaAutoFullscreen===true,kavitaPageTurnAnimation:m.kavitaPageTurnAnimation===true,processingMode:m.processingMode,outputFormat:m.outputFormat,processingTimeoutMs:m.processingTimeoutMs,processingRetryRevision:m.processingRetryRevision,filterParameters:m.filterParameters,filterCandidates:m.filterCandidates,filterCatalog:m.filterCatalog});
    globalThis.__KKGR_CORE__?.apply(settings);
    if(m.enabled!==enabled) {
      enabled=m.enabled;
      if(enabled) {starts++;let previous=site();observer=new MutationObserver(()=>{
        const now=site();if(now!==previous) {previous=now;reply('event');}
      });
        observer.observe(document.documentElement,{childList:true,subtree:true});}
      else {stops++;observer?.disconnect();observer=null;}
    }
    reply(m.id);
  };
  window.addEventListener('message',onMessage);
  Object.defineProperty(window,KEY,{value:Object.freeze({shellOnly:false}),configurable:false});
})();
