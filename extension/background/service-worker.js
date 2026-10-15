'use strict';
importScripts('site-model.js','../modules/catalog.js','../ui/package-metadata.js','../ui/parameter-schema.js','../ui/analysis-contract.js','../ui/module-contract.js','../ui/candidate-policy.js','../ui/i18n.js','settings-tabs.js');
const settingsTabs=chrome.runtime.onConnect?globalThis.__KKGR_SETTINGS_TABS__(id=>chrome.storage.local.set({dev1SettingsTabId:id})):null;
const Policy=globalThis.__KKGR_CANDIDATE_POLICY__;
const BUNDLED_CATALOG=globalThis.__KKGR_RENDERER_CATALOG__;
let RENDERER_IDS=BUNDLED_CATALOG.filter(e=>e.kind!=='filter').map(e=>e.id);
const withDeadline=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('実行が10秒以内に応答しませんでした。対象タブを表示してから再試行してください。')),10000);})]).finally(()=>clearTimeout(timer));};
async function packageState(){return (await chrome.storage.local.get('managedRenderers')).managedRenderers||{revision:0,items:[]};}
const runtimeId=item=>item.registrationId||item.metadata.id;
function catalogItems(ps){return [...BUNDLED_CATALOG.map(x=>({...x})),...ps.items.map(x=>({...x.metadata,id:runtimeId(x),packageId:x.metadata.id,installed:x.installed,updated:x.updated,checksum:x.checksum||null,filename:x.filename,module:true,managed:true}))];}
async function moduleLocale(){const choice=(await chrome.storage.local.get('uiLanguage')).uiLanguage;return globalThis.__KKGR_I18N__.resolve(choice,chrome.i18n?.getUILanguage?.()||globalThis.navigator?.language||'en');}
async function rendererCatalog(){const ps=await packageState();const locale=await moduleLocale(),entries=catalogItems(ps).filter(x=>x.kind!=='filter').map(x=>({...x,name:globalThis.__KKGR_PACKAGE_METADATA__.translated(x,'name',locale)||x.name}));const names=(await chrome.storage.local.get('config')).config?.rendererDisplayNames||{};for(const entry of entries){entry.originalName=entry.name;entry.name=names[entry.id]||(entry.managed&&entries.filter(x=>x.managed&&x.packageId===entry.packageId).length>1?entry.name+' · v'+entry.version:entry.name);}RENDERER_IDS=entries.map(e=>e.id);return entries;}
// Keep the copied source intact. Isolate each registration queue, then alias only
// its descriptor to the host's unique candidate ID before adapting it.
function registrationCode(item){
 const filter=item.metadata.kind==='filter',key='__KKGR_MODULES__';
 return '(function(){const key='+JSON.stringify(key)+';const previous=globalThis[key]||[];const receipts=globalThis.__KKGR_REGISTRATION_RECEIPTS__||(globalThis.__KKGR_REGISTRATION_RECEIPTS__={});const receiptId='+JSON.stringify(runtimeId(item))+';receipts[receiptId]={ok:false,message:"Registration did not complete"};globalThis[key]=[];try{\n'+item.code+'\n;const queue=globalThis[key];if(!Array.isArray(queue)||queue.length!==1)throw Error("Invalid package registration");const descriptor=queue[0];const actual=globalThis.__KKGR_MODULE_CONTRACT__.validate(descriptor);if('+ '!globalThis.__KKGR_MODULE_CONTRACT__.equivalent(actual,'+JSON.stringify(item.metadata)+')'+')throw Error("Package metadata mismatch");globalThis[key]=[...previous,Object.freeze({...descriptor,id:'+JSON.stringify(runtimeId(item))+',packageId:'+JSON.stringify(item.metadata.id)+',stamp:'+JSON.stringify(item.installation||String(item.installed))+'})];receipts[receiptId]={ok:true};}catch(error){globalThis[key]=previous;receipts[receiptId]={ok:false,message:String(error?.message||error).slice(0,240)};throw error;}})();';
}
async function filterCatalog(){const locale=await moduleLocale(),ps=await packageState(),names=(await chrome.storage.local.get('config')).config?.rendererDisplayNames||{};return catalogItems(ps).filter(x=>x.kind==='filter').map(x=>({...x,name:globalThis.__KKGR_PACKAGE_METADATA__.translated(x,'name',locale)||x.name})).map(x=>({...x,originalName:x.name,name:names[x.id]||(ps.items.filter(item=>item.metadata.id===x.packageId).length>1?x.name+' · v'+x.version:x.name)}));}
let packageSerial=Promise.resolve();
function managePackage(m){return packageSerial=packageSerial.catch(()=>{}).then(()=>managePackageInternal(m));}
async function managePackageInternal(m){
 const ps=await packageState(),c=await config();
 if(m.type==='ADD_PACKAGE'||m.type==='UPDATE_PACKAGE'){
  const d=globalThis.__KKGR_MODULE_CONTRACT__.validatePublic(m.metadata);
  if(typeof m.code!=='string'||new TextEncoder().encode(m.code).length>1024*1024)throw Error('Invalid package source');
  if(BUNDLED_CATALOG.some(x=>x.id===d.id))throw Error('同じIDの組み込みパッケージがあります。今回は更新できません。');
  if(ps.items.some(x=>x.metadata.id===d.id&&x.metadata.version===d.version))throw Error('同じID・同じバージョンが登録されています。既存のものは保持しました。');
  if(m.type==='ADD_PACKAGE'&&BUNDLED_CATALOG.length+ps.items.length>=Policy.registrationLimit)throw Error(globalThis.__KKGR_I18N__.t('packages.limitReached',{limit:Policy.registrationLimit}));
  const family=ps.items.filter(x=>x.metadata.id===d.id);
  const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(m.code)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const now=Date.now(),installation=crypto.randomUUID();
  if(m.type==='UPDATE_PACKAGE'){
   const index=ps.items.findIndex(x=>runtimeId(x)===m.packageId);if(index<0||ps.items[index].metadata.id!==d.id)throw Error('更新対象のパッケージIDが一致しません。');
   const old=ps.items[index];if(d.kind==='filter')for(const stage of ['pre','post'])if(c.filterParameters?.[stage]?.[runtimeId(old)])globalThis.__KKGR_PARAMETERS__.values(d.parameters,c.filterParameters[stage][runtimeId(old)]);if(old.metadata.kind!==d.kind)throw Error("Package kind cannot change during update");ps.items[index]={...old,metadata:d,checksum,code:m.code,filename:String(m.filename||'module.js'),updated:now,installation};
  }else{
   if(family.length&&m.mode!=='additional')throw Error('同じIDの別バージョンがあります。追加か更新を選択してください。');
   const occupied=new Set([...BUNDLED_CATALOG.map(x=>x.id),...ps.items.map(runtimeId)]);
   const id=occupied.has(d.id)?'package.'+crypto.randomUUID():d.id;
   ps.items.push({registrationId:id,metadata:d,checksum,code:m.code,filename:String(m.filename||'module.js'),installed:now,installation});
   if(d.kind!=='filter')c.disabledRenderers=[...new Set([...c.disabledRenderers,id])];
  }
 }else if(m.type==='DELETE_PACKAGE'){
  if(!ps.items.some(x=>runtimeId(x)===m.packageId))throw Error('削除できる外部パッケージがありません');
  ps.items=ps.items.filter(x=>runtimeId(x)!==m.packageId);for(const stage of ['pre','post'])delete c.filterParameters?.[stage]?.[m.packageId];c.rendererDisplayNames={...(c.rendererDisplayNames||{})};delete c.rendererDisplayNames[m.packageId];
 }else throw Error('未対応の管理操作です');
 const catalog=catalogItems(ps),ids=catalog.filter(x=>x.kind!=='filter').map(x=>x.id);const filters=catalog.filter(x=>x.kind==='filter');c.filterCandidates={pre:[],post:[],...(c.filterCandidates||{})};c.filters={pre:null,post:null,...(c.filters||{})};for(const stage of ['pre','post']){const allowed=filters.filter(x=>x.supportedStages.includes(stage)).map(x=>x.id);c.filterCandidates[stage]=c.filterCandidates[stage].filter(id=>allowed.includes(id));if(!allowed.includes(c.filters[stage]))c.filters[stage]=null;}c.rendererOrder=(c.rendererOrder||[]).filter(x=>ids.includes(x));c.rendererCatalog=catalog;c.disabledRenderers=c.disabledRenderers.filter(x=>ids.includes(x));if(c.renderer!=='browser'&&!ids.includes(c.renderer))c.renderer='browser';ps.revision++;c.revision++;
 await chrome.storage.local.set({managedRenderers:ps,config:c});notifyReaderPages(true).catch(()=>{});return {ok:true,catalog,message:'保存しました。読書ページへ反映します。反映されない場合はタブを表示してください。'};
}

const Sites=globalThis.__KKGR_SITES__;
const QUICK_DEFAULT={"order": ["power", "pre", "renderer", "post", "adjust", "custom", "hud", "settings"], "visible": ["power", "pre", "renderer", "post", "adjust", "hud", "settings"], "portrait": {"pos": "右下", "dir": "横"}, "landscape": {"pos": "右下", "dir": "横"}};
const DEFAULT={processingMode:'worker',outputFormat:'png',blobBudgets:{png:128,jpeg:64},decodedForward:4,decodedBack:4,developerMode:false,diagnosticRecording:false,diagnosticClearRevision:0,processingTimeoutMs:10000,processingRetryRevision:0,enabled:true,hud:true,renderer:'browser',hudMode:'normal',hudPosition:'右下',disabledRenderers:[],quick:QUICK_DEFAULT,revision:0,origins:[]};
let serial=Promise.resolve();
let providerInjection=Promise.resolve();
const config=async()=>{const rendererEntries=await rendererCatalog(),filterEntries=await filterCatalog();const stored={...DEFAULT,...(await chrome.storage.local.get('config')).config};stored.processingMode=['worker','speed'].includes(stored.processingMode)?stored.processingMode:'worker';stored.outputFormat=['png','jpeg'].includes(stored.outputFormat)?stored.outputFormat:'png';stored.blobBudgets={png:[64,128,256].includes(stored.blobBudgets?.png)?stored.blobBudgets.png:128,jpeg:[64,128,256].includes(stored.blobBudgets?.jpeg)?stored.blobBudgets.jpeg:64};for(const k of ['decodedForward','decodedBack'])stored[k]=[2,4,8].includes(stored[k])?stored[k]:4;stored.developerMode=stored.developerMode===true;stored.diagnosticRecording=stored.developerMode&&stored.diagnosticRecording===true;if(!stored.developerMode)stored.hudMode="normal";stored.processingTimeoutMs=Number.isSafeInteger(stored.processingTimeoutMs)&&stored.processingTimeoutMs>=1000&&stored.processingTimeoutMs<=60000?stored.processingTimeoutMs:10000;stored.quick={...QUICK_DEFAULT,...(stored.quick||{}),order:[...new Set([...(stored.quick?.order||QUICK_DEFAULT.order),...QUICK_DEFAULT.order])].filter(k=>QUICK_DEFAULT.order.includes(k)),visible:[...new Set(['power',...(stored.quick?.visible||QUICK_DEFAULT.visible),...(!stored.quick?.order?.includes('adjust')?['adjust']:[])])].filter(key=>key!=='custom')};stored.rendererOrder=[...new Set([...(stored.rendererOrder||[]),...RENDERER_IDS])].filter(x=>RENDERER_IDS.includes(x));stored.disabledRenderers=(stored.disabledRenderers||[]).filter(id=>RENDERER_IDS.includes(id));if(stored.renderer!=='browser'&&!RENDERER_IDS.includes(stored.renderer))stored.renderer='browser';stored.filterCandidates={pre:[],post:[],...(stored.filterCandidates||{})};stored.filters={pre:null,post:null,...(stored.filters||{})};stored.filterParameters={pre:{},post:{},...(stored.filterParameters||{})};for(const stage of ['pre','post']){const allowed=filterEntries.filter(x=>x.supportedStages.includes(stage)).map(x=>x.id);stored.filterCandidates[stage]=stored.filterCandidates[stage].filter(id=>allowed.includes(id)).slice(0,Policy.candidateLimit);if(!stored.filterCandidates[stage].includes(stored.filters[stage]))stored.filters[stage]=null;}const language=(await chrome.storage.local.get('uiLanguage')).uiLanguage;const sites=Sites.sites(stored);return {...stored,appVersion:chrome.runtime.getManifest?.().version,uiLanguage:globalThis.__KKGR_I18N__.isChoice(language)?language:'Auto',candidatePolicy:Policy,rendererCatalog:rendererEntries,filterCatalog:filterEntries,sites,origins:[...new Set(sites.map(x=>x.origin))]};};
const originOf=url=>{try {const u=new URL(url);return /^https?:$/.test(u.protocol)?u.origin:null;}catch{return null;}};
// Permissions cover host-pattern ports; exact port is enforced here and at HELLO.
const pattern=origin=>{const u=new URL(origin);return `${u.protocol}//${u.hostname}/*`;};
const permitted=async(c,url)=>{const o=originOf(url);return !!o && c.sites.some(site=>Sites.matches(site,url)) && await chrome.permissions.contains({origins:[pattern(o)]});};
const cleanError=e=>String(e?.message||e).replace(/https?:\/\/\S+/g,'[URL]').slice(0,240);
const actionPaintSequence=new Map(),actionImageCache=new Map();
async function actionImageData(icon){
 if(actionImageCache.has(icon))return actionImageCache.get(icon);
 const data={};for(const size of [16,32,48,128]){
 const response=await fetch(chrome.runtime.getURL('icons/'+icon+'-'+size+'.png'));
 if(!response.ok)throw Error('Icon PNG fetch failed: '+response.status);
 const bitmap=await createImageBitmap(await response.blob()),canvas=new OffscreenCanvas(size,size),context=canvas.getContext('2d');
 context.drawImage(bitmap,0,0,size,size);bitmap.close();data[size]=context.getImageData(0,0,size,size);
 }actionImageCache.set(icon,data);return data;
}

async function paint(tabId,status,c,urlHint=null) {
 const sequence=(actionPaintSequence.get(tabId)||0)+1;actionPaintSequence.set(tabId,sequence);
 const tab=await chrome.tabs.get(tabId).catch(()=>null);
 if(!tab||actionPaintSequence.get(tabId)!==sequence)return;
 const registered=c.sites.some(site=>Sites.matches(site,tab.url||urlHint||''));
 const icon=!registered?'unregistered':c.enabled?'registered-on':'registered-off';
 const locale=await moduleLocale(),state=locale==='ja'?(!registered?'未登録サイト':c.enabled?'登録済み・ON':'登録済み・OFF'):(!registered?'Unregistered site':c.enabled?'Registered · ON':'Registered · OFF');
 if(actionPaintSequence.get(tabId)!==sequence)return;
 const record={tabId,registered,enabled:c.enabled,icon,hasTabUrl:!!tab.url,hasUrlHint:!!urlHint,siteCount:c.sites.length,revision:c.revision,updated:Date.now()};
 try{
 const imageData=typeof OffscreenCanvas==='function'?await actionImageData(icon):null;
 if(actionPaintSequence.get(tabId)!==sequence)return;
 await chrome.action.setIcon(imageData?{tabId,imageData}:{tabId,path:Object.fromEntries([16,32,48,128].map(n=>[n,'icons/'+icon+'-'+n+'.png']))});
 await chrome.action.setBadgeText({tabId,text:''});
 await chrome.action.setTitle({tabId,title:'Kavita & Komga GPU Image Enhancer — '+state});
 record.ok=true;
 }catch(error){record.ok=false;record.error=String(error?.message||error);console.error('GPU Image Enhancer action icon',record);}
 await chrome.storage.session.set({['action-icon:'+tabId]:record});

}
async function storeStatus(sender,status,error=null) {
  const c=await config(), id=sender.tab?.id;
  if(id===undefined || sender.frameId!==0) return;
  const key=`tab:${id}`;
  const allowed=await permitted(c,sender.url);
  const existing=(await chrome.storage.session.get(key))[key];
  if(status && (!allowed || existing?.documentId!==sender.documentId || status.revision!==c.revision || status.enabled!==c.enabled)) return;
  await chrome.storage.session.set({[key]:{documentId:sender.documentId,status:status||null,
    diagnostic:error,updated:Date.now()}});
  await paint(id,status,c,sender.url||sender.tab?.url);
}
async function hello(sender) {
  const execute=request=>withDeadline(chrome.scripting.executeScript(request));
  let c=await config();
  if(sender.frameId!==0 || !await permitted(c,sender.url)) return {allowed:false};
  await execute({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},
    world:'MAIN',files:['content/main.js']});
  // Old E2 MAIN singletons can survive an Extension update in an open tab.
  // Never inject Core into a document whose MAIN platform was not established.
  const platform=await execute({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},
    world:'MAIN',func:()=>!!globalThis.__KKGR_PLATFORM__});
  if(platform[0]?.result!==true)
    throw Error('MAIN接続基盤が未初期化です。対象サイトを再読み込みしてから再接続してください。');
  // Serialize descriptor loading only; never block STATUS/HELLO on UI reconciliation.
  providerInjection=providerInjection.catch(()=>{}).then(async()=>{
  c=await config();
  const loaded=await execute({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},
    world:'MAIN',func:()=>{if(globalThis.__KKGR_CORE__&&!globalThis.__KKGR_DEV4_1_4_READY__)throw Error('DEV4への更新後は読書タブを再読み込みしてください。');return !!globalThis.__KKGR_DEV4_1_4_READY__;}});
  if(!loaded[0]?.result) {
    const target={tabId:sender.tab.id,documentIds:[sender.documentId]};
    const runFiles=files=>withDeadline(chrome.scripting.executeScript({target,world:'MAIN',files}));
    const ps=await packageState(),catalog=await rendererCatalog();
    await execute({target,world:'MAIN',func:entries=>{globalThis.__KKGR_RENDERER_CATALOG__=Object.freeze(entries.map(Object.freeze));globalThis.__KKGR_EXTERNAL_RENDERERS__=[];globalThis.__KKGR_MODULES__=[];},args:[catalog]});
    await runFiles(['ui/package-metadata.js','ui/parameter-schema.js','ui/analysis-contract.js','ui/module-contract.js']);
    await runFiles(['ui/developer-diagnostics.js','gpu/processing-client.js','gpu/main-runtime.js','gpu/cpu-analysis.js','gpu/host.js','gpu/lohalo-jr.js','gpu/nohalo-jr.js','gpu/usm.js']);
    const diagnostics=[];
    for(const file of new Set(BUNDLED_CATALOG.filter(e=>e.kind!=='filter').map(e=>e.file))){
      try{await runFiles([file]);}catch(error){diagnostics.push({stage:'file',file,message:cleanError(error)});}
    }
    const failed=[];
    for(const item of ps.items.filter(x=>x.metadata.kind!=='filter')){try{if(!chrome.userScripts?.execute)throw Error('ユーザースクリプトを許可してください。');const result=await withDeadline(chrome.userScripts.execute({target,world:'MAIN',js:[{code:registrationCode(item)}]}));if(result.some(x=>x.error))throw Error(result.find(x=>x.error).error);}catch(error){failed.push(runtimeId(item));diagnostics.push({stage:'external',id:runtimeId(item),message:cleanError(error)});}}
    await execute({target,world:'MAIN',func:(items,failed)=>{globalThis.__KKGR_MODULE_DIAGNOSTICS__=items;globalThis.__KKGR_RENDERER_CATALOG__=Object.freeze(globalThis.__KKGR_RENDERER_CATALOG__.filter(x=>!failed.includes(x.id)));},args:[diagnostics,failed]});
    await execute({target,world:'MAIN',func:()=>{globalThis.__KKGR_EXTERNAL_RENDERERS__=(globalThis.__KKGR_MODULES__||[]).filter(d=>d.kind==='renderer'&&d.packageId);}});await runFiles(['modules/module-loader.js']);
    await execute({target,world:'MAIN',func:()=>{const available=globalThis.__KKGR_RENDERER_PROVIDERS__||[];globalThis.__KKGR_RENDERER_CATALOG__=Object.freeze(globalThis.__KKGR_RENDERER_CATALOG__.filter(e=>{const ok=available.some(p=>p.id===e.id);if(!ok)globalThis.__KKGR_MODULE_DIAGNOSTICS__.push({stage:'missing',id:e.id,message:'登録失敗のためこのページでは使用できません'});return ok;}));}});
    await runFiles(['content/providers-ready.js']);
    await execute({target,world:'MAIN',func:items=>{globalThis.__KKGR_MODULE_STAMPS__=Object.fromEntries(items.filter(x=>globalThis.__KKGR_RENDERER_CATALOG__.some(e=>e.id===x.id)).map(x=>[x.id,x.stamp]));},args:[ps.items.map(x=>({id:runtimeId(x),stamp:x.installation||String(x.installed)}))]});
    const moduleResult=await execute({target,world:'MAIN',func:()=>globalThis.__KKGR_MODULE_DIAGNOSTICS__||[]});
    await chrome.storage.session.set({[`modules:${sender.tab.id}`]:{documentId:sender.documentId,items:moduleResult[0]?.result||[]}});
    await syncRuntimeFilters(target);
  }else{await syncRuntimeModules({tabId:sender.tab.id,documentIds:[sender.documentId]});}
  const effective=await execute({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},
    world:'MAIN',func:settings=>{if(settings.renderer!=='browser'&&!globalThis.__KKGR_RENDERER_CATALOG__.some(e=>e.id===settings.renderer))settings.renderer='browser';Object.assign(globalThis.__KKGR_PLATFORM__.settings,settings);return settings.renderer;},
    args:[{developerMode:c.developerMode,diagnosticRecording:c.diagnosticRecording,diagnosticClearRevision:c.diagnosticClearRevision,hud:c.hud,renderer:c.renderer,hudMode:c.hudMode,hudPosition:c.hudPosition,uiLanguage:c.uiLanguage,disabledRenderers:c.disabledRenderers,quick:c.quick,rendererOrder:c.rendererOrder,filters:c.filters,processingMode:c.processingMode,outputFormat:c.outputFormat,blobBudgets:c.blobBudgets,decodedForward:c.decodedForward,decodedBack:c.decodedBack,processingTimeoutMs:c.processingTimeoutMs,processingRetryRevision:c.processingRetryRevision,filterParameters:c.filterParameters,filterCatalog:c.filterCatalog,revision:c.revision,filterCandidates:c.filterCandidates}]});
  c.renderer=effective[0]?.result||'browser';
  await execute({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},
    world:'MAIN',files:['ui/package-metadata.js','ui/parameter-editor.js','ui/candidate-policy.js','ui/i18n.js','ui/diagnostics-view.js','ui/panel.js','ui/komga-pages.js','ui/kavita-pages.js','ui/cache-state.js','ui/hud-model.js','ui/host-display.js','content/reader-core.js']});
  });
  await providerInjection;
  const key=`tab:${sender.tab.id}`,old=(await chrome.storage.session.get(key))[key];
  if(old?.documentId!==sender.documentId) await chrome.storage.session.set({[key]:{documentId:sender.documentId,status:null,diagnostic:null}});
  return {allowed:true,enabled:c.enabled,developerMode:c.developerMode,diagnosticRecording:c.diagnosticRecording,diagnosticClearRevision:c.diagnosticClearRevision,hud:c.hud,renderer:c.renderer,hudMode:c.hudMode,hudPosition:c.hudPosition,uiLanguage:c.uiLanguage,disabledRenderers:c.disabledRenderers,quick:c.quick,rendererOrder:c.rendererOrder,filterCandidates:c.filterCandidates,filters:c.filters,processingMode:c.processingMode,outputFormat:c.outputFormat,blobBudgets:c.blobBudgets,decodedForward:c.decodedForward,decodedBack:c.decodedBack,processingTimeoutMs:c.processingTimeoutMs,processingRetryRevision:c.processingRetryRevision,filterParameters:c.filterParameters,filterCatalog:c.filterCatalog,revision:c.revision};
}
// Use the HELLO-established document identity; never accept a popup-supplied identity.
async function syncRuntimeModules(target){
 const ps=await packageState(),catalog=await rendererCatalog();
 const specs=ps.items.filter(x=>x.metadata.kind!=='filter').map(x=>({id:runtimeId(x),stamp:x.installation||String(x.installed)}));
 const run=req=>withDeadline(chrome.scripting.executeScript({target,world:'MAIN',...req}));
 const plan=(await run({func:specs=>{const core=globalThis.__KKGR_CORE__;if(!core?.syncRenderers)throw Error('更新後は一度読書ページを再読み込みしてください。');const stamps=globalThis.__KKGR_MODULE_STAMPS__||{};return specs.filter(x=>stamps[x.id]!==x.stamp||!core.ids().includes(x.id)).map(x=>x.id);},args:[specs]}))[0]?.result||[];
 await run({func:(catalog,plan)=>{const core=globalThis.__KKGR_CORE__;core.syncRenderers([],catalog.filter(x=>!plan.includes(x.id)));globalThis.__KKGR_RENDERER_CATALOG__=Object.freeze(catalog.map(Object.freeze));globalThis.__KKGR_EXTERNAL_RENDERERS__=[];globalThis.__KKGR_MODULES__=[];globalThis.__KKGR_MODULE_DIAGNOSTICS__=[];},args:[catalog,plan]});
 const failed=[];
 for(const item of ps.items.filter(x=>x.metadata.kind!=='filter'&&plan.includes(runtimeId(x)))){try{if(!chrome.userScripts?.execute)throw Error('ユーザースクリプトを許可してください。');const result=await withDeadline(chrome.userScripts.execute({target,world:'MAIN',js:[{code:registrationCode(item)}]}));if(result.some(x=>x.error))throw Error(result.find(x=>x.error).error);}catch(error){failed.push(runtimeId(item));}}
 await run({func:()=>{globalThis.__KKGR_EXTERNAL_RENDERERS__=(globalThis.__KKGR_MODULES__||[]).filter(d=>d.kind==='renderer'&&d.packageId);}});await run({files:['modules/module-loader.js']});
 await run({func:(catalog,specs,failed)=>{const core=globalThis.__KKGR_CORE__,pending=globalThis.__KKGR_RENDERER_PROVIDERS__||[];const good=catalog.filter(x=>!failed.includes(x.id));core.syncRenderers(pending,good);delete globalThis.__KKGR_RENDERER_PROVIDERS__;const ids=core.ids();globalThis.__KKGR_RENDERER_CATALOG__=Object.freeze(good.filter(x=>ids.includes(x.id)).map(Object.freeze));globalThis.__KKGR_MODULE_STAMPS__=Object.fromEntries(specs.filter(x=>ids.includes(x.id)).map(x=>[x.id,x.stamp]));},args:[catalog,specs,failed]});
 await syncRuntimeFilters(target);
}
async function syncRuntimeFilters(target){
 const ps=await packageState(),items=ps.items.filter(x=>x.metadata.kind==='filter'),catalog=await filterCatalog();
 const run=req=>withDeadline(chrome.scripting.executeScript({target,world:'MAIN',...req}));
 await run({func:packages=>{globalThis.__KKGR_PACKAGE_SOURCES__=Object.fromEntries(packages.map(p=>[p.id,p]));},args:[ps.items.map(x=>({id:runtimeId(x),name:x.metadata.name,kind:x.metadata.kind,metadata:x.metadata,code:x.code,stamp:x.installation||String(x.installed)}))]});
 const signature=JSON.stringify(items.map(x=>[runtimeId(x),x.installation||String(x.installed)]));
 const publishDiagnostics=async()=>{const items=(await run({func:()=>globalThis.__KKGR_MODULE_DIAGNOSTICS__||[]}))[0]?.result||[];const entry=(await chrome.storage.session.get(`tab:${target.tabId}`))[`tab:${target.tabId}`];const documentId=target.documentIds?.[0]||entry?.documentId;if(documentId)await chrome.storage.session.set({[`modules:${target.tabId}`]:{documentId,items}});};
 const changed=(await run({func:s=>globalThis.__KKGR_FILTER_SIGNATURE__!==s,args:[signature]}))[0]?.result;
 if(!changed){await run({func:catalog=>{globalThis.__KKGR_FILTER_CATALOG__=catalog.filter(d=>globalThis.__KKGR_FILTER_MODULES__?.[d.id]);},args:[catalog]});await publishDiagnostics();return;}
 await run({func:()=>{globalThis.__KKGR_MODULES__=Object.values(globalThis.__KKGR_BUILTIN_FILTER_MODULES__||{});globalThis.__KKGR_REGISTRATION_RECEIPTS__={};}});
 const failed=[],diagnostics=[];
 for(const item of items){try{if(!chrome.userScripts?.execute)throw Error('Allow user scripts');const r=await withDeadline(chrome.userScripts.execute({target,world:'MAIN',js:[{code:registrationCode(item)}]}));if(r.some(x=>x.error))throw Error(r.find(x=>x.error).error);const check=(await run({func:(id,stamp)=>{const receipt=globalThis.__KKGR_REGISTRATION_RECEIPTS__?.[id];const registered=(globalThis.__KKGR_MODULES__||[]).some(d=>d.id===id&&d.stamp===stamp);return {ok:receipt?.ok===true&&registered,message:receipt?.message||'Filter registration missing'};},args:[runtimeId(item),item.installation||String(item.installed)]}))[0]?.result;if(!check?.ok)throw Error(check?.message||'Filter registration missing');}catch(e){failed.push(runtimeId(item));diagnostics.push({stage:"filter",id:runtimeId(item),message:cleanError(e)});} }
 await run({func:(catalog,signature,failed,diagnostics)=>{globalThis.__KKGR_MODULE_DIAGNOSTICS__=[...(globalThis.__KKGR_MODULE_DIAGNOSTICS__||[]).filter(x=>x.stage!=="filter"),...diagnostics];const q=globalThis.__KKGR_MODULES__||[];globalThis.__KKGR_FILTER_MODULES__=Object.fromEntries(q.filter(d=>d.kind==='filter'&&!failed.includes(d.id)).map(d=>[d.id,d]));globalThis.__KKGR_FILTER_CATALOG__=catalog.filter(d=>globalThis.__KKGR_FILTER_MODULES__[d.id]);globalThis.__KKGR_FILTER_SIGNATURE__=failed.length?null:signature;globalThis.__KKGR_MODULES__=[];globalThis.__KKGR_CORE__?.syncFilters();},args:[catalog,signature,failed,diagnostics]});
 await publishDiagnostics();
}
// One in-flight delivery per tab, with one replaceable latest request behind it.
// A sleeping tab cannot accumulate one timeout for every setting edit.
const readerDelivery=new Map();
function queueReaderDelivery(tab,c,full=false){
 let slot=readerDelivery.get(tab.id);
 if(slot){if(!slot.pending||c.revision>=slot.pending.c.revision)slot.pending={tab,c,full:full||slot.pending?.full||slot.full};return slot.promise;}
 slot={pending:{tab,c,full},full:false};readerDelivery.set(tab.id,slot);
 slot.promise=(async()=>{
  while(slot.pending){
   const next=slot.pending,started=Date.now();slot.pending=null;slot.full=next.full;
   try{
    if(!await permitted(next.c,next.tab.url)){await paint(tab.id,null,next.c);continue;}
    if(next.full){await pingTab(next.tab);continue;}
    const result=await withDeadline(chrome.tabs.sendMessage(tab.id,{type:'APPLY',config:{...next.c,allowed:true}}));
    if(!result?.ok||!result.status)throw Error(result?.error||'APPLY: bridge unavailable');
    const entry=(await chrome.storage.session.get(`tab:${tab.id}`))[`tab:${tab.id}`];
    await storeStatus({tab:next.tab,frameId:0,url:next.tab.url,documentId:entry?.documentId},result.status);
   }catch(e){
    // Do not overwrite a newer successful STATUS with an old delivery error.
    const current=(await chrome.storage.session.get(`tab:${tab.id}`))[`tab:${tab.id}`];
    if((await config()).revision===next.c.revision&&!(current?.updated>started&&current?.status))await storeStatus({tab:next.tab,frameId:0},null,'APPLY: '+cleanError(e));
    // Resume/activation will fetch the saved latest state; no automatic timeout loop.
    slot.pending=null;
   }
  }
 })().finally(()=>{if(readerDelivery.get(tab.id)===slot)readerDelivery.delete(tab.id);});
 return slot.promise;
}
async function notifyReaderPages(full=false){const c=await config();for(const tab of await chrome.tabs.query({})){paint(tab.id,null,c,tab.url).catch(()=>{});queueReaderDelivery(tab,c,full).catch(()=>{});}}
chrome.tabs.onActivated?.addListener(info=>{chrome.tabs.get(info.tabId).then(async tab=>{const c=await config();await paint(tab.id,null,c,tab.url);if(await permitted(c,tab.url))queueReaderDelivery(tab,c,true).catch(()=>{});}).catch(()=>{});});
async function pingTab(tab) {
  const result=await withDeadline(chrome.tabs.sendMessage(tab.id,{type:'PING'}));
  if(!result?.ok || !result.status) throw new Error(result?.error||'PING: bridge unavailable');
  const key=`tab:${tab.id}`,entry=(await chrome.storage.session.get(key))[key];
  if(!entry?.documentId) throw new Error('PING: document handshake missing');
  await storeStatus({tab,frameId:0,url:tab.url,documentId:entry.documentId},result.status);
  return (await chrome.storage.session.get(key))[key];
}
async function connectTab(tab) {
  const c=await config();
  if(!await permitted(c,tab.url)) return;
  try {
    await withDeadline(chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',files:['modules/catalog.js','content/bridge.js']}));
    await pingTab(tab);
  } catch(e) {await storeStatus({tab,frameId:0},null,'CONNECT: '+cleanError(e));}
}
async function reconcile(targetTabId=null) {
  const c=await config();
  const origins=[];
  for(const o of c.origins) if(await chrome.permissions.contains({origins:[pattern(o)]})) origins.push(o);
  const scripts=await chrome.scripting.getRegisteredContentScripts();
  if(scripts.length) await chrome.scripting.unregisterContentScripts({ids:scripts.map(s=>s.id)});
  const matches=[...new Set(origins.map(pattern))];
  if(matches.length) await chrome.scripting.registerContentScripts([{id:'kkgr-e2-bridge',
    matches,js:['modules/catalog.js','content/bridge.js'],world:'ISOLATED',runAt:'document_idle',allFrames:false,persistAcrossSessions:true}]);
  const tabs=await chrome.tabs.query({});
  tabs.sort((a,b)=>(b.id===targetTabId)-(a.id===targetTabId));
  for(const tab of tabs) {
    await paint(tab.id,null,c,tab.url);
    if(await permitted(c,tab.url)) {
      connectTab(tab).catch(()=>{});
    } else {
      withDeadline(chrome.tabs.sendMessage(tab.id,{type:'STOP'})).catch(()=>{});
      await chrome.storage.session.remove(`tab:${tab.id}`);
    }
  }
}
async function finishPendingOrigins() {
 const pending=(await chrome.storage.session.get('pendingSites')).pendingSites||[];
 for(const item of pending){if(item.completed||Date.now()-item.created>300000)continue;if(await chrome.permissions.contains({origins:[pattern(item.site.origin)]})){try{await saveSite(item.site,item.targetTabId,true);item.completed=true;}catch{}}}
 const c=await config();await chrome.storage.session.set({pendingSites:pending.filter(x=>Date.now()-x.created<=300000)});
}
async function saveSite(raw,targetTabId=null,allowCompleted=false){
 const site=Sites.normalize(raw),c=await config();
 if(!await chrome.permissions.contains({origins:[pattern(site.origin)]}))throw Error('サイト権限が許可されていません');
 const existing=c.sites.find(x=>x.id===site.id);
 if(site.id&&!existing)throw Error('編集する登録が見つかりません');
 const duplicate=c.sites.find(x=>x.id!==site.id&&Sites.overlap(x,site));
 if(duplicate){if(allowCompleted&&!site.id&&duplicate.basePath===site.basePath)return c;throw Error('対象範囲が重なるサイトは既に登録されています');}
 if(!site.id)site.id=crypto.randomUUID();
 c.sites=existing?c.sites.map(x=>x.id===site.id?site:x):[...c.sites,site];c.origins=[...new Set(c.sites.map(x=>x.origin))];c.revision++;await chrome.storage.local.set({config:c});
 if(existing&&pattern(existing.origin)!==pattern(site.origin)&&!c.sites.some(x=>pattern(x.origin)===pattern(existing.origin)))await chrome.permissions.remove({origins:[pattern(existing.origin)]}).catch(()=>{});
 await configureAction();await reconcile(targetTabId);return c;
}
async function userScriptCapability(){try{const api=chrome.userScripts;if(!api||typeof api.execute!=='function')return {state:'unavailable'};if(typeof api.getScripts!=='function')return {state:'unknown'};await withDeadline(api.getScripts());return {state:'available'};}catch{return {state:'unavailable'};}}
async function ui(m) {
  if(m.type==='USER_SCRIPT_CAPABILITY')return userScriptCapability();
  if(m.type==='PACKAGE_STATE')return {config:await config(),userScripts:await userScriptCapability()};
  if(['ADD_PACKAGE','UPDATE_PACKAGE','DELETE_PACKAGE'].includes(m.type))return managePackage(m);
  if(m.type==='OPEN_SETTINGS')return openSettingsTab(m.targetTabId,m.section||((await config()).sites.length?'':'sites'));
  if(m.type==='SET_UI_LANGUAGE'){if(!globalThis.__KKGR_I18N__.isChoice(m.uiLanguage))throw Error('Invalid language');await chrome.storage.local.set({uiLanguage:m.uiLanguage});return {ok:true};}
  if(m.type==='SET_UI_APPEARANCE'){if(!['Auto','Light','Dark'].includes(m.uiAppearance))throw Error('Invalid appearance');await chrome.storage.local.set({uiAppearance:m.uiAppearance});return {ok:true};}
  if(m.type==='REGISTER_SETTINGS_TAB'){if(Number.isSafeInteger(m.selfTabId)){const t=await chrome.tabs.get(m.selfTabId);if(t.url?.split('?')[0]!==chrome.runtime.getURL('ui/settings.html'))throw Error('Invalid settings tab');await chrome.storage.local.set({dev1SettingsTabId:t.id});}return {ok:true};}
  if(m.type==='READER_TABS')return {tabs:await readerTabs()};
  if(m.type==='FOCUS_READER'){const candidates=await readerTabs();const tab=candidates.find(t=>t.id===m.readerTabId);if(!tab)throw Error('読書タブが閉じられたか、権限またはURLが変わりました');await chrome.tabs.update(tab.id,{active:true});let warning=null;try{await chrome.windows.update(tab.windowId,{focused:true});}catch(e){warning=cleanError(e);}return {ok:true,warning};}

  if(m.type==='PREPARE_SITE'){
    const site=Sites.normalize(m.site),c=await config();
    if(site.id&&!c.sites.some(x=>x.id===site.id))throw Error('編集する登録が見つかりません');
    if(c.sites.some(x=>x.id!==site.id&&Sites.overlap(x,site)))throw Error('対象範囲が重なるサイトは既に登録されています');
    const intent=crypto.randomUUID(),pending=(await chrome.storage.session.get('pendingSites')).pendingSites||[];
    await chrome.storage.session.set({pendingSites:[...pending.filter(x=>Date.now()-x.created<300000),{intent,site,targetTabId:m.targetTabId,created:Date.now()}]});
    return {ok:true,intent};
  }
  if(m.type==='SAVE_SITE'){const pending=(await chrome.storage.session.get('pendingSites')).pendingSites||[];const prepared=pending.find(x=>x.intent===m.intent);if(m.intent&&(!prepared||['id','origin','basePath','app'].some(key=>Sites.normalize(m.site)[key]!==Sites.normalize(prepared.site)[key])))throw Error('登録要求の確認に失敗しました');await saveSite(m.site,m.targetTabId,!!prepared);await chrome.storage.session.set({pendingSites:pending.filter(x=>x.intent!==m.intent)});return ui({type:'GET_SAVED',targetTabId:m.targetTabId});}
  if(m.type==='CANCEL_SITE'){const pending=(await chrome.storage.session.get('pendingSites')).pendingSites||[];await chrome.storage.session.set({pendingSites:pending.filter(x=>x.intent!==m.intent)});return {ok:true};}
  if(m.type==='DELETE_SITE'){
    const c=await config(),site=c.sites.find(x=>x.id===m.siteId);if(!site)throw Error('削除する登録が見つかりません');
    c.sites=c.sites.filter(x=>x.id!==site.id);c.origins=[...new Set(c.sites.map(x=>x.origin))];c.revision++;
    await chrome.storage.local.set({config:c});const pending=(await chrome.storage.session.get('pendingSites')).pendingSites||[];await chrome.storage.session.set({pendingSites:pending.filter(x=>x.site.id!==site.id)});
    let warning=null;if(!c.sites.some(x=>pattern(x.origin)===pattern(site.origin)))try{await chrome.permissions.remove({origins:[pattern(site.origin)]});}catch(e){warning='登録は削除しましたが、ブラウザー権限の解除に失敗しました。拡張機能の設定から確認してください。';}
    await configureAction();await reconcile(m.targetTabId);return {...await ui({type:'GET_SAVED',targetTabId:m.targetTabId}),warning};
  }
  if(m.type==='LAUNCH_CONTEXT')return (await chrome.storage.session.get('dev2Launch')).dev2Launch||{};
  if(m.type==='RECONNECT') {
    const tab=(await chrome.tabs.query({})).find(t=>t.id===m.targetTabId);
    if(!tab || !await permitted(await config(),tab.url)) throw Error('Target site not registered/permitted');
    await connectTab(tab);
    return ui({type:'GET',targetTabId:m.targetTabId});
  }

  if(m.type==='REANALYZE_FILTER'){const c=await config();if(!c.developerMode||!c.enabled||!['pre','post'].includes(m.stage)||c.filters[m.stage]!==m.filterId)throw Error('DIAGNOSTIC_PROCESSING_UNAVAILABLE');const tab=await chrome.tabs.get(m.targetTabId);if(!await permitted(c,tab.url))throw Error('Target site not registered/permitted');const r=await chrome.tabs.sendMessage(tab.id,{type:'REANALYZE',stage:m.stage,filterId:m.filterId});if(!r?.ok)throw Error(r?.error||'Diagnostics unavailable');return {diagnostics:r.diagnostics};}
  if(m.type==='GET_DIAGNOSTICS'){const c=await config(),tab=await chrome.tabs.get(m.targetTabId);if(!await permitted(c,tab.url))throw Error('Target site not registered/permitted');const r=await withDeadline(chrome.tabs.sendMessage(tab.id,{type:'DIAGNOSTICS'}));if(!r?.ok)throw Error(r?.error||'Diagnostics unavailable');return {diagnostics:r.diagnostics};}
  if(m.type==='GET'||m.type==='GET_SAVED') {
    if(!chrome.storage.session) throw new Error('GET / storage.session unavailable');
    const c=await config(),all=await chrome.tabs.query({});
    const candidates=all.filter(t=>originOf(t.url)).map(t=>({id:t.id,origin:originOf(t.url),url:t.url,title:t.title||originOf(t.url)}));
    const active=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
    const tab=Number.isSafeInteger(m.targetTabId)?all.find(t=>t.id===m.targetTabId && originOf(t.url)):
      originOf(active?.url)?active:null;
    let entry=tab?(await chrome.storage.session.get(`tab:${tab.id}`))[`tab:${tab.id}`]:null;
    if(m.type==='GET' && tab && await permitted(c,tab.url)) {
      try {entry=await pingTab(tab);}catch(e) {
        entry={status:null,diagnostic:'GET / PING: '+cleanError(e)};
      }
    }
    if(tab){const modules=(await chrome.storage.session.get(`modules:${tab.id}`))[`modules:${tab.id}`];if(modules&&modules.documentId===entry?.documentId)entry={...entry,moduleDiagnostics:modules.items};}
    const sitePermissions={};for(const site of c.sites)sitePermissions[site.id]=await chrome.permissions.contains({origins:[pattern(site.origin)]});
    return {config:c,sitePermissions,origin:originOf(tab?.url),targetURL:tab?.url||null,targetTabId:tab?.id??null,candidates,
      userScripts:m.type==='GET'?await userScriptCapability():{state:'unknown'},capabilities:{sessionStorage:!!chrome.storage.session,scripting:!!chrome.scripting?.executeScript},
      entry:entry||null,shellOnly:false};
  }
  const c=await config();
  if(m.type==='SET_ENABLED' && typeof m.enabled==='boolean') c.enabled=m.enabled;
  else if(m.type==='SET_PROCESSING_MODE'){if(!['worker','speed'].includes(m.processingMode))throw Error('Invalid processing mode');c.processingMode=m.processingMode;}
  else if(m.type==='SET_OUTPUT_FORMAT'){if(!['png','jpeg'].includes(m.outputFormat))throw Error('Invalid output format');c.outputFormat=m.outputFormat;}
  else if(m.type==='SET_BLOB_BUDGET'){if(![64,128,256].includes(m.blobBudgetMb))throw Error('Invalid Blob budget');c.blobBudgets={...c.blobBudgets,[c.outputFormat]:m.blobBudgetMb};}
  else if(m.type==='SET_DECODED_FORWARD'||m.type==='SET_DECODED_BACK'){const key=m.type==='SET_DECODED_FORWARD'?'decodedForward':'decodedBack';if(![2,4,8].includes(m[key]))throw Error('Invalid decoded count');c[key]=m[key];}
   else if(m.type==='SET_PROCESSING_TIMEOUT'){if(!Number.isSafeInteger(m.processingTimeoutMs)||m.processingTimeoutMs<1000||m.processingTimeoutMs>60000||m.processingTimeoutMs%1000)throw Error('Invalid processing timeout');c.processingTimeoutMs=m.processingTimeoutMs;}
  else if(m.type==='SET_PROCESSING_RETRY'){c.processingRetryRevision=(c.processingRetryRevision||0)+1;}
  else if(m.type==='SET_HUD' && typeof m.hud==='boolean') c.hud=m.hud;
  else if(m.type==='SET_HUD_POSITION' && ['左上','右上','左下','右下'].includes(m.hudPosition)) c.hudPosition=m.hudPosition;
  else if(m.type==='SET_DEVELOPER_MODE'&&typeof m.developerMode==='boolean'){c.developerMode=m.developerMode;if(!c.developerMode){c.hudMode='normal';c.diagnosticRecording=false;}}
  else if(m.type==='SET_DIAGNOSTIC_RECORDING'&&typeof m.diagnosticRecording==='boolean'){if(m.diagnosticRecording&&!c.developerMode)throw Error('Developer mode required');c.diagnosticRecording=m.diagnosticRecording;}
  else if(m.type==='SET_DIAGNOSTIC_CLEAR'){c.diagnosticClearRevision=(c.diagnosticClearRevision||0)+1;}
  else if(m.type==='SET_HUD_MODE' && ['normal','details'].includes(m.hudMode)){if(m.hudMode==='details'&&!c.developerMode)throw Error('Developer mode required');c.hudMode=m.hudMode;}
  else if(m.type==='SET_RENDERER_NAME'){if(![...RENDERER_IDS,...c.filterCatalog.map(x=>x.id)].includes(m.rendererId)||typeof m.displayName!=='string'||globalThis.__KKGR_PACKAGE_METADATA__.displayWidth(m.displayName.trim())>32)throw Error('表示名は半角32文字相当（全角16文字相当）以下にしてください。');c.rendererDisplayNames={...(c.rendererDisplayNames||{})};if(m.displayName.trim())c.rendererDisplayNames[m.rendererId]=m.displayName.trim();else delete c.rendererDisplayNames[m.rendererId];}
  else if(m.type==='SET_CANDIDATES'){const order=m.rendererCandidates;if(!Array.isArray(order)||new Set(order).size!==order.length||order.length>Policy.candidateLimit||!order.every(x=>RENDERER_IDS.includes(x)))throw Error('候補は'+Policy.candidateLimit+'個までです。');c.rendererOrder=[...order,...RENDERER_IDS.filter(x=>!order.includes(x))];c.disabledRenderers=RENDERER_IDS.filter(x=>!order.includes(x));if(c.disabledRenderers.includes(c.renderer))c.renderer='browser';}
  else if(m.type==='SET_FILTER_CANDIDATES'){const value=m.filterCandidates;if(!value||!['pre','post'].every(stage=>Array.isArray(value[stage])&&new Set(value[stage]).size===value[stage].length&&value[stage].length<=Policy.candidateLimit&&value[stage].every(id=>c.filterCatalog.some(f=>f.id===id&&f.supportedStages.includes(stage)))))throw Error('不正なフィルター候補です。');c.filterCandidates={pre:[...value.pre],post:[...value.post]};for(const stage of ['pre','post'])if(!value[stage].includes(c.filters[stage]))c.filters[stage]=null;}
  else if(m.type==='SET_FILTER_PARAMETERS'){const entry=c.filterCatalog.find(d=>d.id===m.filterId);if(!['pre','post'].includes(m.stage)||!entry?.supportedStages.includes(m.stage))throw Error('Invalid filter parameter target');const values=globalThis.__KKGR_PARAMETERS__.values(entry.parameters||[],m.values);c.filterParameters={pre:{},post:{},...c.filterParameters,[m.stage]:{...(c.filterParameters?.[m.stage]||{}),[m.filterId]:values}};}
  else if(m.type==='SET_FILTER'){if(!['pre','post'].includes(m.stage)||m.filterId!==null&&!c.filterCandidates[m.stage].includes(m.filterId))throw Error('Invalid filter selection');c.filters={...c.filters,[m.stage]:m.filterId};}
  else if(m.type==='SET_RENDERERS' && Array.isArray(m.disabledRenderers) && m.disabledRenderers.every(id=>RENDERER_IDS.includes(id))) {if(RENDERER_IDS.filter(x=>!m.disabledRenderers.includes(x)).length>Policy.candidateLimit)throw Error('候補上限を超えています。');c.disabledRenderers=[...new Set(m.disabledRenderers)];if(c.disabledRenderers.includes(c.renderer)) c.renderer='browser';}
  else if(m.type==='SET_RENDERER' && ['browser',...RENDERER_IDS].includes(m.renderer)) {if(c.disabledRenderers.includes(m.renderer)) throw Error('Renderer disabled');c.renderer=m.renderer;}
  else if(m.type==='SET_QUICK'){const q=m.quick,k=QUICK_DEFAULT.order;if(!q||!Array.isArray(q.order)||q.order.length!==k.length||new Set(q.order).size!==k.length||!q.order.every(x=>k.includes(x))||!Array.isArray(q.visible)||!q.visible.every(x=>k.includes(x))||!['portrait','landscape'].every(o=>q[o]&&['左上','右上','左下','右下'].includes(q[o].pos)&&['横','縦'].includes(q[o].dir)))throw Error('Invalid quick configuration');c.quick={...q,visible:[...new Set(['power',...q.visible])]};}
  else throw new Error('Unsupported command');
  c.revision++;await chrome.storage.local.set({config:c});
  // Saving is authoritative. Reader delivery never gates the mutation queue or UI.
  notifyReaderPages(m.type==='SET_RENDERER_NAME').catch(()=>{});
  return ui({type:'GET_SAVED',targetTabId:m.targetTabId});
}
chrome.runtime.onMessage.addListener((m,sender,sendResponse)=>{
  // Android browsers may open the action UI as an extension tab.
  const senderPage=typeof sender.url==='string'?sender.url.split(/[?#]/)[0]:'';
  const isUI=[chrome.runtime.getURL('ui/popup.html'),chrome.runtime.getURL('ui/settings.html')].includes(senderPage) &&
    (!sender.id || sender.id===chrome.runtime.id);
  const task=async()=>{
    if(isUI){const mutating=/^SET_/.test(m.type)||['ADD_PACKAGE','UPDATE_PACKAGE','DELETE_PACKAGE','SAVE_SITE','DELETE_SITE','PREPARE_SITE','RECONNECT','FOCUS_READER','REANALYZE_FILTER'].includes(m.type);if(senderPage===chrome.runtime.getURL('ui/settings.html')&&settingsTabs&&mutating)return settingsTabs.run(m,sender,()=>ui(m));return ui(m);}
    if(!sender.tab || sender.frameId!==0) throw new Error('Unsupported sender');
    if(m.type==='HELLO') return hello(sender);
    if(m.type==='OPEN_SETTINGS_FROM_READER'){if(!await permitted(await config(),sender.url))throw Error('Site permission missing');return openSettingsTab(sender.tab.id,(await config()).sites.length?'':'sites');}
    if(m.type==='SETTING') {
      const c=await config(), entry=(await chrome.storage.session.get(`tab:${sender.tab.id}`))[`tab:${sender.tab.id}`];
      if(!await permitted(c,sender.url) || entry?.documentId!==sender.documentId ||
         entry?.status?.documentToken!==m.documentToken) throw Error('Settings document not connected');
      if(['enabled','hud'].includes(m.key) && typeof m.value==='boolean')
        return ui({type:m.key==='enabled'?'SET_ENABLED':'SET_HUD',[m.key]:m.value,targetTabId:sender.tab.id});
      if(['developerMode','diagnosticRecording','diagnosticClearRevision'].includes(m.key))return ui({type:{developerMode:'SET_DEVELOPER_MODE',diagnosticRecording:'SET_DIAGNOSTIC_RECORDING',diagnosticClearRevision:'SET_DIAGNOSTIC_CLEAR'}[m.key],[m.key]:m.value,targetTabId:sender.tab.id});
       if(m.key==='processingMode')return ui({type:'SET_PROCESSING_MODE',processingMode:m.value,targetTabId:sender.tab.id});
        if(m.key==='blobBudgetMb')return ui({type:'SET_BLOB_BUDGET',blobBudgetMb:m.value,targetTabId:sender.tab.id});if(m.key==='decodedForward'||m.key==='decodedBack')return ui({type:m.key==='decodedForward'?'SET_DECODED_FORWARD':'SET_DECODED_BACK',[m.key]:m.value,targetTabId:sender.tab.id});
        if(m.key==='outputFormat')return ui({type:'SET_OUTPUT_FORMAT',outputFormat:m.value,targetTabId:sender.tab.id});
       if(m.key==='processingTimeoutMs')return ui({type:'SET_PROCESSING_TIMEOUT',processingTimeoutMs:m.value,targetTabId:sender.tab.id});
      if(m.key==='processingRetryRevision')return ui({type:'SET_PROCESSING_RETRY',targetTabId:sender.tab.id});
      if(m.key==='hudPosition') return ui({type:'SET_HUD_POSITION',hudPosition:m.value,targetTabId:sender.tab.id});
      if(m.key==='hudMode') return ui({type:'SET_HUD_MODE',hudMode:m.value,targetTabId:sender.tab.id});
      if(m.key==='rendererCandidates')return ui({type:'SET_CANDIDATES',rendererCandidates:m.value,targetTabId:sender.tab.id});
      if(m.key==='filterParameters')return ui({type:'SET_FILTER_PARAMETERS',stage:m.value.stage,filterId:m.value.id,values:m.value.values,targetTabId:sender.tab.id});
      if(m.key==='filters')return ui({type:'SET_FILTER',stage:m.value.stage,filterId:m.value.id,targetTabId:sender.tab.id});
      if(m.key==='filterCandidates')return ui({type:'SET_FILTER_CANDIDATES',filterCandidates:m.value,targetTabId:sender.tab.id});
      if(m.key==='disabledRenderers') return ui({type:'SET_RENDERERS',disabledRenderers:m.value,targetTabId:sender.tab.id});
      if(m.key==='renderer' && ['browser',...RENDERER_IDS].includes(m.value))
        return ui({type:'SET_RENDERER',renderer:m.value,targetTabId:sender.tab.id});
      throw Error('Invalid setting');
    }
    if(m.type==='STATUS') {
      const s=m.status;
      if(!s || s.shellOnly!==false || typeof s.enabled!=='boolean' || !['IDLE','KAVITA','KOMGA'].includes(s.site) ||
        typeof s.documentToken!=='string' || !Number.isSafeInteger(s.revision) ||
        !Number.isSafeInteger(s.starts) || !Number.isSafeInteger(s.stops)) throw new Error('Invalid status');
      await storeStatus(sender,s);return {ok:true};
    }
    if(m.type==='DIAGNOSTIC') {await storeStatus(sender,null,cleanError(m.error));return {ok:true};}
    throw new Error('Unsupported content command');
  };
  // Serialize only UI mutations. HELLO/STATUS must run while reconcile awaits a bridge.
  const result=((isUI && !['GET_DIAGNOSTICS','REANALYZE_FILTER','GET','GET_SAVED','PACKAGE_STATE','RECONNECT','FOCUS_READER','REANALYZE_FILTER'].includes(m.type)) || m.type==='SETTING')?(serial=serial.catch(()=>{}).then(task)):task();
  result.then(v=>sendResponse(v),e=>sendResponse({error:cleanError(e)}));return true;
});
chrome.runtime.onInstalled.addListener(()=>{serial=serial.catch(()=>{}).then(reconcile);});
chrome.runtime.onStartup.addListener(()=>{serial=serial.catch(()=>{}).then(reconcile);});
chrome.permissions.onAdded.addListener(()=>{serial=serial.catch(()=>{}).then(finishPendingOrigins);});
chrome.permissions.onRemoved.addListener(()=>{serial=serial.catch(()=>{}).then(reconcile);});
chrome.tabs.onRemoved.addListener(id=>{chrome.storage.session.remove(`tab:${id}`);actionPaintSequence.delete(id);});
chrome.tabs.onUpdated.addListener((id,change,tab)=>{
  // A late loading notification must not erase a new document's HELLO/status.
  // HELLO replaces the previous identity. GET actively probes before showing status.
  if(change.status==='loading'||change.url) config().then(c=>paint(id,null,c,tab?.url||change.url));
  // Registered content scripts remain primary. This idempotent completion hook
  // repairs a missed automatic injection without waiting for an Action click.
  if(change.status==='complete' && tab) connectTab({...tab,id}).catch(()=>{});
});

// DEV2 routing: site registration is separate from reader processing.
const mobileAction=!!navigator.userAgentData?.mobile || /Android|iPhone|iPad/i.test(navigator.userAgent||'');
async function configureAction(){await chrome.action.setPopup({popup:mobileAction?'':'ui/popup.html'});}
configureAction().catch(()=>{});
chrome.runtime.onInstalled.addListener(()=>configureAction().catch(()=>{}));
chrome.runtime.onStartup.addListener(()=>{chrome.storage.local.remove('dev1SettingsTabId');configureAction().catch(()=>{});});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.config)configureAction().catch(()=>{});});
let openingSettings;
async function openSettingsTab(targetTabId=null,section='',mobileRoute=false){
 const base=chrome.runtime.getURL('ui/settings.html');
 let target=null;if(Number.isSafeInteger(targetTabId))try{target=await chrome.tabs.get(targetTabId);}catch{}
 if(mobileRoute&&target){const savedSelf=(await chrome.storage.local.get('dev1SettingsTabId')).dev1SettingsTabId;if(target.url?.split(/[?#]/)[0]===base||settingsTabs?.isSettings(target.id)||(!target.url&&target.id===savedSelf)){await chrome.storage.local.set({dev1SettingsTabId:target.id});return {ok:true,settingsTabId:target.id,unchanged:true};}}
 const autoSites=mobileRoute&&!(await config()).sites.some(site=>Sites.matches(site,target?.url));if(mobileRoute)section=autoSites?'sites':'';
 const inferred=Sites.infer(target?.url);const token=crypto.randomUUID();const context={token,readerReturnTabId:target&&(await config()).sites.some(site=>Sites.reader(site,target.url))&&await permitted(await config(),target.url)?target.id:null,tabId:target?.id??null,inferred,sourceURL:inferred?.sourceURL||null,section:section==='sites'?'sites':'',autoSites,mobileRoute};await chrome.storage.session.set({dev2Launch:context});
 const query=new URLSearchParams({launch:token});if(Number.isSafeInteger(target?.id))query.set('target',String(target.id));if(section==='sites')query.set('section','sites');
 const url=base+'?'+query.toString();
 let tab;const connectedId=settingsTabs?.liveId();if(Number.isSafeInteger(connectedId))try{tab=await chrome.tabs.get(connectedId);}catch{}const saved=await chrome.storage.local.get('dev1SettingsTabId');
 if(!tab&&Number.isSafeInteger(saved.dev1SettingsTabId)){try{const live=await chrome.tabs.get(saved.dev1SettingsTabId);if(!live.url||live.url.split('?')[0]===base)tab=live;}catch{}}
 if(!tab)tab=(await chrome.tabs.query({})).find(t=>t.url?.split('?')[0]===base);
 if(tab){context.settingsTabId=tab.id;await chrome.storage.session.set({dev2Launch:context});tab=await chrome.tabs.update(tab.id,{active:true});try{await chrome.windows.update(tab.windowId,{focused:true});}catch{}}
 else tab=await chrome.tabs.create({url,active:true});
 await chrome.storage.local.set({dev1SettingsTabId:tab.id});context.settingsTabId=tab.id;await chrome.storage.session.set({dev2Launch:context});return {ok:true,settingsTabId:tab.id};
}
async function readerTabs(){const c=await config(),all=await chrome.tabs.query({}),result=[];for(const tab of all){if(!await permitted(c,tab.url)||!c.sites.some(site=>Sites.reader(site,tab.url)))continue;const u=new URL(tab.url);result.push({id:tab.id,windowId:tab.windowId,title:tab.title||u.pathname,site:u.origin});}return result;}
chrome.action.onClicked.addListener(tab=>{if(!openingSettings)openingSettings=(async()=>{const c=await config();if(mobileAction)await openSettingsTab(tab?.id,'',true);else{await configureAction();try{await chrome.action.openPopup();}catch{await openSettingsTab(tab?.id);}}})().catch(()=>{}).finally(()=>openingSettings=null);});
chrome.tabs.onRemoved.addListener(async id=>{const saved=await chrome.storage.local.get('dev1SettingsTabId');if(saved.dev1SettingsTabId===id)await chrome.storage.local.remove('dev1SettingsTabId');});
