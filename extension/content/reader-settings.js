// Runs in the isolated extension world. Reader image state is never touched.
(() => {
 'use strict';
 const version='responsive-4',previous=globalThis.__KKGR_READER_SETTINGS__;
 if(previous?.version===version)return;
 // A reader SPA may outlive an extension update. Retire its previous opaque
 // controller (or orphaned dialog) before installing the current presentation.
 try{previous?.close?.();}catch{}
 for(const stale of document.querySelectorAll('[data-gpu-reader-settings]'))stale.remove();
 const channel='kkgr-embedded-settings';
 let current=null,opening=null,generation=0;
 const reader=()=>document.querySelector('app-manga-reader,.v-carousel,.html-reader');
 const ja=()=>navigator.language.startsWith('ja');
 function close(){
  generation++;
  const value=current;current=null;if(!value)return;
  clearTimeout(value.timer);value.observer.disconnect();value.abort.abort();
  value.dialog.close();value.host.remove();
  chrome.runtime.sendMessage({type:'CLOSE_EMBEDDED_SETTINGS',token:value.token}).catch(()=>{});
  if(value.focus?.isConnected)value.focus.focus({preventScroll:true});
 }
 function requestClose(){if(current)current.frame.contentWindow.postMessage({channel,type:'REQUEST_CLOSE',token:current.token},current.origin);}
 async function open(){
  if(current){current.frame.focus();return {ok:true};}
  if(opening)return opening;
  const root=reader();if(!root)return {ok:false};
  const serial=++generation;
  opening=(async()=>{
   const result=await chrome.runtime.sendMessage({type:'PREPARE_EMBEDDED_SETTINGS'});
   if(result?.error)throw Error(result.error);
   if(serial!==generation||!root.isConnected){if(result?.token)chrome.runtime.sendMessage({type:'CLOSE_EMBEDDED_SETTINGS',token:result.token}).catch(()=>{});return {ok:false};}
   if(!result?.url||!result.token)throw Error('Settings unavailable');
   const host=document.createElement('div');host.setAttribute('data-gpu-reader-settings','');host.dataset.state='pending';
   const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
   style.textContent=':host{all:initial;color-scheme:only light}dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;padding:0;border:1px solid #8888;border-radius:12px;width:min(820px,calc(100vw - 48px));height:min(680px,calc(100dvh - 48px));max-width:none;max-height:none;background:transparent;color:CanvasText;overflow:hidden;box-shadow:0 12px 60px #0008;font:14px system-ui}dialog::backdrop{background:#0003}iframe{display:block;border:0;width:100%;height:100%;background:transparent;color-scheme:only light;visibility:hidden}aside{position:absolute;inset:0;background:Canvas;color:CanvasText;padding:24px;overflow:auto}aside[hidden]{display:none}button{font:inherit;padding:10px 16px;margin:12px 8px 0 0} @media(width < 600px){dialog{width:100vw;height:100dvh;border:0;border-radius:0}}';
   const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',ja()?'GPUIE 設定':'GPUIE Settings');
   const systemMedia=matchMedia('(prefers-color-scheme: dark)'),frameURL=new URL(result.url);frameURL.searchParams.set('systemAppearance',systemMedia.matches?'Dark':'Light');
   const frame=document.createElement('iframe');frame.title=ja()?'GPUIE 詳細設定':'GPUIE Settings';frame.src=frameURL.href;
   const status=document.createElement('aside'),label=document.createElement('p'),dismiss=document.createElement('button');
   status.hidden=true;dismiss.textContent=ja()?'読書に戻る':'Return to reader';dismiss.onclick=close;status.append(label,dismiss);
   dialog.append(frame,status);shadow.append(style,dialog);
   const focus=document.activeElement,abort=new AbortController(),origin=new URL(result.url).origin;
   const observer=new MutationObserver(()=>{if(!root.isConnected||!host.isConnected)close();});
   const value={host,dialog,frame,status,token:result.token,origin,observer,abort,focus,timer:null};current=value;
   const attach=()=>{const full=document.fullscreenElement||document.webkitFullscreenElement;(full||document.body||document.documentElement).append(host);};
   attach();observer.observe(document.documentElement,{childList:true,subtree:true});
   const syncSystemAppearance=()=>frame.contentWindow.postMessage({channel,type:'SYSTEM_APPEARANCE',token:value.token,value:systemMedia.matches?'Dark':'Light'},origin);
   systemMedia.addEventListener('change',syncSystemAppearance,{signal:abort.signal});
   const failed=()=>{host.dataset.state='error';status.hidden=false;frame.style.visibility='hidden';if(!dialog.open)dialog.showModal();label.textContent=ja()?'設定を表示できませんでした。閉じて再度お試しください。':'Settings could not be displayed. Close and try again.';};
   value.timer=setTimeout(failed,15000);
   window.addEventListener('message',e=>{
    if(current!==value||e.source!==frame.contentWindow||e.origin!==origin||e.data?.channel!==channel||e.data.token!==value.token)return;
    if(e.data.type==='READY'){clearTimeout(value.timer);status.hidden=true;host.dataset.state='ready';frame.style.visibility='visible';if(!dialog.open)dialog.showModal();syncSystemAppearance();frame.focus();}
    if(e.data.type==='ERROR'){clearTimeout(value.timer);failed();}
    if(e.data.type==='CLOSE')close();
    if(e.data.type==='REOPEN'){close();open();}
   },{signal:abort.signal});
   dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose();},{signal:abort.signal});
   // Fullscreen changes reparent the existing frame without navigating the reader.
   document.addEventListener('fullscreenchange',()=>{if(current!==value)return;const full=document.fullscreenElement;if(full&&!full.contains(host)){close();}},{signal:abort.signal});
   window.addEventListener('pagehide',close,{signal:abort.signal});
   return {ok:true};
  })().catch(error=>({ok:false,error:String(error.message||error)})).finally(()=>{opening=null;});
  return opening;
 }
 globalThis.__KKGR_READER_SETTINGS__=Object.freeze({version,open,close,requestClose});
})();
