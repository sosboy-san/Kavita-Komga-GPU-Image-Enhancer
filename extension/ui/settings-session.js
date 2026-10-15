'use strict';
// Only loaded by settings.html. PC action popup and reader Quick remain independent.
globalThis.__KKGR_SETTINGS_SESSION__ = (()=>{
 const I=globalThis.__KKGR_I18N__,t=(key,params)=>I.t(key,params);
 const token=crypto.randomUUID();let port=null,id=null,state=null,job=null,operation=false,timer,registrationTimer,hooks=null;
 const dialog=document.createElement('dialog');dialog.className='settings-session';dialog.setAttribute('aria-label',t("message.9cc4c0647d08"));document.body.append(dialog);
 const el=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
 function status(value){dialog.querySelector('[role=status]')?.replaceChildren(value);}
 function post(m){if(!port)throw Error(t("message.def7c45cb525"));port.postMessage(m);}
 function draft(){return !!hooks?.hasDraft();}
 function lock(value){document.getElementById('panel').inert=value;if(value&&!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}if(!value&&dialog.open){if(dialog.close)dialog.close();else dialog.removeAttribute('open');}}
 function draw(message){dialog.setAttribute('aria-label',t('message.9cc4c0647d08'));if(!hooks)return;const host=document.getElementById('panel');dialog.style.background=host.style.getPropertyValue('--card')||'Canvas';dialog.style.color=host.style.getPropertyValue('--text')||'CanvasText';dialog.style.borderColor=host.style.getPropertyValue('--line')||'GrayText';dialog.style.colorScheme=host.style.colorScheme;for(const name of ['card','text','line','accent','soft'])dialog.style.setProperty('--'+name,host.style.getPropertyValue('--'+name));const blocked=!state?.allowed;lock(blocked);if(!blocked)return;dialog.replaceChildren(el('h2',state?.peers.length>1?t("message.dd94180047e4"):t("message.25e88b09c477")));const note=el('p',state?.peers.length>1?t("message.2319b2a680ce"):t("message.dafe20474048"));dialog.append(note);const info=el('p',message||'' );info.setAttribute('role','status');dialog.append(info);
  if(state?.peers.length>1){if(state.peers.some(p=>p.dirty))dialog.append(el('p',t("message.379912c55042")));const keep=el('button',t("message.556aa590b3d8"));keep.className='primary';keep.disabled=operation;keep.onclick=()=>resolve(id);dialog.append(keep);const select=el('select');select.setAttribute('aria-label',t("message.bcfc024260e0"));for(const p of state.peers.filter(p=>p.id!==id)){const opt=el('option',t('session.tabName',{id:p.id,dirty:p.dirty?t('message.ec5919ef140c'):''}));opt.value=String(p.id);select.append(opt);}select.disabled=operation;const other=el('button',t("message.3efe827ea302"));other.disabled=operation;other.onclick=()=>resolve(Number(select.value));dialog.append(select,other);}
  const retry=el('button',t("common.reconnect"));retry.disabled=operation;retry.onclick=()=>connect('manual');dialog.append(retry);
 }
 function clearOperation(){clearTimeout(timer);operation=false;}
 function disconnected(){clearTimeout(registrationTimer);clearOperation();state=null;port=null;draw(t("message.fd3e9c5308e0"));}
 async function connect(reason){if(job)return job;job=(async()=>{state=null;draw();if(port){port.onDisconnect.removeListener(disconnected);port.disconnect();}id=(await chrome.tabs.getCurrent())?.id;port=chrome.runtime.connect({name:'kkgr-settings'});port.onDisconnect.addListener(disconnected);port.onMessage.addListener(async m=>{
   if(m.type==='VERIFY'){post({type:'VERIFY_REPLY',nonce:m.nonce,url:location.href.split(/[?#]/)[0],token,dirty:draft(),pending:!!hooks.hasPending()});return;}
   if(m.type==='STATE'){clearTimeout(registrationTimer);const wasAllowed=state?.allowed;state=m;if(m.allowed&&!wasAllowed){lock(true);try{await hooks.refresh();}catch(e){state=null;draw(t("message.142f41db9dce")+I.error(e.message));return;}}draw();return;}
   if(m.type==='RESULT'){clearOperation();draw(m.result.failed.length?t("message.6b4d9311894f"):'');return;}
   if(m.type==='ERROR'){clearOperation();draw(I.error(m.message));return;}
   if(m.type==='REPLACED'){const old=port;old?.onDisconnect.removeListener(disconnected);old?.disconnect();disconnected();}
  });post({type:'REGISTER',id,token,dirty:draft(),reason});registrationTimer=setTimeout(()=>{state=null;draw(t("message.f63d70529ef8"));},7000);
 })().catch(e=>{state=null;draw(I.error(e.message));}).finally(()=>job=null);return job;}
 function resolve(keepId){if(!state||operation)return;const closing=state.peers.filter(p=>p.id!==keepId);if(!confirm(t('session.closeConfirm',{count:closing.length,warning:closing.some(p=>p.dirty)?t('message.46f5cc575024'):''})))return;operation=true;draw(t("message.4050bbbcd0da"));timer=setTimeout(()=>{clearOperation();draw(t("message.8add196ba4da"));},30000);try{post({type:'RESOLVE',keepId,revision:state.revision});}catch(e){clearOperation();draw(I.error(e.message));}}
 dialog.addEventListener('cancel',e=>e.preventDefault());
 return {token,allowed:()=>!!state?.allowed,start(value){hooks=value;connect('load');},dirty(){try{post({type:'DIRTY',dirty:draft()});}catch{}},wake(){if(!hooks)return;if(!port)connect('visible');else try{post({type:'PING'});}catch{disconnected();}},reconnect(){return connect('manual');}};
})();
