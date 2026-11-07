const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/../extension/gpu/processing-client.js','utf8');
function client(selected){
 const calls=[],blob=new Blob(['processed']);
 const box=vm.createContext({performance,AbortController,setTimeout,clearTimeout,
  __KKGR_MODULE_RUNTIME__:{ready:true,mode:'speed',slots:selected,errors:[]},
  __KKGR_BUILTIN_FILTER_MODULES__:{usm:{},paper:{}},
  __KKGR_MAIN_PROCESSING__:{run:async job=>{calls.push(job);return {blob,outputSize:[64,96],trace:[]};}}
 });
 vm.runInContext(code,box);
 return {calls,blob,run:(filters,provider='lohalo')=>box.__KKGR_PROCESSING__.start(provider,{},128,192,64,96,'image/png',{processingMode:'speed',renderer:'lohalo',filters})};
}
for(const [name,selected,filters]of [
 ['observed device: omitted pre with USM post',{renderer:'lohalo',post:'usm'},{pre:null,post:'usm'}],
 ['omitted post with pre enabled',{renderer:'lohalo',pre:'paper'},{pre:'paper',post:null}],
 ['both omitted',{renderer:'lohalo'},{pre:null,post:null}],
 ['settings slots omitted',{renderer:'lohalo',pre:null,post:null},{}],
 ['explicit null slots',{renderer:'lohalo',pre:null,post:'usm'},{pre:null,post:'usm'}]
])test(name,async()=>{
 const c=client(selected);assert.equal(await c.run(filters),c.blob);assert.equal(c.calls.length,1);
 assert.equal(c.calls[0].plan.pre,filters.pre||null);assert.equal(c.calls[0].plan.post,filters.post||null);
});
for(const [name,selected,filters,provider]of [
 ['changed pre',{renderer:'lohalo',pre:'paper',post:'usm'},{pre:null,post:'usm'},'lohalo'],
 ['changed post',{renderer:'lohalo'},{pre:null,post:'usm'},'lohalo'],
 ['changed renderer',{renderer:'lohalo'},{pre:null,post:null},'nohalo']
])test(name+' still cancels',async()=>{
 const c=client(selected);await assert.rejects(c.run(filters,provider),{code:'ANALYSIS_CANCELLED'});assert.equal(c.calls.length,0);
});
