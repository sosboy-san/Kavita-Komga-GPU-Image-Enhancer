const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const prefix=fs.readFileSync(__dirname+'/dev2-sites.test.cjs','utf8').split('(async()=>{')[0],box={require,__dirname,console,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,setImmediate};
vm.createContext(box);vm.runInContext(prefix+';globalThis.harness=harness',box);
(async()=>{
 const h=await box.harness();h.tabs.clear();h.ctx.chrome.tabs.query=async()=>[];
 let r=await h.send({type:'GET_SAVED'});assert.equal(r.config.rendererCatalog.length,2);assert.equal(r.config.filterCatalog.length,3);
 assert.equal(r.config.filters.post,null);assert.equal(r.config.filters.pre,null);
 const defaults=h.data.managedRenderers.items.map(p=>({id:p.registrationId,stamp:p.installation}));
 assert.equal(defaults.length,3);assert(h.data.managedRenderers.items.every(p=>p.bundledFile));
 for(const {id} of defaults){assert(r.config.filterCatalog.find(d=>d.id===id).managed);assert((await h.send({type:'DELETE_PACKAGE',packageId:id})).ok);}
 r=await h.send({type:'GET_SAVED'});assert.equal(r.config.filterCatalog.length,0);assert.equal(h.data.managedRenderers.defaultFiltersSeeded,1);
 const store=h.ctx.__KKGR_DEFAULT_PACKAGE_STORE__.create(h.ctx.chrome.storage.local,()=>{throw Error('Must not reload deleted defaults');});assert.equal((await store.get()).items.length,0);
 for(const item of h.ctx.__KKGR_DEFAULT_FILTERS__){
  const code=fs.readFileSync(__dirname+'/../extension/'+item.file,'utf8');
  const altered=await h.send({type:'ADD_PACKAGE',metadata:item.metadata,code:code+'\n',bundledFile:item.file});assert(altered.ok,altered.error);
  assert.equal(h.data.managedRenderers.items.at(-1).bundledFile,undefined,'UI must not forge packaged provenance');
  assert((await h.send({type:'DELETE_PACKAGE',packageId:item.metadata.id})).ok);
  const restored=await h.send({type:'ADD_PACKAGE',metadata:item.metadata,code});assert(restored.ok,restored.error);
  assert.equal(h.data.managedRenderers.items.at(-1).registrationId,item.metadata.id);assert.equal(h.data.managedRenderers.items.at(-1).bundledFile,item.file);
 }
 const original=h.data.managedRenderers.items.map(p=>[p.registrationId,p.installation]);
 delete h.data.managedRenderers.defaultFiltersSeeded;
 const migrated=h.ctx.__KKGR_DEFAULT_PACKAGE_STORE__.create(h.ctx.chrome.storage.local,()=>{throw Error('Existing defaults must remain untouched');});
 assert.equal((await migrated.get()).items.length,3);assert.deepEqual(h.data.managedRenderers.items.map(p=>[p.registrationId,p.installation]),original);
 console.log('PASS three defaults installed OFF, removable, persistent deletion, official source restore, same module IDs');
})().catch(e=>{console.error(e);process.exitCode=1;});
