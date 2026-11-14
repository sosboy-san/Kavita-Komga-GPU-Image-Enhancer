const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto;
const bridge=fs.readFileSync(__dirname+'/../extension/content/bridge.js','utf8'),main=fs.readFileSync(__dirname+'/../extension/content/main.js','utf8'),tick=()=>new Promise(setImmediate);
function target(){const events=new Map();return {events,addEventListener(type,f){if(!events.has(type))events.set(type,new Set());events.get(type).add(f);},removeEventListener(type,f){events.get(type)?.delete(f);},emit(type,event){for(const f of [...(events.get(type)||[])])f(event);},count(){return [...events.values()].reduce((n,s)=>n+s.size,0);}};}
function event(){const listeners=new Set();return {addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),listeners};}
function port(){return {messages:[],closed:0,postMessage(m){this.messages.push(m)},close(){this.closed++}};}
function fixture(){const window=target(),document=target(),messages=[],frames=[],onMessage=event(),onStorage=event();document.visibilityState='visible';document.documentElement={setAttribute(){},append(frame){frames.push(frame)}};document.dispatchEvent=()=>{};document.createElement=()=>({contentWindow:{postMessage(){}},remove(){this.removed=true}});
 const config={allowed:true,enabled:true,revision:1,renderer:'browser',processingMode:'worker'},status={shellOnly:false,site:'KAVITA',enabled:true,documentToken:'doc',revision:1,starts:1,stops:0};
 window.postMessage=m=>{messages.push(m);if(m.id&&m.from==='bridge')queueMicrotask(()=>window.emit('message',{source:window,origin:'https://reader.example',ports:[],data:{...m,from:'main',type:'STATUS',status}}));};
 const chrome={runtime:{id:'dev',getURL:p=>'chrome-extension://dev/'+p,onMessage,sendMessage:async m=>m.type==='HELLO'?config:{ok:true}},storage:{local:{get:async()=>({})},onChanged:onStorage}};
 const box={window,document,chrome,crypto,location:{origin:'https://reader.example'},CustomEvent:class{},setTimeout,clearTimeout,setInterval,clearInterval};vm.createContext(box);vm.runInContext(bridge,box);
 const emit=(data,ports=[])=>window.emit('message',{source:window,origin:'https://reader.example',data,ports});
 return {window,document,chrome,box,messages,frames,onMessage,onStorage,status,emit,session:()=>messages.find(m=>m.type==='HELLO').session};
}
(async()=>{
 for(const failure of ['missing-runtime','throwing-getURL','throwing-sendMessage']){
  const h=fixture();for(let i=0;i<6;i++)await tick();
  const connect=p=>h.emit({channel:'kkgr-processing-connect',session:h.session()},[p]);
  const ignored=port();h.emit({channel:'kkgr-processing-connect',session:'another-bridge'},[ignored]);assert.equal(h.frames.length,0);assert.equal(ignored.closed,0,'Another bridge must own this port');
  const active=port();
  if(failure==='missing-runtime')h.chrome.runtime=undefined;
  if(failure==='throwing-getURL')h.chrome.runtime.getURL=()=>{throw Error('Extension context invalidated.')};
  if(failure==='throwing-sendMessage'){connect(active);assert.equal(h.frames.length,1);h.chrome.runtime.sendMessage=()=>{throw Error('Extension context invalidated.')};h.emit({channel:'kkgr-e2-v1',from:'main',session:h.session(),status:h.status});}
  else assert.doesNotThrow(()=>connect(active));
  for(let i=0;i<6;i++)await tick();
  assert.equal(active.closed,1);assert.equal(active.messages[0].error.code,'EXTENSION_CONTEXT_INVALIDATED');
  assert.equal(h.frames.filter(f=>!f.removed).length,0);assert.equal(h.window.count(),0);assert.equal(h.document.count(),0);assert.equal(h.onMessage.listeners.size,0);assert.equal(h.onStorage.listeners.size,0);
  assert.equal(h.messages.filter(m=>m.type==='BRIDGE_DISCONNECTED').length,1);const later=port();assert.doesNotThrow(()=>connect(later));assert.equal(later.closed,0,'Retired listeners must not intercept later connections');
 }
 // A temporary transport failure must allow a later PING to recover without retiring the extension context.
 const transient=fixture();for(let i=0;i<6;i++)await tick();const send=transient.chrome.runtime.sendMessage;let failOnce=true;
 transient.chrome.runtime.sendMessage=message=>{if(message.type==='STATUS'&&failOnce){failOnce=false;throw Error('Receiving end does not exist');}return send(message);};
 transient.emit({channel:'kkgr-e2-v1',from:'main',session:transient.session(),status:transient.status});for(let i=0;i<6;i++)await tick();assert(transient.window.count()>0);assert.equal(transient.messages.filter(m=>m.type==='BRIDGE_DISCONNECTED').length,0);
 const response=await new Promise(resolve=>[...transient.onMessage.listeners][0]({type:'PING'},{},resolve));assert(response.ok);transient.chrome.runtime=undefined;const transientPort=port();transient.emit({channel:'kkgr-processing-connect',session:transient.session()},[transientPort]);assert.equal(transientPort.closed,1);
 // Actual MAIN session handling cancels once, rejects pending authorization and ignores old-session retirement.
 const window=target(),posts=[];window.postMessage=m=>posts.push(m);let retries=0,stops=0;
 const box={window,document:{documentElement:{}},crypto,location:{origin:'https://reader.example'},setTimeout,clearTimeout,MutationObserver:class{observe(){}disconnect(){}},__KKGR_MODULE_RUNTIME__:{ready:true,allowed:true},__KKGR_PROCESSING__:{retry(){retries++}},__KKGR_CORE__:{ids:()=>[],status:()=>({site:'KAVITA'}),apply(){},stop(){stops++}}};vm.createContext(box);vm.runInContext(main,box);
 const emit=data=>window.emit('message',{source:window,origin:'https://reader.example',data:{channel:'kkgr-e2-v1',from:'bridge',...data}});
 emit({session:'live',id:'hello',type:'HELLO'});emit({session:'live',id:'config',type:'CONFIG',revision:1,enabled:true});
 const pending=box.__KKGR_PLATFORM__.authorizeModules({runtimeKey:'key'});const denied=assert.rejects(pending,/Reload/);
 emit({session:'old',type:'BRIDGE_DISCONNECTED',error:'Reload'});assert.equal(stops,0);
 emit({session:'live',type:'BRIDGE_DISCONNECTED',error:'Reload the reader tab'});await denied;assert.equal(stops,1);assert.equal(retries,1);assert.equal(box.__KKGR_MODULE_RUNTIME__.ready,false);assert.equal(box.__KKGR_PLATFORM__.processingSession(),null);assert.equal(box.__KKGR_PLATFORM__.settings.enabled,false);
 emit({session:'live',type:'BRIDGE_DISCONNECTED',error:'Reload'});assert.equal(stops,1);
 console.log('PASS context loss: missing runtime, synchronous API throws, ports/frame/timer/listener cleanup, worker session ownership, MAIN retirement and pending authorization');
})().catch(e=>{console.error(e);process.exitCode=1});
