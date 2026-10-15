'use strict';
// Session-only identities: dormant Android restore tabs are never guessed from a saved ID.
globalThis.__KKGR_SETTINGS_TABS__ = function createSettingsTabs(onOwner) {
 const base=chrome.runtime.getURL('ui/settings.html'),peers=new Map(),waiters=new Map();
 let revision=0,owner=null,serial=Promise.resolve();
 const enqueue=fn=>(serial=serial.catch(()=>{}).then(fn));
 const send=(p,m)=>{try{p.port.postMessage(m);}catch{}};
 function publish(){const list=[...peers.values()].map(p=>({id:p.id,dirty:p.dirty}));for(const p of peers.values())send(p,{type:'STATE',revision,owner,peers:list,allowed:peers.size===1&&owner===p.id});if(owner!==null)onOwner(owner).catch(()=>{});}
 function drop(p){if(peers.get(p.id)!==p)return;peers.delete(p.id);revision++;owner=peers.size===1?[...peers.keys()][0]:null;publish();}
 function check(p){return new Promise((resolve,reject)=>{const nonce=crypto.randomUUID();const timer=setTimeout(()=>{waiters.delete(nonce);reject(Error('設定タブの通信確認がタイムアウトしました。タブは閉じません。'));},5000);waiters.set(nonce,{p,resolve:value=>{clearTimeout(timer);waiters.delete(nonce);resolve(value);}});send(p,{type:'VERIFY',nonce});});}
 async function resolvePeers(actor,m){
  if(m.revision!==revision)throw Error('タブの状態が変わりました。最新の一覧で選び直してください。');
  const chosen=peers.get(m.keepId);if(!chosen)throw Error('残すタブが見つかりません。');
  const generation=revision,closing=[...peers.values()].filter(p=>p!==chosen),all=[chosen,...closing];
  const proof=await Promise.all(all.map(check));
  for(let i=0;i<all.length;i++){const p=all[i];if(proof[i].pending)throw Error('設定を適用中のタブがあります。操作が完了してから選び直してください。');if(proof[i].url!==base||proof[i].token!==p.token||peers.get(p.id)!==p)throw Error('タブの識別が変わりました。閉じません。');if(proof[i].dirty&&!p.dirty)throw Error('未保存の編集が発生しました。再確認してください。');const t=await chrome.tabs.get(p.id);if(t.url&&t.url.split(/[?#]/)[0]!==base)throw Error('別のページに移動したタブは閉じません。');}
  if(generation!==revision)throw Error('確認中にタブの状態が変わりました。閉じません。');
  await chrome.tabs.update(chosen.id,{active:true});try{const t=await chrome.tabs.get(chosen.id);await chrome.windows.update(t.windowId,{focused:true});}catch{}
  const ready=await check(chosen);if(ready.url!==base||ready.token!==chosen.token||generation!==revision)throw Error('移動先を確認できません。閉じません。');
  const failed=[];
  for(const p of closing){if(peers.get(chosen.id)!==chosen){failed.push('残すタブの接続が切れました');break;}if(peers.get(p.id)!==p)continue;try{const t=await chrome.tabs.get(p.id);if(t.url&&t.url.split(/[?#]/)[0]!==base)throw Error('別ページに移動しています');await chrome.tabs.remove(p.id);drop(p);}catch(e){failed.push(p.id+': '+e.message);}}
  owner=peers.size===1&&peers.has(chosen.id)?chosen.id:null;revision++;publish();return {keepId:chosen.id,failed};
 }
 chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='kkgr-settings'||port.sender?.url?.split(/[?#]/)[0]!==base||port.sender.id&&port.sender.id!==chrome.runtime.id)return;
  let peer=null;port.onDisconnect.addListener(()=>{if(peer)drop(peer);});
  port.onMessage.addListener(m=>{
   // Challenge replies must run outside the queue that waits for them.
   if(m.type==='VERIFY_REPLY'){const w=waiters.get(m.nonce);if(w&&w.p===peer)w.resolve(m);return;}
   enqueue(async()=>{
    if(m.type==='REGISTER'){const id=port.sender.tab?.id??m.id;if(!Number.isSafeInteger(id)||typeof m.token!=='string')throw Error('設定タブを識別できません。');const t=await chrome.tabs.get(id);if(t.url&&t.url.split(/[?#]/)[0]!==base)throw Error('設定タブ以外は登録できません。');const old=peers.get(id);if(old&&old.port!==port)send(old,{type:'REPLACED'});peer={id,token:m.token,documentId:port.sender.documentId,port,dirty:!!m.dirty};peers.set(id,peer);revision++;owner=peers.size===1?id:null;publish();}
    else if(!peer||peers.get(peer.id)!==peer)throw Error('設定タブを再接続してください。');
    else if(m.type==='DIRTY'){if(peer.dirty!==!!m.dirty){peer.dirty=!!m.dirty;revision++;publish();}}
    else if(m.type==='RESOLVE')send(peer,{type:'RESULT',result:await resolvePeers(peer,m)});
    else if(m.type==='PING'){publish();send(peer,{type:'PONG'});}
   }).catch(e=>send(peer||{port},{type:'ERROR',message:e.message}));
  });
 });
 return {
  liveId(){return owner??[...peers.keys()][0]??null;},
  isSettings(id){return peers.has(id);},
  run(m,sender,fn){return enqueue(async()=>{const p=[...peers.values()].find(p=>p.token===m.settingsToken);if(!p||sender.tab?.id!==undefined&&sender.tab.id!==p.id||sender.documentId&&p.documentId&&sender.documentId!==p.documentId)throw Error('設定タブの接続を確認してください。');if(peers.size!==1||owner!==p.id)throw Error('残す設定タブを先に選んでください。');return {result:fn()};}).then(({result})=>result);}
 };
};
