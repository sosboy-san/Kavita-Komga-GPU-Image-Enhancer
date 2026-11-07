// Candidate providers are metadata-only. Module functions belong to their executor.
(()=>{'use strict';
 const catalog=globalThis.__KKGR_RENDERER_CATALOG__,pending=globalThis.__KKGR_RENDERER_PROVIDERS__||[],prepared=[];
 for(const d of globalThis.__KKGR_EXTERNAL_RENDERERS__||[]){try{
  globalThis.__KKGR_MODULE_CONTRACT__.normalize(d);
  if(d.kind!=='renderer'||!catalog.some(x=>x.id===d.id))throw Error('Invalid renderer');
  if([...pending,...prepared].some(x=>x.id===d.id))throw Error('Duplicate renderer');
  let disposed=false;
  prepared.push(Object.freeze({apiVersion:1,managed:true,id:d.id,name:d.name,version:d.version,implementationRevision:d.implementationRevision,supportsFilters:true,runAtNativeSize:true,
   get pipelineRevision(){const s=globalThis.__KKGR_PLATFORM__?.settings||{};return JSON.stringify([s.processingTimeoutMs,s.processingRetryRevision,s.filters,s.filterParameters,globalThis.__KKGR_FILTER_SIGNATURE__]);},
   dispose:()=>{disposed=true;},ok:()=>!disposed&&globalThis.__KKGR_MODULE_RUNTIME__?.ready!==false,
   why:()=>globalThis.__KKGR_MODULE_RUNTIME__?.errors?.[0]?.message||'Module runtime is not ready',outputLabel:()=>d.name,
   render(){throw Error('Asynchronous renderer');},
   startEncodeAsync:(source,sw,sh,dw,dh,type,label)=>globalThis.__KKGR_PROCESSING__.start(d.id,source,sw,sh,dw,dh,type,globalThis.__KKGR_PLATFORM__?.settings,false,{role:/ahead|prefetch/i.test(label||'')?'ahead':/split/i.test(label||'')?'split':'current'})
  }));
 }catch(error){(globalThis.__KKGR_MODULE_DIAGNOSTICS__??=[]).push({stage:'descriptor',id:d?.id,message:String(error.message)});}}
 globalThis.__KKGR_RENDERER_PROVIDERS__=[...prepared,...pending].sort((a,b)=>catalog.findIndex(e=>e.id===a.id)-catalog.findIndex(e=>e.id===b.id));
 globalThis.__KKGR_EXTERNAL_RENDERERS__=[];
})();
