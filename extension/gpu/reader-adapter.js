// Stage F: selected external API 1 filters share the renderer host and GPU surfaces.
// Each stage owns a separate instance; replacement waits for the previous snapshot.
(() => {
 'use strict';
 globalThis.__KKGR_BUILTIN_MODULES__=Object.fromEntries((globalThis.__KKGR_MODULES__||[]).filter(d=>d.kind==='renderer').map(d=>[d.id,d]));
 globalThis.__KKGR_BUILTIN_FILTER_MODULES__=Object.fromEntries((globalThis.__KKGR_MODULES__||[]).filter(d=>d.kind==='filter').map(d=>[d.id,d]));
 const cancellations=new Set();globalThis.__KKGR_CANCEL_ANALYSIS__=()=>{globalThis.__KKGR_PROCESSING__?.cancelAll();for(const cancel of cancellations)cancel();};
 function makeProvider(id,moduleId,name,browser=false){
 const descriptor=globalThis.__KKGR_MODULES__?.find(d=>d.id===moduleId);
 if(!descriptor||!globalThis.__KKGR_GPU__)throw Error('GPU API 1 foundation missing');
 let host=null,module=null,pre=null,post=null,filterSignature=null,disposed=false,encodeStopped=false,lastError='',serial=Promise.resolve();
 function get(){
  if(disposed)throw Error('Renderer disposed');
  if(encodeStopped)throw Error('Encoder stopped; reopen reader to reconnect');
  if(!host){
   const candidate=globalThis.__KKGR_GPU__.create();
   try{module=browser?null:candidate.bind(descriptor);host=candidate;}catch(e){candidate.dispose();throw e;}
  }
  if(host.stats().stopped)throw Error('GPU host stopped; reopen reader to reconnect');
  return host;
 }
 const provider=Object.freeze({apiVersion:1,id,supportsFilters:true,runAtNativeSize:true,get pipelineRevision(){const settings=globalThis.__KKGR_PLATFORM__?.settings||{};return JSON.stringify(['stage-f',settings.processingTimeoutMs,settings.processingRetryRevision,settings.filters||{},globalThis.__KKGR_PARAMETERS__?.selected(settings,settings.filterCatalog||[])||{},globalThis.__KKGR_FILTER_SIGNATURE__]);},name:browser?'Browser':name,version:descriptor.version,implementationRevision:descriptor.implementationRevision,
  ok(){if(globalThis.__KKGR_PROCESSING__)return !disposed;try{get();return true;}catch(e){lastError=String(e.message);return false;}},
  why:()=>lastError||'GPU API 1 unavailable',
  outputLabel:()=>`${browser?'browser':moduleId} (GPU API 1, ${host?.capabilities.format||'auto'})`,
  render(){throw Error('GPU API 1 requires asynchronous encode');},
  startEncodeAsync(source,sw,sh,dw,dh,type,label,measureRender){
   if(globalThis.__KKGR_PROCESSING__)return globalThis.__KKGR_PROCESSING__.start(id,source,sw,sh,dw,dh,type,globalThis.__KKGR_PLATFORM__?.settings,false,{role:/ahead|prefetch/i.test(label||'')?'ahead':/split/i.test(label||'')?'split':'current'});
   const controller=globalThis.AbortController?new AbortController():null;
   const cancel=()=>controller?.abort();cancellations.add(cancel);
   const epoch=globalThis.__KKGR_CORE__?.processingEpoch;
   const sourceUrl=source?.currentSrc||source?.src;
   const isCurrent=()=>!controller?.signal.aborted&&(epoch===undefined||epoch===globalThis.__KKGR_CORE__?.processingEpoch)&&(sourceUrl===undefined||sourceUrl===(source?.currentSrc||source?.src));
   const settingsSnapshot=JSON.parse(JSON.stringify(globalThis.__KKGR_PLATFORM__?.settings||{}));
   const job=serial.catch(()=>{}).then(async()=>{
    if(!isCurrent())throw Object.assign(Error("Job cancelled"),{code:"ANALYSIS_CANCELLED"});
    const initStarted=performance.now(),wasInitialized=!!host;
    const h=get();
    const initializationMs=performance.now()-initStarted;
    const settings=settingsSnapshot,slots=settings.filters||{};
    const parameters=globalThis.__KKGR_PARAMETERS__?.selected(settings,settings.filterCatalog||[])||{};
    const signature=JSON.stringify([slots,globalThis.__KKGR_FILTER_SIGNATURE__]);
    if(signature!==filterSignature){if(pre)h.disposeModule(pre);if(post)h.disposeModule(post);pre=post=null;filterSignature=null;
      try{for(const stage of ['pre','post']){const fid=slots[stage];if(!fid)continue;const descriptor=globalThis.__KKGR_FILTER_MODULES__?.[fid];if(!descriptor||!descriptor.supportedStages.includes(stage))throw Error('Filter unavailable: '+fid);const bound=h.bind(descriptor);if(stage==='pre')pre=bound;else post=bound;}filterSignature=signature;}catch(e){if(pre)h.disposeModule(pre);if(post)h.disposeModule(post);pre=post=null;throw e;}
    }
    const useRenderer=!browser&&(sw!==dw||sh!==dh);
    const started=performance.now();
    const run=()=>h.runPipeline({pre,renderer:useRenderer?module:null,post},source,dw,dh,{sourceWidth:sw,sourceHeight:sh,parameters,settingsRevision:epoch??settings.revision??0,signal:controller?.signal,isCurrent});
    const result=await (measureRender?measureRender(run):run());
    globalThis.__KKGR_GPU_LAST_JOB__=Object.freeze({id,initializationMs,firstJob:!wasInitialized,source:[sw,sh],output:[result.canvas.width,result.canvas.height],rendererUsed:useRenderer,trace:result.trace,computeAndWaitMs:performance.now()-started,filters:{pre:slots.pre||null,post:slots.post||null},resources:h.stats()});
    if(disposed)throw Error('Renderer disposed');
    // Keep the Canvas locked until its snapshot finishes, including ahead jobs.
    return new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{encodeStopped=true;reject(Error(label+': encode timeout'));},30000);
     try{let output=result.canvas;if(type==='image/jpeg'){output=document.createElement('canvas');output.width=result.canvas.width;output.height=result.canvas.height;const x=output.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,output.width,output.height);x.drawImage(result.canvas,0,0);}output.toBlob(blob=>{clearTimeout(timer);if(blob)resolve(blob);else reject(Error(label+': encode failed'));},type,type==='image/jpeg'?0.9:1);}catch(e){clearTimeout(timer);reject(e);}
    });
   });
   const tracked=job.finally(()=>cancellations.delete(cancel));serial=tracked;return tracked;
  },
  dispose(){if(disposed)return;disposed=true;serial.catch(()=>{}).then(()=>{host?.dispose();host=null;module=null;});}
 });
 return provider;
 }
 globalThis.__KKGR_BROWSER_PIPELINE_PROBE__=makeProvider('browser','lohalo-jr','Browser',true);
 const queue=globalThis.__KKGR_RENDERER_PROVIDERS__||[];
 const providers=[['lohalo','lohalo-jr','LoHalo Jr.'],['nohalo','nohalo-jr','NoHalo Jr.']].map(args=>makeProvider(...args));
 if(providers.some(p=>queue.some(q=>q.id===p.id)))throw Error('Duplicate GPU API 1 provider');
 globalThis.__KKGR_RENDERER_PROVIDERS__=[...queue,...providers];
})();
