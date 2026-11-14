const {test}=require('node:test'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=fs.readFileSync(__dirname+'/../extension/content/reader-core.js','utf8');
const start=core.indexOf('  function queueKavitaApi('),end=core.indexOf('  function kavitaApiSnapshot(',start);
function fixture(){
 const ready={complete:true,naturalWidth:240},first={},second={},states=new WeakMap([[first,{key:'page13'}],[second,{key:null}]]);
 const entry=()=>({decoded:ready});
 const ahead=new Map([['page14',entry()],['page15',entry()],['page2',entry()]]);
 const history=new Map([['page14',entry()],['page1',entry()]]);
 const blobs=new Map([['blob:pending',{key:'page14',decoded:ready}],['blob:old',{key:'page1',decoded:ready}]]);
 const plan={signature:'stable',id:{number:13,chapter:'one'},near:[{key:'page15',distance:1}],currentKeys:['page13','page14']};
 const context=vm.createContext({Set,Map,AbortController,enabled:true,kavitaApiIdentity:'stable',kavitaGeneration:0,kavitaApiController:null,kavitaAttempts:new Set(),kavitaApiError:null,kavitaForwardKeys:new Set(),kavitaBackKeys:new Set(),kavitaShownImages:()=>[first,second],state:states,kavitaAhead:ahead,historyLRU:history,blobs,KavitaPages:{imageIdentity:()=>true},KavitaSplit:{currentKey:()=>null,keepDecoded(){}},farReady:()=>false,kavitaJob:true,kavitaApiTimer:null});
 vm.runInContext(core.slice(start,end)+';globalThis.reconcile=queueKavitaApi;',context);
 return {ready,ahead,history,blobs,reconcile:()=>context.reconcile(null,plan),plan,states,first,second};
}
test('a decoded incoming spread remains prepared before native image states are committed',()=>{
 const f=fixture();f.reconcile();
 assert.equal(f.ahead.get('page14').decoded,f.ready,'The second incoming page must not be undecoded while its state.key is null');
 assert.equal(f.history.get('page14').decoded,f.ready);assert.equal(f.blobs.get('blob:pending').decoded,f.ready);
 assert.equal(f.ahead.get('page15').decoded,f.ready,'Nearby decoded pages remain prepared');
 assert.equal(f.ahead.get('page2').decoded,null);assert.equal(f.history.get('page1').decoded,null);assert.equal(f.blobs.get('blob:old').decoded,null);
});
test('the old decoded window is released after the reader actually advances',()=>{
 const f=fixture();f.reconcile();
 f.plan.currentKeys=['page17','page18'];f.states.set(f.first,{key:'page17'});f.states.set(f.second,{key:'page18'});f.reconcile();
 assert.equal(f.ahead.get('page14').decoded,null);assert.equal(f.history.get('page14').decoded,null);assert.equal(f.blobs.get('blob:pending').decoded,null);
});
