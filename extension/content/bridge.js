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

  const KEY='__KKGR_E2_BRIDGE__', CHANNEL='kkgr-e2-v1';
  if(globalThis[KEY]) return;
  const session=newId(), pending=new Map(), removers=[];
  let booting=null,bootPath=null,preparedPath=null,bootAgain=false;
  let alive=true,stoppingForTransport=false,accessTimer=null,accessState=null,checkingAccess=false;
  let workerFrame=null,workerReady=false;const workerPorts=[];
  const contextError=()=>Object.assign(Error('Extension context invalidated. Reload the reader tab.'),{code:'EXTENSION_CONTEXT_INVALIDATED'});
  function runtime(){const value=globalThis.chrome?.runtime;if(!value?.id||typeof value.sendMessage!=='function')throw contextError();return value;}
  function contextLost(error){try{runtime();return /extension context invalidated/i.test(String(error?.message||error));}catch{return true;}}
  function listen(target,type,handler){target.addEventListener(type,handler);removers.push(()=>target.removeEventListener?.(type,handler));}
  function rejectPort(port,error){try{port.postMessage({error:{code:error.code||'WORKER_UNAVAILABLE',message:error.message}});}catch{}try{port.close();}catch{}}
  function clearWorkers(error){for(const port of workerPorts.splice(0))rejectPort(port,error);workerFrame?.remove();workerFrame=null;workerReady=false;}
  function retire(error=contextError()){
    if(!alive)return;alive=false;watchAccess(null);
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();
    clearWorkers(error);for(const remove of removers.splice(0)){try{remove();}catch{}}
    try{globalThis.__KKGR_READER_SETTINGS__?.close();}catch{}
    window.postMessage({channel:CHANNEL,from:'bridge',session,type:'BRIDGE_DISCONNECTED',error:error.message},location.origin);
  }
  async function sendRuntime(message){if(!alive)throw contextError();try{return await runtime().sendMessage(message);}catch(error){if(contextLost(error))retire(contextError());throw error;}}

  listen(document,'kkgr-dev1-open-settings',()=>globalThis.__KKGR_READER_SETTINGS__?.open());
  // Share menu appearance across isolated/main worlds without changing reader processing.
  const applyAppearance=value=>{document.documentElement.setAttribute('data-kkgr-ui-appearance',['Auto','Light','Dark'].includes(value)?value:'Auto');document.dispatchEvent(new CustomEvent('kkgr-ui-appearance'));};
  const appearanceChanged=(changes,area)=>{if(alive&&area==='local'&&changes.uiAppearance)applyAppearance(changes.uiAppearance.newValue);};
  try{chrome.storage.local.get('uiAppearance').then(v=>{if(alive)applyAppearance(v.uiAppearance);}).catch(e=>{if(contextLost(e))retire(contextError());});chrome.storage.onChanged.addListener(appearanceChanged);removers.push(()=>chrome.storage.onChanged.removeListener?.(appearanceChanged));}catch(e){retire(contextError());return;}
  function watchAccess(state){if(state!==undefined)accessState=state;clearInterval(accessTimer);accessTimer=null;if(alive&&accessState?.active&&accessState?.allowed&&accessState?.needsUserScripts)accessTimer=setInterval(checkAccess,1000);}
  function invalidateModules(error,runtimeKey,changeId,requestState){if((!runtimeKey||accessState?.key===runtimeKey)&&(!changeId||accessState===requestState))watchAccess(null);window.postMessage({channel:CHANNEL,from:'bridge',session,type:'MODULE_RUNTIME_INVALIDATED',error,runtimeKey,changeId},location.origin);}
  async function checkAccess(){if(checkingAccess||!accessState)return;checkingAccess=true;const state=accessState;try{const r=await sendRuntime({type:'CHECK_MODULE_ACCESS',runtimeKey:state.key});if(accessState===state&&!r?.ok)invalidateModules(r?.error||'Module access revoked',state.key);}catch(e){if(accessState===state)invalidateModules(String(e.message),state.key);}finally{checkingAccess=false;}}
  listen(document,'visibilitychange',()=>{if(document.visibilityState==='visible')checkAccess();});
  listen(window,'focus',checkAccess);
  listen(window,'pageshow',()=>{watchAccess();checkAccess();});
  listen(window,'pagehide',()=>{clearInterval(accessTimer);accessTimer=null;});
  const sendWorkerPort=port=>{try{if(!alive)throw contextError();runtime();workerFrame.contentWindow.postMessage({type:'KKGR_WORKER_CONNECT'},'*',[port]);}catch(error){rejectPort(port,error);if(contextLost(error))retire(contextError());}};
  listen(window,'message',e=>{
    if(!alive)return;
    if(workerFrame&&e.source===workerFrame.contentWindow&&e.data?.type==='KKGR_WORKER_FRAME_READY'){workerReady=true;for(const p of workerPorts.splice(0))sendWorkerPort(p);return;}
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='kkgr-processing-connect'||e.data.session!==session||e.ports.length!==1)return;
    const port=e.ports[0];
    try{const api=runtime();if(workerReady){sendWorkerPort(port);return;}if(!workerFrame){const frame=document.createElement('iframe');frame.hidden=true;frame.src=api.getURL('gpu/worker-frame.html');workerFrame=frame;document.documentElement.append(frame);}workerPorts.push(port);}
    catch(error){const lost=contextLost(error);rejectPort(port,lost?contextError():error);if(lost)retire(contextError());else clearWorkers(error);}
  });
  const request=(type,extra={})=>new Promise((resolve,reject)=>{
    if(!alive){reject(contextError());return;}
    const id=newId();
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('MAIN handshake timeout'));},type==='REANALYZE'?240000:2500);
    pending.set(id,{resolve,reject,timer});
    window.postMessage({channel:CHANNEL,from:'bridge',session,id,type,...extra},location.origin);
  });
  listen(window,'message',e=>{
    if(!alive)return;
    const m=e.data,s=m?.status;if(e.source===window&&e.origin===location.origin&&m?.channel===CHANNEL&&m.from==='main'&&m.session===session&&m.type==='DIAGNOSTICS'){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);if(m.error){p.reject(Error(m.error));return;}let json;try{json=JSON.stringify(m.diagnostics);}catch{}p.resolve(json&&json.length<=5*1024*1024?JSON.parse(json):null);}return;}
    if(e.source===window&&e.origin===location.origin&&m?.channel===CHANNEL&&m.from==='main'&&m.session===session&&m.type==='PREPARE_MODULE_RUNTIME'){freshBoot().then(()=>{if(alive)window.postMessage({channel:CHANNEL,from:'bridge',session,type:'MODULE_RUNTIME_PREPARED',changeId:m.changeId,result:{ok:true}},location.origin);},error=>{if(alive)window.postMessage({channel:CHANNEL,from:'bridge',session,type:'MODULE_RUNTIME_PREPARED',changeId:m.changeId,result:{error:error.message}},location.origin);});return;}
    if(e.source===window&&e.origin===location.origin&&m?.channel===CHANNEL&&m.from==='main'&&m.session===session&&m.type==='AUTHORIZE_MODULE_JOB'){
      const requestState=accessState;sendRuntime({type:'AUTHORIZE_MODULE_JOB',runtimeKey:m.runtimeKey,mode:m.mode,packages:m.packages}).then(result=>{if(!alive)return;if(!result?.ok)invalidateModules(result?.error||'Module access revoked',m.runtimeKey,m.changeId,requestState);window.postMessage({channel:CHANNEL,from:'bridge',session,type:'MODULE_AUTHORIZATION_RESULT',changeId:m.changeId,result},location.origin);}).catch(e=>{if(!alive)return;invalidateModules(String(e.message),m.runtimeKey,m.changeId,requestState);window.postMessage({channel:CHANNEL,from:'bridge',session,type:'MODULE_AUTHORIZATION_RESULT',changeId:m.changeId,result:{error:String(e.message)}},location.origin);});return;
    }
    if(e.source===window && e.origin===location.origin && m?.channel===CHANNEL &&
       m.from==='main' && m.session===session && m.type==='SETTING' &&
       ['developerMode','diagnosticRecording','diagnosticClearRevision','enabled','hud','renderer','hudMode','hudPosition','disabledRenderers','rendererCandidates','filterCandidates','filters','filterParameters','kavitaAutoFullscreen','kavitaPageTurnAnimation','processingMode','outputFormat','blobBudgetMb','decodedForward','decodedBack','processingTimeoutMs','processingRetryRevision'].includes(m.key)) {
      sendRuntime({type:'SETTING',documentToken:m.documentToken,key:m.key,value:m.value})
        .then(async result=>{if(!alive)return;if(!result?.error&&result?.config){await request('CONFIG',result.config);}if(m.changeId)window.postMessage({channel:CHANNEL,from:'bridge',session,type:'SETTING_RESULT',changeId:m.changeId,error:result?.error||null},location.origin);}).catch(error=>{if(!alive)return;if(m.changeId)window.postMessage({channel:CHANNEL,from:'bridge',session,type:'SETTING_RESULT',changeId:m.changeId,error:String(error.message||error)},location.origin);});
      return;
    }
    if(e.source!==window || e.origin!==location.origin || m?.channel!==CHANNEL ||
       m.from!=='main' || m.session!==session || !s || s.shellOnly!==false ||
       !['IDLE','KAVITA','KOMGA'].includes(s.site) || typeof s.enabled!=='boolean' ||
       typeof s.documentToken!=='string' || !Number.isSafeInteger(s.revision) ||
       !Number.isSafeInteger(s.starts) || !Number.isSafeInteger(s.stops)) return;
    const bounded=value=>{try{const json=JSON.stringify(value);return json&&json.length<=32768?JSON.parse(json):null;}catch{return null;}};
    const status={pipeline:bounded(s.pipeline),moduleDiagnostics:Array.isArray(s.moduleDiagnostics)?s.moduleDiagnostics.slice(-20).map(x=>({stage:String(x.stage||'').slice(0,32),id:String(x.id||'').slice(0,160),message:String(x.message||'').slice(0,240)})):[],theme:s.theme && typeof s.theme.accent==='string' && s.theme.accent.length<64 && typeof s.theme.light==='boolean'?{accent:s.theme.accent,light:s.theme.light}:null,locale:s.locale==='ja'?'ja':'en',documentToken:s.documentToken,revision:s.revision,enabled:s.enabled,
      site:s.site,starts:s.starts,stops:s.stops,shellOnly:false,coreReady:s.coreReady===true,renderer:s.renderer,mainConnected:true,providersReady:s.providersReady===true,
      providerIds:Array.isArray(s.providerIds)?s.providerIds.filter(id=>typeof id==='string'):[]};
    const p=pending.get(m.id);
    if(p) {clearTimeout(p.timer);pending.delete(m.id);p.resolve(status);}
    if(alive&&s.enabled&&preparedPath!==(location.pathname||''))boot().catch(()=>{});
    if(alive&&!stoppingForTransport)sendRuntime({type:'STATUS',status}).catch(error=>{if(!alive||stoppingForTransport)return;if(contextLost(error)){retire(contextError());return;}stoppingForTransport=true;request('STOP').catch(()=>{}).finally(()=>{stoppingForTransport=false;});});
  });
  const runtimeListener=(m,_sender,sendResponse)=>{
    if(!alive)return;
    const respond=value=>{try{sendResponse(value);}catch(error){if(contextLost(error))retire(contextError());}};
    if(!['OPEN_READER_SETTINGS','DIAGNOSTICS','REANALYZE','APPLY','STOP','PING'].includes(m?.type)) return;
    (async()=>{
      if(m.type==='OPEN_READER_SETTINGS')return globalThis.__KKGR_READER_SETTINGS__?.open()||{ok:false};
      if(m.type==='REANALYZE')return request('REANALYZE',{stage:m.stage,filterId:m.filterId});
      if(m.type==='DIAGNOSTICS')return request('DIAGNOSTICS');
      if(m.type==='STOP'){watchAccess(null);invalidateModules('Site access revoked');globalThis.__KKGR_READER_SETTINGS__?.close();return request('STOP');}
      if(m.type==='PING')return freshBoot();
      const config=m.config;
      if(config?.error) throw new Error(config.error);
      if(!config?.allowed) return request('STOP');
      watchAccess(config.moduleRuntime);
      await request('HELLO');
      return request('CONFIG',{appVersion:config.appVersion,revision:config.revision,enabled:config.enabled,developerMode:config.developerMode,diagnosticRecording:config.diagnosticRecording,diagnosticClearRevision:config.diagnosticClearRevision,hud:config.hud,renderer:config.renderer,hudMode:config.hudMode,hudPosition:config.hudPosition,uiLanguage:config.uiLanguage,disabledRenderers:config.disabledRenderers,quick:config.quick,rendererOrder:config.rendererOrder,filters:config.filters,kavitaAutoFullscreen:config.kavitaAutoFullscreen,kavitaPageTurnAnimation:config.kavitaPageTurnAnimation,processingMode:config.processingMode,outputFormat:config.outputFormat,processingTimeoutMs:config.processingTimeoutMs,processingRetryRevision:config.processingRetryRevision,filterParameters:config.filterParameters,filterCandidates:config.filterCandidates,filterCatalog:config.filterCatalog});
    })().then(status=>respond(m.type==='OPEN_READER_SETTINGS'?status:['DIAGNOSTICS','REANALYZE'].includes(m.type)?{ok:true,diagnostics:status}:{ok:true,status}),e=>respond({ok:false,error:e.message}));
    return true;
  };
  try{const api=runtime();api.onMessage.addListener(runtimeListener);removers.push(()=>api.onMessage.removeListener(runtimeListener));}catch(error){retire(contextError());return;}
  const boot=()=>{
    if(!alive)return Promise.reject(contextError());
    const path=location.pathname||'';if(booting){if(path!==bootPath)bootAgain=true;return booting;}bootPath=path;
    booting=(async()=>{
    const config=await sendRuntime({type:'HELLO'});
    if(config?.error) throw new Error(config.error);
    if(!config?.allowed){watchAccess(null);invalidateModules('Site access revoked');return request('STOP');}
    watchAccess(config.moduleRuntime);
    await request('HELLO');
    const status=await request('CONFIG',{appVersion:config.appVersion,revision:config.revision,enabled:config.enabled,developerMode:config.developerMode,diagnosticRecording:config.diagnosticRecording,diagnosticClearRevision:config.diagnosticClearRevision,hud:config.hud,renderer:config.renderer,hudMode:config.hudMode,hudPosition:config.hudPosition,uiLanguage:config.uiLanguage,disabledRenderers:config.disabledRenderers,quick:config.quick,rendererOrder:config.rendererOrder,filters:config.filters,kavitaAutoFullscreen:config.kavitaAutoFullscreen,kavitaPageTurnAnimation:config.kavitaPageTurnAnimation,processingMode:config.processingMode,outputFormat:config.outputFormat,processingTimeoutMs:config.processingTimeoutMs,processingRetryRevision:config.processingRetryRevision,filterParameters:config.filterParameters,filterCandidates:config.filterCandidates,filterCatalog:config.filterCatalog});
    preparedPath=path;await sendRuntime({type:'STATUS',status});return status;
    })().finally(()=>{booting=null;if(alive&&(bootAgain||(location.pathname||'')!==path)){bootAgain=false;boot().catch(()=>{});}});return booting;
  };
  // Explicit setting delivery must not be acknowledged by an older in-flight boot.
  const freshBoot=()=>booting?booting.catch(()=>{}).then(()=>boot()):boot();
  globalThis[KEY]=true;
  boot().catch(e=>sendRuntime({type:'DIAGNOSTIC',error:e.message}).catch(()=>{}));
  listen(window,'pageshow',e=>{if(e.persisted) boot().catch(()=>{});});
  let resuming=false;
  listen(document,'visibilitychange',()=>{if(document.visibilityState!=='visible'||resuming)return;resuming=true;boot().catch(()=>{}).finally(()=>{resuming=false;});});
  listen(window,'pagehide',()=>{clearWorkers(Object.assign(Error('Reader page hidden'),{code:'ANALYSIS_CANCELLED'}));request('STOP').catch(()=>{});});
})();
