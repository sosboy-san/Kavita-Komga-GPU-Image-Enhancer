// Packaged defaults are installed once. Deletion is persistent and imports keep their IDs.
(()=>{'use strict';
 const defaults=globalThis.__KKGR_DEFAULT_FILTERS__;
 function create(storage,readSource){
  let initialization;
  async function initialize(){
   const saved=await storage.get(['managedRenderers','config']);
   const state=saved.managedRenderers||{revision:0,items:[]};
   if(state.defaultFiltersSeeded===1)return;
   const added=[];
   for(const item of defaults){
    if(state.items.some(p=>p.metadata.id===item.metadata.id))continue;
    const code=await readSource(item.file);
    const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code))),n=>n.toString(16).padStart(2,'0')).join('');
    if(checksum!==item.checksum)throw Error('Packaged filter checksum mismatch');
    state.items.push({registrationId:item.metadata.id,metadata:item.metadata,checksum,code,filename:item.file.split('/').at(-1),bundledFile:item.file,installation:'bundled:'+checksum,installed:Date.now()});
    added.push(item.metadata);
   }
   state.defaultFiltersSeeded=1;state.revision++;
   const config={...(saved.config||{})},candidates={pre:[],post:[],...config.filterCandidates};
   for(const stage of ['pre','post'])candidates[stage]=[...new Set([...candidates[stage],...added.filter(d=>d.supportedStages.includes(stage)).map(d=>d.id)])].slice(0,globalThis.__KKGR_CANDIDATE_POLICY__?.candidateLimit||5);
   config.filterCandidates=candidates;
   await storage.set({managedRenderers:state,config});
  }
  return {
   async get(){if(!initialization)initialization=initialize().catch(e=>{initialization=null;throw e;});await initialization;return (await storage.get('managedRenderers')).managedRenderers;},
   trustedFile(metadata,checksum){return defaults.find(p=>p.checksum===checksum&&globalThis.__KKGR_MODULE_CONTRACT__.equivalent(p.metadata,metadata))?.file;}
  };
 }
 globalThis.__KKGR_DEFAULT_PACKAGE_STORE__=Object.freeze({create});
})();
