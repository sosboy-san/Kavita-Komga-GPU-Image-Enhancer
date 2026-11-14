// One selection identity for registration, jobs, updates and permission revocation.
(()=>{'use strict';
 const id=p=>p.registrationId||p.metadata.id,stamp=p=>p.installation||String(p.installed);
 function select(config,packages,url){
  const mode=config.processingMode==='speed'?'speed':'worker';
  const active=config.enabled===true&&globalThis.__KKGR_SITES__.sites(config).some(s=>globalThis.__KKGR_SITES__.reader(s,url));
  const ids=new Set([config.renderer,config.filters?.pre,config.filters?.post].filter(Boolean));
  const selected=packages.items.filter(p=>ids.has(id(p)));
  return {mode,active,selected,slots:{renderer:config.renderer||'browser',pre:config.filters?.pre||null,post:config.filters?.post||null},needsUserScripts:active&&selected.some(p=>!p.bundledFile),base:JSON.stringify([mode,active,config.renderer||'browser',config.filters?.pre||null,config.filters?.post||null,selected.map(p=>[id(p),stamp(p)])])};
 }
 function state(selection,allowed){return {key:JSON.stringify([selection.base,allowed]),mode:selection.mode,active:selection.active,slots:selection.slots,allowed,needsUserScripts:selection.needsUserScripts,ready:false,errors:[]};}
 globalThis.__KKGR_MODULE_RUNTIME_POLICY__=Object.freeze({select,state,id,stamp});
})();
