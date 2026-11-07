// Kavita presentation only. Never changes native navigation, progress or image geometry.
(() => {
  'use strict';
  if (globalThis.__KKGR_KAVITA_MOTION__) return;
  const directions = new WeakMap();
  const identity = source => {
    try {
      const u = new URL(source, location.href);
      if (u.origin !== location.origin || !/\/api\/reader\/image\/?$/i.test(u.pathname) ||
          !/^\d+$/.test(u.searchParams.get('chapterId') || '') || !/^\d+$/.test(u.searchParams.get('page') || '')) return null;
      return {chapter: u.origin + u.pathname + '?chapterId=' + u.searchParams.get('chapterId'), page: Number(u.searchParams.get('page'))};
    } catch { return null; }
  };
  const visible = el => {
    if (!el?.isConnected) return false;
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (p.hidden || s.display === 'none' || s.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  function read(inspect = img => ({source: img.src, url: img.currentSrc || img.src, signature: ''})) {
    const root = document.querySelector('app-manga-reader');
    if (!root) return {reason: 'no-reader'};
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || globalThis.matchMedia?.('(update: slow)').matches || root.closest('.no-animations,.no-transitions,.animate-disabled')) return {root,reason:'motion-suppressed'};
    if ([...document.querySelectorAll('ngb-modal-window,[role="dialog"][aria-modal="true"]')].some(visible)) return {root,reason:'native-dialog'};
    const fullscreen=document.fullscreenElement||document.webkitFullscreenElement;
    if(fullscreen&&!fullscreen.contains(root)&&!root.contains(fullscreen))return {root,reason:'fullscreen-outside-reader'};
    if (root.querySelector('.webtoon-images') || !root.querySelector('.pagination-area .left')) return {root, reason: 'non-horizontal'};
    const renderers=[...root.querySelectorAll('app-single-renderer .image-container,app-double-renderer .image-container,app-double-reverse-renderer .image-container,app-double-no-cover-renderer .image-container')].filter(visible);
    if(renderers.length!==1||[...root.querySelectorAll('app-canvas-renderer canvas')].some(visible))return {root,reason:'unsupported-renderer'};
    const container=renderers[0],tag=container.parentElement.tagName.toLowerCase();
    const layout=tag==='app-single-renderer'?'single':tag==='app-double-renderer'?'double':'manga';
    const images=[...container.querySelectorAll('img')].filter(img=>!img.closest('[data-gpuie-motion]')&&visible(img)&&(!fullscreen||fullscreen.contains(img)));
    if(fullscreen&&images.some(img=>img===fullscreen))return {root,reason:'fullscreen-image-element'};
    if(images.length<1||images.length>(layout==='single'?1:2))return {root,reason:'partial-spread'};
    const members=[];
    for(const img of images){
      if(img.srcset)return {root,reason:'responsive-source'};
      for(let el=img;el;el=el.parentElement)if(getComputedStyle(el).transform!=='none')return {root,reason:'transformed-surface'};
      const info=inspect(img),id=identity(info.source);
      if(!id)return {root,reason:'partial-spread'};
      const r=img.getBoundingClientRect();
      members.push({img,...info,...id,rect:{left:r.left,top:r.top,width:r.width,height:r.height}});
    }
    members.sort((a,b)=>a.page-b.page);
    const first=members[0];
    if(members.some(m=>m.chapter!==first.chapter))return {root,reason:'chapter-transition'};
    if(members.some((m,i)=>m.signature!==first.signature||(i>0&&m.page!==members[i-1].page+1)))return {root,reason:'partial-spread'};
    let known=directions.get(root);
    if(known?.chapter!==first.chapter){known=null;directions.delete(root);}
    const icon=root.querySelector('[aria-describedby="reading-direction"] i');
    const ltr=icon?.classList.contains('fa-angle-double-right'),rtl=icon?.classList.contains('fa-angle-double-left');
    if(icon&&ltr===rtl){known=null;directions.delete(root);}
    if(ltr!==rtl&&(ltr||rtl)){known={chapter:first.chapter,direction:rtl?'rtl':'ltr',source:'dom'};directions.set(root,known);}
    // Native pagination hints are also authoritative when the menu is closed.
    if(!known){const leftHint=root.querySelector('.pagination-area .left i'),rightHint=root.querySelector('.pagination-area .right i');
      const hintLtr=leftHint?.classList.contains('fa-angle-left')&&rightHint?.classList.contains('fa-angle-double-right');
      const hintRtl=leftHint?.classList.contains('fa-angle-double-left')&&rightHint?.classList.contains('fa-angle-right');
      if(hintLtr||hintRtl){known={chapter:first.chapter,direction:hintRtl?'rtl':'ltr',source:'dom'};directions.set(root,known);}
    }
    const left=Math.min(...members.map(m=>m.rect.left)),top=Math.min(...members.map(m=>m.rect.top));
    const right=Math.max(...members.map(m=>m.rect.left+m.rect.width)),bottom=Math.max(...members.map(m=>m.rect.top+m.rect.height));
    return {root,layout,members,pages:members.map(m=>m.page),...first,direction:known?.direction||null,
      rect:{left,top,width:right-left,height:bottom-top},
      resourceKey:JSON.stringify(members.map(m=>m.url)),
      ready:members.every(m=>m.ready!==undefined?m.ready:m.img.complete&&m.img.naturalWidth>0),
      reason:known?null:'unknown-direction'};
  }

  function classify(previous, next) {
    if (!previous || !next || previous.reason || next.reason || previous.root !== next.root ||
        previous.chapter !== next.chapter || previous.direction !== next.direction ||
        previous.signature !== next.signature || (previous.layout||'single') !== (next.layout||'single')) return null;
    const before=previous.pages||[previous.page],after=next.pages||[next.page];
    const forward=before.at(-1)+1===after[0],backward=after.at(-1)+1===before[0];
    if(!forward&&!backward)return null;
    return {forward, sign: (forward ? -1 : 1) * (next.direction === 'rtl' ? -1 : 1)};
  }
  // The native 0.9.1.4 route resolver uses this read-only, device-specific endpoint.
  function profileRequest(page){
    try{
      const route=location.pathname.match(/\/library\/(\d+)\/series\/(\d+)\/manga\/(\d+)(?:\/|$)/);
      const source=new URL(page.source,location.href),base=source.pathname.match(/^(.*\/api\/)reader\/image\/?$/i);
      if(!route||!base||source.origin!==location.origin||source.searchParams.get('chapterId')!==route[3])return null;
      const fingerprint=localStorage.getItem('kavita-fingerprint-id');
      // Do not accidentally read a different device's default profile.
      if(!fingerprint)return null;
      const headers={'X-Device-Id':fingerprint};
      const token=JSON.parse(localStorage.getItem('kavita-user')||'null')?.token;
      if(typeof token==='string'&&token)headers.Authorization='Bearer '+token;
      return {url:source.origin+base[1]+'reading-profile/'+route[1]+'/'+route[2]+'?skipImplicit=false',headers};
    }catch{return null;}
  }
  // Ownership stays with the existing caches. Only requested revocations are deferred.
  function createURLLeases(revoke) {
    const records=new Map();
    return {
      acquire(url,bytes=0){
        if(!url?.startsWith('blob:'))return ()=>{};
        let r=records.get(url);if(!r){r={count:0,bytes,pending:false};records.set(url,r);}
        r.count++;r.bytes=Math.max(r.bytes,bytes);let returned=false;
        return ()=>{if(returned)return;returned=true;if(--r.count===0){records.delete(url);if(r.pending)revoke(url);}};
      },
      releaseOwned(url){const r=records.get(url);if(r)r.pending=true;else revoke(url);},
      pendingBytes:()=>[...records.values()].reduce((sum,r)=>sum+(r.pending?r.bytes:0),0),
      count:()=>[...records.values()].reduce((sum,r)=>sum+r.count,0),
    };
  }
  function create(adapter = {}) {
    let active=false,observer=null,current=null,running=null,waiting=null,scheduled=false,unstableTimer=null;
    let starts=0,lastFailure=null,profile=null,layoutObserver=null,layoutTargets=new Set();
    const media=typeof matchMedia==='function'?['(prefers-reduced-motion: reduce)','(update: slow)'].map(q=>matchMedia(q)):[];
    const inspect=adapter.inspect || (img=>({source:img.src,url:img.currentSrc||img.src,signature:'',ready:img.complete&&img.naturalWidth>0&&img.currentSrc===img.src}));
    const own=node=>node instanceof Element&&!!node.closest('[data-gpuie-motion]');
    const same=(a,b)=>a&&b&&a.root===b.root&&a.chapter===b.chapter&&(a.layout||'single')===(b.layout||'single')&&JSON.stringify(a.pages||[a.page])===JSON.stringify(b.pages||[b.page])&&a.signature===b.signature&&a.direction===b.direction;
    function cancel(){
      const old=running;running=null;
      if(old){clearTimeout(old.timer);old.track.removeEventListener('transitionend',old.end);old.layer.remove();if(old.from!==current)old.from.dispose();}
      if(waiting){clearTimeout(waiting.timer);waiting.layer.remove();waiting=null;}
    }
    function forget(){clearTimeout(unstableTimer);unstableTimer=null;current?.dispose();current=null;}
    function pictureOne(page){
      const image=new Image();image.src=page.url;image.alt='';
      const s=getComputedStyle(page.img),r=page.rect;
      image.style.cssText='position:absolute;max-width:none;max-height:none;margin:0;padding:0;border:0;';
      Object.assign(image.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',objectFit:s.objectFit,objectPosition:s.objectPosition,filter:s.filter});
      const wrapper=document.createElement('div');wrapper.style.cssText='position:absolute;inset:0;';
      wrapper.style.filter=getComputedStyle(page.img.closest('.image-container')).filter;
      wrapper.append(image);return wrapper;
    }
    function snapshot(page){
      const members=page.members||[page];
      if(page.reason||page.ready===false||members.some(m=>!m.url||m.ready===false||m.rect.width<=0||m.rect.height<=0))return null;
      if(members.some(m=>m.ready===undefined&&(!m.img.complete||!m.img.naturalWidth)))return null;
      const releases=[];let disposed=false;
      const dispose=()=>{if(disposed)return;disposed=true;for(const release of releases)release();};
      try{
        const picture=document.createElement('div');picture.style.cssText='position:absolute;inset:0;';
        for(const m of members){releases.push(adapter.acquire?.(m.url,m.bytes)||(()=>{}));picture.append(pictureOne(m));}
        return {...page,picture,dispose};
      }catch(error){dispose();throw error;}
    }
    function layerFor(page){
      const readingArea=page.root.querySelector('.reading-area')||page.root;
      const fullscreen=document.fullscreenElement||document.webkitFullscreenElement;
      const area=fullscreen&&!fullscreen.contains(readingArea)?fullscreen:readingArea,box=area.getBoundingClientRect();
      const left=Math.max(0,box.left),top=Math.max(0,box.top),width=Math.min(innerWidth,box.right)-left,height=Math.min(innerHeight,box.bottom)-top;
      if(width<=0||height<=0)return null;
      const layer=document.createElement('div');layer.dataset.gpuieMotion='';layer.setAttribute('aria-hidden','true');
      layer.style.cssText=`position:fixed;left:${left}px;top:${top}px;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;z-index:2;`;
      let background=getComputedStyle(area).backgroundColor;
      for(let p=area.parentElement;background==='rgba(0, 0, 0, 0)'&&p;p=p.parentElement)background=getComputedStyle(p).backgroundColor;
      layer.style.backgroundColor=background;return {area,layer,left,top,width,height};
    }
    function positionPicture(entry,box){entry.picture.style.left=-box.left+'px';entry.picture.style.top=-box.top+'px';}
    function slide(from,to,transition){
      cancel();let box;try{box=layerFor(to);if(!box){from.dispose();return;}
      const {layer,width,height}=box,track=document.createElement('div');track.style.cssText='position:absolute;inset:0;will-change:transform;pointer-events:none;';
      for(const [entry,index]of [[from,0],[to,1]]){
        const plane=document.createElement('div');plane.style.cssText=`position:absolute;top:0;left:${index*-transition.sign*width}px;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;`;
        plane.style.backgroundColor=layer.style.backgroundColor;positionPicture(entry,box);plane.append(entry.picture);track.append(plane);
      }
      layer.append(track);box.area.append(layer);
      const end=e=>{if(!e||(e.target===track&&e.propertyName==='transform')){cancel();schedule();}};
      running={layer,track,end,from,timer:setTimeout(()=>end(),450)};track.addEventListener('transitionend',end);
      track.getBoundingClientRect();track.style.transition='transform 300ms cubic-bezier(.25,.8,.5,1)';track.style.transform=`translateX(${transition.sign*width}px)`;starts++;
      }catch(error){box?.layer.remove();from.dispose();throw error;}
    }
    function waitFor(page){
      if(waiting&&same(waiting.target,page))return;
      cancel();let box;try{box=layerFor(current);if(!box){forget();return;}
      positionPicture(current,box);box.layer.append(current.picture);box.area.append(box.layer);
      waiting={target:page,layer:box.layer,timer:setTimeout(()=>{cancel();forget();},4000)};
      }catch(error){box?.layer.remove();throw error;}
    }
    function resetProfile(){
      profile?.controller.abort();if(profile)clearTimeout(profile.timer);profile=null;
    }
    function bootstrap(page){
      if(profile&&(profile.root!==page.root||profile.chapter!==page.chapter))resetProfile();
      if(profile||page.reason!=='unknown-direction')return;
      const request=profileRequest(page);if(!request)return;
      const controller=new AbortController(),record={root:page.root,chapter:page.chapter,controller,timer:setTimeout(()=>controller.abort(),4000)};
      profile=record;
      fetch(request.url,{credentials:'same-origin',headers:request.headers,signal:controller.signal})
        .then(response=>{if(!response.ok)throw Error('PROFILE_UNAVAILABLE');return response.json();})
        .then(data=>{
          if(!active||profile!==record||controller.signal.aborted||document.querySelector('app-manga-reader')!==record.root)return;
          const direction=data?.readingDirection===0?'ltr':data?.readingDirection===1?'rtl':null;
          if(!direction)return;
          const known=directions.get(record.root);
          if(known?.chapter===record.chapter&&known.source==='dom')return;
          // A response for the old chapter must never initialize a newer reader.
          const latest=read(inspect);if(latest.root!==record.root||(latest.chapter&&latest.chapter!==record.chapter)||profileRequest(page)?.url!==request.url)return;
          if(directions.get(record.root)?.chapter===record.chapter&&directions.get(record.root)?.source==='dom')return;
          directions.set(record.root,{chapter:record.chapter,direction,source:'profile'});
          schedule();
        }).catch(()=>{}).finally(()=>{clearTimeout(record.timer);});
    }
    function watchLayout(page){
      if(!layoutObserver)return;
      const next=new Set(page.root?[page.root,...page.root.querySelectorAll('.reading-area,.image-container,img')].filter(el=>!own(el)):[]);
      for(const el of layoutTargets)if(!next.has(el))layoutObserver.unobserve(el);
      for(const el of next)if(!layoutTargets.has(el))layoutObserver.observe(el);
      layoutTargets=next;
    }
    function tick(){
      scheduled=false;if(!active)return;
      const page=read(inspect);
      watchLayout(page);
      if(profile&&(profile.root!==page.root||(page.chapter&&profile.chapter!==page.chapter)||!page.root?.isConnected))resetProfile();
      if(page.reason==='unknown-direction')bootstrap(page);
      // Angular can update the two native image slots in separate mutations.
      // Retain the last complete spread rather than adopting a mixed old/new pair.
      const overlaps=current&&page.root===current.root&&page.chapter===current.chapter&&page.layout===current.layout&&!same(current,page)&&(page.pages||[]).some(n=>(current.pages||[current.page]).includes(n));
      if(current&&(page.reason==='partial-spread'||overlaps)){
        cancel();if(!unstableTimer)unstableTimer=setTimeout(()=>{forget();},4000);return;
      }
      clearTimeout(unstableTimer);unstableTimer=null;
      if(page.reason){cancel();forget();return;}
      // Ignore resource substitutions on the same native page during an active slide.
      if(same(current,page)&&(current.members||[current]).some((m,i)=>['left','top','width','height'].some(k=>Math.abs(m.rect[k]-(page.members||[page])[i].rect[k])>0.5))){cancel();forget();}
      if(same(current,page)&&running)return;
      if(same(current,page)&&(current.resourceKey||current.url)===(page.resourceKey||page.url)&&!waiting)return;
      const change=classify(current,page);
      if(waiting&&!same(waiting.target,page)){cancel();forget();}
      const next=snapshot(page);
      if(!next){if(current&&change)waitFor(page);else {cancel();forget();}return;}
      const from=current;
      if(same(current,page)){cancel();forget();current=next;return;}
      const wasRunning=!!running;cancel();current=next;
      if(from&&change&&!wasRunning)slide(from,next,change);else from?.dispose();
    }
    function schedule(){if(!active||scheduled)return;scheduled=true;queueMicrotask(()=>{try{tick();}catch(error){lastFailure=String(error?.message||error).slice(0,160);cancel();forget();}});}
    const geometry=()=>{cancel();forget();schedule();};
    const loaded=event=>{if(!own(event.target))schedule();};
    const failed=event=>{if(own(event.target)||(waiting?.target.members||[waiting?.target]).some(m=>m?.img===event.target)){cancel();forget();}else schedule();};
    const hide=()=>configure(false);
    function configure(value){
      if(value===active){if(active)schedule();return;}active=value;
      if(!active){observer?.disconnect();observer=null;layoutObserver?.disconnect();layoutObserver=null;layoutTargets.clear();resetProfile();document.removeEventListener('load',loaded,true);document.removeEventListener('error',failed,true);
        window.removeEventListener('resize',geometry);window.removeEventListener('orientationchange',geometry);
        document.removeEventListener('fullscreenchange',geometry);document.removeEventListener('webkitfullscreenchange',geometry);
        window.removeEventListener('scroll',geometry,true);window.removeEventListener('pagehide',hide);
        window.visualViewport?.removeEventListener('resize',geometry);window.visualViewport?.removeEventListener('scroll',geometry);
        for(const m of media)m.removeEventListener('change',geometry);cancel();forget();return;}
      if(typeof ResizeObserver==='function')layoutObserver=new ResizeObserver(()=>schedule());
      observer=new MutationObserver(records=>{if(records.some(r=>!own(r.target)&&!(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].every(n=>n instanceof Element&&n.hasAttribute('data-gpuie-motion')))))schedule();});
      observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset','class','style','hidden']});
      document.addEventListener('load',loaded,true);document.addEventListener('error',failed,true);
      window.addEventListener('resize',geometry);window.addEventListener('orientationchange',geometry);
      document.addEventListener('fullscreenchange',geometry);document.addEventListener('webkitfullscreenchange',geometry);
      window.addEventListener('scroll',geometry,{capture:true,passive:true});window.addEventListener('pagehide',hide);
      window.visualViewport?.addEventListener('resize',geometry);window.visualViewport?.addEventListener('scroll',geometry);
      for(const m of media)m.addEventListener('change',geometry);schedule();
    }
    return {configure,cancel:geometry,stop:()=>configure(false),status:()=>({active,starts,running:!!running,waiting:!!waiting,failure:lastFailure,reason:active?read(inspect).reason:'off'})};
  }
  globalThis.__KKGR_KAVITA_MOTION__ = Object.freeze({identity, read, classify, create, createURLLeases, profileRequest});
})();
