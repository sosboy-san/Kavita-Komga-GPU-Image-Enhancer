(()=>{'use strict';
 const connections=new Set();
 addEventListener('message',e=>{
  if(e.source!==parent||e.data?.type!=='KKGR_WORKER_CONNECT'||e.ports.length!==1)return;
  const port=e.ports[0],url=URL.createObjectURL(new Blob([globalThis.__KKGR_WORKER_SOURCE__],{type:'text/javascript'}));
  let worker;try{worker=new Worker(url);}catch(error){port.postMessage({error:{code:'WORKER_UNAVAILABLE',message:error.message}});URL.revokeObjectURL(url);port.close();return;}
  URL.revokeObjectURL(url);connections.add(worker);
  const stop=()=>{worker.terminate();connections.delete(worker);port.close();};
  port.onmessage=event=>{if(event.data?.type==='STOP'){stop();return;}const m=event.data;try{worker.postMessage(m,m.source instanceof ImageBitmap?[m.source]:[]);}catch(error){port.postMessage({id:m.id,error:{code:'WORKER_UNAVAILABLE',message:error.message}});stop();}};
  worker.onmessage=event=>port.postMessage(event.data);
  worker.onerror=error=>{port.postMessage({error:{code:'WORKER_FAILED',message:error.message}});stop();};
  port.start();port.postMessage({type:'CONNECTED'});
 });
 addEventListener('pagehide',()=>{for(const worker of connections)worker.terminate();connections.clear();});
 parent.postMessage({type:'KKGR_WORKER_FRAME_READY'},'*');
})();
