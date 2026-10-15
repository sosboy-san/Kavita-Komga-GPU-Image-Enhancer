// Optional reader-thread executor. Synchronous package code cannot be forcibly stopped.
(()=>{'use strict';if(globalThis.__KKGR_MAIN_PROCESSING__)return;
 let host=null,modules={},signature=null,resetRequested=false,running=false;
 const fail=(code,message)=>Object.assign(Error(message),{code});
 function reset(){host?.dispose();host=null;modules={};signature=null;resetRequested=false;}
 function encode(canvas,type){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(fail('ENCODE_TIMEOUT','Image encoding exceeded 30 seconds')),30000);try{canvas.toBlob(blob=>{clearTimeout(timer);blob?resolve(blob):reject(fail('ENCODE_FAILED','Image encoding failed'));},type,type==='image/jpeg'?0.9:1);}catch(e){clearTimeout(timer);reject(e);}});}
 async function run(m,{signal,isCurrent=()=>true,report=null,phase=()=>{}}={}){
  const {source,sw,sh,dw,dh,plan,parameters,timeoutMs,settingsRevision,mimeType}=m,start=performance.now();let initializationMs=0,pipelineMs=0;
  const current=()=>{if(!isCurrent())throw fail('ANALYSIS_CANCELLED','Job cancelled');if(performance.now()>globalThis.__KKGR_PROCESSING_DEADLINE__)throw fail('PROCESSING_TIMEOUT','Image processing deadline exceeded');};
  running=true;globalThis.__KKGR_PROCESSING_DEADLINE__=start+timeoutMs;
  try{
   current();const next=JSON.stringify([timeoutMs,plan,m.packages.map(p=>[p.id,p.stamp])]);if(resetRequested||signature!==next){reset();
    {host=globalThis.__KKGR_GPU__.create({processingTimeoutMs:timeoutMs,waitMs:timeoutMs,onStage:phase});for(const stage of ['pre','renderer','post']){const key=plan[stage];if(!key)continue;const d=stage==='renderer'?(globalThis.__KKGR_BUILTIN_MODULES__?.[key]||globalThis.__KKGR_RENDERER_MODULES__?.[key]):globalThis.__KKGR_FILTER_MODULES__?.[key];if(!d)throw fail('INVALID_DESCRIPTOR','Module unavailable: '+key);phase(stage,d,'prepare');modules[stage]=host.bind(d);current();}}
    signature=next;
   }
   initializationMs=performance.now()-start;current();const pipelineStarted=performance.now();let result;
   result=await host.runPipeline(modules,source,dw,dh,{sourceWidth:sw,sourceHeight:sh,parameters,settingsRevision,signal,isCurrent,onDiagnostic:report,bypassAnalysisStage:m.bypassAnalysisStage});
   pipelineMs=performance.now()-pipelineStarted;current();phase('encode',null,'encode');const encodeStarted=performance.now();let type=mimeType==='image/jpeg'?'image/jpeg':'image/png',canvas=result.canvas;if(!isCurrent())throw fail('ANALYSIS_CANCELLED','Job cancelled');if(type==='image/jpeg'){canvas=document.createElement('canvas');canvas.width=result.canvas.width;canvas.height=result.canvas.height;const x=canvas.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,canvas.width,canvas.height);x.drawImage(result.canvas,0,0);}const blob=await encode(canvas,type);if(!isCurrent())throw fail('ANALYSIS_CANCELLED','Job cancelled');
   return {blob,colorSuggestions:result.colorSuggestions,encoding:{requestedMimeType:mimeType,mimeType:blob.type,quality:blob.type==='image/jpeg'?90:null,alphaBackground:blob.type==='image/jpeg'?'white':null,fallback:blob.type!==mimeType},trace:result.trace,format:result.format,resources:host?.stats(),elapsedMs:performance.now()-start,encodeMs:performance.now()-encodeStarted,outputSize:[result.canvas.width,result.canvas.height],timings:{initializationMs,pipelineMs}};
  }catch(e){resetRequested=true;throw e;}finally{running=false;globalThis.__KKGR_PROCESSING_DEADLINE__=Infinity;if(resetRequested)reset();}
 }
 globalThis.__KKGR_MAIN_PROCESSING__=Object.freeze({run,invalidate:()=>{resetRequested=true;if(!running)reset();}});
})();
