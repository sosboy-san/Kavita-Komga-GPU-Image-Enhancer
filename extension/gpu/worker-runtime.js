(()=>{'use strict';
 let host=null,modules={},signature=null,tail=Promise.resolve();
 const bundled=[...(globalThis.__KKGR_MODULES__||[])];let currentId;
 const phase=(id,stage,module,action)=>postMessage({id:currentId||id,type:'PHASE',stage,module:module?{id:module.id,packageId:module.packageId||module.id,name:module.name,version:module.version||null,implementationRevision:module.implementationRevision||null,stamp:module.stamp||null}:null,action});
 function reset(){host?.dispose();host=null;modules={};signature=null;}
 async function run(m){
  const {id,source,sw,sh,dw,dh,plan,parameters,timeoutMs,settingsRevision,mimeType}=m;const report=m.diagnostics?(event)=>postMessage({id,type:"DIAGNOSTIC",event}):null;
  globalThis.__KKGR_GPU_INSTANCE_ID__??=id;currentId=id;const start=performance.now(),workerQueueMs=m.receivedAt===undefined?0:start-m.receivedAt,initializationStarted=start;let initializationMs=0,pipelineMs=0;globalThis.__KKGR_PROCESSING_DEADLINE__=start+timeoutMs;
  try{
   const next=JSON.stringify([timeoutMs,plan,m.packages.map(p=>[p.id,p.stamp])]);
   if(signature!==next){reset();globalThis.__KKGR_MODULES__=[...bundled];
    for(const p of m.packages){phase(id,p.kind==='filter'?(plan.pre===p.id?'pre':'post'):'renderer',{...p.metadata,id:p.id,packageId:p.metadata.id,stamp:p.stamp},'register');const before=globalThis.__KKGR_MODULES__;const old=before.length;new Function(p.code)();const queue=globalThis.__KKGR_MODULES__;if(queue.length!==old+1)throw Object.assign(Error('One descriptor per file'),{code:'INVALID_DESCRIPTOR'});const d=queue.at(-1),actual=globalThis.__KKGR_MODULE_CONTRACT__.validate(d);if(!globalThis.__KKGR_MODULE_CONTRACT__.equivalent(actual,p.metadata))throw Object.assign(Error('Package metadata mismatch'),{code:'INVALID_DESCRIPTOR'});queue[queue.length-1]={...d,packageId:d.id,id:p.id,stamp:p.stamp};}
    {host=globalThis.__KKGR_GPU__.create({processingTimeoutMs:timeoutMs,waitMs:timeoutMs,onStage:(stage,d,action)=>phase(id,stage,d,action)});
     for(const stage of ['pre','renderer','post']){const key=plan[stage];if(!key)continue;const d=globalThis.__KKGR_MODULES__.find(d=>d.id===key);if(!d)throw Error('Module unavailable: '+key);phase(id,stage,d,'prepare');modules[stage]=host.bind(d);}
    }signature=next;
   }
   initializationMs=performance.now()-initializationStarted;const pipelineStarted=performance.now();let result;
   result=await host.runPipeline(modules,source,dw,dh,{sourceWidth:sw,sourceHeight:sh,parameters,settingsRevision,onDiagnostic:report,bypassAnalysisStage:m.bypassAnalysisStage});
   pipelineMs=performance.now()-pipelineStarted;phase(id,'encode',null,'encode');const encodeStarted=performance.now();let actualType=mimeType==='image/jpeg'?'image/jpeg':'image/png',encodeCanvas=result.canvas;if(actualType==='image/jpeg'){encodeCanvas=new OffscreenCanvas(result.canvas.width,result.canvas.height);const x=encodeCanvas.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,encodeCanvas.width,encodeCanvas.height);x.drawImage(result.canvas,0,0);}const blob=await encodeCanvas.convertToBlob({type:actualType,quality:actualType==='image/jpeg'?0.9:1});const encoding={requestedMimeType:mimeType,mimeType:blob.type,quality:blob.type==='image/jpeg'?90:null,alphaBackground:blob.type==='image/jpeg'?'white':null,fallback:blob.type!==mimeType};
   postMessage({id,type:'RESULT',blob,colorSuggestions:result.colorSuggestions,encoding,trace:result.trace,format:result.format,resources:host?.stats(),elapsedMs:performance.now()-start,encodeMs:performance.now()-encodeStarted,outputSize:[result.canvas.width,result.canvas.height],timings:{workerQueueMs,initializationMs,pipelineMs}});
  }catch(error){postMessage({id,error:{code:error.code||'EXECUTION_FAILED',message:String(error.message||error)}});if(error.code==='GPU_TIMEOUT'||error.code==='CONTEXT_LOST'||error.code==='GPU_WAIT_FAILED'||['MEMORY_BUDGET_EXCEEDED','ALLOCATION_FAILED','FRAMEBUFFER_INCOMPLETE','SIZE_LIMIT'].includes(error.code))reset();}
  finally{source?.close?.();globalThis.__KKGR_PROCESSING_DEADLINE__=Infinity;}
 }
 onmessage=e=>{if(e.data?.type!=='RUN')return;e.data.receivedAt=performance.now();tail=tail.catch(()=>{}).then(()=>run(e.data));};
})();
