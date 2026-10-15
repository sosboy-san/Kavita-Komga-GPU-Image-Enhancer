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
  const session=newId(), pending=new Map();
  document.addEventListener('kkgr-dev1-open-settings',()=>chrome.runtime.sendMessage({type:'OPEN_SETTINGS_FROM_READER'}).catch(()=>{}));
  // Share menu appearance across isolated/main worlds without changing reader processing.
  const applyAppearance=value=>{document.documentElement.setAttribute('data-kkgr-ui-appearance',['Auto','Light','Dark'].includes(value)?value:'Auto');document.dispatchEvent(new CustomEvent('kkgr-ui-appearance'));};
  chrome.storage.local.get('uiAppearance').then(v=>applyAppearance(v.uiAppearance)).catch(()=>{});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.uiAppearance)applyAppearance(changes.uiAppearance.newValue);});
  let alive=true;
  let workerFrame=null,workerReady=false;const workerPorts=[];
  const sendWorkerPort=port=>workerFrame.contentWindow.postMessage({type:'KKGR_WORKER_CONNECT'},'*',[port]);
  window.addEventListener('message',e=>{
    if(workerFrame&&e.source===workerFrame.contentWindow&&e.data?.type==='KKGR_WORKER_FRAME_READY'){workerReady=true;for(const p of workerPorts.splice(0))sendWorkerPort(p);return;}
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='kkgr-processing-connect'||e.ports.length!==1)return;
    const port=e.ports[0];if(workerReady){sendWorkerPort(port);return;}workerPorts.push(port);
    if(!workerFrame){workerFrame=document.createElement('iframe');workerFrame.hidden=true;workerFrame.src=chrome.runtime.getURL('gpu/worker-frame.html');document.documentElement.append(workerFrame);}
  });
  const request=(type,extra={})=>new Promise((resolve,reject)=>{
    const id=newId();
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('MAIN handshake timeout'));},type==='REANALYZE'?240000:2500);
    pending.set(id,{resolve,reject,timer});
    window.postMessage({channel:CHANNEL,from:'bridge',session,id,type,...extra},location.origin);
  });
  window.addEventListener('message',e=>{
    const m=e.data,s=m?.status;if(e.source===window&&e.origin===location.origin&&m?.channel===CHANNEL&&m.from==='main'&&m.session===session&&m.type==='DIAGNOSTICS'){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);if(m.error){p.reject(Error(m.error));return;}let json;try{json=JSON.stringify(m.diagnostics);}catch{}p.resolve(json&&json.length<=5*1024*1024?JSON.parse(json):null);}return;}
    if(e.source===window && e.origin===location.origin && m?.channel===CHANNEL &&
       m.from==='main' && m.session===session && m.type==='SETTING' &&
       ['developerMode','diagnosticRecording','diagnosticClearRevision','enabled','hud','renderer','hudMode','hudPosition','disabledRenderers','rendererCandidates','filterCandidates','filters','filterParameters','processingMode','outputFormat','blobBudgetMb','decodedForward','decodedBack','processingTimeoutMs','processingRetryRevision'].includes(m.key)) {
      chrome.runtime.sendMessage({type:'SETTING',documentToken:m.documentToken,key:m.key,value:m.value})
        .then(async result=>{if(!result?.error&&result?.config){await request('CONFIG',result.config);}if(m.changeId)window.postMessage({channel:CHANNEL,from:'bridge',session,type:'SETTING_RESULT',changeId:m.changeId,error:result?.error||null},location.origin);}).catch(error=>{if(m.changeId)window.postMessage({channel:CHANNEL,from:'bridge',session,type:'SETTING_RESULT',changeId:m.changeId,error:String(error.message||error)},location.origin);});
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
    if(alive) chrome.runtime.sendMessage({type:'STATUS',status}).catch(()=>{alive=false;request('STOP').catch(()=>{});});
  });
  chrome.runtime.onMessage.addListener((m,_sender,sendResponse)=>{
    if(!['DIAGNOSTICS','REANALYZE','APPLY','STOP','PING'].includes(m?.type)) return;
    (async()=>{
      if(m.type==='REANALYZE')return request('REANALYZE',{stage:m.stage,filterId:m.filterId});
      if(m.type==='DIAGNOSTICS')return request('DIAGNOSTICS');
      if(m.type==='STOP') return request('STOP');
      const config=m.type==='PING'?await chrome.runtime.sendMessage({type:'HELLO'}):m.config;
      if(config?.error) throw new Error(config.error);
      if(!config?.allowed) return request('STOP');
      await request('HELLO');
      return request('CONFIG',{appVersion:config.appVersion,revision:config.revision,enabled:config.enabled,developerMode:config.developerMode,diagnosticRecording:config.diagnosticRecording,diagnosticClearRevision:config.diagnosticClearRevision,hud:config.hud,renderer:config.renderer,hudMode:config.hudMode,hudPosition:config.hudPosition,uiLanguage:config.uiLanguage,disabledRenderers:config.disabledRenderers,quick:config.quick,rendererOrder:config.rendererOrder,filters:config.filters,processingMode:config.processingMode,outputFormat:config.outputFormat,processingTimeoutMs:config.processingTimeoutMs,processingRetryRevision:config.processingRetryRevision,filterParameters:config.filterParameters,filterCandidates:config.filterCandidates,filterCatalog:config.filterCatalog});
    })().then(status=>sendResponse(['DIAGNOSTICS','REANALYZE'].includes(m.type)?{ok:true,diagnostics:status}:{ok:true,status}),e=>sendResponse({ok:false,error:e.message}));
    return true;
  });
  const boot=async()=>{
    const config=await chrome.runtime.sendMessage({type:'HELLO'});
    if(config?.error) throw new Error(config.error);
    if(!config?.allowed) return;
    await request('HELLO');
    const status=await request('CONFIG',{appVersion:config.appVersion,revision:config.revision,enabled:config.enabled,developerMode:config.developerMode,diagnosticRecording:config.diagnosticRecording,diagnosticClearRevision:config.diagnosticClearRevision,hud:config.hud,renderer:config.renderer,hudMode:config.hudMode,hudPosition:config.hudPosition,uiLanguage:config.uiLanguage,disabledRenderers:config.disabledRenderers,quick:config.quick,rendererOrder:config.rendererOrder,filters:config.filters,processingMode:config.processingMode,outputFormat:config.outputFormat,processingTimeoutMs:config.processingTimeoutMs,processingRetryRevision:config.processingRetryRevision,filterParameters:config.filterParameters,filterCandidates:config.filterCandidates,filterCatalog:config.filterCatalog});
    await chrome.runtime.sendMessage({type:'STATUS',status});
  };
  globalThis[KEY]=true;
  boot().catch(e=>chrome.runtime.sendMessage({type:'DIAGNOSTIC',error:e.message}).catch(()=>{}));
  window.addEventListener('pageshow',e=>{if(e.persisted) boot().catch(()=>{});});
  let resuming=false;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||resuming)return;resuming=true;boot().catch(()=>{}).finally(()=>{resuming=false;});});
  window.addEventListener('pagehide',()=>request('STOP').catch(()=>{}));
})();
