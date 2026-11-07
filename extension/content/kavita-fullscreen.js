// Kavita reader entry preference. No navigation, image or input handlers are replaced.
(() => {
 'use strict';
 if(globalThis.__KKGR_KAVITA_FULLSCREEN__)return;
 function create(){
  let enabled=false,observer=null,root=null,managed=null,stopped=false;
  const attempted=new WeakSet();
  const fullscreen=()=>document.fullscreenElement||document.webkitFullscreenElement;
  function syncIcon(value){
   if(!value?.isConnected||managed!==value)return;
   const full=fullscreen(),active=!!full&&(full.contains(value)||value.contains(full));
   const observedLanguage=globalThis.__KKGR_HOST_DISPLAY__?.read('Kavita')?.locale||document.documentElement.lang||navigator.language;
   const language=globalThis.__KKGR_I18N__?.resolve('Auto',observedLanguage)||'en';
   const label=globalThis.__KKGR_I18N__?.t('kavita.fullscreen.'+(active?'exit':'enter'),{},language)||(active?'Exit fullscreen':'Fullscreen');
   // 0.9.1.4: fullscreenIcon pipe uses only these two classes. The next native
   // toggle reads screenfull.isFullscreen, so its operation remains authoritative.
   for(const icon of value.querySelectorAll('button i.fa-expand-alt,button i.fa-compress-alt')){
    const button=icon.closest('button');
    if(icon.classList.contains('fa-compress-alt')!==active){icon.classList.toggle('fa-compress-alt',active);icon.classList.toggle('fa-expand-alt',!active);}
    if(button.title!==label)button.title=label;
    const text=button.querySelector('.visually-hidden');if(text&&text.textContent!==label)text.textContent=label;
   }
  }
  function scan(){
   if(stopped)return;
   const next=document.querySelector('app-manga-reader');
   if(next!==root){root=next;if(managed&&!managed.isConnected)managed=null;}
   syncIcon(root);
   if(!enabled||!root||attempted.has(root))return;
   attempted.add(root);
   if(fullscreen()||document.visibilityState==='hidden'||document.fullscreenEnabled===false||typeof document.documentElement.requestFullscreen!=='function')return;
   // Direct URL / slow entry may no longer have a valid user activation. Do not
   // consume the next reader tap or repeatedly ask after rejection/manual exit.
   if(navigator.userActivation&&!navigator.userActivation.isActive)return;
   const entry=root,target=document.documentElement;managed=entry;
   try{
    Promise.resolve(target.requestFullscreen({navigationUI:'hide'})).then(()=>{
     if(stopped||!entry.isConnected){if(fullscreen()===target)document.exitFullscreen().catch(()=>{});return;}
     syncIcon(entry);
    }).catch(()=>{if(managed===entry){syncIcon(entry);managed=null;}});
   }catch{managed=null;}
  }
  const changed=()=>scan();
  function watch(){
   if(observer)return;
   observer=new MutationObserver(scan);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','title']});
   document.addEventListener('fullscreenchange',changed);
  }
  return Object.freeze({
   configure(value){stopped=false;enabled=value===true;if(enabled||managed){watch();scan();}else if(observer){observer.disconnect();observer=null;document.removeEventListener('fullscreenchange',changed);}},
   stop(){syncIcon(root);stopped=true;enabled=false;observer?.disconnect();observer=null;document.removeEventListener('fullscreenchange',changed);root=null;managed=null;}
  });
 }
 globalThis.__KKGR_KAVITA_FULLSCREEN__=Object.freeze({create});
})();
