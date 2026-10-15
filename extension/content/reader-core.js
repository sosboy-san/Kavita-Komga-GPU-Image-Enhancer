// Derived from adopted Stable v4.0.22 + Split A Test a.3; see legacy/ for unchanged baseline.
(function () {
  'use strict';
  if (globalThis.__KKGR_CORE__) return;
  const platform = globalThis.__KKGR_PLATFORM__;
  if (!platform) throw new Error('Extension platform missing');
  let suspended = true, applyingConfig = false;
  const HudModel=globalThis.__KKGR_HUD_MODEL_V1__;
  const hudLanguage=globalThis.__KKGR_I18N__?.resolve(platform.settings.uiLanguage||'Auto',navigator.language)||(String(navigator.language||'en').startsWith('ja')?'ja':'en');
  const hudMessage=(key,values)=>HudModel.text(key,values,hudLanguage);
  function hudHostDisplay(site){const display=globalThis.__KKGR_HOST_DISPLAY__?.read(site);return display?{...display,...globalThis.__KKGR_HOST_DISPLAY__.normalize(site,display.layout,display.navigation,hudLanguage,display.source)}:display;}
  if(!HudModel) throw new Error('HUD presentation model missing');
  // Separate presentation metadata from Stable's diagnostic strings. No pipeline execution.
  function hudState(subject,changes) { subject.presentation=HudModel.patch(subject.presentation,changes); }



  // Crisp Images-derived code: copyright Igkor Bevzenidis, MIT.
  // Original source: https://github.com/Ikkoru/crisp-images
  // GEGL LoHalo-derived algorithm: copyright GEGL contributors,
  // LGPL-3.0-or-later. See gpu/lohalo-jr.js for attribution.
  const CFG = {

  /* ================================================================== *
   * Config START.
   * ================================================================== */

    // Whether the script is active on all websites by default.
    // The current GUI activates/deactivates it. Its on or off state is remembered per site
    // and overrides this setting, so switching it on somewhere keeps it on there.
    // Switching it off will keep it off as well.
    // false: the script starts out inactive on all sites.
    // true:  the script starts out active on all sites. Not recommended.
    enabledOnStart: false,

    // Whether the overlay starts visible. The HUD control toggles it, and that choice is
    // remembered per site and overrides this.
    hudOnStart: true,

    // Debug diagnostic rows start hidden. Developer settings toggle
    // them for this session; this state is not stored per host.
    detailsOnStart: false,

    // Reader adapters identify target pages; only positive decoded dimensions are required.

    quality: 'lanczos3', // lanczos3, lohalo, browser

    // Upper limit on the resampled image, in pixels (64 megapixels). Anything
    // larger is handed back to the browser rather than eating memory.
    maxOutputPixels: 64e6,

    // How much memory to spend keeping resampled images around, in bytes
    // (64 MB). Keeping them makes switching filters or scrolling back instant;
    // past this the oldest are dropped and redone if you return to them. Images
    // on screen are never dropped, so this is a target rather than a hard
    // ceiling. All of it is freed when you leave the page.
    blobBudget: ([64,128,256].includes(platform.settings.blobBudgets?.[platform.settings.outputFormat||'png'])?platform.settings.blobBudgets[platform.settings.outputFormat||'png']:(platform.settings.outputFormat==='jpeg'?64:128))*1e6,
    prefetchNext: [2,4,8].includes(platform.settings.decodedForward)?platform.settings.decodedForward:4, // target GPU image count, not display positions
    prefetchPrevious: [2,4,8].includes(platform.settings.decodedBack)?platform.settings.decodedBack:4, // target GPU image count, not display positions

    // How far beyond the window to prepare images so they are ready before you
	// scroll to them. Measured in screenfuls above/below/left/right.
    lazyMargin: 1.5,

  /* ================================================================== *
   * Config END.
   * ================================================================== */

  };

  // Synchronous settings snapshot; persistence belongs to the Extension bridge.
  const readFlag = (k, d) => typeof platform.settings[k] === 'boolean' ? platform.settings[k] : d;
  const writeFlag = (k, v) => { if (!applyingConfig) platform.change(k, v); };
  const writeRenderer = id => { if (!applyingConfig) platform.change('renderer', id); };

  let enabled = false; // Start only after the permitted CONFIG handshake.
  let hudVisible = readFlag('hud', CFG.hudOnStart);
  // Debug and runtime caches are deliberately session-only.
  let detailsVisible = !!platform.settings.developerMode&&platform.settings.hudMode==='details';
  globalThis.__KKGR_DIAGNOSTICS__?.configure(platform.settings);
  const releaseProcessedURL=url=>{globalThis.__KKGR_DIAGNOSTICS__?.releaseURL?.(url);URL.revokeObjectURL(url);};
  const processedURL=blob=>{const url=URL.createObjectURL(blob);return globalThis.__KKGR_DIAGNOSTICS__?.bindURL(url,blob)||url;};
  let disabledRenderers = new Set(platform.settings.disabledRenderers || []);
  let quality;

  const dpr = () => window.devicePixelRatio || 1;

  /* ================================================================== *
   * Renderers: synchronous shared-canvas boundary.
   *
   * The external renderers keep their shaders and reusable Canvas resources.
   * render() is synchronous and returns a shared Canvas. The caller must
   * start canvas.toBlob() immediately, before yielding or rendering again.
   * Browser remains the existing passthrough in Reader Core.
   * ================================================================== */

  let rendererEpoch=0;
  const rendererVersions=new Map();
  const executionProvider=id=>id==='browser'?globalThis.__KKGR_BROWSER_PIPELINE_PROBE__:RendererRegistry.get(id);
  const filterUnsupported=id=>!!Object.values(globalThis.__KKGR_PLATFORM__?.settings.filters||{}).some(Boolean)&&!executionProvider(id)?.supportsFilters;
  let appliedFilterSignature=JSON.stringify(platform.settings.filters||{});
  const rendererCacheKey=id=>JSON.stringify(['output',platform.settings.outputFormat||'png',platform.settings.processingMode||'worker'])+'|'+(rendererVersions.get(id)?id+'@'+rendererVersions.get(id):id)+(executionProvider(id)?.pipelineRevision?'|'+executionProvider(id).pipelineRevision:'|'+JSON.stringify(platform.settings.filters||{}));
  const RendererRegistry = (() => {
    const entries = new Map();
    return Object.freeze({
      register(renderer) {
        if (renderer?.apiVersion !== 1 ||
            !/^[a-z][a-z0-9._-]*$/.test(renderer.id || '') ||
            typeof renderer.name !== 'string' || !renderer.name ||
            typeof renderer.render !== 'function' ||
            typeof renderer.ok !== 'function' ||
            typeof renderer.why !== 'function' ||
            typeof renderer.outputLabel !== 'function')
          throw new Error('Invalid Renderer API v1 provider');
        if (entries.has(renderer.id))
          throw new Error('Duplicate GPU renderer: ' + renderer.id);
        entries.set(renderer.id, Object.freeze(renderer));
      },
      remove(id) {const old=entries.get(id);if(!old?.managed)return false;entries.delete(id);try{old.dispose?.();}catch(e){console.warn('[GPU Image Enhancer] dispose',e);}return true;},
      get(id) { return entries.get(id) || null; },
      ids() { return [...entries.keys()]; },
    });
  })();

  const pendingRenderers = globalThis.__KKGR_RENDERER_PROVIDERS__;
  try {
    if (Array.isArray(pendingRenderers))
      for (const provider of pendingRenderers) RendererRegistry.register(provider);
  } finally { delete globalThis.__KKGR_RENDERER_PROVIDERS__; }
  const rendererChoices = () => [...new Set([...(platform.settings.rendererOrder||[]),...RendererRegistry.ids()])].filter(id=>RendererRegistry.get(id)&&!disabledRenderers.has(id)).concat('browser');
  const fallbackRenderer = () => RendererRegistry.get(CFG.quality) || CFG.quality === 'browser'
    ? (disabledRenderers.has(CFG.quality)?'browser':CFG.quality) : rendererChoices()[0] || 'browser';
  const readRenderer = () => rendererChoices().includes(platform.settings.renderer)
    ? platform.settings.renderer : fallbackRenderer();
  quality = readRenderer();

  const RendererRuntime = Object.freeze({
    has(id) { return !!executionProvider(id); },
    native(id) { return !!executionProvider(id)?.runAtNativeSize; },
    name(id) { return globalThis.__KKGR_RENDERER_CATALOG__?.find(e=>e.id===id)?.name || RendererRegistry.get(id)?.name || id; },
    ready(id) { return !filterUnsupported(id)&&!!executionProvider(id)?.ok(); },
    why(id) { return filterUnsupported(id)?'Filters require a GPU API 1 renderer or Browser':executionProvider(id)?.why() || 'unknown renderer'; },
    outputLabel(id) { return executionProvider(id)?.outputLabel() || id; },
    startEncode(id, source, sw, sh, dw, dh, type, label, measureRender) {
      const renderer=executionProvider(id);
      if (!renderer) throw new Error('Unknown GPU renderer: ' + id);
      if(filterUnsupported(id))throw new Error('Filters require a GPU API 1 renderer or Browser');
      if(typeof renderer.startEncodeAsync==='function')
        return renderer.startEncodeAsync(source,sw,sh,dw,dh,type,label,measureRender);
      const render=()=>renderer.render(source,sw,sh,dw,dh);
      const canvas=measureRender ? measureRender(render) : render();
      // Synchronous boundary: start the shared Canvas snapshot before returning
      // to either visible processing or a speculative queue.
      return withTimeout(new Promise(resolve => outputCanvas(canvas,type).toBlob(resolve,type,type==='image/jpeg'?0.9:1)),
        8000,label);
    },
  });

  /* Site geometry is owned by Kavita or Komga. Never set img dimensions. */
  function komgaContainedSize(box, imageCount, nw, nh, pixelRatio) {
    const cssW=box.width / Math.max(1, imageCount), cssH=box.height;
    const paintW=Math.min(cssW, cssH * nw / nh);
    const paintH=Math.min(cssH, cssW * nh / nw);
    return {w:Math.max(1,Math.round(paintW*pixelRatio)),
      h:Math.max(1,Math.round(paintH*pixelRatio)),cssW,cssH};
  }

  function targetSize(img, nw, nh) {
    const kavitaSize=kavitaPageSize(img,nw,nh);if(kavitaSize)return {...kavitaSize,factor:Math.min(kavitaSize.w/nw,kavitaSize.h/nh)};
    if (komgaWebtoonPageImage(img)) return komgaWebtoonTargetSize(img,nw,nh);
    // A GPU Blob can change img's intrinsic aspect and its rect. The slide's
    // layout and image count are owned by Komga and stay the same after a swap.
    if(nw>0 && nh>0 && img.closest('.v-carousel') &&
       getComputedStyle(img).objectFit==='contain') {
      const slide=img.closest('.v-window-item');
      if(slide) {
        const size=komgaContainedSize(komgaStableBox(slide),
          slide.querySelectorAll('img').length,nw,nh,dpr());
        return {...size,factor:Math.min(size.w/nw,size.h/nh),siteControlled:true};
      }
    }
    const r=img.getBoundingClientRect();
    let paintW=r.width, paintH=r.height;
    // Komga object-fit:contain paints inside the element's fixed box.
    if(nw>0 && nh>0 && img.closest('.v-carousel') &&
       getComputedStyle(img).objectFit==='contain') {
      const scale=Math.min(r.width/nw,r.height/nh);
      paintW=nw*scale;
      paintH=nh*scale;
    }
    const w=Math.max(1,Math.round(paintW*dpr()));
    const h=Math.max(1,Math.round(paintH*dpr()));
    return {w,h,factor:Math.min(w/nw,h/nh),cssW:r.width,cssH:r.height,
      siteControlled:true};
  }

  /* ================================================================== *
   * Per-image state
   * ================================================================== */

  let idCounter = 0;
  const state = new WeakMap();

  function record(img) {
    let s = state.get(img);
    const cur = kavitaNextUrl(img.src, 0) ? img.src : (img.currentSrc || img.src);

    if (!s) {
      s = {
        id: ++idCounter, origUrl: cur, el: new WeakRef(img),
        nw: kavitaNextUrl(cur, 0) && img.currentSrc !== cur ? 0 : img.naturalWidth,
        nh: kavitaNextUrl(cur, 0) && img.currentSrc !== cur ? 0 : img.naturalHeight,
        blobUrl: null, key: null, busy: false, rerun: false,
        retryable: false,
        status: 'pending', report: null,
        // key -> blob URL, so flipping between filters you have already seen is
        // instant instead of a fresh resample plus PNG encode each time.
        cache: new Map(),
        viewedKeys: new Set(),
      };
      state.set(img, s);
      return s;
    }

    // Ignore src changes while a swap of ours is in flight: the value passing
    // through is our own resampled blob. Treating it as a new source would
    // overwrite origUrl and the recorded natural size with the resampled size,
    // and the image would then fail the eligibility check and be skipped for good.
    if (s.busy) return s;

    // An image can be recorded before it has decoded - IntersectionObserver fires for
    // elements that are in view but still loading - and its natural size is 0 then.
    // The src-change branch below is the only other place the size is refreshed, so an
    // image whose URL never changes would keep a size of 0, fail eligible(), and be
    // skipped for as long as the page lived.
    if (!s.nw && img.naturalWidth &&
        (!kavitaNextUrl(s.origUrl, 0) || img.currentSrc === s.origUrl)) {
      s.nw = img.naturalWidth;
      s.nh = img.naturalHeight;
      s.key = null;
    }

    // The site swapped in a different image behind our back.
    const ours = s.blobUrl && cur === s.blobUrl;
    if (!ours && cur !== s.origUrl) {
      retainViewedPage(s);
      dropCache(s);
      trimCacheBudget();
      s.origUrl = cur;
      rendererEpoch++;globalThis.__KKGR_CANCEL_ANALYSIS__?.();
      const loaded = img.complete && (!kavitaNextUrl(cur, 0) || img.currentSrc === cur);
      s.nw = loaded ? img.naturalWidth : 0;
      s.nh = loaded ? img.naturalHeight : 0;
      s.key = null;
      s.status = s.nw && s.nh ? 'pending' : 'source loading';
      hudState(s,{phase:'waiting',stage:s.nw?'layout':'source',route:null,reuse:null,issue:null,actualRenderer:null}); // HUD_ONLY
    }
    return s;
  }


  // A resampled bitmap is a blob: URL, and a blob stays alive until it is
  // revoked or the document is destroyed. Per-image caches cannot bound that on
  // their own: the caches hang off a WeakMap keyed by the <img>, so if the page
  // removes an element, its state becomes collectable and takes the only
  // reference to those URLs with it - several MB stranded per image, with no way
  // left to free them. This registry is keyed by URL instead of by element, so
  // the total stays bounded no matter what the page does to the DOM.
  const blobs = new Map();   // url -> { s, key, bytes }, in creation order
  let blobBytes = 0;
  const historyLRU = new Map(); // exact URL|size|renderer -> viewed result
  let historyBytes = 0;
  function historyPageCount() {
    return new Set([...historyLRU.keys()].map(key => key.slice(0, key.indexOf('|')))).size;
  }

  function totalCacheBytes() {
    return blobBytes + historyBytes + kavitaAheadBytes() + komgaAheadBytes() + KavitaSplit.bytes();
  }

  function retainViewedPage(s) {
    // Transfer ownership of the completed, actually displayed bitmap before
    // dropCache() revokes any entries on a recycled <img>.
    for (const [key, url] of [...s.cache]) {
      if (!s.viewedKeys.has(key) || !blobs.has(url)) continue;
      const rec = blobs.get(url);
      blobs.delete(url);
      blobBytes -= rec.bytes;
      s.cache.delete(key);
      const older = historyLRU.get(key);
      if (older) { releaseProcessedURL(older.url); historyBytes -= older.bytes; }
      historyLRU.delete(key);
      historyLRU.set(key, {url, bytes:rec.bytes, nw:s.nw, nh:s.nh,
        viewed:true, direction:'history', el:s.el, decoded:rec.decoded||null});
      historyBytes += rec.bytes;
    }
  }

  function takeHistory(key) {
    const item = historyLRU.get(key);
    if (!item) return null;
    historyLRU.delete(key);
    historyBytes -= item.bytes;
    return item;
  }

  let cacheReclaimScheduled = false;
  function scheduleCacheReclaim() {
    if (cacheReclaimScheduled) return;
    cacheReclaimScheduled = true;
    setTimeout(async () => {
      try {
        for (const [url, rec] of [...blobs]) {
          if (totalCacheBytes() <= CFG.blobBudget) break;
          const s = rec.s, img = s.el.deref();
          if (s.busy || kavitaForwardKeys.has(rec.key) || kavitaBackKeys.has(rec.key) ||
              komgaForwardKeys.has(rec.key) || komgaBackKeys.has(rec.key) || (img?.isConnected && nearViewport(img))) continue;
          if (img?.isConnected && (img.currentSrc || img.src) === url) {
            if (s.origUrl !== rec.key.split('|')[0]) continue;
            s.busy = true;
            try {
              await setSrc(img, s.origUrl);
              if ((img.currentSrc || img.src) === url) continue;
              s.key = null;
            } finally { s.busy = false; }
          }
          if (s.cache.get(rec.key) === url) s.cache.delete(rec.key);
          if (s.blobUrl === url) s.blobUrl = null;
          forgetBlob(url);
        }
      } finally { cacheReclaimScheduled = false; }
    }, 0);
  }

  function trimCacheBudget() {
    while (totalCacheBytes() > CFG.blobBudget) {
      // Render priority is independent: visible work runs first. Eviction
      // starts with distant unused work and then oldest viewed history.
      const speculative = [
        ...[...kavitaAhead].filter(([key, item]) => !item.viewed &&
          item.direction !== 'current' && !kavitaForwardKeys.has(key) && !kavitaBackKeys.has(key))
          .map(([key, item]) => ({map:kavitaAhead,key,item,
            distance:kavitaDistance(key)})),
        ...[...komgaAhead].filter(([key]) => !komgaForwardKeys.has(key) && !komgaBackKeys.has(key))
          .map(([key, item]) => ({map:komgaAhead,key,item,
            distance:Math.abs(item.distance || 0)})),
      ].sort((a,b) => b.distance-a.distance);
      const victim = speculative[0];
      if (victim) {
        victim.map.delete(victim.key);
        releaseProcessedURL(victim.item.url);
        continue;
      }
      const oldest = [...historyLRU].find(([key, item]) => {
        const img = item.el?.deref();
        return !kavitaForwardKeys.has(key) && !kavitaBackKeys.has(key) &&
          !komgaForwardKeys.has(key) && !komgaBackKeys.has(key) &&
          !(img?.isConnected && (img.currentSrc || img.src) === item.url);
      });
      if (oldest) {
        historyLRU.delete(oldest[0]);
        historyBytes -= oldest[1].bytes;
        releaseProcessedURL(oldest[1].url);
        continue;
      }
      // Current and the required moving window can temporarily exceed 64MB.
      break;
    }
  }

  function forgetBlob(url) {
    const rec = blobs.get(url);
    if (rec) {
      blobBytes -= rec.bytes;
      blobs.delete(url);
    }
    releaseProcessedURL(url);
  }

  function trackBlob(url, s, key, bytes, decoded=null) {
    const previous=blobs.get(url);
    if(previous)blobBytes-=previous.bytes;
    blobs.set(url, { s, key, bytes, decoded:decoded||previous?.decoded||null });
    blobBytes += bytes;
    trimCacheBudget();
    if (totalCacheBytes() > CFG.blobBudget) scheduleCacheReclaim();
  }

  function dropCache(s) {
    for (const url of s.cache.values()) forgetBlob(url);
    s.cache.clear();
    s.viewedKeys.clear();
    s.blobUrl = null;
  }

  function trimCache(s) {
    trimCacheBudget();
  }

  function eligible(s) {
    return s.nw >= 1 && s.nh >= 1;
  }

  // Chrome gives every file:// resource its own opaque origin, so a local image
  // can never be uploaded to WebGL or read back out of a canvas. Setting
  // crossOrigin on one also stops it loading at all, so CORS must only be asked
  // for where it can help. data: URLs are the one local-ish form that never taints.
  function originKind(url) {
    if (/^data:/i.test(url)) return 'same';
    if (location.protocol === 'file:') return 'file';
    if (/^(blob|filesystem):/i.test(url)) return 'same';
    try {
      const u = new URL(url, location.href);
      if (!/^https?:$/.test(u.protocol)) return 'other';
      return u.origin === location.origin ? 'same' : 'cross';
    } catch { return 'other'; }
  }

  const outputWarning=()=>{};
  async function outputType(){return platform.settings.outputFormat==='jpeg'?'image/jpeg':'image/png';}
  function outputCanvas(canvas,type){if(type!=='image/jpeg')return canvas;const white=document.createElement('canvas');white.width=canvas.width;white.height=canvas.height;const x=white.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,white.width,white.height);x.drawImage(canvas,0,0);return white;}


  function loadImage(url,kind,signal) {
    return new Promise((res,rej)=>{
      const im=new Image(),loadStarted=performance.now();
      const cleanup=()=>{signal?.removeEventListener('abort',abort);im.onload=im.onerror=null;};
      const abort=()=>{cleanup();im.removeAttribute('src');rej(Object.assign(Error('Image request cancelled'),{code:'ANALYSIS_CANCELLED'}));};
      if(signal?.aborted){abort();return;}
      if(kind==='cross')im.crossOrigin='anonymous';
      im.onload=()=>{cleanup();globalThis.__KKGR_DIAGNOSTICS__?.measurement(im,{sourceLoadMs:performance.now()-loadStarted,startedAt:loadStarted});res(im);};
      im.onerror=()=>{cleanup();rej(Error(kind==='cross'?'blocked: no CORS headers on source':'source load failed'));};
      signal?.addEventListener('abort',abort,{once:true});im.src=url;
    });
  }

  // Any await inside processImage that can fail to settle would leave s.busy
  // true forever, freezing that image on its last status with no way to recover.
  // Every one of them gets a deadline so a stall surfaces as a visible ERROR.
  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(label)), ms); }),
    ]).finally(() => clearTimeout(timer));
  }

  // Kavita's reader image endpoint includes a numeric page. Prepare four
  // images ahead and four back in the DOM fallback when they have the same aspect ratio as the page
  // being viewed. Never assign a speculative result to an img: on display,
  // the normal exact source/size/quality key decides whether it is usable.
  const PrefetchPolicy = Object.freeze({
    offsets() {
      return [
        ...Array.from({length: CFG.prefetchNext}, (_, i) => i + 1),
        ...Array.from({length: CFG.prefetchPrevious}, (_, i) => -i - 1),
      ];
    },
  });
  const kavitaAhead = new Map();
  const kavitaAttempts = new Set();
  let kavitaJob = false;
  let kavitaGeneration = 0;
  let kavitaHistoryHits = 0;
  let kavitaAnchorPage = 0;
  let kavitaChapterId = '';
  const kavitaForwardKeys = new Set();
  const kavitaBackKeys = new Set();

  function kavitaAheadBytes() {
    return [...kavitaAhead.values()].reduce((sum, item) => sum + item.bytes, 0);
  }

  function komgaAheadBytes() {
    return [...komgaAhead.values()].reduce((sum, item) => sum + item.bytes, 0);
  }

  function hasCompletedKavitaKey(key) {
    return kavitaAhead.has(key) || historyLRU.has(key) ||
      [...blobs.values()].some(rec => rec.key === key);
  }

  function clearKavitaAhead() {
    kavitaGeneration++;kavitaApiController?.abort();clearTimeout(kavitaApiTimer);kavitaApiTimer=null;kavitaApiIdentity='';kavitaApiPlanCache=null;
    kavitaForwardKeys.clear();
    kavitaBackKeys.clear();
    for (const item of kavitaAhead.values()) releaseProcessedURL(item.url);
    kavitaAhead.clear();
    kavitaAttempts.clear();
  }

  function kavitaNextUrl(original, distance = 1) {
    try {
      const u = new URL(original, location.href);
      if (u.origin !== location.origin ||
          !/\/api\/reader\/image\/?$/i.test(u.pathname) ||
          !u.searchParams.get('chapterId')) return null;
      const page = u.searchParams.get('page');
      if (!/^(0|[1-9]\d*)$/.test(page) ||
          Number(page) + distance < 0 || Number(page) + distance >= (KavitaPages?.peek(original)?.pages?.length||10000)) return null;
      u.searchParams.set('page', String(Number(page) + distance));
      return u.href;
    } catch { return null; }
  }

  function kavitaVisiblePages(original) {
    const base = new URL(original, location.href);
    let highest = original, lowest = original;
    let maxPage = Number(base.searchParams.get('page'));
    let minPage = maxPage;
    for (const el of document.images) {
      const box = el.getBoundingClientRect();
      if (box.width < 32 || box.height < 32 ||
          box.bottom <= 0 || box.top >= innerHeight ||
          box.right <= 0 || box.left >= innerWidth) continue;
      try {
        const displayed = el.src || el.currentSrc;
        const original = kavitaNextUrl(displayed, 0) ? displayed :
          state.get(el)?.origUrl || displayed;
        const url = new URL(original, location.href);
        const page = url.searchParams.get('page');
        if (url.origin !== base.origin || url.pathname !== base.pathname ||
            url.searchParams.get('chapterId') !== base.searchParams.get('chapterId') ||
            !/^(0|[1-9]\d*)$/.test(page)) continue;
        if (Number(page) > maxPage) { highest = url.href; maxPage = Number(page); }
        if (Number(page) < minPage) { lowest = url.href; minPage = Number(page); }
      } catch { /* Ignore unrelated images. */ }
    }
    return { first: lowest, last: highest };
  }

  // A reused img element receives the next page's src. Transfer its completed
  // bitmap before dropCache() revokes the previous page. Keep previously viewed
  // pages by exact source, dimensions and quality until the shared budget fills.
  function trimKavitaAhead() {
    trimCacheBudget();
    if (totalCacheBytes() > CFG.blobBudget) scheduleCacheReclaim();
  }

  function kavitaDistance(key) {
    try {
      const url = new URL(key.startsWith('[')?JSON.parse(key)[0]:key.slice(0, key.indexOf('|')));
      if (url.searchParams.get('chapterId') !== kavitaChapterId) return Infinity;
      return Math.abs(Number(url.searchParams.get('page')) - kavitaAnchorPage);
    } catch { return Infinity; }
  }

  // A reader may keep dozens of old img elements in the DOM. Before prefetch,
  // return distant, offscreen images to their original source; only then revoke
  // their displayed Blob. Never revoke a Blob still bound to an img.
  const KavitaAdapter = Object.freeze({
    id: 'Kavita',
    getCurrentPage: source => kavitaNextUrl(source, 0),
    getPageCount: source => KavitaPages?.peek(source)?.pages?.length||null,
    getSource: (source, offset) => kavitaNextUrl(source, offset),
  });

  // Shared render queue gate: visible jobs always precede speculative jobs.
  let prefetchMeasurementSerial=0;
  const RenderQueue = Object.freeze({
    visiblePending: () => !!(running || queue.length),
    async loadSource(url,label,signal) {const D=globalThis.__KKGR_DIAGNOSTICS__,started=performance.now();try{return await withTimeout(loadImage(url,'same',signal),8000,label);}catch(e){if(D?.enabled()){const token=D.begin('source-'+(++prefetchMeasurementSerial),url,[],[],platform.settings,'ahead');D.event(token,{timings:{sourceLoadMs:performance.now()-started,prefetchTotalMs:performance.now()-started},outcome:'source-failed'});D.finish(token,'failed',null,{code:'SOURCE_LOAD_FAILED'});}throw e;}},
    async prefetch(rendererId, source, sw, sh, dw, dh, type, label) {
      // Runtime starts toBlob synchronously before this async method yields.
      return RendererRuntime.startEncode(rendererId,source,sw,sh,dw,dh,type,label);
    },
  });

  let kavitaWindowTimer = null;
  function revisitKavitaWindow(img) {
    if (kavitaWindowTimer) return;
    kavitaWindowTimer = setTimeout(() => {
      kavitaWindowTimer = null;
      if (!enabled || !img.isConnected) return;
      if (RenderQueue.visiblePending() || kavitaJob) {
        revisitKavitaWindow(img);
        return;
      }
      const current = record(img);
      if (current.nw && current.nh && eligible(current))
        queueKavitaAhead(img, current,
          targetSize(img, current.nw, current.nh));
    }, 120);
  }

  // Decode only nearby, already completed History Blobs. The History LRU owns
  // the Blob; this window owns only its optional decoded Image reference.
  let kavitaWarmWanted = new Set();
  let kavitaWarmOrder = [];
  let kavitaWarmGeneration = 0;
  let kavitaWarmTimer = null;
  let kavitaWarmRunning = false;
  function runKavitaHistoryWarm() {
    if (kavitaWarmTimer || kavitaWarmRunning || !kavitaWarmOrder.length) return;
    kavitaWarmTimer = setTimeout(async () => {
      kavitaWarmTimer = null;
      if (!enabled || !RendererRuntime.has(quality)) return;
      if (RenderQueue.visiblePending()) {
        runKavitaHistoryWarm();
        return;
      }
      kavitaWarmRunning = true;
      const generation = kavitaWarmGeneration;
      try {
        for (const key of kavitaWarmOrder) {
          if (generation !== kavitaWarmGeneration || RenderQueue.visiblePending()) break;
          const item = historyLRU.get(key);
          if (!item || item.decoded || item.warming) continue;
          item.warming = true;
          try {
            const decoded = await withTimeout(loadImage(item.url, 'same'), 4000,
              'History warm source timed out');
            await withTimeout(decoded.decode(), 4000, 'History warm decode timed out');
            if (generation === kavitaWarmGeneration && kavitaWarmWanted.has(key) &&
                historyLRU.get(key) === item) item.decoded = decoded;
          } catch { /* The Blob remains available to the normal cache path. */ }
          finally { item.warming = false; updateHud(); }
        }
      } finally {
        kavitaWarmRunning = false;
        if (generation !== kavitaWarmGeneration) runKavitaHistoryWarm();
      }
    }, 80);
  }
  function moveKavitaHistoryWarmWindow(first, last, target, rendererId) {
    const next = new Set();
    const ordered = [];
    for (let distance = 1; distance <= Math.max(CFG.prefetchNext,CFG.prefetchPrevious); distance++) {
      for (const source of [distance<=CFG.prefetchNext?kavitaNextUrl(last,distance):null,distance<=CFG.prefetchPrevious?kavitaNextUrl(first,-distance):null]) {
        if (!source) continue;
        const key = `${source}|${target.w}x${target.h}|${rendererCacheKey(rendererId)}`;
        if (!next.has(key)) { next.add(key); ordered.push(key); }
      }
    }
    const changed = next.size !== kavitaWarmWanted.size ||
      [...next].some(key => !kavitaWarmWanted.has(key));
    kavitaWarmWanted = next;
    kavitaWarmOrder = ordered;
    if (changed) {
      kavitaWarmGeneration++;
      for (const [key,item] of historyLRU)
        if (!next.has(key)) item.decoded = null; // Keep the Blob and LRU entry.
    }
    runKavitaHistoryWarm();
  }

  function queueKavitaAhead(img, s, t, retry = 0) {
    const api=kavitaApiPlan(img);if(api){queueKavitaApi(img,api);return;}
    if (!enabled ||         !RendererRuntime.has(quality) ||
        !t.siteControlled || t.cssW < 32 || t.cssH < 32 ||
        t.w * t.h > CFG.maxOutputPixels || t.w * t.h > 16e6) return;
    if (!KavitaAdapter.getCurrentPage(s.origUrl)) return;
    const {first, last} = kavitaVisiblePages(s.origUrl);
    moveKavitaHistoryWarmWindow(first,last,t,quality);
    const baseRatio = s.nw / s.nh;
    const prefetchQuality = quality;
    const candidates = PrefetchPolicy.offsets().map(distance => ({
      next:KavitaAdapter.getSource(distance > 0 ? last : first, distance),
      direction:distance > 0 ? 'next' : 'previous',
    })).filter(item => item.next).map(item => ({...item,
      key: `${item.next}|${t.w}x${t.h}|${rendererCacheKey(prefetchQuality)}`}));
    kavitaAnchorPage = Number(new URL(last).searchParams.get('page'));
    kavitaChapterId = new URL(last).searchParams.get('chapterId');
    kavitaForwardKeys.clear();
    kavitaBackKeys.clear();
    for (const item of candidates) {
      if (item.direction === 'next') kavitaForwardKeys.add(item.key);
      else kavitaBackKeys.add(item.key);
    }
    const wanted = new Map(candidates.map(item => [item.key, item.direction]));
    // The first image of a new spread can arrive before the second. Keep the
    // second image's prepared result while the next/previous ranges shift.
    const base = new URL(s.origUrl, location.href);
    for (const el of document.images) {
      const box = el.getBoundingClientRect();
      if (box.width < 32 || box.height < 32 ||
          box.bottom <= 0 || box.top >= innerHeight ||
          box.right <= 0 || box.left >= innerWidth) continue;
      try {
        const displayed = el.src || el.currentSrc;
        const original = kavitaNextUrl(displayed, 0) ? displayed :
          state.get(el)?.origUrl || displayed;
        const url = new URL(original, location.href);
        if (url.origin !== base.origin || url.pathname !== base.pathname ||
            url.searchParams.get('chapterId') !== base.searchParams.get('chapterId') ||
            !kavitaNextUrl(url.href, 0)) continue;
        const key = `${url.href}|${Math.round(box.width * dpr())}x${Math.round(box.height * dpr())}|${rendererCacheKey(prefetchQuality)}`;
        if (kavitaAhead.has(key)) wanted.set(key, 'current');
      } catch { /* Ignore unrelated images. */ }
    }
    for (const [key, item] of [...kavitaAhead]) {
      if (wanted.has(key)) item.direction = wanted.get(key);
      else {item.direction = 'history';item.decoded=null;}
    }
    for (const key of [...kavitaAttempts]) if (!wanted.has(key)) kavitaAttempts.delete(key);
    // An earlier attempt may have been discarded under memory pressure. Once
    // it becomes a required forward page, retry if no job still owns it.
    if (!kavitaJob) for (const key of kavitaForwardKeys)
      if (!hasCompletedKavitaKey(key)) kavitaAttempts.delete(key);
    updateHud();
    if (candidates.every(({key}) => kavitaAhead.has(key) || kavitaAttempts.has(key))) return;
    // The visible page always has priority over speculative work.
    setTimeout(async () => {
      if (RenderQueue.visiblePending()) {
        if (retry < 10) queueKavitaAhead(img, s, t, retry + 1);
        else revisitKavitaWindow(img);
        return;
      }
      if (!enabled || quality !== prefetchQuality ||
          RenderQueue.visiblePending() || kavitaJob ||
          !img.isConnected || !RendererRuntime.ready(prefetchQuality)) return;
      kavitaJob = true;
      const generation = kavitaGeneration;
      let interrupted = false;
      const yieldToVisible = () => {
        if (RenderQueue.visiblePending()) interrupted = true;
        return interrupted;
      };
      try {
        for (const {next, key, direction} of candidates) {
          if (generation !== kavitaGeneration || !enabled ||
              quality !== prefetchQuality ||
              yieldToVisible() || !img.isConnected) break;
          if (hasCompletedKavitaKey(key) || kavitaAttempts.has(key)) continue;
          if (kavitaAttempts.size > 64) kavitaAttempts.clear();
          kavitaAttempts.add(key);
          try {
            if (generation !== kavitaGeneration || yieldToVisible()) continue;
            const source = await RenderQueue.loadSource(next,'Kavita prefetch source timed out');
            if (generation !== kavitaGeneration || !enabled ||
                quality !== prefetchQuality ||
                Math.abs(source.naturalWidth / source.naturalHeight - baseRatio) > 0.005 ||
                source.naturalWidth < 1 ||
                source.naturalHeight < 1 ||
                yieldToVisible()) continue;
            const type = await outputType();
            if (yieldToVisible() || generation !== kavitaGeneration ||
                hasCompletedKavitaKey(key)) continue;
            // Shared canvas: snapshot before yielding to another image.
            const blob = await RenderQueue.prefetch(prefetchQuality, source,
              source.naturalWidth, source.naturalHeight, t.w, t.h, type,
              'Kavita prefetch encode timed out');
            if (!blob || generation !== kavitaGeneration || !enabled ||
                quality !== prefetchQuality || hasCompletedKavitaKey(key)){if(blob)globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'discarded'});continue;}
            if (generation !== kavitaGeneration || !enabled ||
                quality !== prefetchQuality || hasCompletedKavitaKey(key)){globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'discarded'});continue;}
            const url = processedURL(blob);globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'stored'});
            kavitaAhead.set(key, { url, bytes: blob.size, direction, viewed:false,
              nw:source.naturalWidth, nh:source.naturalHeight });
            trimKavitaAhead();
            updateHud();
            if (!kavitaAhead.has(key)){globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'evicted'});continue;}
            try {
              const decodeStarted=performance.now();const decoded = await withTimeout(loadImage(url, 'same'), 4000,
                'Kavita prefetch decode timed out');
              await withTimeout(decoded.decode(), 4000,
                'Kavita prefetch decode timed out');
              if (kavitaAhead.get(key)?.url === url)
                kavitaAhead.get(key).decoded = decoded;globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(url,{timings:{outputDecodeMs:performance.now()-decodeStarted},outcome:kavitaAhead.get(key)?.url===url?'ready':'discarded'});
            } catch(e) {globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(url,{outcome:'stored-decode-failed',warmError:e.code||'DECODE_TIMEOUT_OR_FAILED'}); /* Encoded result remains useful if warming fails. */ } finally {updateHud();}
          } catch { /* Missing page leaves normal reading intact. */ }
        }
      }
      finally {
        kavitaJob = false;
        if (interrupted && generation === kavitaGeneration) {
          for (const item of candidates)
            if (!hasCompletedKavitaKey(item.key)) kavitaAttempts.delete(item.key);
          revisitKavitaWindow(img);
        }
      }
    }, 80);
  }

  // Far work follows the site's Fullscreen API, not Chrome's F11 mode.
  const farPolicies={};let farWakeTimer=null,kavitaFarJob=false,komgaFarJob=false;const FAR_STABLE_MS=600;
  function siteFullscreen(){const el=document.fullscreenElement||document.webkitFullscreenElement;return !!el&&!!document.querySelector('app-manga-reader,.v-carousel,.html-reader')&&(el===document.documentElement||el===document.body||!!el.querySelector?.('app-manga-reader,.v-carousel,.html-reader')||!!el.closest?.('app-manga-reader,.v-carousel,.html-reader'));}
  function wakeReadAhead(){if(farWakeTimer)return;farWakeTimer=setTimeout(()=>{farWakeTimer=null;if(!enabled)return;const img=hudTarget();queueKavitaApi(img);const plan=img&&komgaApiPlan(img);if(plan)queueKomgaApi(img,plan);},FAR_STABLE_MS+30);}
  function cacheShape(key){try{if(key.startsWith('[')){const a=JSON.parse(key);return {source:a[0],shape:JSON.stringify(a.slice(0,6))};}const i=key.indexOf('|'),j=key.indexOf('|',i+1);if(i<0||j<0)return null;return {source:key.slice(0,i),shape:key.slice(0,j)};}catch{return null;}}
  function pruneOldGeometry(plan,site){
    const wanted=new Set([...plan.near,...plan.far,...(plan.currentKeys||[]).map(key=>({key}))].filter(e=>e.key).map(e=>cacheShape(e.key)?.shape));
    const stale=key=>{const k=cacheShape(key);if(!k||wanted.has(k.shape))return false;const id=site==='Kavita'?KavitaPages.imageIdentity(k.source):KomgaPages.imageIdentity(k.source);return !!id&&(site==='Kavita'?id.recordKey===plan.id.recordKey:id.listUrl===plan.id.listUrl);};
    const used=url=>[...document.images].some(img=>img.isConnected&&(img.currentSrc||img.src)===url);let blocked=false;
    for(const map of [kavitaAhead,komgaAhead])for(const [key,item]of map){if(!stale(key))continue;if(used(item.url)){blocked=true;continue;}map.delete(key);releaseProcessedURL(item.url);}
    for(const [key,item]of historyLRU){if(!stale(key))continue;if(used(item.url)){blocked=true;continue;}historyLRU.delete(key);historyBytes-=item.bytes;releaseProcessedURL(item.url);}
    for(const [url,rec]of blobs){if(!stale(rec.key))continue;if(rec.s.busy||used(url)){blocked=true;continue;}if(rec.s.cache.get(rec.key)===url)rec.s.cache.delete(rec.key);if(rec.s.blobUrl===url)rec.s.blobUrl=null;if(rec.s.key===rec.key)rec.s.key=null;forgetBlob(url);}
    KavitaSplit.pruneGeometry(stale,used);return blocked;
  }
  function farReady(plan,site){
    const geometry=plan.geometryKey,full=siteFullscreen();let policy=farPolicies[site];
    if(!policy||policy.geometry!==geometry||policy.full!==full){const changed=!!policy&&policy.geometry!==geometry;policy=farPolicies[site]={geometry,full,stableAt:performance.now()+FAR_STABLE_MS,cleanup:changed||policy?.cleanup};wakeReadAhead();}
    if(performance.now()<policy.stableAt){wakeReadAhead();return false;}
    if(policy.cleanup)policy.cleanup=pruneOldGeometry(plan,site);return full;
  }
  const fullscreenChanged=()=>{for(const policy of Object.values(farPolicies)){policy.full=siteFullscreen();policy.stableAt=performance.now()+FAR_STABLE_MS;}if(!siteFullscreen()){if(kavitaFarJob){kavitaApiController?.abort();kavitaAttempts.clear();}if(komgaFarJob){komgaApiController?.abort();komgaAttempts.clear();}}wakeReadAhead();};
  document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);
  const KavitaPages=globalThis.__KKGR_KAVITA_PAGES__;
  let kavitaApiTimer=null,kavitaApiController=null,kavitaApiIdentity='',kavitaApiError=null,kavitaApiPlanCache=null,kavitaPlanReason=null,kavitaPlanSource=null;
  function kavitaShownImages(){return [...document.querySelectorAll('app-manga-reader img')].filter(img=>{if(img.hasAttribute('data-gpu-reader-split-output'))return false;const r=img.getBoundingClientRect(),style=getComputedStyle(img);return r.width>=32&&r.height>=32&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&style.visibility!=='hidden'&&style.display!=='none';});}
  function kavitaGeometry(surface,layout){
    const container=surface?.closest('.image-container')||surface?.parentElement;if(!container)return null;
    const classes=container.classList,mode=classes.contains('full-height')||classes.contains('fit-to-height-double-offset')?'height':classes.contains('full-width')||classes.contains('fit-to-width-double-offset')?'width':classes.contains('original')||classes.contains('original-double-offset')?'original':null;
    if(!mode)return null;
    const box=container.getBoundingClientRect(),style=getComputedStyle(surface),override=surface.style.width?.endsWith('%')?parseFloat(surface.style.width):0;
    return {mode,width:box.width,height:innerHeight,ratio:dpr(),override,contain:surface.classList.contains('fit-to-screen')||mode==='height'&&(style.objectFit==='contain'||style.objectFit==='scale-down'),scaleDown:style.objectFit==='scale-down',layout};
  }
  function kavitaPageSize(img,nw,nh){
    if(!KavitaPages||!KavitaPages.imageIdentity(state.get(img)?.origUrl||img.src))return null;
    const display=globalThis.__KKGR_HOST_DISPLAY__?.read('Kavita'),layout=display?.navigation==='webtoon'?'webtoon':display?.layout;
    if(layout==='webtoon'){const r=img.getBoundingClientRect();return r.width>=32?{w:Math.max(1,Math.round(r.width*dpr())),h:Math.max(1,Math.round(r.width*nh/nw*dpr())),cssW:r.width,cssH:r.width*nh/nw,siteControlled:true}:null;}
    const profile=kavitaGeometry(img,layout);if(!profile)return null;
    const record=KavitaPages.peek(state.get(img)?.origUrl||img.src),id=KavitaPages.imageIdentity(state.get(img)?.origUrl||img.src),groups=record?.pages&&KavitaPages.groups(record,layout);
    const slots=groups?.find(g=>g.some(p=>p.number===id.number))?.length||kavitaShownImages().filter(x=>x.closest('.image-container')===img.closest('.image-container')).length||1;
    return KavitaPages.size(profile,nw,nh,slots);
  }
  function kavitaApiPlan(img=null){
    const unavailable=reason=>{kavitaPlanReason=reason;return null;};kavitaPlanSource=null;
    if(!enabled)return unavailable('OFF');if(!KavitaPages)return unavailable('PAGE_ADAPTER_UNAVAILABLE');if(!RendererRuntime.has(quality))return unavailable('PROCESSING_PROVIDER_UNAVAILABLE');
    const split=KavitaSplit.info(),splitContext=KavitaSplit.context(),isSplit=!!splitContext&&!!split;
    const currentImage=kavitaShownImages()[0];img=currentImage||img;
    const source=isSplit?split.source:state.get(img)?.origUrl||img?.src,id=KavitaPages.imageIdentity(source);kavitaPlanSource=source;if(!id)return unavailable('IMAGE_URL_UNRECOGNIZED');
    const record=KavitaPages.ensure(source,()=>{schedule();queueKavitaApi();});if(!record?.pages)return unavailable(record?.pending?'CHAPTER_INFO_LOADING':record?.error||'CHAPTER_INFO_UNAVAILABLE');
    const display=globalThis.__KKGR_HOST_DISPLAY__?.read('Kavita'),webtoon=display?.navigation==='webtoon',layout=isSplit?'split':webtoon?'webtoon':display?.layout;
    if(!layout)return unavailable('LAYOUT_UNRECOGNIZED');if(layout==='double'&&!Object.keys(record.pairs).length)return unavailable('DOUBLE_PAIRS_MISSING');
    const groups=KavitaPages.groups(record,layout);if(!groups)return unavailable('LAYOUT_UNSUPPORTED');
    const shown=kavitaShownImages(),visible=shown.map(x=>KavitaPages.imageIdentity(state.get(x)?.origUrl||x.src)).filter(x=>x?.recordKey===id.recordKey).map(x=>x.number);
    const window=KavitaPages.window(groups,id.number,{forward:CFG.prefetchNext,back:CFG.prefetchPrevious,visible});if(!window)return unavailable('CURRENT_PAGE_NOT_IN_CHAPTER');
    const surface=isSplit?splitContext.img:img,profile=webtoon?{mode:'width',width:surface.getBoundingClientRect().width,height:innerHeight,ratio:dpr()}:kavitaGeometry(surface,layout);if(!profile)return unavailable('FITTING_UNRECOGNIZED');if(profile.width<32)return unavailable('LAYOUT_NOT_READY');kavitaPlanReason=null;
    const splitControl=document.querySelector('app-manga-reader #page-splitting'),splitMatch=splitControl&&String(splitControl.value).match(/^(?:\d+: )?([0-3])$/),splitSetting=splitMatch?Number(splitMatch[1]):null,splitEnabled=isSplit||(layout==='single'&&[0,1].includes(splitSetting));
    const pipeline=rendererCacheKey(quality),signature=JSON.stringify([id.recordKey,id.number,visible,layout,profile,pipeline,CFG.prefetchNext,CFG.prefetchPrevious,isSplit?split.part:null,splitSetting]);
    if(kavitaApiPlanCache?.signature===signature&&kavitaApiPlanCache.record===record)return kavitaApiPlanCache;
    const make=e=>{
      const p=e.page;if(p.width<1||p.height<1)return [{...e,missing:true}];
      const parts=splitEnabled&&p.isWide&&p.width%2===0?['left','right']:[null];
      return parts.map(part=>{const nw=part?p.width/2:p.width,nh=p.height,t=KavitaPages.size(profile,nw,nh,e.slots),sourceUrl=KavitaPages.pageUrl(id,p);if(!t||t.w*t.h>16e6||t.w*t.h>CFG.maxOutputPixels)return {...e,part,missing:true};return {...e,part,sourceUrl,nw,nh,originalW:p.width,originalH:p.height,w:t.w,h:t.h,key:part?JSON.stringify([sourceUrl,part,nw,nh,t.w,t.h,pipeline]):`${sourceUrl}|${t.w}x${t.h}|${pipeline}`};});
    };
    const near=window.near.flatMap(make),far=window.far.flatMap(make).filter(x=>x.key);
    if(isSplit){const page=record.pages[id.number];if(page?.isWide){const other=make({page,slots:1,distance:0,offset:0,near:true}).filter(x=>x.part!==split.part);near.unshift(...other);}}
    const currentKeys=groups.filter(g=>g.some(p=>p.number===id.number||visible.includes(p.number))).flatMap(g=>g.flatMap(page=>make({page,slots:g.length,distance:0,offset:0,near:true}))).filter(e=>e.key).map(e=>e.key);
    return kavitaApiPlanCache={near,far,currentKeys,signature,pipeline,id,isSplit,layout,record,geometryKey:JSON.stringify([id.recordKey,profile])};
  }
  function kavitaApiResult(key){const result=completedResult(key),split=KavitaSplit.cached(key);return split?{key,url:split.url,item:split,owner:'Split',decoded:!!split.image?.complete&&split.image.naturalWidth>0}:result;}
  function queueKavitaApi(img=null,provided=null){
    const plan=provided||kavitaApiPlan(img);if(!plan)return;
    if(plan.signature!==kavitaApiIdentity){kavitaApiIdentity=plan.signature;kavitaGeneration++;kavitaApiController?.abort();kavitaAttempts.clear();kavitaApiError=null;}
    kavitaAnchorPage=plan.id.number;kavitaChapterId=plan.id.chapter;
    const near=plan.near.filter(x=>x.key),wanted=new Set(near.map(x=>x.key));kavitaForwardKeys.clear();kavitaBackKeys.clear();
    for(const x of near)(x.distance>=0?kavitaForwardKeys:kavitaBackKeys).add(x.key);
    const currentKeys=new Set(kavitaShownImages().map(x=>state.get(x)?.key).filter(Boolean));const splitKey=KavitaSplit.currentKey();if(splitKey)currentKeys.add(splitKey);
    for(const [key,item]of kavitaAhead){item.direction=wanted.has(key)?near.find(x=>x.key===key).distance<0?'previous':'next':currentKeys.has(key)?'current':'history';if(!wanted.has(key)&&!currentKeys.has(key))item.decoded=null;}
    for(const [key,item]of historyLRU)if(KavitaPages.imageIdentity(key.split('|')[0])&&!wanted.has(key)&&!currentKeys.has(key))item.decoded=null;
    for(const rec of blobs.values())if(KavitaPages.imageIdentity(rec.key.split('|')[0])&&!wanted.has(rec.key)&&!currentKeys.has(rec.key))rec.decoded=null;
    KavitaSplit.keepDecoded(wanted);
    const allowFar=farReady(plan,'Kavita');
    if(kavitaJob||kavitaApiTimer)return;
    const pending=near.find(x=>!kavitaApiResult(x.key).decoded&&!kavitaAttempts.has(x.key)),distant=!pending&&allowFar&&totalCacheBytes()<CFG.blobBudget*.85?plan.far.find(x=>!kavitaApiResult(x.key).url&&!kavitaAttempts.has(x.key)):null,item=pending||distant;
    if(!item)return;
    const selected=quality,generation=kavitaGeneration;
    kavitaApiTimer=setTimeout(async()=>{
      kavitaApiTimer=null;const latest=kavitaApiPlan();if(!enabled)return;
      if(generation!==kavitaGeneration||quality!==selected||!latest||latest.signature!==plan.signature){if(latest)queueKavitaApi(null,latest);return;}
      if(RenderQueue.visiblePending()||KavitaSplit.working()||!RendererRuntime.ready(selected)){setTimeout(()=>queueKavitaApi(),120);return;}
      if(!item.near&&!farReady(plan,'Kavita'))return;
      kavitaFarJob=!item.near;kavitaJob=true;const controller=new AbortController();kavitaApiController=controller;kavitaAttempts.add(item.key);let failed=false,crop=null;
      try{
        let result=kavitaApiResult(item.key),url=result.url;
        if(!url){
          const source=await RenderQueue.loadSource(item.sourceUrl,'Kavita API prefetch source timed out',controller.signal);
          if(source.naturalWidth!==item.originalW||source.naturalHeight!==item.originalH)throw Object.assign(Error('SOURCE_DIMENSIONS_CHANGED'),{code:'SOURCE_DIMENSIONS_CHANGED'});
          if(generation!==kavitaGeneration||RenderQueue.visiblePending()||KavitaSplit.working()){kavitaAttempts.delete(item.key);return;}
          let input=source;if(item.part){crop=document.createElement('canvas');crop.width=item.nw;crop.height=item.nh;crop.getContext('2d').drawImage(source,item.part==='right'?item.nw:0,0,item.nw,item.nh,0,0,item.nw,item.nh);input=crop;globalThis.__KKGR_DIAGNOSTICS__?.aliasSource(crop,item.sourceUrl+'|'+item.part);}
          const type=await outputType();if(generation!==kavitaGeneration||RenderQueue.visiblePending()||KavitaSplit.working()){kavitaAttempts.delete(item.key);return;}
          const blob=await RenderQueue.prefetch(selected,input,item.nw,item.nh,item.w,item.h,type,'Kavita API prefetch encode timed out');
          if(!blob||!enabled||quality!==selected||rendererCacheKey(selected)!==plan.pipeline||generation!==kavitaGeneration||kavitaApiResult(item.key).url||(!item.near&&!farReady(plan,'Kavita'))){kavitaAttempts.delete(item.key);return;}
          url=processedURL(blob);kavitaAhead.set(item.key,{url,bytes:blob.size,direction:item.distance<0?'previous':'next',distance:item.distance,nw:item.nw,nh:item.nh,decoded:null});trimKavitaAhead();KavitaSplit.trim();globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'stored'});
        }
        const next=kavitaApiPlan();if(url&&next?.near.some(x=>x.key===item.key)&&!RenderQueue.visiblePending()&&!KavitaSplit.working()){
          const owner=kavitaApiResult(item.key);if(owner.item){owner.item.warming=true;try{const image=await withTimeout(loadImage(url,'same'),4000,'Kavita API decode timed out');await withTimeout(image.decode(),4000,'Kavita API decode timed out');const final=kavitaApiPlan();if(final?.near.some(x=>x.key===item.key)&&kavitaApiResult(item.key).url===url){if(owner.owner==='Split')owner.item.image=image;else owner.item.decoded=image;}}finally{owner.item.warming=false;}}
        }
      }catch(error){failed=error.code!=='ANALYSIS_CANCELLED'&&error.name!=='AbortError';if(failed)kavitaApiError=String(error.code||'PREFETCH_FAILED').slice(0,120);}
      finally{if(crop){crop.width=0;crop.height=0;}if(item.near&&!failed&&kavitaApiResult(item.key).url&&!kavitaApiResult(item.key).decoded)kavitaAttempts.delete(item.key);controller.abort();if(kavitaApiController===controller)kavitaApiController=null;kavitaFarJob=false;kavitaJob=false;updateHud();setTimeout(()=>queueKavitaApi(),120);}
    },80);
  }
  function kavitaApiSnapshot(img){const plan=kavitaApiPlan(img);if(!plan)return null;const rows=new Map();for(const e of plan.near){if(e.offset===0)continue;const row=rows.get(e.offset)||{offset:e.offset,pages:new Map()};const entries=row.pages.get(e.page.number)||[];entries.push(e);row.pages.set(e.page.number,entries);rows.set(e.offset,row);}return [...rows.values()].map(row=>{const entries=[...row.pages.values()].map(parts=>({ready:parts.every(e=>e.key&&kavitaApiResult(e.key).decoded),status:parts.every(e=>e.key&&kavitaApiResult(e.key).decoded)?'READY':'MISSING'}));return {offset:row.offset,entries,total:entries.length,ready:entries.filter(e=>e.ready).length,status:entries.every(e=>e.ready)?'READY':'MISSING'};});}

  // Diagnostic only: bounded, session-local observations. Never own or modify
  // cache entries; keep the exact key internally for stage/process correlation.
  const kavitaStageDiagnostic = [];
  function diagnosticPage(url) {
    try {
      const params=new URL(url,location.href).searchParams;
      if(!params.has('page')) return '?';
      const n=Number(params.get('page'));
      return Number.isInteger(n) ? `P${n+1} (URL ${n})` : '?';
    } catch { return '?'; }
  }
  function stageDiagnostic(img, original, key, owner, item, reason) {
    if (!kavitaNextUrl(original,0)) return null;
    const s=state.get(img);
    const entry={img, original, key, page:diagnosticPage(original),
      renderer:quality, owner, reason, process:null,
      decoded:!!item?.decoded, warming:!!item?.warming,
      nw:item?.nw ?? 0, nh:item?.nh ?? 0, bytes:item?.bytes ?? 0,
      stateExists:!!s, busy:!!s?.busy, stateCache:!!(key && s?.cache.has(key)),
      stateOriginal:s?.origUrl || '-', time:new Date().toLocaleTimeString('ja-JP'),
      earlier:[]};
    const previous=kavitaStageDiagnostic.findIndex(e=>e.original===original && e.renderer===quality);
    if(previous>=0) {
      const old=kavitaStageDiagnostic.splice(previous,1)[0];
      entry.earlier=[...old.earlier,`${old.reason}${old.process?` -> ${old.process}`:''}`].slice(-3);
    }
    kavitaStageDiagnostic.push(entry);
    if (kavitaStageDiagnostic.length>8) kavitaStageDiagnostic.shift();
    return entry;
  }
  function processDiagnostic(img, original, key, result) {
    if (!kavitaNextUrl(original,0)) return;
    for (let i=kavitaStageDiagnostic.length-1;i>=0;i--) {
      const entry=kavitaStageDiagnostic[i];
      if (entry.img===img && entry.original===original &&
          (!entry.key || entry.key===key) && entry.reason!=='STAGE_APPLIED') {
        // A later sweep can see s.key already current. Preserve the earlier
        // cache/render origin rather than replacing it with that no-op check.
        if (!entry.process || result!=='PROCESS_ALREADY_CURRENT') entry.process=result;
        return;
      }
    }
    const entry=stageDiagnostic(img,original,key,'-',null,'NO_STAGE_RECORD');
    if(entry) entry.process=result;
  }

  // A Kavita page can change by replacing an existing img or inserting a new
  // one. Apply an already decoded bitmap in the same mutation checkpoint as
  // that src change, before waiting for the normal image-load/sweep pipeline.
  // Exact source, device dimensions and original aspect must all match.
  function stageKavitaPage(img) {
    const original = img.src;
    if (!enabled) { stageDiagnostic(img,original,null,'-',null,'POWER_OFF'); return; }
    if (!readerContext()) { stageDiagnostic(img,original,null,'-',null,'READER_CONTEXT_FAIL'); return; }
    if (quality==='browser' && RendererRuntime.native(quality)) {stageDiagnostic(img,original,null,'-',null,'BROWSER_FILTER_NORMAL_PATH');return;}
    if (!RendererRuntime.has(quality)) {
      stageDiagnostic(img,original,null,'-',null,'RENDERER_UNSUPPORTED'); return;
    }
    if (img.srcset) { stageDiagnostic(img,original,null,'-',null,'SRCSET'); return; }
    if (!kavitaNextUrl(original, 0)) {
      stageDiagnostic(img,original,null,'-',null,'NOT_KAVITA_PAGE'); return;
    }
    const r = img.getBoundingClientRect();
    if (r.width < 32 || r.height < 32) {
      stageDiagnostic(img,original,null,'-',null,'TOO_SMALL'); return;
    }
    const page=KavitaPages?.peek(original)?.pages?.[KavitaPages.imageIdentity(original)?.number];
    const planned=page&&kavitaPageSize(img,page.width,page.height);
    const w = planned?.w||Math.round(r.width * dpr()), h = planned?.h||Math.round(r.height * dpr());
    const key = `${original}|${w}x${h}|${rendererCacheKey(quality)}`;
    const item = kavitaAhead.get(key) || historyLRU.get(key);
    const owner=kavitaAhead.has(key)?'KavitaAhead':historyLRU.has(key)?'History':'MISS';
    if (item && historyLRU.has(key) && !item.decoded && !item.warming) {
      item.warming = true;
      withTimeout(loadImage(item.url, 'same'), 4000, 'History decode timed out')
        .then(decoded => withTimeout(decoded.decode(), 4000,
          'History decode timed out').then(() => {
          if (historyLRU.get(key) === item) {
            item.decoded = decoded;
            // The first stage returned because decoded was missing. Re-enter
            // it now; also wake the normal path if the layout/source changed.
            if (img.isConnected && img.src === original) stageKavitaPage(img);
            if (historyLRU.get(key) === item && !kavitaWarmWanted.has(key))
              item.decoded = null;
          }
          schedule();
        })).catch(() => { schedule(); })
          .finally(() => { item.warming = false; });
    }
    if (!item) { stageDiagnostic(img,original,key,owner,item,'ITEM_MISS'); return; }
    if (!item.decoded) {
      stageDiagnostic(img,original,key,owner,item,'ITEM_NOT_DECODED'); return;
    }
    if (!item.nw || !item.nh) {
      stageDiagnostic(img,original,key,owner,item,'SIZE_METADATA_MISSING'); return;
    }
    if (Math.abs(w / h - item.nw / item.nh) > 0.005) {
      stageDiagnostic(img,original,key,owner,item,'ASPECT_MISMATCH'); return;
    }
    let s = state.get(img);
    if (s?.busy) { stageDiagnostic(img,original,key,owner,item,'STATE_BUSY'); return; }
    if (s?.cache.has(key)) {
      stageDiagnostic(img,original,key,owner,item,'STATE_CACHE_ALREADY_HAS_KEY'); return;
    }
    const diagnosis=stageDiagnostic(img,original,key,owner,item,'STAGE_APPLIED');
    if (!s) s = record(img);
    if (historyLRU.has(key)) takeHistory(key);
    else kavitaAhead.delete(key); // Reserve before any cache trim.
    if (s.origUrl !== original) {
      retainViewedPage(s);
      dropCache(s);
      trimCacheBudget();
    }
    s.origUrl = original;
    s.nw = item.nw;
    s.nh = item.nh;
    s.key = null;
    s.cache.set(key, item.url);
    s.blobUrl = item.url;
    s.busy = true;
    trackBlob(item.url, s, key, item.bytes, item.decoded);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.removeEventListener('load', finish);
      img.removeEventListener('error', finish);
      s.busy = false;
      if (!img.naturalWidth) {
        if(diagnosis) diagnosis.reason='STAGE_SWAP_LOAD_FAILED';
        s.cache.delete(key);
        s.blobUrl = null;
        forgetBlob(item.url);
        img.src = original;
        s.key = null;
        schedule();
        return;
      }
      const t = targetSize(img, s.nw, s.nh);
      if ((img.currentSrc || img.src) === item.url &&
          img.naturalWidth === w && img.naturalHeight === h &&
          t.w === w && t.h === h) {
        if (item.viewed) kavitaHistoryHits++;
        s.key = key;
        s.viewedKeys.add(key);
        s.report = {...t, nw:s.nw, nh:s.nh};
        s.status = `${RendererRuntime.name(quality)} (gpu, Kavita ready at page change)`;
        hudState(s,{phase:'ready',stage:'display',route:'gpu',reuse:item.viewed?'history':'prefetch',issue:null,actualRenderer:quality}); // HUD_ONLY
        queueKavitaAhead(img, s, t);
      } else {
        if(diagnosis) diagnosis.reason='STAGE_LAYOUT_CHANGED';
        s.key = null;
        s.status = 'Kavita page layout changed - reprocessing';
        hudState(s,{phase:'waiting',stage:'layout',issue:null}); // HUD_ONLY
        schedule();
      }
      updateHud();
      if (suspended) { s.rerun = false; restore(img); }
      else if (s.rerun) { s.rerun = false; processImage(img); }
    };
    img.addEventListener('load', finish);
    img.addEventListener('error', finish);
    const timer = setTimeout(finish, 5000);
    img.src = item.url;
    if (img.complete && (img.currentSrc || img.src) === item.url) finish();
  }

  function setSrc(img, url) {
    return new Promise((res) => {
      if ((img.currentSrc || img.src) === url && img.complete) return res();
      let settled = false;
      let timer;
      // Must resolve on error and on timeout too: an unresolved promise here
      // would leave s.busy true forever and block that image permanently.
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.removeEventListener('load', finish);
        img.removeEventListener('error', finish);
        res();
      };
      img.addEventListener('load', finish);
      img.addEventListener('error', finish);
      timer = setTimeout(finish, 5000);
      img.src = url;
      // Cached images can complete before the listener attaches.
      if (img.complete) finish();
    });
  }

  // Komga 1.27.0 uses a Vuetify carousel. Wait only while an actual transform
  // transition is running. A still page is never blocked by its CSS classes or
  // coordinates. Animation OFF emits no transition events and follows the
  // original processing path. The timer prevents a missing end event from
  // holding a swap indefinitely.
  const komgaCarousels = new WeakMap();

  const komgaStableBoxes=new WeakMap();
  function komgaMoving(img){const carousel=img.closest('.v-carousel');return !!carousel&&(!!komgaCarousels.get(carousel)?.active.size||[...carousel.querySelectorAll('.v-window-item')].some(slide=>[...slide.classList].some(x=>/v-window.*-transition-(enter|leave)(?:-active)?$/.test(x))));}
  function komgaStableBox(slide){const carousel=slide.closest('.v-carousel'),rect=slide.getBoundingClientRect();if(!carousel)return rect;const saved=komgaStableBoxes.get(carousel);if(komgaMoving(slide))return saved||rect;if(rect.width>=32&&rect.height>=32){const box={width:rect.width,height:rect.height};komgaStableBoxes.set(carousel,box);return box;}return saved||rect;}

  // Vue adds the enter class before the CSS transition's first frame. Only a
  // decoded, precomputed bitmap for the same original resource may replace an
  // incoming image here. The old normal pipeline remains the fallback.
  function stageKomgaEnteringSlide(slide) {
    if(quality==='browser'&&RendererRuntime.native(quality))return;
    if (!enabled ||         !RendererRuntime.has(quality)) return;
    for (const img of slide.querySelectorAll('img')) {
      const original = img.src;
      if (originKind(original) !== 'same' || !/^https?:/i.test(original) ||
          !img.complete || img.naturalWidth < 1 ||
          img.naturalHeight < 1) continue;
      const s = record(img);
      if (s.busy || s.origUrl !== original) continue;
      const entry = [...komgaAhead, ...historyLRU].find(([key, item]) =>
        item.decoded && key.startsWith(original + '|') &&
        key.endsWith('|' + rendererCacheKey(quality)));
      if (!entry) continue;
      const [key, item] = entry;
      const dims = key.slice(original.length + 1).split('|')[0].split('x').map(Number);
      if (dims.length !== 2 || dims.some(x => !Number.isFinite(x) || x < 64) ||
          Math.abs(dims[0] / dims[1] - s.nw / s.nh) > 0.005) continue;
      const enteringSize = targetSize(img, s.nw, s.nh);
      if (!komgaImageHasLayout(img, enteringSize) ||
          enteringSize.w !== dims[0] || enteringSize.h !== dims[1]) continue;
      if (historyLRU.has(key)) takeHistory(key);
      else komgaAhead.delete(key);
      s.cache.set(key, item.url);
      s.blobUrl = item.url;
      s.busy = true;
      trackBlob(item.url, s, key, item.bytes, item.decoded);
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.removeEventListener('load', finish);
        img.removeEventListener('error', finish);
        s.busy = false;
        if (!img.naturalWidth) {
          s.cache.delete(key);
          s.blobUrl = null;
          forgetBlob(item.url);
          img.src = s.origUrl;
          s.key = null;
          s.status = 'Komga animated preload failed - original restored';
          hudState(s,{phase:'failed',stage:'decode',route:'browser',issue:{kind:'failure'},actualRenderer:null}); // HUD_ONLY
          schedule();
          return;
        }
        const current = img.currentSrc || img.src;
        const actual = targetSize(img, s.nw, s.nh);
        if (current === item.url && img.naturalWidth === dims[0] &&
            img.naturalHeight === dims[1] && komgaImageHasLayout(img, actual) &&
            actual.w === dims[0] && actual.h === dims[1]) {
          s.key = key;
          s.viewedKeys.add(key);
          s.report = { ...actual, nw:s.nw, nh:s.nh };
          if (item.viewed) kavitaHistoryHits++;
          s.status = `${RendererRuntime.name(quality)} (gpu, Komga prefetched during animation)`;
          hudState(s,{phase:'ready',stage:'display',route:'gpu',reuse:item.viewed?'history':'prefetch',issue:null,actualRenderer:quality}); // HUD_ONLY
        } else {
          s.key = null;
          s.status = 'Komga animated preload size changed - reprocessing';
          hudState(s,{phase:'waiting',stage:'layout',issue:null}); // HUD_ONLY
          schedule();
        }
        updateHud();
        if (suspended) { s.rerun = false; restore(img); }
      else if (s.rerun) { s.rerun = false; processImage(img); }
      };
      img.addEventListener('load', finish);
      img.addEventListener('error', finish);
      const timer = setTimeout(finish, 5000);
      img.src = item.url;
      if (img.complete && (img.currentSrc || img.src) === item.url) finish();
    }
  }

  function watchKomgaCarousel(img) {
    const carousel = img.closest('.v-carousel');
    if (!carousel) return null;
    let state = komgaCarousels.get(carousel);
    if (state) return state;
    state = { active: new Set(), waiters: new Set(), safety: null };
    komgaCarousels.set(carousel, state);
    const isSlideMove = e => e.propertyName === 'transform' &&
      e.target instanceof Element && e.target !== carousel;
    const release = () => {
      if (state.active.size) return;
      clearTimeout(state.safety);
      for (const done of state.waiters) done();
      state.waiters.clear();
      schedule();
    };
    const begin = e => {
      if (!isSlideMove(e)) return;
      state.active.add(e.target);
      clearTimeout(state.safety);
      state.safety = setTimeout(() => { state.active.clear(); release(); }, 1200);
    };
    const end = e => {
      if (!isSlideMove(e)) return;
      state.active.delete(e.target);
      release();
    };
    carousel.addEventListener('transitionrun', begin, true);
    carousel.addEventListener('transitionstart', begin, true);
    carousel.addEventListener('transitionend', end, true);
    carousel.addEventListener('transitioncancel', end, true);
    new MutationObserver(records => {
      for (const record of records) {
        const slide = record.target;
        if (slide instanceof Element && slide.matches('.v-window-item') &&
            [...slide.classList].some(name =>
              /v-window.*-transition-enter(?:-active)?$/.test(name)))
          stageKomgaEnteringSlide(slide);
      }
    }).observe(carousel, {subtree:true, attributes:true, attributeFilter:['class']});
    return state;
  }

  function waitForKomgaTransition(img) {
    const state = watchKomgaCarousel(img);
    if (!state?.active.size) return Promise.resolve();
    return new Promise(resolve => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        state.waiters.delete(done);
        resolve();
      };
      state.waiters.add(done);
      timer = setTimeout(done, 1250);
    });
  }

  // A hidden carousel item reports a zero-size image. targetSize() clamps this
  // to 1x1, which otherwise encodes a 1x1 Blob and overwrites Komga's full-size
  // page image. Wait for the item to have an actual, laid-out image box.
  function komgaImageHasLayout(img, t) {
    if (!t.siteControlled || !img.closest('.v-carousel')) return true;
    const slide = img.closest('.v-window-item');
    const rect=img.getBoundingClientRect();
    return img.isConnected && (!slide || getComputedStyle(slide).display !== 'none') &&
      t.cssW >= 32 && t.cssH >= 32 && rect.width >= 32 && rect.height >= 32;
  }

  // In Komga the adjacent spreads already exist as carousel items. A hidden
  // item's own box can be 0x0; predict its fit from the *visible* carousel box
  // and verify the exact result key when the item actually appears. No hidden
  // img src or CSS geometry is modified by this speculative operation.
  const komgaAhead = new Map();
  const komgaForwardKeys = new Set();
  const komgaBackKeys = new Set();
  const komgaAttempts = new Set();
  let komgaJob = false;
  let komgaGeneration = 0;

  function clearKomgaAhead() {
    komgaGeneration++;
    clearTimeout(komgaApiTimer);komgaApiTimer=null;komgaApiController?.abort();
    komgaWindowIdentity=null;
    for (const item of komgaAhead.values()) releaseProcessedURL(item.url);
    komgaAhead.clear();
    komgaForwardKeys.clear();
    komgaBackKeys.clear();
    komgaAttempts.clear();
  }

  function trimKomgaAhead() {
    trimCacheBudget();
    if (totalCacheBytes() > CFG.blobBudget) scheduleCacheReclaim();
  }

  const KomgaAdapter = Object.freeze({
    id: 'Komga',
    getCurrentPage: (slide, slides) => slides.indexOf(slide),
    getPageCount: slides => slides.length,
    getImages: (slides, index) => [...slides[index].querySelectorAll('img')],
    getSource: img => komgaSourceInfo(img).sourceUrl,
  });

  // Share original identity between speculative work, HUD and display.
  function komgaSourceInfo(img) {
    const saved=state.get(img), displayed=img.currentSrc || img.src;
    const owned=saved && (img.src===saved.origUrl || img.src===saved.blobUrl || [...saved.cache.values()].includes(img.src)) && (displayed===saved.origUrl || displayed===saved.blobUrl ||
      [...saved.cache.values()].includes(displayed));
    return owned && saved.nw && saved.nh
      ? {sourceUrl:saved.origUrl,nw:saved.nw,nh:saved.nh}
      : {sourceUrl:img.src,nw:img.naturalWidth,nh:img.naturalHeight};
  }
  let komgaWindowIdentity=null;

  // Webtoon pages are a vertical column, not carousel slides. Retain the
  // source's displayed width before swapping in our own intrinsic-size Blob.
  const komgaWebtoonWidths = new WeakMap();
  function komgaWebtoonPageImage(img, noCarouselChecked=false) {
    if (!document.documentElement.classList.contains('html-reader') ||
        (!noCarouselChecked && document.querySelector('.v-carousel')) ||
        img.closest('.v-carousel') ||
        !img.closest('.d-flex.flex-column')) return false;
    const source=state.get(img)?.origUrl || KomgaAdapter.getSource(img);
    try {
      const url=new URL(source,location.href);
      return url.origin===location.origin &&
        /\/api\/v1\/books\/[^/]+\/pages\/\d+\/?$/.test(url.pathname);
    } catch { return false; }
  }
  function komgaWebtoonPages() {
    if (!document.documentElement.classList.contains('html-reader') ||
        document.querySelector('.v-carousel')) return [];
    return [...document.images].filter(img=>komgaWebtoonPageImage(img,true));
  }
  function komgaWebtoonCurrentImage() {
    let current=null, overlap=0, centerDistance=Infinity;
    for (const img of komgaWebtoonPages()) {
      const s=state.get(img);
      if ((s?.nw || img.naturalWidth)<1 ||
          (s?.nh || img.naturalHeight)<1) continue;
      const r=img.getBoundingClientRect();
      const area=Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0)) *
        Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));
      if (r.width<32 || r.height<32 || !area ||
          getComputedStyle(img).visibility==='hidden') continue;
      const distance=Math.abs((r.top+r.bottom)/2-innerHeight/2);
      if (area>overlap || (area===overlap && distance<centerDistance)) {
        current=img;overlap=area;centerDistance=distance;
      }
    }
    return current;
  }
  function komgaWebtoonVisibleImages() {
    return komgaWebtoonPages().filter(img=>{
      if(!img.isConnected) return false;
      const s=state.get(img);
      if((s?.nw || img.naturalWidth)<1 ||
         (s?.nh || img.naturalHeight)<1) return false;
      const r=img.getBoundingClientRect();
      const area=Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0)) *
        Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0));
      return r.width>=32 && r.height>=32 && area>0 &&
        getComputedStyle(img).visibility!=='hidden';
    });
  }
  function komgaWebtoonTargetSize(img,nw,nh) {
    const source=state.get(img)?.origUrl || KomgaAdapter.getSource(img);
    const rect=img.getBoundingClientRect();
    let anchor=komgaWebtoonWidths.get(img);
    if (!anchor || anchor.source!==source || anchor.viewportWidth!==innerWidth) {
      // After a viewport resize, the host's column is the new width source;
      // never continually sample our Blob's image rect at the same width.
      const hostWidth=img.parentElement?.getBoundingClientRect().width || rect.width;
      const cssW=anchor && (img.currentSrc || img.src)!==source
        ? hostWidth : rect.width;
      if (cssW>=32) {
        anchor={source,viewportWidth:innerWidth,cssW};
        komgaWebtoonWidths.set(img,anchor);
      }
    }
    const cssW=anchor?.cssW || 0;
    const w=Math.max(1,Math.round(cssW*dpr()));
    const h=Math.max(1,Math.round(w*nh/nw));
    return {w,h,factor:Math.min(w/nw,h/nh),cssW,cssH:rect.height,
      siteControlled:true};
  }

  // One DOM-ordered window around W1's viewport current. The same targetSize()
  // path is used when the image later becomes visible; no second fit formula.
  let webtoonWindowIdentity = null;
  let webtoonGeneration = 0;
  let webtoonJob = false;
  let webtoonTimer = null;
  let webtoonWindowCurrent = null;
  function webtoonWindow(img) {
    const pages=komgaWebtoonPages(), index=pages.indexOf(img);
    if(index<0) return [];
    const result=[];
    for(const offset of PrefetchPolicy.offsets().sort((a,b)=>Math.abs(a)-Math.abs(b)||b-a)) {
      const candidate=pages[index+offset];
      if(!candidate) continue;
      const s=state.get(candidate);
      const nw=s?.nw || candidate.naturalWidth;
      const nh=s?.nh || candidate.naturalHeight;
      const sourceUrl=s?.origUrl || KomgaAdapter.getSource(candidate);
      const t=nw && nh ? komgaWebtoonTargetSize(candidate,nw,nh) : null;
      const key=t ? `${sourceUrl}|${t.w}x${t.h}|${rendererCacheKey(quality)}` : null;
      result.push({img:candidate,offset,sourceUrl,nw,nh,t,key});
    }
    return result;
  }
  function queueWebtoonWindow(img) {
    const api=komgaApiPlan(img);if(api){queueKomgaApi(img,api);return;}
    if(!enabled || !komgaWebtoonPageImage(img)) return;
    const candidates=webtoonWindow(img);
    const identity=`${komgaWebtoonPages().indexOf(img)}|${quality}|${candidates.map(e=>e.key).join(';')}`;
    if(identity!==webtoonWindowIdentity || img!==webtoonWindowCurrent) {
      webtoonWindowIdentity=identity;
      webtoonWindowCurrent=img;
      webtoonGeneration++;
    }
    const generation=webtoonGeneration, selectedQuality=quality;
    const wanted=new Set(candidates.map(e=>e.key).filter(Boolean));
    // A prefetched image may have just become Current. Leave it available until
    // processImage() claims the Blob; the offset sets contain only neighbours.
    const current=state.get(img);
    if(current?.nw && current?.nh) {
      const t=komgaWebtoonTargetSize(img,current.nw,current.nh);
      wanted.add(`${current.origUrl}|${t.w}x${t.h}|${rendererCacheKey(quality)}`);
    }
    komgaForwardKeys.clear();komgaBackKeys.clear();
    for(const e of candidates) if(e.key) (e.offset>0?komgaForwardKeys:komgaBackKeys).add(e.key);
    for(const [key,item] of [...komgaAhead]) if(!wanted.has(key)) {
      komgaAhead.delete(key);releaseProcessedURL(item.url);
    }
    for(const key of [...komgaAttempts]) if(!wanted.has(key)) komgaAttempts.delete(key);
    if(webtoonJob || webtoonTimer || !RendererRuntime.has(quality)) return;
    const usable=e=>e.key && e.img.isConnected && e.nw>=1 &&
      e.nh>=1 && e.t.cssW>=32 &&
      e.t.w*e.t.h<=16e6 && e.t.w*e.t.h<=CFG.maxOutputPixels &&
      (e.t.w!==e.nw || e.t.h!==e.nh) &&
      originKind(e.sourceUrl)==='same' && /^https?:/i.test(e.sourceUrl);
    if(!candidates.some(e=>usable(e) && !komgaAhead.has(e.key) &&
        !historyLRU.has(e.key) && !state.get(e.img)?.cache.has(e.key) &&
        !komgaAttempts.has(e.key))) return;
    webtoonTimer=setTimeout(async()=>{
      webtoonTimer=null;
      if(webtoonJob || RenderQueue.visiblePending() || !RendererRuntime.ready(selectedQuality)) {
        if(generation===webtoonGeneration && img===komgaWebtoonCurrentImage())
          webtoonTimer=setTimeout(()=>{webtoonTimer=null;queueWebtoonWindow(img);},120);
        return;
      }
      webtoonJob=true;
      try {
        for(const e of candidates) {
          const stale=()=>!enabled || quality!==selectedQuality ||
            generation!==webtoonGeneration || img!==komgaWebtoonCurrentImage() ||
            RenderQueue.visiblePending();
          if(stale()) break;
          if(!usable(e) || komgaAhead.has(e.key) || historyLRU.has(e.key) ||
             state.get(e.img)?.cache.has(e.key) || komgaAttempts.has(e.key)) continue;
          komgaAttempts.add(e.key);
          try {
            const source=await withTimeout(loadImage(e.sourceUrl,'same'),8000,
              'Komga Webtoon prefetch source timed out');
            if(stale() || source.naturalWidth!==e.nw || source.naturalHeight!==e.nh) break;
            const type=await outputType();
            if(stale()) break;
            const blob=await RenderQueue.prefetch(selectedQuality,source,e.nw,e.nh,
              e.t.w,e.t.h,type,'Komga Webtoon prefetch encode timed out');
            if(!blob || stale()) continue;
            const url=processedURL(blob);
            komgaAhead.set(e.key,{url,bytes:blob.size,distance:e.offset});
            trimKomgaAhead();updateHud();
          } catch { /* A missed preload falls back to normal processing. */ }
        }
      } finally {
        webtoonJob=false;
        const interrupted=generation!==webtoonGeneration || RenderQueue.visiblePending();
        if(interrupted) for(const e of candidates) if(e.key && !komgaAhead.has(e.key) &&
            !historyLRU.has(e.key) && !state.get(e.img)?.cache.has(e.key))
          komgaAttempts.delete(e.key);
        // A newer scroll invalidates old speculative work at the next await.
        const latest=komgaWebtoonCurrentImage();
        if(interrupted && latest && enabled) queueWebtoonWindow(latest);
      }
    },80);
  }

  let komgaWindowTimer = null;
  function revisitKomgaWindow(img) {
    if (komgaWindowTimer) return;
    komgaWindowTimer = setTimeout(() => {
      komgaWindowTimer = null;
      if (!enabled || !img.isConnected) return;
      const carousel=img.closest('.v-carousel');
      if (RenderQueue.visiblePending() || komgaJob ||
          komgaCarousels.get(carousel)?.active.size) {
        revisitKomgaWindow(img);
        return;
      }
      const current=carousel?.querySelector('.v-window-item--active img') || img;
      const st=state.get(current);
      if (st?.nw && st?.nh && current.isConnected)
        queueKomgaAhead(current, targetSize(current, st.nw, st.nh));
    }, 120);
  }

  const KomgaPages=globalThis.__KKGR_KOMGA_PAGES__;
  let komgaApiTimer=null,komgaApiError=null,komgaApiController=null,komgaApiPlanCache=null;
  function komgaMediaPolicy(img){for(let el=img;el;el=el.parentElement)for(let vm=el.__vue__,i=0;vm&&i<12;vm=vm.$parent,i++)if(Array.isArray(vm.supportedMediaTypes))return {supported:[...vm.supportedMediaTypes],convert:vm.convertTo||'jpeg'};return undefined;}
  function komgaApiPlan(img,allowMotion=false){
    if(!enabled||!img?.isConnected||(!allowMotion&&komgaMoving(img)))return null;
    const slide=img.closest('.v-window-item');
    if(slide){const style=getComputedStyle(slide),r=img.getBoundingClientRect();if(style.display==='none'||style.visibility==='hidden'||slide.classList.contains('pre-render')||r.width<32||r.height<32||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)return null;}
    const source=state.get(img)?.origUrl||komgaSourceInfo(img).sourceUrl,id=KomgaPages.imageIdentity(source);if(!id)return null;
    const record=KomgaPages.ensure(source,()=>{const current=hudTarget();if(current?.isConnected){const st=state.get(current);if(st?.nw&&st?.nh){if(current.closest('.v-carousel'))queueKomgaAhead(current,targetSize(current,st.nw,st.nh));else queueWebtoonWindow(current);}}});
    if(!record?.pages)return null;
    const webtoon=komgaWebtoonPageImage(img),display=globalThis.__KKGR_HOST_DISPLAY__?.read('Komga'),layout=webtoon?'single':display?.layout;
    if(layout!=='single'&&record.pages.some(p=>!(p.width>0&&p.height>0)))return null;
    const groups=KomgaPages.spreads(record.pages,layout);if(!groups)return null;
    const visibleImages=webtoon?komgaWebtoonVisibleImages():[...img.closest('.v-window-item').querySelectorAll('img')];
    const visible=visibleImages.map(x=>KomgaPages.imageIdentity(state.get(x)?.origUrl||komgaSourceInfo(x).sourceUrl)?.number).filter(Boolean);
    const window=KomgaPages.window(groups,id.number,{forward:CFG.prefetchNext,back:CFG.prefetchPrevious,visible});if(!window)return null;
    const box=webtoon?targetSize(img,state.get(img)?.nw||img.naturalWidth,state.get(img)?.nh||img.naturalHeight):komgaStableBox(img.closest('.v-window-item'));
    if((webtoon?box.cssW:box.width)<32||(webtoon?box.cssH:box.height)<32)return null;
    const pipeline=rendererCacheKey(quality),media=komgaMediaPolicy(img);
    const signature=JSON.stringify([id.listUrl,window.currentIndex,record.revision||0,visible,layout,box.width||box.w,box.height||box.h,dpr(),pipeline,media,CFG.prefetchNext,CFG.prefetchPrevious]);
    if(komgaApiPlanCache?.signature===signature&&komgaApiPlanCache.record===record)return komgaApiPlanCache;
    const make=e=>{const page=e.page,sourceUrl=KomgaPages.pageUrl(id,page,media);if(!Number.isFinite(page.width)||!Number.isFinite(page.height)||page.width<=0||page.height<=0)return {...e,sourceUrl,missing:true,metadataPending:true,metadataKey:'meta:'+sourceUrl};if(!(page.width>=1&&page.height>=1))return null;const t=webtoon?{w:box.w,h:Math.max(1,Math.round(box.w*page.height/page.width))}:komgaContainedSize(box,e.slots,page.width,page.height,dpr());if(t.w*t.h>16e6||t.w*t.h>CFG.maxOutputPixels)return null;return {...e,sourceUrl,nw:page.width,nh:page.height,w:t.w,h:t.h,key:`${sourceUrl}|${t.w}x${t.h}|${pipeline}`};};
    const near=window.near.map(e=>make(e)||{...e,missing:true}),far=window.far.map(make).filter(Boolean);
    // Missing page dimensions are a blocker; they are not skipped in HUD readiness.
    const currentKeys=groups.filter(g=>g.some(p=>p.number===id.number||visible.includes(p.number))).flatMap(g=>g.map(page=>make({page,slots:g.length,distance:0,offset:0,near:true}))).filter(e=>e?.key).map(e=>e.key);
    return komgaApiPlanCache={near,far,currentKeys,signature,pipeline,id,webtoon,record,geometryKey:JSON.stringify([id.listUrl,layout,box.width||box.w,webtoon?null:(box.height||box.h),dpr()])};
  }
  function queueKomgaApi(img,plan){
    if(plan.signature!==komgaWindowIdentity){komgaWindowIdentity=plan.signature;komgaGeneration++;komgaApiController?.abort();komgaAttempts.clear();komgaApiError=null;}
    const near=plan.near.filter(x=>x.key),wanted=new Set(near.map(x=>x.key));
    for(const x of near)(x.distance>0?komgaForwardKeys:komgaBackKeys).add(x.key);
    for(const set of [komgaForwardKeys,komgaBackKeys])for(const key of [...set])if(!wanted.has(key))set.delete(key);
    const displayed=plan.webtoon?komgaWebtoonVisibleImages():[...img.closest('.v-window-item').querySelectorAll('img')];
    const currentKeys=new Set(displayed.map(x=>state.get(x)?.key).filter(Boolean));
    for(const [key,item]of komgaAhead){const identity=KomgaPages.imageIdentity(key.slice(0,key.indexOf('|')));item.distance=identity?.listUrl===plan.id.listUrl?identity.number-plan.id.number:Infinity;}
    for(const [key,item]of komgaAhead)if(!wanted.has(key)&&!currentKeys.has(key))item.decoded=null;
    for(const [key,item]of historyLRU)if(key.startsWith(plan.id.listUrl+'/')&&!wanted.has(key)&&!currentKeys.has(key))item.decoded=null;
    for(const rec of blobs.values())if(rec.key.startsWith(plan.id.listUrl+'/')&&!wanted.has(rec.key)&&!currentKeys.has(rec.key))rec.decoded=null;
    const allowFar=farReady(plan,'Komga');
    if(komgaJob||komgaApiTimer)return;
    const pending=plan.near.find(x=>x.metadataPending?!komgaAttempts.has(x.metadataKey):x.key&&!completedResult(x.key).decoded&&!komgaAttempts.has(x.key));
    const distant=!pending&&allowFar&&totalCacheBytes()<CFG.blobBudget*.85?plan.far.find(x=>x.metadataPending?!komgaAttempts.has(x.metadataKey):x.key&&!completedOwner(x.key)&&!komgaAttempts.has(x.key)):null;
    const item=pending||distant;if(!item)return;
    const selected=quality,generation=komgaGeneration;
    komgaApiTimer=setTimeout(async()=>{
      komgaApiTimer=null;if(!enabled)return;if(quality!==selected||generation!==komgaGeneration){const current=hudTarget(),next=current&&komgaApiPlan(current);if(next)queueKomgaApi(current,next);return;}
      const current=hudTarget(),latest=current&&komgaApiPlan(current);
      if(RenderQueue.visiblePending()||!latest||latest.signature!==plan.signature){if(current)setTimeout(()=>{const p=komgaApiPlan(current);if(p)queueKomgaApi(current,p);},120);return;}
      if(!item.near&&!farReady(plan,'Komga'))return;
      komgaFarJob=!item.near;komgaJob=true;let failed=false;const controller=new AbortController();komgaApiController=controller;komgaAttempts.add(item.key||item.metadataKey);
      try{
        if(item.metadataPending){const source=await RenderQueue.loadSource(item.sourceUrl,'Komga page dimensions timed out',controller.signal);if(generation!==komgaGeneration||RenderQueue.visiblePending()){komgaAttempts.delete(item.metadataKey);return;}if(!KomgaPages.setDimensions(item.sourceUrl,source.naturalWidth,source.naturalHeight))throw Error('PAGE_DIMENSIONS_UNAVAILABLE');return;}
        let result=completedResult(item.key),url=result.url;
        if(!url){
          const source=await RenderQueue.loadSource(item.sourceUrl,'Komga API prefetch source timed out',controller.signal);
          if(source.naturalWidth!==item.nw||source.naturalHeight!==item.nh||RenderQueue.visiblePending()||generation!==komgaGeneration){komgaAttempts.delete(item.key);return;}
          const type=await outputType();if(RenderQueue.visiblePending()||generation!==komgaGeneration){komgaAttempts.delete(item.key);return;}
          const blob=await RenderQueue.prefetch(selected,source,item.nw,item.nh,item.w,item.h,type,'Komga API prefetch encode timed out');
          if(!blob||!enabled||quality!==selected||rendererCacheKey(selected)!==plan.pipeline||generation!==komgaGeneration||(!item.near&&!farReady(plan,'Komga'))){komgaAttempts.delete(item.key);return;}
          url=processedURL(blob);komgaAhead.set(item.key,{url,bytes:blob.size,distance:item.distance,nw:item.nw,nh:item.nh,decoded:null});trimKomgaAhead();
          globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'stored'});result=completedResult(item.key);
        }
        const refreshed=hudTarget(),next=refreshed&&komgaApiPlan(refreshed);
        if(url&&next?.near.some(x=>x?.key===item.key)&&!RenderQueue.visiblePending()){
          const owner=completedResult(item.key);if(owner.item){owner.item.warming=true;try{const image=await withTimeout(loadImage(url,'same'),4000,'Komga API decode timed out');await withTimeout(image.decode(),4000,'Komga API decode timed out');if(completedResult(item.key).url===url)owner.item.decoded=image;}finally{owner.item.warming=false;}}
        }
      }catch(error){failed=error.code!=='ANALYSIS_CANCELLED';if(failed)komgaApiError=String(error.code||error.message||'PREFETCH_FAILED').replace(/https?:\/\/\S+/g,'[URL]').slice(0,160);}
      finally{if(item.near&&!failed&&completedOwner(item.key)&&!completedResult(item.key).decoded)komgaAttempts.delete(item.key);controller.abort();if(komgaApiController===controller)komgaApiController=null;komgaFarJob=false;komgaJob=false;updateHud();const current=hudTarget();if(current?.isConnected)setTimeout(()=>{const next=komgaApiPlan(current);if(next)queueKomgaApi(current,next);},120);}
    },80);
  }

  // Convert the shared image targets into DOM slide offsets. Include all
  // images of the last spread, keeping the host reader's display unit intact.
  // Nothing outside Komga's already loaded DOM is fetched here.
  function komgaImageWindow(slides, index) {
    const result=[];
    for (const [direction,limit] of [[1,CFG.prefetchNext],[-1,CFG.prefetchPrevious]]) {
      let images=0;
      for (let distance=direction; images<limit; distance+=direction) {
        const slide=slides[index+distance];
        if (!slide) break;
        const count=KomgaAdapter.getImages(slides,index+distance).length;
        result.push({distance,index:index+distance,count});
        images+=count;
      }
    }
    return result;
  }

  async function warmKomgaResult(key,isWanted){
    const result=completedResult(key);if(!result.url||result.decoded||!result.item)return;
    result.item.warming=true;
    try{const image=await withTimeout(loadImage(result.url,'same'),4000,'Komga cached decode timed out');await withTimeout(image.decode(),4000,'Komga cached decode timed out');if(isWanted()&&completedResult(key).url===result.url){result.item.decoded=image;result.item.warmFailed=false;}}
    catch(error){result.item.warmFailed=true;throw error;}
    finally{result.item.warming=false;updateHud();}
  }
  function queueKomgaAhead(img, t, retry = 0) {
    if(komgaMoving(img))return;
    const api=komgaApiPlan(img);if(api){queueKomgaApi(img,api);return;}
    if (!enabled ||         !RendererRuntime.has(quality) ||
        !t.siteControlled || t.cssW < 32 || t.cssH < 32) return;
    const carousel = img.closest('.v-carousel');
    const active = img.closest('.v-window-item');
    if (!carousel || !active || active.classList.contains('pre-render') ||
        getComputedStyle(active).display === 'none' ||
        komgaCarousels.get(carousel)?.active.size) return;
    const slides = [...carousel.querySelectorAll('.v-window-item')];
    const activeIndex = KomgaAdapter.getCurrentPage(active, slides);
    const box = active.getBoundingClientRect();
    if (activeIndex < 0 || box.width < 32 || box.height < 32) return;
    const prefetchQuality = quality;
    const positions=komgaImageWindow(slides,activeIndex);
    const candidates = [];
    for (const {index} of positions) {
      const images = KomgaAdapter.getImages(slides, index);
      for (const candidate of images) {
        const {sourceUrl,nw,nh} = komgaSourceInfo(candidate);
        if (originKind(sourceUrl) !== 'same' ||
            !/^https?:/i.test(sourceUrl) || !candidate.complete ||
            nw < 1 || nh < 1) continue;
        const {w,h} = komgaContainedSize(box,images.length,nw,nh,dpr());
        if (w * h > 16e6 || w * h > CFG.maxOutputPixels ||
            (w === nw && h === nh)) continue;
        candidates.push({ sourceUrl, nw, nh, w, h, distance:index-activeIndex,
          key: `${sourceUrl}|${w}x${h}|${rendererCacheKey(prefetchQuality)}` });
      }
    }
    const identity=`${activeIndex}|${box.width}x${box.height}|${dpr()}|${rendererCacheKey(prefetchQuality)}|${candidates.map(e=>e.key).join(';')}`;
    if(identity!==komgaWindowIdentity) {
      komgaWindowIdentity=identity;
      komgaGeneration++;
    }
    const requestedGeneration=komgaGeneration;
    const wanted = new Set(candidates.map(item => item.key));
    // The new current spread may not have claimed its prepared result yet.
    for(const current of active.querySelectorAll('img')) {
      const {sourceUrl,nw,nh}=komgaSourceInfo(current);
      if(!nw || !nh)continue;
      const size=komgaContainedSize(box,active.querySelectorAll('img').length,nw,nh,dpr());
      wanted.add(`${sourceUrl}|${size.w}x${size.h}|${rendererCacheKey(prefetchQuality)}`);
    }

    komgaForwardKeys.clear();
    komgaBackKeys.clear();
    for (const item of candidates) {
      if (item.distance > 0) komgaForwardKeys.add(item.key);
      else komgaBackKeys.add(item.key);
    }
    for (const [key, item] of [...komgaAhead]) {
      if (!wanted.has(key)) {
        item.decoded=null;
      }
    }
    for (const key of [...komgaAttempts]) if (!wanted.has(key)) komgaAttempts.delete(key);
    if(!komgaJob) for(const item of candidates)
      if(!completedOwner(item.key)||(!completedResult(item.key).decoded&&!completedResult(item.key).item?.warmFailed)) komgaAttempts.delete(item.key);
    if(komgaJob) { revisitKomgaWindow(img); return; }
    if (!candidates.length || candidates.every(item =>
        completedResult(item.key).decoded || komgaAttempts.has(item.key))) return;
    setTimeout(async () => {
      if(requestedGeneration!==komgaGeneration) {revisitKomgaWindow(img);return;}
      if (RenderQueue.visiblePending()) {
        if (retry < 10) queueKomgaAhead(img, t, retry + 1);
        else revisitKomgaWindow(img);
        return;
      }
      if (!enabled || quality !== prefetchQuality ||           RenderQueue.visiblePending() || komgaJob || !img.isConnected ||
          komgaCarousels.get(carousel)?.active.size || !RendererRuntime.ready(prefetchQuality)) { revisitKomgaWindow(img); return; }
      komgaJob = true;
      const generation = komgaGeneration;
      let interrupted = false;
      const yieldToVisible = () => {
        if (RenderQueue.visiblePending() || komgaCarousels.get(carousel)?.active.size)
          interrupted = true;
        return interrupted;
      };
      try {
        for (const item of candidates) {
          if (!enabled || quality !== prefetchQuality ||
              generation !== komgaGeneration || yieldToVisible()) break;
          if (completedResult(item.key).decoded || komgaAttempts.has(item.key)) continue;
          komgaAttempts.add(item.key);
          try {
            if(completedOwner(item.key)){await warmKomgaResult(item.key,()=>generation===komgaGeneration&&wanted.has(item.key)&&!yieldToVisible());continue;}
            const source = await RenderQueue.loadSource(item.sourceUrl,'Komga prefetch source timed out');
            if (source.naturalWidth !== item.nw || source.naturalHeight !== item.nh ||
                yieldToVisible() || generation !== komgaGeneration) continue;
            const type = await outputType();
            if (yieldToVisible() || generation !== komgaGeneration) continue;
            // Shared canvas: call toBlob immediately after the GPU pass.
            const blob = await RenderQueue.prefetch(prefetchQuality, source,
              item.nw, item.nh, item.w, item.h, type,
              'Komga prefetch encode timed out');
            if (!blob || generation !== komgaGeneration || !enabled ||
                quality !== prefetchQuality){if(blob)globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'discarded'});continue;}
            const url = processedURL(blob);globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'stored'});
            komgaAhead.set(item.key, {url, bytes:blob.size, distance:item.distance});
            trimKomgaAhead();
            updateHud();
            if (!komgaAhead.has(item.key)){globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(blob,{outcome:'evicted'});continue;}
            try {
              const decodeStarted=performance.now();const decoded = await withTimeout(loadImage(url, 'same'), 4000,
                'Komga prefetch decode timed out');
              await withTimeout(decoded.decode(), 4000,
                'Komga prefetch decode timed out');
              if (komgaAhead.get(item.key)?.url === url) {
                komgaAhead.get(item.key).decoded = decoded;globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(url,{timings:{outputDecodeMs:performance.now()-decodeStarted},outcome:'ready'});
                updateHud();
              }
            } catch(e) {globalThis.__KKGR_DIAGNOSTICS__?.outputEvent(url,{outcome:'stored-decode-failed',warmError:e.code||'DECODE_TIMEOUT_OR_FAILED'}); /* The prepared bitmap can still be used after motion. */ }
          } catch { /* A missed preload falls back to normal processing. */ }
        }
      } finally {
        komgaJob = false;
        if (interrupted || generation !== komgaGeneration) {
          for (const item of candidates)
            if (!completedOwner(item.key))
              komgaAttempts.delete(item.key);
          revisitKomgaWindow(img);
        }
      }
    }, 80);
  }

  // Per-stage timings. The overlay reports the outcome but not where the time went,
  // and the slow paths here are all awaits on the browser (fetch, encode, load event)
  // rather than on anything this script computes. __crispImages.trace = true.
  //
  // Every line also carries the elapsed time since processing was last enabled, because a stage
  // being quick and the whole thing still feeling slow are different problems and the
  // per-stage figures alone cannot tell them apart.
  let trace = false;
  let traceT0 = 0;

  function traceMark(msg) {
    if (trace) console.log(`[crisp-images] +${Math.round(performance.now() - traceT0)}ms  ${msg}`);
  }

  // Synchronous twin of timed(). Required for anything that must not yield: see the
  // note on the shared canvas in processImage.
  function timeSync(s, label, fn) {
    if (!trace) return fn();
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      traceMark(`#${s.id} ${label} took ${Math.round(performance.now() - t0)}ms`);
    }
  }

  async function timed(s, label, fn) {
    if (!trace) return fn();
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      traceMark(`#${s.id} ${label} took ${Math.round(performance.now() - t0)}ms`);
    }
  }

  async function processImage(img, refresh=null) {
    const context=readerContext();
    if(!context || (context.layout==='webtoon' &&
        !(context.adapter==='Kavita'?kavitaShownImages():komgaWebtoonVisibleImages()).includes(img))) return;
    const s = record(img);
    if (!s.nw || !s.nh) {
      if (kavitaNextUrl(s.origUrl, 0)) s.status = 'source loading';
      return;
    }
    if (!eligible(s)) return;
    // A resample is async. Dropping a request that arrives mid-flight would lose
    // the most recent intent, so a keypress during processing would appear to do
    // nothing. Queue it and re-run once the current pass finishes.
    if (s.busy) { if(refresh)throw Error('IMAGE_PROCESSING_BUSY');s.rerun = true; return; }

    if(komgaMoving(img)){revisitKomgaWindow(img);return;}
    const t = targetSize(img, s.nw, s.nh);
    if (!komgaImageHasLayout(img, t)) {
      s.status = 'Komga hidden page - waiting for layout';
      hudState(s,{phase:'waiting',stage:'layout',issue:null}); // HUD_ONLY
      return;
    }
    const key = `${s.origUrl}|${t.w}x${t.h}|${rendererCacheKey(quality)}`;
    if (!refresh && s.key === key) {
      // A hidden Komga slide may temporarily mark a finished bitmap as waiting.
      // When it becomes visible again, restore only a verified current result.
      const expectedW=quality==='browser'&&RendererRuntime.native(quality)?s.nw:t.w;
      const expectedH=quality==='browser'&&RendererRuntime.native(quality)?s.nh:t.h;
      if (t.siteControlled && img.closest('.v-carousel') &&
          s.presentation?.phase==='waiting' && s.presentation?.stage==='layout' &&
          s.blobUrl && s.cache.get(key)===s.blobUrl &&
          (img.currentSrc || img.src)===s.blobUrl && img.complete &&
          img.naturalWidth===expectedW && img.naturalHeight===expectedH &&
          s.report?.w===t.w && s.report?.h===t.h) {
        s.status = RendererRuntime.outputLabel(quality) + ' [cached]';
        hudState(s,{phase:'ready',stage:'display',route:'gpu',reuse:'cache',issue:null,actualRenderer:quality});
        updateHud();
      }
      if(context.layout==='webtoon' && img===(context.adapter==='Kavita'?hudTarget():komgaWebtoonCurrentImage()) &&
          s.blobUrl && (img.currentSrc || img.src)===s.blobUrl)
        s.viewedKeys.add(key);
      processDiagnostic(img,s.origUrl,key,'PROCESS_ALREADY_CURRENT');
      return;
    }

    const jobEpoch=rendererEpoch,original=s.origUrl,previous={blobUrl:s.blobUrl,key:s.key,report:s.report,presentation:s.presentation,cache:s.cache.get(key)};
    const refreshCurrent=()=>{const latest=targetSize(img,s.nw,s.nh);return jobEpoch===rendererEpoch&&enabled&&img.isConnected&&s.origUrl===original&&hudTarget()===img&&latest.w===t.w&&latest.h===t.h;};
    s.busy = true;
    traceMark(`#${s.id} start`);
    s.status = 'Preparing image';
    hudState(s,{phase:'working',stage:'renderer',reuse:null,issue:null}); // HUD_ONLY
    try {
      const kind = originKind(s.origUrl);
      const blocked =
        kind === 'file'
          ? 'file:// is an opaque origin - the GPU path cannot run on local files'
          : kind === 'other' ? 'unsupported URL scheme'
          : null;

      // Both resamplers go through the GPU. That is what makes every quality
      // switch replace the image resource, which is what actually forces Chrome
      // to re-raster - see the note in the shader.
      const useGpu =
        RendererRuntime.has(quality) &&
        (t.factor !== 1 || RendererRuntime.native(quality)) &&
        t.w * t.h <= CFG.maxOutputPixels &&
        !blocked &&
        RendererRuntime.ready(quality);

      if (useGpu) {
        const previousBlobUrl = s.blobUrl;
        let url = refresh?null:s.cache.get(key);
        if (!url && !historyLRU.has(key)) {
          const detached = [...blobs.values()].find(rec =>
            rec.key === key && rec.s.key === key &&
            !rec.s.el.deref()?.isConnected);
          if (detached) retainViewedPage(detached.s);
        }
        const preparedResult=!refresh&&!url?completedResult(key,false):null;
        const aheadKind=preparedResult?.owner==='History'?'History':preparedResult?.owner==='KavitaAhead'?'Kavita':preparedResult?.owner==='KomgaAhead'?'Komga':null;
        const ahead=preparedResult?.item||null;
        if (ahead) {
          if (aheadKind === 'History') takeHistory(key);
          else if (aheadKind === 'Kavita') kavitaAhead.delete(key);
          else komgaAhead.delete(key);
          updateHud();
          url = ahead.url;
          s.cache.set(key, url);
          s.blobUrl = url;
          trackBlob(url, s, key, ahead.bytes, ahead.decoded);
        }
        const cached = !!url;
        if (!url) {
          // Resolved before the resample, never between it and toBlob - see below.
          const type = await outputType();
          s.status = 'Loading source image';
          hudState(s,{phase:'working',stage:'source'}); // HUD_ONLY
          // Only reuse the live element when it is definitely untainted.
          const fresh = kind === 'same' && !s.blobUrl && img.complete &&
                        (img.currentSrc || img.src) === s.origUrl;
          const source = fresh ? img
            : await timed(s, 'load source', () =>
                withTimeout(loadImage(s.origUrl, kind), 8000, 'source load timed out'));

          if(jobEpoch!==rendererEpoch){if(refresh)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});s.rerun=true;return;}
          // Runtime renders to its reusable Canvas and starts toBlob in the
          s.status = 'Rendering image';
          hudState(s,{phase:'working',stage:'renderer'}); // HUD_ONLY
          // same synchronous call. No await or other render may intervene.
          const encoding = refresh?globalThis.__KKGR_PROCESSING__.start(quality,source,s.nw,s.nh,t.w,t.h,type,platform.settings,false,{role:'current',bypassAnalysisStage:refresh.stage,isCurrent:refreshCurrent}):RendererRuntime.startEncode(quality,source,
            s.nw,s.nh,t.w,t.h,type,'encode timed out',
            render=>timeSync(s,'gpu resample',render));
          processDiagnostic(img,s.origUrl,key,`PROCESS_RENDER [${quality}]`);
          s.status = 'Encoding image';
          hudState(s,{phase:'working',stage:'encode'}); // HUD_ONLY
          const blob = await timed(s, `${type.slice(6)} encode`, () => encoding);
          if(jobEpoch!==rendererEpoch){if(refresh)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});s.rerun=true;return;}
          if(refresh&&!refreshCurrent())throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});
          if (!blob) throw new Error('encode failed');
          url = processedURL(blob);
          s.cache.set(key, url);
          // Claim it before registering: images resample concurrently, and an
          // unclaimed blob is fair game for another image's eviction pass.
          s.blobUrl = url;
          trackBlob(url, s, key, blob.size);
        }

        if (t.siteControlled && img.closest('.v-carousel')) {
          await timed(s, 'Komga transition', () => waitForKomgaTransition(img));
        }
        if (t.siteControlled) {
          if(refresh&&!refreshCurrent())throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});
          const current = img.currentSrc || img.src;
          const latest = targetSize(img, s.nw, s.nh);
          if (!enabled || (current !== s.origUrl && current !== previousBlobUrl) ||
              latest.w !== t.w || latest.h !== t.h ||
              (context.layout==='webtoon' &&
                !(context.adapter==='Kavita'?kavitaShownImages():komgaWebtoonVisibleImages()).includes(img)) ||
              !komgaImageHasLayout(img, latest)) {
            processDiagnostic(img,s.origUrl,key,'PROCESS_ABORT_CHANGED');
            s.blobUrl = previousBlobUrl;
            s.status = 'Page changed before swap - original visible';
            hudState(s,{phase:'waiting',stage:'layout',issue:null}); // HUD_ONLY
            // Re-read the source after this job exits. The key then reflects
            // the new page rather than assigning an old result to that img.
            if (enabled) schedule();
            return;
          }
        }
        if(refresh&&!refreshCurrent())throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});
        if(jobEpoch!==rendererEpoch){if(refresh)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});s.rerun=true;return;}
        s.blobUrl = url;
        hudState(s,{phase:'working',stage:'decode'}); // HUD_ONLY
        await timed(s, 'swap src', () => setSrc(img, url));
        if(refresh&&!refreshCurrent())throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});
        if(jobEpoch!==rendererEpoch){await setSrc(img,s.origUrl);s.blobUrl=null;s.rerun=true;return;}
        hudState(s,{phase:'ready',stage:'display',route:'gpu',reuse:aheadKind==='History'||ahead?.viewed?'history':ahead?'prefetch':cached?'cache':'new',issue:null,actualRenderer:quality}); // HUD_ONLY
        if (cached || ahead)
          processDiagnostic(img,s.origUrl,key,`PROCESS_CACHE [${cached?'state cache':aheadKind==='Kavita'?'KavitaAhead':aheadKind}]`);
        if ((img.currentSrc || img.src) === url && img.naturalWidth &&
            (context.layout!=='webtoon' || img===(context.adapter==='Kavita'?hudTarget():komgaWebtoonCurrentImage())))
          s.viewedKeys.add(key);
        if ((aheadKind === 'History' ||
             (aheadKind === 'Kavita' && ahead?.viewed)) &&
            (img.currentSrc || img.src) === url && img.naturalWidth)
          kavitaHistoryHits++;
        trimCache(s);
        img.style.setProperty('image-rendering', 'auto', 'important');
        s.status = RendererRuntime.outputLabel(quality);
        if (cached || aheadKind === 'History') s.status += ' [cached]';
        if (ahead && aheadKind !== 'History')
          s.status += ` [${aheadKind} prefetched]`;
      } else {
        if(refresh)throw Error('DIAGNOSTIC_PROCESSING_UNAVAILABLE');
        // Every non-GPU path must show the ORIGINAL bitmap, otherwise it would
        // merely re-size whatever the last resample produced.
        if (s.blobUrl) {
          // Keep s.blobUrl set until the swap has landed, so that anything
          // inspecting state mid-swap still recognises the displayed blob as ours.
          // No revoke here - the blob stays in s.cache for the next switch back.
          await timed(s, 'restore src', () => setSrc(img, s.origUrl));
          s.blobUrl = null;
        }
        if (t.factor === 1) {
          // One image pixel per device pixel: there is nothing to resample, so
          // every quality setting uses the original source here.
          img.style.setProperty('image-rendering', 'auto', 'important');
          s.status = 'factor 1 - no resampling (all qualities identical here)';
          hudState(s,{phase:'ready',stage:'display',route:'native',reuse:null,issue:null,actualRenderer:null}); // HUD_ONLY
        } else if (quality === 'browser') {
          img.style.removeProperty('image-rendering');
          s.status = 'chrome bilinear';
          hudState(s,{phase:'ready',stage:'display',route:'browser',reuse:null,issue:null,actualRenderer:null}); // HUD_ONLY
        } else {
          img.style.setProperty('image-rendering', 'auto', 'important');
          s.status = blocked ? 'chrome bilinear — ' + blocked
            : t.w * t.h > CFG.maxOutputPixels ? 'over pixel cap - fell back to chrome'
            : 'gpu unavailable: ' + (RendererRuntime.why(quality) || 'unknown');
          hudState(s,{phase:'fallback',stage:'display',route:'browser',reuse:null,issue:{kind:blocked?'source':t.w*t.h>CFG.maxOutputPixels?'limit':'unavailable'},actualRenderer:null}); // HUD_ONLY
        }
      }

      s.key = key;
      s.report = { ...t, nw: s.nw, nh: s.nh };
      if (useGpu) {
        queueKavitaAhead(img, s, t);
        queueKomgaAhead(img, t);
      }
    } catch (e) {
      if(refresh){
        if(jobEpoch===rendererEpoch&&s.origUrl===original){const generated=s.blobUrl;if(generated&&generated!==previous.blobUrl){if((img.currentSrc||img.src)===generated)try{await setSrc(img,previous.blobUrl||original);}catch{}if(s.cache.get(key)===generated){if(previous.cache)s.cache.set(key,previous.cache);else s.cache.delete(key);}const rec=blobs.get(generated);if(rec){blobs.delete(generated);blobBytes-=rec.bytes;}releaseProcessedURL(generated);}s.blobUrl=previous.blobUrl;s.key=previous.key;s.report=previous.report;s.presentation=previous.presentation;}
        throw e;
      }
      if(e.code==='ANALYSIS_CANCELLED'&&jobEpoch!==rendererEpoch){s.rerun=true;return;}
      if(e.code?.startsWith('ANALYSIS_')||['SOURCE_SAMPLE_FAILED','PROCESSING_TIMEOUT','ENCODE_TIMEOUT','GPU_TIMEOUT','MEMORY_BUDGET_EXCEEDED','ALLOCATION_FAILED','FRAMEBUFFER_INCOMPLETE','SIZE_LIMIT'].includes(e.code)){
        if(s.blobUrl){try{await setSrc(img,s.origUrl);s.blobUrl=null;}catch{}}
      }
      s.status = 'ERROR: ' + e.message;
      if(['PROCESSING_TIMEOUT','ANALYSIS_TIMEOUT','GPU_TIMEOUT','ENCODE_TIMEOUT','MEMORY_BUDGET_EXCEEDED','ALLOCATION_FAILED','FRAMEBUFFER_INCOMPLETE','SIZE_LIMIT'].includes(e.code)&&!e.notified){e.notified=true;quickToast(e.message);}
      hudState(s,{phase:'failed',stage:e.stage||s.presentation?.stage||'renderer',route:'browser',issue:{kind:['MEMORY_BUDGET_EXCEEDED','ALLOCATION_FAILED','FRAMEBUFFER_INCOMPLETE','SIZE_LIMIT'].includes(e.code)?'limit':'failure'},actualRenderer:null}); // HUD_ONLY
      // A missed deadline usually says something about the moment, not the image:
      // a throttled background tab, a busy GPU. Worth one more go later. Anything
      // else - tainted source, unreadable origin - would just fail again.
      s.retryable = !['PROCESSING_TIMEOUT','ANALYSIS_TIMEOUT','GPU_TIMEOUT','ENCODE_TIMEOUT'].includes(e.code)&&/timed out/.test(e.message);
      s.key = key;
      s.report = { ...t, nw: s.nw, nh: s.nh };
      img.style.setProperty('image-rendering', 'auto', 'important');
      console.warn('[crisp-images]', e);
    } finally {
      s.busy = false;
      traceMark(`#${s.id} done - ${s.status}`);
      updateHud();
      if (suspended) { s.rerun = false; restore(img); }
      else if (s.rerun) { s.rerun = false; processImage(img); }
    }
  }

  async function restore(img) {
    const s = state.get(img);
    if (!s || s.busy) return;
    if (s.blobUrl) {
      s.busy = true;                    // same guard as processImage: this is our swap
      await setSrc(img, s.origUrl);
      s.busy = false;
    }
    dropCache(s);
    for (const p of ['width', 'height', 'max-width', 'max-height', 'image-rendering',
                     'transform', 'margin-left', 'margin-right']) {
      img.style.removeProperty(p);
    }
    s.key = null;
    s.status = 'off';
    hudState(s,{phase:'ready',stage:'display',route:'browser',reuse:null,issue:null,actualRenderer:null}); // HUD_ONLY
  }

  /* ================================================================== *
   * Scheduling
   * ================================================================== */

  const visible = new Set();

  const io = new IntersectionObserver((entries) => {
    const webtoonCurrent=komgaWebtoonCurrentImage();
    for (const e of entries) {
      // Queued rather than started directly, so a scroll cannot put more work in flight
      // than the cap allows - and pump() re-sorts, so a newly scrolled-to image goes to
      // the front rather than behind whatever was queued earlier.
      if (e.isIntersecting) { visible.add(e.target); if (enabled &&
          !komgaWebtoonPageImage(e.target)) {
        enqueue(e.target); pump();
      } }
      else visible.delete(e.target);
    }
    if(webtoonCurrent && enabled) processVisible();
    updateHud();
  }, { rootMargin: `${CFG.lazyMargin * 100}%` });

  const watched = new WeakSet();
  const resizeWatched = new WeakSet();
  let hadReaderContext = false;

  // Geometry check, deliberately independent of IntersectionObserver. IO is only
  // a trigger for scroll-driven work; correctness must not depend on it having
  // delivered for a given image yet.
  function nearViewport(img) {
    const r = img.getBoundingClientRect();
    const mx = innerWidth * CFG.lazyMargin, my = innerHeight * CFG.lazyMargin;
    return r.bottom > -my && r.top < innerHeight + my &&
           r.right > -mx && r.left < innerWidth + mx;
  }

  // Reconcile against the current settings. processImage is a no-op when nothing
  // changed, so this is cheap to call often.
  //
  // Deliberately not gated on img.complete: straight after a switch we have just
  // replaced src, so complete is often false. What the pipeline needs is the
  // recorded natural size, and that survives the swap.
  // Distance in pixels from the real viewport - 0 for anything on screen. Ordering by
  // this is what puts the image you are looking at at the front of the queue.
  function viewportDistance(img) {
    const r = img.getBoundingClientRect();
    const dy = r.top > innerHeight ? r.top - innerHeight : (r.bottom < 0 ? -r.bottom : 0);
    const dx = r.left > innerWidth ? r.left - innerWidth : (r.right < 0 ? -r.right : 0);
    return Math.hypot(dx, dy);
  }

  // Encoding is the expensive stage and it contends: five images at once measured
  // 1.2-1.7 s each where one alone took 0.45 s, so everything landed at the speed of
  // the slowest. Running a couple at a time costs nothing in total - the work is the
  // same - but the images actually on screen finish first instead of queueing behind
  // whatever happened to come earlier in the document.
  const MAX_CONCURRENT = 2;
  let running = 0;
  const queue = [];

  function pump() {
    // Re-ordered on every pass rather than at insertion: the queue may have been built
    // before a scroll, and what matters is where things are now.
    if (queue.length > 1) {
      const d = new Map(queue.map((img) => [img, viewportDistance(img)]));
      queue.sort((a, b) => d.get(a) - d.get(b));
    }
    while (running < MAX_CONCURRENT && queue.length) {
      const img = queue.shift();
      if (!img.isConnected) continue;          // removed from the page while queued
      if (komgaWebtoonPageImage(img) &&
          !komgaWebtoonVisibleImages().includes(img)) continue;
      running++;
      Promise.resolve(processImage(img))
        .catch(() => {})
        .then(() => { running--; pump(); });
    }
  }

  function enqueue(img) {
    if (!queue.includes(img)) queue.push(img);
  }

  function processVisible() {
    const webtoonCurrent=komgaWebtoonCurrentImage();
    if (webtoonCurrent) {
      const webtoonVisible=komgaWebtoonVisibleImages();
      // Give W1's single Current first claim on the visible queue. The other
      // viewport images use the same exact-key cache/swap path, not new anchors.
      for(const img of [webtoonCurrent,...webtoonVisible.filter(e=>e!==webtoonCurrent)]) {
        if(img.complete && img.naturalWidth) record(img);
        const s=state.get(img);
        if(s && eligible(s)) enqueue(img);
      }
      pump();
      queueWebtoonWindow(webtoonCurrent);
      return;
    }
    for (const img of document.images) {
      const s = state.get(img);
      if (!s || !s.nw || !eligible(s)) continue;
      if (visible.has(img) || nearViewport(img)) enqueue(img);
    }
    pump();
  }


  /* Kavita Split A adapter: observe completed native crop draws, never infer
   * halves from navigation clicks, and never write into the native canvas.
   * No Angular/private-field dependency. Unknown draws fail open to Kavita. */
  const KavitaSplit = (() => {
    const entries=new Map();
    let current=null, serial=0, bytes=0, busy=false, again=false, tick=0;
    const events=[];
    let lastReason='waiting for native draw';
    const canvasInReader=()=>document.querySelector('app-manga-reader app-canvas-renderer canvas');
    const readerRoot=()=>document.querySelector('app-manga-reader');
    const normalPage=()=>[...document.querySelectorAll('app-manga-reader img')].find(i=>{
      if(i.hasAttribute('data-gpu-reader-split-output')) return false;
      const r=i.getBoundingClientRect(),style=getComputedStyle(i);
      return i.isConnected && r.width>32 && r.height>32 && style.visibility!=='hidden';
    }) || null;
    function note(reason,detail={}) {
      lastReason=reason;
      events.push({time:Math.round(performance.now()),reason,...detail});
      if(events.length>80) events.shift();
    }
    const safeSource=source=>{
      try {const u=new URL(source,location.href);return {scheme:u.protocol,
        path:u.pathname,page:u.searchParams.get('page'),chapter:u.searchParams.get('chapterId')};}
      catch {return {scheme:'unknown'};}
    };
    const nativeDraw=CanvasRenderingContext2D.prototype.drawImage;
    const nativeClear=CanvasRenderingContext2D.prototype.clearRect;
    const targetCanvas=c=>c instanceof HTMLCanvasElement &&
      !!c.closest('app-manga-reader app-canvas-renderer');
    const visibleCanvas=()=>[...document.querySelectorAll('app-manga-reader app-canvas-renderer canvas')]
      .find(c=>{const r=c.getBoundingClientRect();return c.isConnected && r.width>32 &&
        r.height>32 && r.bottom>0 && r.right>0 && r.top<innerHeight && r.left<innerWidth &&
        getComputedStyle(c).visibility!=='hidden';}) || null;
    function hide() { if(current?.overlay) current.overlay.style.display='none'; }
    function abandon(reason) {
      note(reason);serial++; hide();
      if(current) {current.status=reason;current.key=null;current.snapshot.width=0;
        current.snapshot.height=0;current.snapshot=null;current.overlay?.remove();}
      current=null;
    }
    function invalidateDraw(canvas,reason) {
      if(current?.canvas===canvas) abandon(reason);
    }
    function cropOf(canvas,args) {
      if(args.length!==9) return null;
      const [source,sx,sy,sw,sh,dx,dy,dw,dh]=args;
      if(!(source instanceof HTMLImageElement) || !source.complete ||
          !source.naturalWidth || !KavitaAdapter.getCurrentPage(source.currentSrc || source.src)) return null;
      const w=source.naturalWidth,h=source.naturalHeight;
      // Accept only the documented 1:1 full-image draw clipped by a half canvas.
      // Odd widths, prior resize and arbitrary crops remain native for now.
      if(w%2 || sx!==0 || sy!==0 || sw!==w || sh!==h || dw!==w || dh!==h ||
          dy!==0 || canvas.width!==w/2 || canvas.height!==h || (dx!==0 && dx!==-w/2)) return null;
      if(w<1 || h<1) return null;
      return {source:source.currentSrc || source.src,part:dx===0?'left':'right',
        w:canvas.width,h:canvas.height,originalW:w,originalH:h};
    }
    function capture(canvas,args) {
      if (suspended) return;
      if(!targetCanvas(canvas)) return;
      const crop=cropOf(canvas,args);
      const input=args[0];
      note(crop?'native crop accepted':'native draw not recognized',{
        input:safeSource(input?.currentSrc || input?.src || ''),
        natural:[input?.naturalWidth || 0,input?.naturalHeight || 0],
        bitmap:[canvas.width,canvas.height],args:args.slice(1),part:crop?.part || null});
      invalidateDraw(canvas,'native draw updated');
      if(!crop) {requestTick();return;}
      if(current) abandon('new Split surface');
      const snapshot=document.createElement('canvas');snapshot.width=crop.w;snapshot.height=crop.h;
      try {nativeDraw.call(snapshot.getContext('2d'),canvas,0,0);}
      catch {snapshot.width=0;return;}
      current={...crop,canvas,snapshot,revision:++serial,key:null,overlay:null,
        status:'Split source captured',report:null};
      queueKavitaApi();requestTick();
    }
    // Preserve native signatures, return values and exceptions. Adapter failures
    // never escape into Kavita's renderer. Only this site's canvas is inspected.
    function observedDraw(...args) {
      const result=nativeDraw.apply(this,args);
      try {capture(this.canvas,args);} catch {try {invalidateDraw(this.canvas,'Split capture failed');} catch {}}
      return result;
    }
    function observedClear(...args) {
      const result=nativeClear.apply(this,args);
      try {if(!suspended && targetCanvas(this.canvas)) invalidateDraw(this.canvas,'Kavita cleared source');} catch {}
      return result;
    }
    CanvasRenderingContext2D.prototype.drawImage=observedDraw;
    CanvasRenderingContext2D.prototype.clearRect=observedClear;
    function requestTick() {if(!tick) tick=requestAnimationFrame(frame);}
    function frame() {
      tick=0;
      if (suspended) return;
      // Do not write the ordinary IMG HUD from the Split frame: its childList
      // mutation would schedule another ordinary sweep and another Split frame.
      if(!readerRoot()) {if(entries.size) clear();return;}
      if(!current && (!canvasInReader() || normalPage())) return;
      // A visible native IMG means Kavita has switched to a normal source
      // page. A dormant Split canvas must not retain ownership of display.
      if(current && normalPage()) {
        hide();
        if(visibleCanvas()!==current.canvas)
          abandon('Split -> normal IMG; pending output cancelled');
        else {
          current.status='Browser: waiting for IMG/Canvas handoff';
          hudState(current,{phase:'waiting',stage:'layout',route:'browser',issue:null}); // HUD_ONLY
          requestTick();return;
        }
      }
      if(current && (!current.canvas.isConnected || current.canvas.width!==current.w ||
          current.canvas.height!==current.h)) abandon('Split bitmap removed or changed');
      // Visibility/layout can disappear briefly without a native redraw. Keep
      // the captured source and completed history; hide only the output.
      if(current && visibleCanvas()!==current.canvas) {
        hide();current.status='Browser: Split layout temporarily unavailable';
        hudState(current,{phase:'waiting',stage:'layout',route:'browser',issue:null}); // HUD_ONLY
        updateHud();requestTick();return;
      }
      if(!readerRoot() && entries.size) clear();
      updateHud();
      if(current) {
        if(!enabled || (quality==='browser'&&!RendererRuntime.has(quality))) hide();
        else {position();process();}
        requestTick();
      }
    }
    function target(item) {
      const r=item.canvas.getBoundingClientRect();
      return {w:Math.max(1,Math.round(r.width*dpr())),h:Math.max(1,Math.round(r.height*dpr()))};
    }
    function keyFor(item,t) {return JSON.stringify([item.source,item.part,item.w,item.h,t.w,t.h,rendererCacheKey(quality)]);}
    function position() {
      const item=current,overlay=item?.overlay;if(!overlay || overlay.style.display==='none') return;
      const c=item.canvas,style=getComputedStyle(c),r=c.getBoundingClientRect();
      // Transformed/rotated surfaces need a richer display adapter; fail open.
      if(style.transform!=='none') {overlay.style.display='none';item.status='Browser fallback: transformed Split canvas';hudState(item,{phase:'fallback',stage:'display',route:'browser',issue:{kind:'transform'}});return;}

      overlay.style.width=r.width+'px';overlay.style.height=r.height+'px';
      // Absolute positioning uses the same parent/containing block; no geometry
      // or visibility properties are ever written to Kavita's elements.
      overlay.style.left=c.offsetLeft+'px';overlay.style.top=c.offsetTop+'px';
      const o=overlay.getBoundingClientRect();
      if(Math.abs(o.x-r.x)>1 || Math.abs(o.y-r.y)>1 ||
          Math.abs(o.width-r.width)>1 || Math.abs(o.height-r.height)>1) {
        overlay.style.display='none';item.status='Browser fallback: Split overlay alignment';
        hudState(item,{phase:'fallback',stage:'display',route:'browser',issue:{kind:'alignment'}}); // HUD_ONLY
      }
    }
    function trim() {
      for(const [key,e] of entries) {
        if(totalCacheBytes()<=CFG.blobBudget) break;
        if(key===current?.key||kavitaForwardKeys.has(key)||kavitaBackKeys.has(key)) continue;
        entries.delete(key);bytes-=e.bytes;releaseProcessedURL(e.url);
        e.image=null;
      }
    }
    async function process(refresh=null) {
      const item=current;if(!item || !enabled || !RendererRuntime.has(quality) || !item.snapshot){if(refresh)throw Error('CURRENT_IMAGE_UNAVAILABLE');return;}
      const t=target(item),key=keyFor(item,t);
      if(!refresh&&item.key===key) {
        if(item.overlay) {item.overlay.style.display='block';position();}
        return;
      }
      if(!refresh)hide();
      if(busy) {if(refresh)throw Error('IMAGE_PROCESSING_BUSY');again=true;return;}
      if(t.w*t.h>CFG.maxOutputPixels || !RendererRuntime.ready(quality)) {
        if(refresh)throw Error('DIAGNOSTIC_PROCESSING_UNAVAILABLE');
        note('renderer fallback');
        item.status='Browser fallback: '+(t.w*t.h>CFG.maxOutputPixels?'output limit':RendererRuntime.why(quality));
        hudState(item,{phase:'fallback',stage:'renderer',route:'browser',reuse:null,issue:{kind:t.w*t.h>CFG.maxOutputPixels?'limit':'unavailable'},actualRenderer:null}); // HUD_ONLY
        item.key=key;updateHud();return;

      }
      busy=true;again=false;
      const revision=item.revision,renderer=quality;
      const valid=()=>current===item && serial===revision && enabled && quality===renderer &&
        keyFor(item,target(item))===key && visibleCanvas()===item.canvas && !normalPage();
      try {
        let e=refresh?null:entries.get(key),cached=!!e;
        item.status=cached?'Split history decoding':'Split GPU processing';
        hudState(item,{phase:'working',stage:cached?'decode':'renderer',route:'browser',reuse:cached?'cache':'new',issue:null,actualRenderer:null}); // HUD_ONLY
        if(!e){const prepared=kavitaAhead.get(key);if(prepared){kavitaAhead.delete(key);e={url:prepared.url,bytes:prepared.bytes,image:prepared.decoded||null};entries.set(key,e);bytes+=e.bytes;cached=true;}}
        if(!e) {
          // Render and start encode synchronously; preserve the shared Renderer
          // canvas contract. Snapshot is an independent native crop Surface.
          globalThis.__KKGR_DIAGNOSTICS__?.aliasSource(item.snapshot,item.source+'|'+item.part);
          const blob=await (refresh?globalThis.__KKGR_PROCESSING__.start(renderer,item.snapshot,item.w,item.h,t.w,t.h,'image/png',platform.settings,false,{role:'split',bypassAnalysisStage:refresh.stage,isCurrent:valid}):RendererRuntime.startEncode(renderer,item.snapshot,item.w,item.h,
            t.w,t.h,await outputType(),'Kavita Split encode'));
          if(!blob || !valid()){if(refresh)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});return;}
          e={url:processedURL(blob),bytes:blob.size,image:null};
          const previous=entries.get(key);if(previous){bytes-=previous.bytes;if(previous.url!==item.overlay?.src)releaseProcessedURL(previous.url);}entries.set(key,e);bytes+=e.bytes;
        }
        if(!valid()){if(refresh)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});return;}
        const image=e.image || new Image();
        hudState(item,{phase:'working',stage:'decode'}); // HUD_ONLY
        if(!e.image) {image.src=e.url;await image.decode();}
        if(!valid()){if(refresh)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});return;}
        // Retain decoded bitmaps only for the current/recent half, not all history.
        for(const [otherKey,other]of entries)if(other!==e&&!kavitaForwardKeys.has(otherKey)&&!kavitaBackKeys.has(otherKey))other.image=null;
        e.image=image;entries.delete(key);entries.set(key,e);
        const previousOutput=item.overlay?.src;item.overlay?.remove();item.overlay=image;item.key=key;if(refresh&&previousOutput&&previousOutput!==e.url&&![...entries.values()].some(entry=>entry.url===previousOutput))releaseProcessedURL(previousOutput);
        image.setAttribute('data-gpu-reader-split-output','');
        image.style.cssText='position:absolute;pointer-events:none;max-width:none;max-height:none;margin:0;padding:0;border:0;display:block;object-fit:fill;';
        item.canvas.parentElement.appendChild(image);position();
        item.status=image.style.display==='none' ? item.status :
          RendererRuntime.outputLabel(renderer)+(cached?' [Split cached]':' [Split]');
        if(image.style.display!=='none') {hudState(item,{phase:'ready',stage:'display',route:'gpu',reuse:cached?(e.hudViewed?'history':'cache'):'new',issue:null,actualRenderer:renderer});e.hudViewed=true;} // HUD_ONLY
        item.report=t;trim();trimCacheBudget();updateHud();queueKavitaApi();

      } catch(error) {
        if(refresh)throw error;
        note('filter output failure',{message:String(error?.message||error)});
        if(current===item) {hide();item.key=key;item.status='Browser fallback: Split '+String(error?.message||error);hudState(item,{phase:'failed',stage:item.presentation?.stage||'renderer',route:'browser',issue:{kind:'failure'},actualRenderer:null});updateHud();}
      } finally {busy=false;if(again || current!==item) requestTick();}
    }
    function clear() {
      serial++;if(current) {current.revision=serial;current.key=null;hide();}
      for(const e of entries.values()) {releaseProcessedURL(e.url);e.image=null;}
      entries.clear();bytes=0;requestTick();
    }
    function resume() {
      // Restore our hooks only when the original slot is still available.
      // If another wrapper retained ours, the suspended gate prevents work.
      if(CanvasRenderingContext2D.prototype.drawImage===nativeDraw)
        CanvasRenderingContext2D.prototype.drawImage=observedDraw;
      if(CanvasRenderingContext2D.prototype.clearRect===nativeClear)
        CanvasRenderingContext2D.prototype.clearRect=observedClear;
    }
    function stop() {
      abandon('Extension stopped');clear();
      if(CanvasRenderingContext2D.prototype.drawImage===observedDraw)
        CanvasRenderingContext2D.prototype.drawImage=nativeDraw;
      if(CanvasRenderingContext2D.prototype.clearRect===observedClear)
        CanvasRenderingContext2D.prototype.clearRect=nativeClear;
    }
    return {pruneGeometry:(stale,used)=>{for(const [key,e]of entries){if(!stale(key)||key===current?.key||used(e.url))continue;entries.delete(key);bytes-=e.bytes;releaseProcessedURL(e.url);e.image=null;}},cached:key=>entries.get(key),currentKey:()=>current?(current.key||keyFor(current,target(current))):null,working:()=>busy,keepDecoded:wanted=>{for(const [key,e]of entries)if(key!==current?.key&&!wanted.has(key))e.image=null;},resume,stop,visibleCanvas,refresh:async stage=>{const item=current,deadline=performance.now()+120000;while(busy){if(current!==item||!enabled)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});if(performance.now()>deadline)throw Error('IMAGE_PROCESSING_BUSY');await new Promise(r=>setTimeout(r,25));}if(current!==item)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});await process({stage});if(current!==item)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});},bytes:()=>bytes,trim,clear,process,requestTick,
      info:()=>current && {part:current.part,source:current.source,w:current.w,h:current.h,
        outputUrl:current.overlay?.src,status:current.status,report:current.report,cache:entries.size,presentation:current.presentation,outputVisible:current.overlay?.style.display!=='none' && !!current.overlay},
      reason:()=>lastReason,
      diagnostics:()=>({reason:lastReason,current:current?{part:current.part,
        source:safeSource(current.source),bitmap:[current.w,current.h],status:current.status,
        connected:current.canvas.isConnected,overlay:current.overlay?.style.display || 'none'}:null,
        events:events.map(e=>({...e}))}),
      context:()=>{
        const canvas=visibleCanvas() || canvasInReader();
        // Keep controls/HUD in an active reader even during an empty Split
        // layout, but never take priority over a normal visible IMG page.
        if(!canvas || !canvas.isConnected) return null;
        const normal=normalPage();
        if(normal) return null;
        // A hidden canvas without a captured Split source is not enough to
        // claim a page. Retain waiting controls only for a visible native
        // canvas or a transiently hidden, previously identified Split page.
        if(!visibleCanvas() && !current) return null;
        return normal?null:{adapter:'Kavita',layout:'split',img:canvas};
      }};
  })();

  function sweep() {
    detach();
    KavitaSplit.requestTick();
    try {
      const hasReader=!!readerContext();
      if(!hasReader && hadReaderContext && komgaNativeUiState()==='NO_READER') {
        if(!kavitaNativeBar() && !komgaNativeBar()) removePowerCompanion();
        resetTouchGesture();
        closeTouchMenu();
        closeSettings();
        detailsVisible=false;
      }
      hadReaderContext=hasReader;
      // IntersectionObserver stops reporting an element once the page removes it, so
      // it would sit in `visible` for the life of the tab - a plain Set holding a
      // strong reference to a detached <img> and its decoded bitmap. A reader that
      // swaps pages would accumulate them indefinitely, and the count in the overlay
      // would drift further from reality with every page turn.
      for (const img of visible) if (!img.isConnected) visible.delete(img);

      for (const img of document.images) {
        if (img.hasAttribute("data-gpu-reader-split-output")) continue;
        if (!enabled) { restore(img); continue; }
        watchKomgaCarousel(img);
        if (img.complete && img.naturalWidth) record(img);
        if (!watched.has(img)) {
          watched.add(img);
          img.addEventListener('load', () => {
            if (enabled && !state.get(img)?.busy) record(img);
            schedule();
          });
          io.observe(img);
        }
        if (!resizeWatched.has(img)) {
          resizeWatched.add(img);
          layoutObserver.observe(img);
        }
      }
      if (enabled && hasReader) {
        processVisible();
        for (const img of document.images) {
          const s = state.get(img);
          if (s && eligible(s) && !s.busy && img.closest('.v-carousel') &&
              nearViewport(img))
            queueKomgaAhead(img, targetSize(img, s.nw, s.nh));
        }
      }
    } finally {
      updateHud();
      syncPowerCompanion();
      attach();
    }
  }

  function invalidateAll() {
    rendererEpoch++;
    globalThis.__KKGR_CANCEL_ANALYSIS__?.();
    KavitaSplit.clear();
    for (const img of document.images) {
      const s = state.get(img);
      if (s) s.key = null;
    }
    if (!enabled) for (const img of document.images) restore(img);
    // sweep(), not processVisible(). While the script is off, sweep records nothing
    // and observes nothing, so `state` and `visible` are both empty - and
    // processVisible() skips any image it has no state for. Switching on has to
    // rebuild that state before there is anything to process.
    else sweep();
    updateHud();
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === 'src' &&
          record.target instanceof HTMLImageElement)
        stageKavitaPage(record.target);
      if (record.type === 'childList') for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLImageElement) stageKavitaPage(node);
        for (const img of node.querySelectorAll('img')) stageKavitaPage(img);
      }
    }
    schedule();
  });
  const OPTS = { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] };
  let attached = false;
  const attach = () => { if (!attached) { observer.observe(document.documentElement, OPTS); attached = true; } };
  const detach = () => { if (attached) { observer.disconnect(); attached = false; } };

  // Runs fn after layout has settled, without making that depend on the page being
  // painted.
  //
  // rAF alone is not enough. It fires only when the browser produces a frame, and a
  // visible tab with nothing to repaint may not produce one for a long time - so work
  // queued here would sit until something unrelated caused a repaint, such as the
  // pointer moving. It never fires at all in a hidden tab. Either way the timer is the
  // floor and rAF is the optimisation, so nothing here can stall waiting for a frame.
  function defer(fn) {
    let ran = false;
    const once = () => { if (ran) return; ran = true; fn(); };
    requestAnimationFrame(once);
    setTimeout(once, 32);
  }

  // Coalesces bursts of mutations into one sweep. Safe to latch only because defer's
  // timer always fires: a latch released solely by rAF would stick shut for good in a
  // tab that stopped painting, silently disabling every later sweep.
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    defer(() => { pending = false; sweep(); });
  }

  // Webtoon scrolls need a current-image update even when the same set of
  // images remains inside IntersectionObserver's generous root margin.
  let komgaWebtoonScrollTimer=null;
  addEventListener('scroll', () => {
    if (!document.documentElement.classList.contains('html-reader') ||
        document.querySelector('.v-carousel') || komgaWebtoonScrollTimer!==null) return;
    komgaWebtoonScrollTimer=setTimeout(() => {
      komgaWebtoonScrollTimer=null;
      const img=komgaWebtoonCurrentImage();
      if (!img) return;
      if (enabled) {
        if (img.complete && img.naturalWidth) record(img);
        processVisible();
      }
      updateHud();
    }, 60);
  }, {capture:true,passive:true});

  // Fit modes, spreads, fullscreen and rotation can alter an image box without
  // changing window dimensions.  The shared schedule() latch coalesces bursts;
  // unchanged target keys make callbacks from our own source swap cheap no-ops.
  const layoutObserver = new ResizeObserver(() => {
    if (enabled) schedule();
  });

  /* ================================================================== *
   * Interaction
   * ================================================================== */

  // The image the overlay reports on: whichever one the pointer is over.
  let focus = null;

  let hoverPending = false;
  addEventListener('mousemove', (e) => {
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el instanceof HTMLImageElement && state.has(el)) { focus = el; updateHud(); }
    });
  }, { passive: true });

  // Quick controls use the registered renderer cycle.

  // Shared actions are used by the current quick controls and settings UI.
  function toggleEnabled() {
    if (suspended) return;
    enabled = !enabled;
    if (!enabled) { clearKavitaAhead(); clearKomgaAhead(); }
    if (enabled) traceT0 = performance.now();
    traceMark(`control -> ${enabled ? 'on' : 'off'}`);
    writeFlag('enabled', enabled);
    invalidateAll();
    syncPowerCompanion();
  }

  function cycleQuality() {
    const choices = rendererChoices();
    quality = choices[(choices.indexOf(quality) + 1) % choices.length];
    writeRenderer(quality);
    clearKavitaAhead();
    clearKomgaAhead();
    invalidateAll();
    syncPowerCompanion();
  }

  function toggleHud() {
    hudVisible = !hudVisible;
    writeFlag('hud', hudVisible);
    updateHud();
  }

  function toggleDetails() {
    if(!platform.settings.developerMode)return;
    detailsVisible = !detailsVisible;
    if(!applyingConfig) platform.change('hudMode',detailsVisible?'details':'normal');
    updateHud();
  }


  // Central long-press entry and its native gesture suppression are retired.
  let touchMenu=null;
  function resetTouchGesture() {}

  // One visual language for the companion, quick controls and settings.
  const UI_ICONS={
    power:'<path d="M12 2.8v9.2"/><path d="M6.2 5.9a8.5 8.5 0 1 0 11.6 0"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    hud:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 15h3m2 0h7M6 11h7"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M10 2h4l.5 2.2 1.7.8 2-.9 2.8 2.8-.9 2 .8 1.7L23 11v3l-2.2.5-.8 1.7.9 2-2.8 2.8-2-.9-1.7.8L14 23h-4l-.5-2.2-1.7-.8-2 .9L3 18.1l.9-2-.8-1.7L1 14v-3l2.2-.5.8-1.7-.9-2L5.9 4l2 .9 1.7-.8z"/>',
    close:'<path d="M5 5l14 14M19 5 5 19"/>'
  };
  const uiSvg=name=>`<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UI_ICONS[name]}</svg>`;
  const rendererLabel=()=>quality==='browser'?'Browser':RendererRuntime.name(quality);
  const uiAccent=adapter=>globalThis.__KKGR_PANEL__?.readTheme(adapter).accent || (adapter==='Komga'?'#91c8f3':'#a0e7bd');
  const uiPanelStyle='background:rgba(15,20,20,.95);color:#f3f7f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,.5);box-sizing:border-box';

  let adjustmentView=null;
  function closeReaderAdjustment(){if(!adjustmentView)return;const view=adjustmentView;adjustmentView=null;view.controller?.destroy();view.host.remove();if(powerCompanion){delete powerCompanion.dataset.status;syncPowerCompanion();}}
  // The view's existence is the user's ON state; visibility follows the quick toolbar.
  function hideReaderAdjustment(){if(adjustmentView){adjustmentView.controller?.pause?.();adjustmentView.host.hidden=true;}}
  function syncReaderAdjustmentVisibility(){if(!adjustmentView)return;adjustmentView.host.hidden=!powerCompanion||powerCompanion.style.visibility!=='visible';if(!adjustmentView.host.hidden)adjustmentView.controller?.reposition();}
  function openReaderAdjustment(){
    if(suspended||!globalThis.__KKGR_PARAMETER_EDITOR__)return;
    if(adjustmentView){closeReaderAdjustment();return;}
    const host=document.createElement('div');host.setAttribute('data-gpu-reader-adjustment','');host.style.cssText='position:fixed;inset:0;z-index:2147483644;pointer-events:none';
    host.addEventListener('click',e=>e.stopPropagation());host.addEventListener('pointerdown',e=>e.stopPropagation());host.addEventListener('pointerup',e=>e.stopPropagation());const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),site=panelSnapshot().site,palette=globalThis.__KKGR_PANEL__.readTheme(site);
    style.textContent=':host{font:14px/1.5 system-ui;--bg:'+palette.surface+';--card:'+palette.surface+';--text:'+(palette.light?'#303840':'#e8edf2')+';--line:'+(palette.light?'#b8c0c8':'#526172')+';--accent:'+palette.accent+';--soft:'+palette.activeBg+';color-scheme:'+(palette.light?'light':'dark')+'}';shadow.append(style);(document.body||document.documentElement).append(host);
    const getPlacement=()=>{
      const viewport=window.visualViewport,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight,vx=viewport?.offsetLeft||0,vy=viewport?.offsetTop||0;
      const layout=quickConfig()[width>height?'landscape':'portrait'],rect=powerCompanion?.firstElementChild?.getBoundingClientRect();
      const top=layout.pos.includes('上'),left=layout.pos.includes('左');
      let panelWidth=Math.min(280,width-24),x=12,y=12,maxHeight=height-24;
      const isVertical=layout.dir==='縦';
      if(rect&&rect.height){
        if(isVertical){const space=left?vx+width-rect.right-22:rect.left-vx-22;
          if(space>=160){panelWidth=Math.min(panelWidth,space);x=left?rect.right+10:innerWidth-rect.left+10;y=top?rect.top:innerHeight-rect.bottom;maxHeight=height-24;}
          else {x=left?vx+12:innerWidth-vx-width+12;y=top?rect.bottom+10:innerHeight-rect.top+10;maxHeight=height-rect.height-34;}
        }else {x=left?rect.left:innerWidth-rect.right;y=top?rect.bottom+10:innerHeight-rect.top+10;maxHeight=height-rect.height-34;}
      }
      return {top,left,x,y,width:panelWidth,maxHeight:Math.max(44,Math.min(height*.55,maxHeight))};
    };
    const I=globalThis.__KKGR_I18N__.forLanguage(typeof hudLanguage==='string'?hudLanguage:'en');
    const controller=globalThis.__KKGR_PARAMETER_EDITOR__.choose(shadow,panelSnapshot,async(stage,entry,values)=>{await platform.change('filterParameters',{stage,id:entry.id,values});},I,{floating:true,getPlacement,close:closeReaderAdjustment,developerMode:()=>!!platform.settings.developerMode,readDiagnostics:async()=>globalThis.__KKGR_DIAGNOSTICS__?.snapshot(),currentEntry:stage=>platform.settings.filterCatalog?.find(x=>x.id===platform.settings.filters?.[stage])||null,currentParameters:(stage,id)=>platform.settings.filterParameters?.[stage]?.[id]||{},reanalyze:reanalyzeCurrent,isActive:(stage,id)=>platform.settings.filters?.[stage]===id});
    adjustmentView={host,controller};delete powerCompanion?.dataset.status;syncPowerCompanion();
  }
  let settingsWindow=null,activePanel=null;
  function closeTouchMenu(restore=true) {
    hideReaderAdjustment();
    activePanel?.destroy();activePanel=null;
    if(touchMenu) touchMenu.remove();
    touchMenu=null;
    if(restore) syncPowerCompanion();
  }
  function closeSettings(restore=true) {
    if(settingsWindow) settingsWindow.remove();
    settingsWindow=null;
    if(restore) syncPowerCompanion();
  }
  let filterChangePending=false;
  function panelSnapshot() {
    const site=readerContext()?.adapter || (komgaNativeUiState()!=='NO_READER'?'Komga':'Kavita');
    return {appVersion:platform.settings.appVersion,enabled,hud:hudVisible,hudMode:detailsVisible?'details':'normal',hudPosition:platform.settings.hudPosition||'右下',renderer:quality,
      developerMode:!!platform.settings.developerMode,diagnosticRecording:!!platform.settings.diagnosticRecording,diagnosticClearRevision:platform.settings.diagnosticClearRevision,processingMode:platform.settings.processingMode,outputFormat:platform.settings.outputFormat,blobBudgets:platform.settings.blobBudgets,decodedForward:CFG.prefetchNext,decodedBack:CFG.prefetchPrevious,processingTimeoutMs:platform.settings.processingTimeoutMs,processingRetryRevision:platform.settings.processingRetryRevision,disabledRenderers:[...disabledRenderers],rendererOrder:platform.settings.rendererOrder,filters:platform.settings.filters,filterParameters:platform.settings.filterParameters,filterCatalog:platform.settings.filterCatalog||[],filterCandidates:platform.settings.filterCandidates,rendererCatalog:globalThis.__KKGR_RENDERER_CATALOG__,candidatePolicy:globalThis.__KKGR_CANDIDATE_POLICY__,locale:globalThis.__KKGR_HOST_DISPLAY__?.read(site)?.locale || 'en',
      site,theme:globalThis.__KKGR_PANEL__?.readTheme(site),connected:true,diagnostic:window.__crispImages?.memory()};
  }
  function openReaderPanel(page='quick') {
    if(suspended || !globalThis.__KKGR_PANEL__) return;
    closeSettings(false);closeTouchMenu(false);removePowerCompanion();
    const backdrop=document.createElement('div');
    backdrop.setAttribute('data-gpu-reader-touch-menu','');
    backdrop.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:12px;background:rgba(0,0,0,.45);box-sizing:border-box';
    const host=document.createElement('div');host.style.cssText='width:min(460px,100%);max-height:calc(100dvh - 24px)';
    backdrop.append(host);(document.body||document.documentElement).append(backdrop);
    touchMenu=backdrop;
    const controller=globalThis.__KKGR_PANEL__.mount(host,{snapshot:panelSnapshot,readDiagnostics:async()=>globalThis.__KKGR_DIAGNOSTICS__?.snapshot(),currentEntry:stage=>platform.settings.filterCatalog?.find(x=>x.id===platform.settings.filters?.[stage])||null,currentParameters:(stage,id)=>platform.settings.filterParameters?.[stage]?.[id]||{},reanalyze:reanalyzeCurrent,initial:page,hostTheme:true,
      change:async(key,value)=>{
        if(key==='enabled') {if(enabled!==value) toggleEnabled();}
        else if(key==='hud') {if(hudVisible!==value) toggleHud();}
        else if(key==='hudPosition') {platform.settings.hudPosition=value;platform.change(key,value);updateHud();}
        else if(key==='hudMode') {if(detailsVisible!==(value==='details')) toggleDetails();}
        else if(key==='renderer' && rendererChoices().includes(value)) {quality=value;writeRenderer(value);clearKavitaAhead();clearKomgaAhead();invalidateAll();}
        else if(key==='rendererCandidates'){platform.settings.rendererOrder=[...value,...RendererRegistry.ids().filter(id=>!value.includes(id))];disabledRenderers=new Set(RendererRegistry.ids().filter(id=>!value.includes(id)));platform.change(key,value);if(disabledRenderers.has(quality)){quality='browser';clearKavitaAhead();clearKomgaAhead();invalidateAll();}}
        else if(['blobBudgetMb','decodedForward','decodedBack','processingMode','outputFormat','developerMode','diagnosticRecording','diagnosticClearRevision','processingTimeoutMs','processingRetryRevision'].includes(key)){await platform.change(key,value);}
        else if(key==='filterParameters'){await platform.change(key,value);}
        else if(key==='filters'){await platform.change(key,value);}
        else if(key==='filterCandidates'){platform.settings.filterCandidates=value;platform.change(key,value);}
        else if(key==='disabledRenderers') {disabledRenderers=new Set(value);platform.change(key,value);if(disabledRenderers.has(quality)){quality='browser';clearKavitaAhead();clearKomgaAhead();invalidateAll();}}
        return panelSnapshot();
      },close:()=>{controller.destroy();closeTouchMenu();}});
    activePanel=controller;
    backdrop.addEventListener('pointerdown',e=>{if(e.target===backdrop && !controller.hasOverlay()) {controller.destroy();closeTouchMenu();}});
  }
  function openSettings() {openReaderPanel('settings');}
  function openTouchMenu() {openReaderPanel();}



  // Each host's native menu is observed independently of the Reader Core.
  let powerCompanion=null, companionNativeBar=null;
  let kavitaReaderRoot=null, kavitaMenuObserver=null;
  let kavitaBarAbort=null, kavitaPositionTimers=[];
  function kavitaNativeBar() {
    return kavitaReaderRoot?.isConnected
      ? kavitaReaderRoot.querySelector('.fixed-bottom.overlay') : null;
  }
  function clearKavitaPositionChecks() {
    kavitaBarAbort?.abort();kavitaBarAbort=null;
    for(const timer of kavitaPositionTimers) clearTimeout(timer);
    kavitaPositionTimers=[];
  }
  function kavitaBarIsLeaving(bar) {
    return bar?.classList.contains('slide-out-bottom');
  }
  function kavitaSettingsOpen(bar) {
    // Kavita's @if(settingsOpen() && formSeeded()) creates this inside the bar.
    return !!bar?.querySelector('.bottom-menu');
  }
  function syncKavitaHudOpacity() {
    if(!hud) return;
    if(!kavitaReaderRoot?.isConnected && hud.style.opacity!=='0.20') return;
    hud.style.transition=kavitaReaderRoot?.isConnected?'opacity .18s ease':'';
    const opacity=(kavitaNativeBar()||powerCompanion?.style.visibility==='visible')?'0.20':'1';
    if(hud.style.opacity!==opacity) hud.style.opacity=opacity;
  }
  function kavitaCssMotionMs(bar) {
    const css=getComputedStyle(bar);
    const seconds=s=>s.split(',').map(v=>v.trim().endsWith('ms')
      ? parseFloat(v)/1000:parseFloat(v)).map(v=>Number.isFinite(v)?v:0);
    const longest=(durations,delays)=>{
      const d=seconds(durations),l=seconds(delays);
      return Math.max(0,...d.map((v,i)=>v+(l[i%l.length]||0)));
    };
    return 1000*Math.max(longest(css.animationDuration,css.animationDelay),
      longest(css.transitionDuration,css.transitionDelay));
  }
  function watchKavitaBarPosition(bar) {
    clearKavitaPositionChecks();
    if(!bar) return;
    kavitaBarAbort=new AbortController();
    let layoutChecks=0;
    const valid=()=>companionNativeBar===bar && bar.isConnected && powerCompanion &&
      !kavitaBarIsLeaving(bar) && !kavitaSettingsOpen(bar) && !touchMenu && !settingsWindow;
    const reveal=()=>{
      if(!valid()) return;
      const moving=[bar,quickTopBar()].filter(Boolean).flatMap(b=>b.getAnimations?.({subtree:false})||[]).filter(a=>a.playState==='running');
      if(moving.length) {
        Promise.allSettled(moving.map(a=>a.finished)).then(()=>{
          if(valid()) requestAnimationFrame(reveal);
        });
        return;
      }
      requestAnimationFrame(()=>{
        if(!valid()) return;
        const before=bar.getBoundingClientRect();
        requestAnimationFrame(()=>{
          if(!valid()) return;
          const after=bar.getBoundingClientRect();
          if(Math.abs(after.top-before.top)>1) {
            if(++layoutChecks<8) kavitaPositionTimers.push(setTimeout(reveal,50));
            return;
          }
          positionPowerCompanion();
          powerCompanion.style.visibility='visible';syncReaderAdjustmentVisibility();
        });
      });
    };
    const ended=e=>{if(e.target===bar) reveal();};
    bar.addEventListener('animationend',ended,{capture:true,signal:kavitaBarAbort.signal});
    bar.addEventListener('transitionend',ended,{capture:true,signal:kavitaBarAbort.signal});
    // DOM presence determines OPEN; motion only determines when Power is shown.
    // Read the theme's durations, with a short fallback for reduced motion.
    requestAnimationFrame(()=>{
      if(!valid()) return;
      const wait=Math.max(32,kavitaCssMotionMs(bar)+50);
      kavitaPositionTimers.push(setTimeout(reveal,wait));
    });
  }
  function bindKavitaNativeObserver() {
    if(kavitaReaderRoot?.isConnected) return;
    const next=document.querySelector('app-manga-reader');
    if(next===kavitaReaderRoot) return;
    kavitaMenuObserver?.disconnect();
    kavitaMenuObserver=null;
    kavitaReaderRoot=next;
    if(next) {
      kavitaMenuObserver=new MutationObserver(records=>{
        syncPowerCompanion();
        syncKavitaHudOpacity();
        applyHudPosition();
    positionHudUnderKavitaMenu();
        const bar=kavitaNativeBar();
        if(bar && powerCompanion?.style.visibility==='hidden' &&
           records.some(r=>r.type==='attributes' && r.target===bar &&
             r.attributeName==='class') && !kavitaBarIsLeaving(bar))
          watchKavitaBarPosition(bar);
      });
      kavitaMenuObserver.observe(next,{childList:true,subtree:true,
        attributes:true,attributeFilter:['class']});
    } else if(!readerContext()) {
      if(hud) hud.style.display='none';
      closeTouchMenu(false);
      closeSettings(false);
    }
    syncPowerCompanion();
    syncKavitaHudOpacity();
    applyHudPosition();
    positionHudUnderKavitaMenu();
  }
  function nativeBottomControls(context) {
    if(!context) return null;
    const selector='app-manga-reader .fixed-bottom.overlay';
    for(const bar of document.querySelectorAll(selector)) {
      const rect=bar.getBoundingClientRect();
      if(rect.width>0 && rect.height>0 && rect.top>=0 && rect.top<innerHeight)
        return bar;
    }
    return null;
  }
  // Komga's reader class and native UI DOM are independent of image decoding,
  // carousel layout and the Reader Core observer's disconnect/reconnect cycle.
  let komgaUiObserver=null, komgaPositionAbort=null, komgaPositionTimer=null;
  let komgaNativeFrame=0;
  function komgaNativeBar() {
    return document.documentElement.classList.contains('html-reader')
      ? document.querySelector('header.settings.v-toolbar[horizontal]') : null;
  }
  function komgaSettingsOpen() {
    if(!document.documentElement.classList.contains('html-reader')) return false;
    return !!document.querySelector(
      '.v-dialog.v-bottom-sheet.v-dialog--active .v-card > header.v-toolbar.v-sheet.primary .v-toolbar__content'
    ) && !!document.querySelector(
      '.v-dialog.v-bottom-sheet.v-dialog--active .v-card .v-card__text .v-list'
    );
  }
  function komgaNativeUiState() {
    if(!document.documentElement.classList.contains('html-reader')) return 'NO_READER';
    if(komgaSettingsOpen()) return 'READER_SETTINGS';
    return komgaNativeBar()?'READER_MENU':'READING';
  }
  function syncKomgaHudOpacity() {
    if(!hud || !document.documentElement.classList.contains('html-reader')) return;
    hud.style.transition='opacity .18s ease';
    const opacity=['READER_MENU','READER_SETTINGS'].includes(komgaNativeUiState())?'0.20':'1';
    if(hud.style.opacity!==opacity) hud.style.opacity=opacity;
  }
  function clearKomgaPositionChecks() {
    komgaPositionAbort?.abort();komgaPositionAbort=null;
    if(komgaPositionTimer!==null) clearTimeout(komgaPositionTimer);
    komgaPositionTimer=null;
  }
  function watchKomgaBarPosition(bar) {
    clearKomgaPositionChecks();
    if(!bar) return;
    komgaPositionAbort=new AbortController();
    const signal=komgaPositionAbort.signal;
    const valid=()=>!signal.aborted && companionNativeBar===bar && bar.isConnected && powerCompanion &&
      komgaNativeUiState()==='READER_MENU' && !touchMenu && !settingsWindow;
    let attempts=0;
    const reveal=()=>{
      if(!valid()) return;
      const moving=[bar,quickTopBar()].filter(Boolean).flatMap(b=>b.getAnimations?.({subtree:false})||[]).filter(a=>a.playState==='running');
      if(moving.length && attempts++<8) {
        Promise.allSettled(moving.map(a=>a.finished)).then(()=>{
          if(valid()) requestAnimationFrame(reveal);
        });
        return;
      }
      requestAnimationFrame(()=>{
        if(!valid()) return;
        const before=bar.getBoundingClientRect();
        requestAnimationFrame(()=>{
          if(!valid()) return;
          const after=bar.getBoundingClientRect();
          if(Math.abs(after.top-before.top)>1 && attempts++<8) {
            komgaPositionTimer=setTimeout(reveal,50);
            return;
          }
          positionPowerCompanion();
          powerCompanion.style.visibility='visible';syncReaderAdjustmentVisibility();
        });
      });
    };
    const ended=e=>{if(e.target===bar) reveal();};
    bar.addEventListener('transitionend',ended,{capture:true,signal:komgaPositionAbort.signal});
    bar.addEventListener('animationend',ended,{capture:true,signal:komgaPositionAbort.signal});
    requestAnimationFrame(()=>{
      if(valid()) komgaPositionTimer=setTimeout(reveal,Math.max(32,kavitaCssMotionMs(bar)+50));
    });
  }
  function removePowerCompanion() {
    hideReaderAdjustment();
    clearTimeout(quickToastTimer);resetQuickHold();quickBarsObserver?.disconnect();
    clearKavitaPositionChecks();
    clearKomgaPositionChecks();
    powerCompanion?.remove();
    powerCompanion=null;
    companionNativeBar=null;
    syncKavitaHudOpacity();
  }
  const QUICK_ICONS={"power": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3v9M6 6a8 8 0 1 0 12 0\" /></svg>", "pre": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M10 4h11l-5 7v7l-4 2v-9l-2-3M2 6h6M5 3l3 3-3 3\" /></svg>", "renderer": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"2\" /><path d=\"M8 2v3m4-3v3m4-3v3M8 19v3m4-3v3m4-3v3M2 8h3m-3 4h3m-3 4h3M19 8h3m-3 4h3m-3 4h3\" /><text x=\"12\" y=\"14\" font-size=\"5\" font-family=\"system-ui,sans-serif\" font-weight=\"700\" text-anchor=\"middle\" fill=\"currentColor\" stroke=\"none\">GPU</text></svg>", "post": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 4h12l-4 7v7l-4 2v-9L3 4M15 16h7M19 13l3 3-3 3\" /></svg>", "custom": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 5h18M3 12h18M3 19h9M7 3v4M16 10v4M6 17v4\" /><text x=\"18\" y=\"22\" font-size=\"9\" fill=\"currentColor\" stroke=\"none\">1</text></svg>", "hud": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\" /><path d=\"M6 8h12M6 12h12M6 16h7\" /></svg>", "settings": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"7\" /><circle cx=\"12\" cy=\"12\" r=\"3\" /><path d=\"M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2\" /></svg>"};
  QUICK_ICONS.adjust="<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6\"/></svg>";QUICK_ICONS.custom="<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"7\" y=\"8\" width=\"14\" height=\"12\" rx=\"2\"/><path d=\"M17 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2\"/></svg>";
  const QUICK_LABELS={power:'Reader全体',pre:'前処理フィルター',renderer:'レンダラー',post:'後処理フィルター',custom:'カスタム',hud:'HUD',settings:'詳細設定'};
  let quickToastTimer=null, quickHoldTimer=null, quickHoldUntil=0, quickHover=false, quickFocus=false;
  let quickManualCloseUntil=0, quickBarsObserver=null;
  function quickOperating(){return !!adjustmentView&&!adjustmentView.host.hidden||quickHover||quickFocus||Date.now()<quickHoldUntil;}
  function holdQuick(){
    quickHoldUntil=Date.now()+3000;clearTimeout(quickHoldTimer);
    quickHoldTimer=setTimeout(()=>{quickHoldUntil=0;syncPowerCompanion();},3000);
  }
  function resetQuickHold(){clearTimeout(quickHoldTimer);quickHoldUntil=0;quickHover=false;quickFocus=false;}
  function quickTopBar(){
    return kavitaReaderRoot?.isConnected
      ? [...kavitaReaderRoot.querySelectorAll('.fixed-top.overlay')].find(b=>b.querySelector('button'))
      : document.querySelector('header.settings.v-toolbar:not([horizontal])');
  }
  function observeQuickBars(){
    quickBarsObserver?.disconnect();
    if(typeof ResizeObserver==='undefined')return;
    quickBarsObserver=new ResizeObserver(()=>{positionPowerCompanion();adjustmentView?.controller?.reposition();});
    for(const b of [companionNativeBar,quickTopBar()])if(b)quickBarsObserver.observe(b);
  }
  document.addEventListener('click',e=>{
    if(!powerCompanion||e.composedPath().includes(powerCompanion)||adjustmentView&&e.composedPath().includes(adjustmentView.host))return;
    const target=e.target;
    if(target.closest?.('button,input,select,a,[role="button"],.fixed-top,.fixed-bottom'))return;
    if(target.closest?.('app-manga-reader'))quickManualCloseUntil=Date.now()+600;
  },true);
  const quickConfig=()=>{const q=platform.settings.quick || {"order": ["power", "pre", "renderer", "post", "adjust", "custom", "hud", "settings"], "visible": ["power", "pre", "renderer", "post", "adjust", "custom", "hud", "settings"], "portrait": {"pos": "右下", "dir": "横"}, "landscape": {"pos": "右下", "dir": "横"}};return {...q,order:[...new Set([...q.order,'adjust'])],visible:[...new Set([...q.visible,...(!q.order.includes('adjust')?['adjust']:[])])]};};
  function quickToast(value){
    const n=powerCompanion?.lastElementChild;if(!n)return;
    clearTimeout(quickToastTimer);n.textContent=value;n.hidden=false;
    quickToastTimer=setTimeout(()=>{n.hidden=true;},1500);
  }
  function positionPowerCompanion(force=false) {
    if(!powerCompanion || (!force&&quickOperating()&&powerCompanion.dataset.positioned)) return;
    const viewport=window.visualViewport;
    const width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
    const x=viewport?.offsetLeft||0,y=viewport?.offsetTop||0;
    const layout=quickConfig()[width>height?'landscape':'portrait'];
    const top=layout.pos.includes('上'),left=layout.pos.includes('左'),vertical=layout.dir==='縦';
    const upper=quickTopBar()?.getBoundingClientRect(),lower=companionNativeBar?.getBoundingClientRect();
    const start=Math.max(y+12,upper?.height>0?upper.bottom+10:y+12);
    const end=Math.min(y+height-12,lower?.height>0?lower.top-10:y+height-12);
    const availableWidth=Math.max(48,width-24),availableHeight=Math.max(48,end-start);
    const buttons=powerCompanion.firstElementChild,count=buttons.children.length;
    const capacity=Math.max(1,Math.floor(((vertical?availableHeight:availableWidth)+6)/54));
    const primary=Math.min(count,capacity),secondary=Math.ceil(count/capacity);
    const w=vertical?secondary*54-6:primary*54-6,h=vertical?primary*54-6:secondary*54-6;
    Object.assign(buttons.style,{display:'grid',gridAutoFlow:vertical?'column':'row',
      gridTemplateColumns:vertical?`repeat(${secondary},48px)`:`repeat(${primary},48px)`,
      gridTemplateRows:vertical?`repeat(${primary},48px)`:`repeat(${secondary},48px)`,gap:'6px',
      maxWidth:'none',width:`${w}px`,height:`${h}px`,flexDirection:vertical?'column':'row'});
    Object.assign(powerCompanion.style,{left:`${left?x+12:Math.max(x+12,x+width-12-w)}px`,right:'auto',
      top:`${top?start:Math.max(start,end-h)}px`,bottom:'auto'});
    powerCompanion.dataset.positioned='true';
  }

  function syncPowerCompanion() {
    if (suspended) { hideReaderAdjustment();removePowerCompanion(); return; }
    const kavitaBar=kavitaNativeBar();
    const komgaBar=!kavitaBar && komgaNativeUiState()==='READER_MENU'
      ? komgaNativeBar():null;
    const context=(kavitaBar||kavitaReaderRoot?.isConnected)?{adapter:'Kavita'}:komgaBar?{adapter:'Komga'}:readerContext();
    const bar=context && !touchMenu && !settingsWindow
      ? kavitaBar?(kavitaBarIsLeaving(kavitaBar)||kavitaSettingsOpen(kavitaBar)
        ? null:kavitaBar):context.adapter==='Komga'?
          (komgaNativeUiState()==='READER_MENU'?komgaBar:null):nativeBottomControls(context) : null;
    let retained=false;
    if(!bar) {
      const hardClose=suspended||touchMenu||settingsWindow||!kavitaReaderRoot?.isConnected||
        kavitaSettingsOpen(kavitaBar)||Date.now()<quickManualCloseUntil;
      retained=!!powerCompanion&&!hardClose&&quickOperating();
      if(!retained){if(powerCompanion)removePowerCompanion();return;}
    }
    if(!powerCompanion) {
      const root=document.createElement('div');
      root.setAttribute('data-gpu-reader-companion','');
      root.style.cssText=`position:fixed;right:12px;z-index:2147483645;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif;visibility:hidden`;
      const buttons=document.createElement('div');
      buttons.style.cssText='display:flex;align-items:center;gap:6px;pointer-events:none';
      const message=document.createElement('div');message.hidden=true;message.setAttribute('role','status');
      message.style.cssText='padding:7px 11px;border:1px solid #8888;border-radius:10px;background:rgba(9,13,11,.92);color:#f3fff4;font-size:12px;line-height:1.35;max-width:calc(100vw - 24px);overflow-wrap:anywhere;pointer-events:none';
      root.addEventListener('pointerdown',holdQuick);
      root.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){quickHover=true;holdQuick();}});
      root.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){quickHover=false;holdQuick();}});
      root.addEventListener('focusin',e=>{quickFocus=!!e.target.matches?.(':focus-visible');if(quickFocus)holdQuick();});
      root.addEventListener('focusout',()=>{quickFocus=false;holdQuick();});
      message.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 22px;border-radius:12px;background:rgba(15,18,22,.78);color:#fff;font-size:22px;line-height:1.4;max-width:calc(100vw - 24px);overflow-wrap:anywhere;pointer-events:none';
      root.append(buttons,message);
      (document.body||document.documentElement).appendChild(root);
      powerCompanion=root;
    }
    const changedBar=companionNativeBar!==bar;
    if(!retained)companionNativeBar=bar;
    const palette=globalThis.__KKGR_PANEL__?.readTheme(context.adapter);
    const config=quickConfig();
    const status=JSON.stringify([context.adapter,enabled,quality,hudVisible,palette,config,[...disabledRenderers],platform.settings.filters,platform.settings.filterCandidates,platform.settings.filterCatalog,!!adjustmentView]);
    if(powerCompanion.dataset.status!==status){
      adjustmentView?.controller?.refresh();
      const buttons=powerCompanion.firstElementChild;buttons.replaceChildren();
      for(const key of config.order.filter(k=>k==='power'||config.visible.includes(k))){
        const button=document.createElement('button');button.type='button';button.dataset.quick=key;
        button.innerHTML=globalThis.__KKGR_PANEL__?.quickIcon?.(key)||QUICK_ICONS[key];button.querySelector('svg').style.cssText='width:24px;height:24px;pointer-events:none;flex-shrink:0';
        const filterSlot=['pre','post'].includes(key)?globalThis.__KKGR_FILTER_STATE__.slot(platform.settings,key):null;
        const unavailable=key==='custom'||(filterSlot&&!filterSlot.candidates.length)||(key==='renderer'&&rendererChoices().length===1);
        const on=key==='power'?enabled:key==='renderer'?quality!=='browser':key==='hud'?hudVisible:key==='adjust'?!!adjustmentView:filterSlot?!!filterSlot.current:false;
        const accent=uiAccent(context.adapter),normal=palette?.fg|| (palette?.light?'#303840':'#c4cbd3');
        button.style.cssText=`width:48px;min-width:48px;height:48px;min-height:48px;flex-shrink:0;padding:0;border-radius:50%;display:grid;place-items:center;pointer-events:auto;touch-action:manipulation;cursor:${unavailable?'default':'pointer'};border:1.5px solid ${on?accent:normal};background:${on?(palette?.activeBg||'#293846'):(palette?.surface||'#242424')};color:${on?accent:normal};opacity:${unavailable?'.35':'1'}`;
        const quickMessage={power:'message.a3baf90d6ee0',pre:'filter.pre',renderer:'adjust.renderer',post:'filter.post',adjust:'quick.adjust',custom:'quick.custom',hud:'message.1ff70ccf70c1',settings:'settings.title'}[key];button.disabled=unavailable;button.title=(globalThis.__KKGR_I18N__?.t(quickMessage,{},typeof hudLanguage==='string'?hudLanguage:undefined)||QUICK_LABELS[key])+(unavailable?'（未接続／候補なし）':'');button.setAttribute('aria-label',button.title);
        if(!['settings','custom'].includes(key))button.setAttribute('aria-pressed',String(on));
        if(!unavailable)button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();holdQuick();
          if(key==='power'){toggleEnabled();quickToast(enabled?'Reader ON':'Reader OFF');}else if(key==='renderer'){cycleQuality();syncPowerCompanion();quickToast(quality==='browser'?'ブラウザー':rendererLabel());}
          else if(key==='pre'||key==='post'){if(filterChangePending)return;const next=globalThis.__KKGR_FILTER_STATE__.slot(platform.settings,key).next;filterChangePending=true;Promise.resolve(platform.change('filters',{stage:key,id:next})).then(()=>{const id=platform.settings.filters?.[key]||null;quickToast(id?globalThis.__KKGR_FILTER_STATE__.name(platform.settings,id):(globalThis.__KKGR_I18N__?.t(key==='pre'?'filter.pre':'filter.post',{},typeof hudLanguage==='string'?hudLanguage:undefined)||QUICK_LABELS[key])+' OFF');},error=>quickToast(String(error.message||error))).finally(()=>{filterChangePending=false;syncPowerCompanion();});}
          else if(key==='adjust'){openReaderAdjustment();quickToast((globalThis.__KKGR_I18N__?.t('quick.adjust',{},typeof hudLanguage==='string'?hudLanguage:undefined)||'Adjust')+' '+(adjustmentView?'ON':'OFF'));}else if(key==='hud'){toggleHud();quickToast(hudVisible?'HUD 表示':'HUD 非表示');}else if(key==='settings')document.dispatchEvent(new CustomEvent('kkgr-dev1-open-settings'));
          syncPowerCompanion();
        });
        if(key==='settings'){button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')button.style.color=accent;});button.addEventListener('pointerleave',()=>button.style.color=normal);}
        buttons.append(button);
      }
      buttons.style.flexWrap='wrap';buttons.style.maxWidth='calc(100vw - 24px)';
      powerCompanion.dataset.status=status;
    }
    syncKavitaHudOpacity();
    if(!retained)positionPowerCompanion();
    syncReaderAdjustmentVisibility();
    // While Kavita's bottom bar is entering, unrelated Core/HUD updates must
    // not overwrite the position obtained after the animation settles.
    if(changedBar&&!retained) {
      observeQuickBars();
      if(context.adapter==='Kavita') watchKavitaBarPosition(bar);
      else {clearKavitaPositionChecks();watchKomgaBarPosition(bar);}
    }
  }
  function bindKomgaNativeObserver() {
    komgaUiObserver?.disconnect();komgaUiObserver=null;
    if(komgaNativeFrame) cancelAnimationFrame(komgaNativeFrame);
    komgaNativeFrame=0;
    if(document.documentElement.classList.contains('html-reader')) {
      komgaUiObserver=new MutationObserver(records=>{
        // Ignore updates made exclusively within our own floating controls.
        if(records.every(r=>r.target.closest?.('[data-gpu-reader-companion], [data-gpu-reader-touch-menu], [data-gpu-reader-settings], [data-gpu-reader-hud], [data-gpu-reader-adjustment]'))) return;
        // Vue may attach the toolbar after the first mutation. Recheck the
        // real DOM next frame; the frame is not a substitute for DOM presence.
        syncPowerCompanion();
        syncKomgaHudOpacity();
        positionHudUnderKomgaMenu();
        if(!komgaNativeFrame) komgaNativeFrame=requestAnimationFrame(()=>{
          komgaNativeFrame=0;
          if(!document.documentElement.classList.contains('html-reader')) return;
          syncPowerCompanion();syncKomgaHudOpacity();positionHudUnderKomgaMenu();
        });
      });
      // Observe html, not a body captured while the SPA is entering Reader.
      // A replaced body cannot silently strand this native UI observer.
      komgaUiObserver.observe(document.documentElement,{childList:true,subtree:true,
        attributes:true,attributeFilter:['class']});
    } else {
      if(companionNativeBar && !companionNativeBar.closest('app-manga-reader')) removePowerCompanion();
      if(hud && hud.style.opacity==='0.20') hud.style.opacity='1';
      if(!kavitaReaderRoot?.isConnected && !readerContext()) {
        closeTouchMenu(false);closeSettings(false);
      }
    }
    syncPowerCompanion();syncKomgaHudOpacity();positionHudUnderKomgaMenu();
  }
  const kavitaRootObserver=new MutationObserver(bindKavitaNativeObserver);
  kavitaRootObserver.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('resize',()=>{if(powerCompanion) positionPowerCompanion(true);adjustmentView?.controller?.reposition();},{passive:true});
  window.visualViewport?.addEventListener('resize',()=>{if(powerCompanion) positionPowerCompanion(true);adjustmentView?.controller?.reposition();},{passive:true});

  /* ================================================================== *
   * HUD - reports one specific image: the hovered one, else the largest visible
   * ================================================================== */

  // Only exact URL|output-size|renderer matches are usable for an offset.
  // The owning map is diagnostic data; a saved distance is never a position.
  const CacheState=globalThis.__KKGR_CACHE_STATE__;
  function completedResult(key,includeBlob=true) {
    const candidates=[];
    const decodedImage=(image,url)=>!!image&&image.complete&&image.naturalWidth>0&&(image.currentSrc||image.src)===url;
    for(const [owner,map] of [['History',historyLRU],['KavitaAhead',kavitaAhead],['KomgaAhead',komgaAhead]]) {
      const item=map.get(key);if(!item)continue;
      candidates.push({key,url:item.url,owner,item,warming:item.warming,
        decoded:decodedImage(item.decoded,item.url)||!!item.el?.deref()?.isConnected&&decodedImage(item.el.deref(),item.url)});
    }
    if(includeBlob)for(const [url,rec] of blobs){
      if(rec.key!==key||rec.s.cache.get(key)!==url)continue;
      candidates.push({key,url,owner:'Blob',item:rec,decoded:decodedImage(rec.decoded,url)||!!rec.s.el.deref()?.isConnected&&decodedImage(rec.s.el.deref(),url)});
    }
    return CacheState.resolve(key,candidates);
  }
  function completedOwner(key) {return completedResult(key).owner;}
  function readiness(key,{native=false,source=null,attempts=null,working=false}={}) {
    const result=completedResult(key);
    const hasFilters=!!platform.settings.filters?.pre||!!platform.settings.filters?.post;
    const unprocessed=!hasFilters&&(quality==='browser'||native);
    const sourceReady=unprocessed&&source?.complete&&source.naturalWidth>0&&(source.currentSrc||source.src)===key.slice(0,key.indexOf('|'));
    const ready=enabled&&(result.decoded||sourceReady);
    return {key,owner:result.owner,ready,total:1,blob:!!result.url,decoded:result.decoded,
      status:ready?(sourceReady&&!result.decoded?'NATIVE':'READY'):result.url?result.state:attempts?.has(key)?
        (working?'RENDERING/QUEUED':'RETRY PENDING'):'MISSING'};
  }
  function komgaApiSnapshot(img){const plan=komgaApiPlan(img,true);if(!plan)return null;const rows=new Map();for(const e of plan.near){if(!e)continue;const row=rows.get(e.offset)||{offset:e.offset,entries:[]};const source=[...document.images].find(x=>(state.get(x)?.origUrl||x.currentSrc||x.src)===e.sourceUrl);row.entries.push(e.missing?{ready:false,status:'SOURCE METADATA WAIT'}:readiness(e.key,{native:e.w===e.nw&&e.h===e.nh,source,attempts:komgaAttempts,working:komgaJob}));rows.set(e.offset,row);}return [...rows.values()].map(row=>({...row,total:row.entries.length,ready:row.entries.filter(x=>x.ready).length,status:row.entries.every(x=>x.ready)?'READY':'MISSING',owner:[...new Set(row.entries.map(x=>x.owner).filter(Boolean))].join('+')}));}
  function webtoonOffsetSnapshot(img) {
    const api=komgaApiSnapshot(img);if(api)return api;
    return webtoonWindow(img).map(e=>{
      if(!e.key||!e.nw||!e.nh)return {offset:e.offset,status:'SOURCE LOADING',total:1,ready:0};
      const entry=readiness(e.key,{native:e.t.w===e.nw&&e.t.h===e.nh,source:e.img,attempts:komgaAttempts,working:webtoonJob});
      return {...entry,offset:e.offset,ready:entry.ready?1:0,entries:[entry]};
    });
  }
  function offsetSnapshot(img,st,adapter) {
    if(adapter==='Komga'){const api=komgaApiSnapshot(img);if(api)return api;}
    if(adapter==='Kavita'){const api=kavitaApiSnapshot(img);if(api)return api;}
    const offsets=Array.from({length:CFG.prefetchPrevious},(_,i)=>-i-1).concat(Array.from({length:CFG.prefetchNext},(_,i)=>i+1));
    if(!img||!st)return offsets.map(offset=>({offset,status:'NO CURRENT',total:1,ready:0}));
    if(adapter==='Kavita'){
      const target=st.nw&&st.nh?targetSize(img,st.nw,st.nh):null,bounds=kavitaVisiblePages(st.origUrl);
      return offsets.map(offset=>{
        const sourceUrl=kavitaNextUrl(offset>0?bounds.last:bounds.first,offset);
        if(!sourceUrl)return {offset,status:'END',total:0,ready:0};
        if(!target)return {offset,status:'SOURCE LOADING',total:1,ready:0};
        const key=`${sourceUrl}|${target.w}x${target.h}|${rendererCacheKey(quality)}`;
        const source=[...document.images].find(x=>(state.get(x)?.origUrl||x.currentSrc||x.src)===sourceUrl);
        const sourceState=source&&state.get(source),nw=sourceState?.nw||source?.naturalWidth,nh=sourceState?.nh||source?.naturalHeight;
        const entry=readiness(key,{native:target.w===nw&&target.h===nh,source,attempts:kavitaAttempts,working:kavitaJob});
        return {...entry,offset,ready:entry.ready?1:0,entries:[entry]};
      });
    }
    if(adapter!=='Komga')return offsets.map(offset=>({offset,status:'NO ADAPTER',total:1,ready:0}));
    const carousel=img.closest('.v-carousel');if(!carousel)return [];
    const slides=[...carousel.querySelectorAll('.v-window-item')],index=slides.indexOf(img.closest('.v-window-item')),box=img.closest('.v-window-item')?.getBoundingClientRect();
    return komgaImageWindow(slides,index).map(({distance,index:slideIndex})=>{
      const images=KomgaAdapter.getImages(slides,slideIndex);
      if(!images.length||!box?.width||!box?.height)return {offset:distance,status:'SOURCE/LAYOUT WAIT',total:images.length,ready:0};
      const entries=images.map(source=>{
        const {sourceUrl,nw,nh}=komgaSourceInfo(source);
        if(!source.complete||!nw||!nh)return {status:'SOURCE LOADING',ready:false};
        if(nw<1||nh<1)return {status:'INELIGIBLE',ready:false};
        const {w,h}=komgaContainedSize(box,images.length,nw,nh,dpr()),key=`${sourceUrl}|${w}x${h}|${rendererCacheKey(quality)}`;
        if(w*h>16e6||w*h>CFG.maxOutputPixels)return {status:'PIXEL CAP',key,ready:false};
        return readiness(key,{native:w===nw&&h===nh,source,attempts:komgaAttempts,working:komgaJob});
      });
      const ready=entries.filter(e=>e.ready).length,owners=[...new Set(entries.map(e=>e.owner).filter(Boolean))].join('+');
      return {offset:distance,total:entries.length,ready,entries,status:ready===entries.length?'READY':ready?`PARTIAL ${ready}/${entries.length}`:entries[0].status,owner:owners};
    });
  }

  // Use the same tracked image and carousel membership as the Komga rendering
  // path. Its slide's active class and the image URL are not renderer gates.
  function readerContext() {
    if (suspended) return null;
    const split=KavitaSplit.context();
    if(split) return split;
    const shown = img => {
      if (!img.isConnected) return false;
      const r=img.getBoundingClientRect();
      return r.width>32 && r.height>32 && r.bottom>0 && r.right>0 &&
        r.top<innerHeight && r.left<innerWidth &&
        getComputedStyle(img).visibility!=='hidden';
    };
    for (const img of document.images) {
      if (!img.closest('.v-carousel') || !shown(img)) continue;
      const recorded=state.get(img);
      const nw=recorded?.nw || img.naturalWidth;
      const nh=recorded?.nh || img.naturalHeight;
      if (nw<1 || nh<1) continue;
      if (!komgaImageHasLayout(img,targetSize(img,nw,nh))) continue;
      return {adapter:'Komga',img};
    }
    for (const img of document.images) {
      if (!shown(img)) continue;
      const original=state.get(img)?.origUrl || img.src;
      if (KavitaAdapter.getCurrentPage(original)) return {adapter:'Kavita',layout:img.closest('.webtoon-images')?'webtoon':undefined,img};
    }
    const webtoon=komgaWebtoonCurrentImage();
    if (webtoon) return {adapter:'Komga',layout:'webtoon',img:webtoon};
    return null;
  }

  function hudTarget() {
    const webtoon=komgaWebtoonCurrentImage();
    if (webtoon) return webtoon;
    const usable = img => {
      if (!img?.isConnected || !state.has(img)) return false;
      const slide=img.closest('.v-window-item');
      if (slide && (slide.classList.contains('pre-render') ||
          getComputedStyle(slide).display === 'none')) return false;
      const r=img.getBoundingClientRect();
      return r.width>32 && r.height>32 && r.bottom>0 && r.top<innerHeight &&
        r.right>0 && r.left<innerWidth;
    };
    const active=[...document.querySelectorAll('.v-carousel .v-window-item--active img')]
      .find(usable);
    if (active) return active;
    if (usable(focus)) return focus;
    let best=null, area=0;
    for (const img of visible) {
      if (!usable(img)) continue;
      const r=img.getBoundingClientRect();
      if (r.width*r.height>area) {best=img;area=r.width*r.height;}
    }
    return best;
  }

  let hud, hudMotionDeadline=0, hudMotionTimer=null;
  // Kavita's menu and reader image can share a stacking context that a
  // body-level HUD with INT_MAX z-index cannot be placed between. Keep the
  // same fixed HUD node in the actual reader and read the menu's CSS stacking
  // level at runtime; do not change either the image or the native bar.
  function positionHudUnderKavitaMenu() {
    if(!hud) return;
    const root=kavitaReaderRoot?.isConnected?kavitaReaderRoot:null;
    if(!root && document.documentElement.classList.contains('html-reader')) return;
    if(!root) {
      const parent=document.body||document.documentElement;
      if(hud.parentElement!==parent) parent.appendChild(hud);
      if(hud.style.zIndex!=='2147483647') hud.style.zIndex='2147483647';
      return;
    }
    const bar=kavitaNativeBar();
    if(!bar) {
      if(hud.parentElement!==root) root.appendChild(hud);
      if(hud.style.zIndex!=='2147483644') hud.style.zIndex='2147483644';
      return;
    }
    let layer=bar;
    let nativeZ=null;
    while(layer && layer!==root) {
      const cssZ=getComputedStyle(layer).zIndex;
      if(cssZ!=='auto' && Number.isFinite(Number(cssZ))) nativeZ=Number(cssZ);
      layer=layer.parentElement;
    }
    // With z:auto, DOM painting order is used: image, HUD, then native bar.
    let menuRoot=bar;
    while(menuRoot.parentElement && menuRoot.parentElement!==root)
      menuRoot=menuRoot.parentElement;
    if(menuRoot.parentElement===root && hud.nextSibling!==menuRoot)
      root.insertBefore(hud,menuRoot);
    else if(hud.parentElement!==root) root.appendChild(hud);
    const hudZ=String(nativeZ!==null?Math.max(0,nativeZ-1):0);
    if(hud.style.zIndex!==hudZ) hud.style.zIndex=hudZ;
  }
  function positionHudUnderKomgaMenu() {
    if(!hud || !document.documentElement.classList.contains('html-reader')) return;
    const bar=komgaNativeBar();
    if(!bar?.parentElement) {
      const parent=document.body||document.documentElement;
      if(hud.parentElement!==parent) parent.appendChild(hud);
      if(hud.style.zIndex!=='2147483647') hud.style.zIndex='2147483647';
      return;
    }
    // Put HUD in the toolbar's own stacking context, immediately before it.
    // This keeps the reader image behind HUD and the native menu above HUD.
    const parent=bar.parentElement;
    if(hud.parentElement!==parent || hud.nextSibling!==bar)
      parent.insertBefore(hud,bar);
    const nativeZ=getComputedStyle(bar).zIndex;
    const hudZ=nativeZ!=='auto' && Number.isFinite(Number(nativeZ)) && Number(nativeZ)>0
      ? String(Number(nativeZ)-1):'auto';
    if(hud.style.zIndex!==hudZ) hud.style.zIndex=hudZ;
  }
  function applyHudPosition() {
    if(!hud)return;
    const position=['左上','右上','左下','右下'].includes(platform.settings.hudPosition)?platform.settings.hudPosition:'右下';
    Object.assign(hud.style,{left:position.startsWith('左')?'8px':'auto',right:position.startsWith('右')?'8px':'auto',top:position.endsWith('上')?'8px':'auto',bottom:position.endsWith('下')?'8px':'auto'});
  }
  function updateHud() {
    const context=readerContext();
    if(context?.layout==='split'){const info=KavitaSplit.info();globalThis.__KKGR_DIAGNOSTICS__?.select(info?info.source+'|'+info.part:null,info?.outputVisible?info.outputUrl:null,!!info?.outputVisible);}
    else{const diagnosticTarget=hudTarget(),diagnosticState=diagnosticTarget&&state.get(diagnosticTarget);globalThis.__KKGR_DIAGNOSTICS__?.select(diagnosticState?.origUrl,diagnosticTarget?.currentSrc||diagnosticTarget?.src,!!diagnosticState?.blobUrl&&(diagnosticTarget?.currentSrc||diagnosticTarget?.src)===diagnosticState.blobUrl);}
    // Keep the last confirmed HUD through Komga page motion, including the
    // checkpoint where no image is visible. Explicit OFF/HUD OFF still applies.
    const movingCarousel=document.documentElement.classList.contains('html-reader')&&document.querySelector('.v-carousel');
    if(hud?.dataset.readerSite==='Komga'&&hudVisible&&enabled&&!suspended&&movingCarousel&&komgaMoving(movingCarousel)){
      if(!hudMotionDeadline)hudMotionDeadline=performance.now()+1500;
      if(performance.now()<hudMotionDeadline){
        if(!hudMotionTimer)hudMotionTimer=setTimeout(()=>{hudMotionTimer=null;updateHud();},50);
        applyHudPosition();syncKomgaHudOpacity();positionHudUnderKomgaMenu();
        return;
      }
    }else hudMotionDeadline=0;
    clearTimeout(hudMotionTimer);hudMotionTimer=null;
    if (!context) {
      if(hud) hud.style.display='none';
      if(touchMenu) closeTouchMenu();
      return;
    }
    if (!hudVisible) { if (hud) hud.style.display = 'none'; return; }
    if (!hud) {
      hud = document.createElement('div');
      hud.setAttribute('data-gpu-reader-hud','');
      hud.style.cssText = [
        'position:fixed', 'z-index:2147483647', 'right:8px', 'bottom:8px',
        'background:rgba(9,13,11,.90)!important', 'color:#f3fff4!important', 'font:12px/1.5 Consolas,monospace',
        'padding:10px 12px', 'border:2px solid '+uiAccent(context.adapter), 'box-shadow:0 0 0 2px #090d0b', 'border-radius:6px', 'pointer-events:none',
        'white-space:pre-wrap', 'text-align:left', 'max-width:92vw', 'max-height:85vh', 'overflow:hidden',
      ].join(';');
      (document.body || document.documentElement).appendChild(hud);
    }
    hud.style.display = 'block';hud.dataset.readerSite=context.adapter;
    const hudAccent=uiAccent(context.adapter);
    if(hud.dataset.accent!==hudAccent) {
      hud.style.borderColor=hudAccent;
      hud.dataset.accent=hudAccent;
    }
    applyHudPosition();
    positionHudUnderKavitaMenu();
    positionHudUnderKomgaMenu();
    syncKavitaHudOpacity();
    syncKomgaHudOpacity();

    if(context.layout==='split') {
      const info=KavitaSplit.info();
      const p=info?Number(new URL(info.source,location.href).searchParams.get('page')):NaN;
      const hostDisplay=hudHostDisplay('Kavita'),splitSnapshot=kavitaApiSnapshot(),splitAhead=CacheState.contiguous(splitSnapshot||[],1,CFG.prefetchNext),splitBack=CacheState.contiguous(splitSnapshot||[],-1,CFG.prefetchPrevious);
      const splitHudText=HudModel.lines({enabled,site:'Kavita',split:true,hostDisplay,locale:hudLanguage,
        rendererName:rendererLabel(),selectedBrowser:quality==='browser',splitPrepared:!!splitSnapshot,ahead:splitAhead,back:splitBack,aheadTarget:CFG.prefetchNext,backTarget:CFG.prefetchPrevious,
        state:quality==='browser'?{phase:'ready',stage:'display',route:'browser'}:
          info?.presentation || {phase:'waiting',stage:'split'},
        displayRoute:quality==='browser'?'browser':info?.outputVisible?'gpu':null,
        pageLabel:hudMessage('splitPage',{page:Number.isInteger(p)?p+1:'-',part:hudMessage(info?.part==='left'?'left':info?.part==='right'?'right':'waitingInput')}),
        input:info?`${info.w}×${info.h}`:null,output:enabled&&quality!=='browser'&&info?.presentation?.phase==='ready'&&info?.report?`${info.report.w}×${info.report.h}`:null,
        history:info?.cache||0,mb:(totalCacheBytes()/1e6).toFixed(1),budgetMb:(CFG.blobBudget/1e6).toFixed(0)});
      if(detailsVisible) splitHudText.push(...(globalThis.__KKGR_DIAGNOSTICS__?.lines(hudLanguage)||[]),hudMessage('diagnostics'),`Host display: ${JSON.stringify(hostDisplay||{})}`,`Raw status: ${info?.status||KavitaSplit.reason()}`,
        `State: ${JSON.stringify(info?.presentation||{})}`,'A: native crop snapshot; separate output surface',
        `Split speculative prefetch: ${splitSnapshot?`physical images ${CFG.prefetchNext}/${CFG.prefetchPrevious}; both halves prepared`:'metadata/layout unavailable; native fallback'}; history ${info?.cache||0} results`,
        'Last event: '+KavitaSplit.reason());
      const splitHudOutput=splitHudText.join('\n');
      if(hud.textContent!==splitHudOutput) hud.textContent=splitHudOutput;
      return;
    }
    const img=hudTarget() || context.img;
    const st=img && state.get(img);
    const adapter=context.adapter;
    let page='-';
    if (st && adapter==='Kavita') {
      const p=Number(new URL(st.origUrl,location.href).searchParams.get('page'));
      page=Number.isInteger(p) ? `${p+1} (URL index ${p})` : '-';
    } else if (img && adapter==='Komga') {
      if (context.layout==='webtoon') {
        const pages=komgaWebtoonPages();
        const index=pages.indexOf(img);
        page=index>=0 ? `${index+1} / ${pages.length} (Webtoon)` : '-';
      } else {
        const slides=[...img.closest('.v-carousel').querySelectorAll('.v-window-item')];
        const index=slides.indexOf(img.closest('.v-window-item'));
        page=index>=0 ? `slide ${index+1}/${slides.length} (loaded DOM)` : '-';
      }
    }
    const snapshot=adapter==='Komga'&&context.layout==='webtoon' ? webtoonOffsetSnapshot(img) : offsetSnapshot(img,st,adapter);
    // Count only the uninterrupted decoded range from the current position.
    const imageCount=direction=>({ready:CacheState.contiguous(snapshot,direction,direction>0?CFG.prefetchNext:CFG.prefetchPrevious),positions:snapshot.filter(e=>Math.sign(e.offset)===direction&&e.status!=='END').reduce((n,e)=>n+(e.total??1),0)});
    const ahead=imageCount(1),back=imageCount(-1);
    const output=st?.report ? `${st.report.w}x${st.report.h}` :
      st?.nw && st?.nh ? (()=>{
        const t=targetSize(img,st.nw,st.nh);
        return `${t.w}x${t.h}`;
      })() : '-';
    const actualSrc=img?.currentSrc || img?.src;
    globalThis.__KKGR_DIAGNOSTICS__?.select(st?.origUrl,actualSrc,!!st?.blobUrl&&actualSrc===st.blobUrl);
    const displayRoute=st?.blobUrl && actualSrc===st.blobUrl?'gpu':actualSrc===st?.origUrl?
      (st?.presentation?.route==='native'?'native':'browser'):null;
    const hostDisplay=hudHostDisplay(adapter);
    const L=HudModel.lines({enabled,site:adapter,hostDisplay,locale:hudLanguage,
      rendererName:rendererLabel(),selectedBrowser:quality==='browser',state:st?.presentation ||
        {phase:'waiting',stage:st?.nw?'layout':'source'},displayRoute,
      pageLabel:adapter==='Kavita'?hudMessage('page',{page:page.split(' ')[0]}):null,
      input:st?.nw&&st?.nh?`${st.nw}×${st.nh}`:null,
      output:enabled&&st?.presentation?.phase==='ready'&&st?.report?`${st.report.w}×${st.report.h}`:null,
      aheadTarget:CFG.prefetchNext,backTarget:CFG.prefetchPrevious,
      ahead:context.layout==='webtoon'?ahead.ready:Math.min(ahead.ready,CFG.prefetchNext),
      back:context.layout==='webtoon'?back.ready:Math.min(back.ready,CFG.prefetchPrevious),
      history:historyPageCount(),mb:(totalCacheBytes()/1e6).toFixed(1),budgetMb:(CFG.blobBudget/1e6).toFixed(0)});
    if (detailsVisible) {
      L.push(...(globalThis.__KKGR_DIAGNOSTICS__?.lines(hudLanguage)||[]));
      L.push(hudMessage('diagnostics'),`Host display: ${JSON.stringify(hostDisplay||{})}`,`Raw status: ${st?.status||'waiting'}`,`State: ${JSON.stringify(st?.presentation||{})}`,`Reuse source: ${st?.presentation?.reuse||'none'}`);
      if (adapter==='Kavita') {
        L.push('Kavita Stage Diagnostic (latest 5 pages)');
        for (const e of kavitaStageDiagnostic.slice(-5)) {
          const size=e.key?.split('|').slice(-2).join(' ') || 'no key';
          L.push(`${e.time} ${e.page} ${e.reason} [${e.owner}]${e.process?` -> ${e.process}`:''}`);
          if(e.earlier.length) L.push(` earlier ${e.earlier.join(' / ')}`);
          L.push(` key ${size} | decoded ${e.decoded?'yes':'no'} warming ${e.warming?'yes':'no'} | item ${e.nw}x${e.nh} ${(e.bytes/1e6).toFixed(1)}MB | state ${e.stateExists?'yes':'no'} busy ${e.busy?'yes':'no'} cache ${e.stateCache?'yes':'no'} orig ${diagnosticPage(e.stateOriginal)}`);
        }
      }
      L.push(`Renderer ${quality} | Adapter ${adapter} | Page ${page}`);
      L.push(`Source ${st?.nw || 0}x${st?.nh || 0} | Target ${output}`);
      L.push(`Cache ${(totalCacheBytes()/1e6).toFixed(1)} MB | History ${historyPageCount()} pages | Hits ${kavitaHistoryHits}`);
      L.push(`Queue visible ${running+queue.length} | prefetch ${Number(kavitaJob)+Number(komgaJob)+Number(webtoonJob)}`);
      L.push(context.layout==='webtoon' ? `Back ${back.ready}/${back.positions} images` :
        `Back ${Math.min(back.ready,CFG.prefetchPrevious)}/${CFG.prefetchPrevious} images${adapter==='Komga'?` (${back.positions} known images)`:''}`);
      for (const e of snapshot.filter(e=>e.offset<0))
        L.push(` ${e.offset}${adapter==='Komga' && context.layout!=='webtoon'?' slide':''} ${e.status}${e.owner?` [${e.owner}${adapter==='Kavita' && e.owner==='History'?`, ${historyLRU.get(e.key)?.decoded?'decoded':historyLRU.get(e.key)?.warming?'warming':'blob'}`:''}]`:''}${adapter==='Komga'?` | ${e.ready}/${e.total} images ready`:''}`);
      L.push(`Current 0 ${st?.status || 'WAITING'}`);
      L.push(context.layout==='webtoon' ? `Ahead ${ahead.ready}/${ahead.positions} images` :
        `Ahead ${Math.min(ahead.ready,CFG.prefetchNext)}/${CFG.prefetchNext} images${adapter==='Komga'?` (${ahead.positions} known images)`:''}`);
      for (const e of snapshot.filter(e=>e.offset>0))
        L.push(` +${e.offset}${adapter==='Komga' && context.layout!=='webtoon'?' slide':''} ${e.status}${e.owner?` [${e.owner}${adapter==='Kavita' && e.owner==='History'?`, ${historyLRU.get(e.key)?.decoded?'decoded':historyLRU.get(e.key)?.warming?'warming':'blob'}`:''}]`:''}${adapter==='Komga'?` | ${e.ready}/${e.total} images ready`:''}`);
      if(adapter==='Kavita')L.push(kavitaApiPlan(img)?`Kavita chapter info: near decoded ${CFG.prefetchNext}/${CFG.prefetchPrevious}; far forward Blob only`:'Kavita chapter info/layout unavailable: existing fallback');
      if(adapter==='Komga' && context.layout!=='webtoon')
        {const meta=KomgaPages.peek(st?.origUrl);L.push(komgaApiPlan(img)?`Komga page list: near decoded ${CFG.prefetchNext}/${CFG.prefetchPrevious}; far forward Blob only`:`Komga DOM fallback: ${meta?.error|| (meta?.pending?'page list loading':meta?.pages?'source/layout unavailable':'page URL not recognized')}`);if(meta?.pages)L.push(`Komga metadata: ${meta.pages.length} images; ${meta.pages.filter(p=>!(p.width>0&&p.height>0)).length} dimensions pending`);}
    }

    const hudText=L.join('\n');
    if(hud.textContent!==hudText) hud.textContent=hudText;
  }

  /* ================================================================== */

  async function reanalyzeCurrent(stage,filterId){
    if(!platform.settings.developerMode||!enabled||!['pre','post'].includes(stage)||platform.settings.filters?.[stage]!==filterId||!globalThis.__KKGR_PROCESSING__)throw Error('DIAGNOSTIC_PROCESSING_UNAVAILABLE');
    const split=KavitaSplit.info();
    if(split&&KavitaSplit.visibleCanvas())await KavitaSplit.refresh(stage);
    else{const img=hudTarget();if(!img)throw Error('CURRENT_IMAGE_UNAVAILABLE');const s=state.get(img),epoch=rendererEpoch,source=s?.origUrl,deadline=performance.now()+120000;while(s?.busy){if(hudTarget()!==img||s.origUrl!==source||rendererEpoch!==epoch||!enabled)throw Object.assign(Error('ANALYSIS_CANCELLED'),{code:'ANALYSIS_CANCELLED'});if(performance.now()>deadline)throw Error('IMAGE_PROCESSING_BUSY');await new Promise(r=>setTimeout(r,25));}if(hudTarget()!==img||!s||!eligible(s)||rendererEpoch!==epoch||!enabled)throw Error('CURRENT_IMAGE_UNAVAILABLE');await processImage(img,{stage});}
    updateHud();const diagnostics=globalThis.__KKGR_DIAGNOSTICS__?.snapshot();if(!diagnostics?.currentJobId)throw Error('CURRENT_DIAGNOSTIC_UNAVAILABLE');return diagnostics;
  }

  // Extension lifecycle adapter. Renderer/cache algorithms remain in the Stable Core.
  globalThis.__KKGR_CORE__ = Object.freeze({
    ids: () => RendererRegistry.ids(),
    get processingEpoch(){return rendererEpoch;},
    syncFilters(){rendererEpoch++;clearKavitaAhead();clearKomgaAhead();invalidateAll();activePanel?.refresh();syncPowerCompanion();},
    syncRenderers(providers,catalog) {
      const wanted=new Set(catalog.map(x=>x.id));let changed=false;
      for(const id of RendererRegistry.ids())if(!wanted.has(id)&&RendererRegistry.remove(id)){rendererVersions.set(id,(rendererVersions.get(id)||0)+1);changed=true;}
      for(const provider of providers)if(wanted.has(provider.id)&&!RendererRegistry.get(provider.id)){RendererRegistry.register(provider);rendererVersions.set(provider.id,(rendererVersions.get(provider.id)||0)+1);changed=true;}
      if(changed){rendererEpoch++;clearKavitaAhead();clearKomgaAhead();if(!RendererRegistry.get(quality)&&quality!=='browser'){quality='browser';platform.settings.renderer='browser';}invalidateAll();}
      activePanel?.refresh();syncPowerCompanion();return RendererRegistry.ids();
    },
    uiSnapshot:panelSnapshot,reanalyze:reanalyzeCurrent,outputWarning,
    status: () => ({site: readerContext()?.adapter?.toUpperCase() || 'IDLE',
      renderer: quality, hud: hudVisible, memory: window.__crispImages?.memory(), pipeline:globalThis.__KKGR_GPU_LAST_JOB__||null}),
    apply(config) {
      suspended = false;
      KavitaSplit.resume();
      applyingConfig = true;
      try {
        const nextFilterSignature=JSON.stringify([config.processingMode||'worker',config.outputFormat||'png',config.processingTimeoutMs,config.processingRetryRevision,config.filters||platform.settings.filters||{},globalThis.__KKGR_PARAMETERS__?.selected(config,config.filterCatalog||platform.settings.filterCatalog||[])||{}]);
        const filterChanged=appliedFilterSignature!==nextFilterSignature;
        appliedFilterSignature=nextFilterSignature;
        if(['worker','speed'].includes(config.processingMode))platform.settings.processingMode=config.processingMode;
        if(['png','jpeg'].includes(config.outputFormat))platform.settings.outputFormat=config.outputFormat;
        const oldCachePolicy=JSON.stringify([CFG.blobBudget,CFG.prefetchNext,CFG.prefetchPrevious]);
        if(config.blobBudgets)platform.settings.blobBudgets={...config.blobBudgets};
        for(const key of ['decodedForward','decodedBack'])if([2,4,8].includes(config[key]))platform.settings[key]=config[key];
        CFG.blobBudget=([64,128,256].includes(platform.settings.blobBudgets?.[platform.settings.outputFormat||'png'])?platform.settings.blobBudgets[platform.settings.outputFormat||'png']:(platform.settings.outputFormat==='jpeg'?64:128))*1e6;
        CFG.prefetchNext=platform.settings.decodedForward||4;CFG.prefetchPrevious=platform.settings.decodedBack||4;
        const cachePolicyChanged=oldCachePolicy!==JSON.stringify([CFG.blobBudget,CFG.prefetchNext,CFG.prefetchPrevious]);
        if(config.filters)platform.settings.filters=config.filters;
        if(config.filterParameters)platform.settings.filterParameters=config.filterParameters;
        if(config.filterCandidates)platform.settings.filterCandidates=config.filterCandidates;
        if(filterChanged){globalThis.__KKGR_PROCESSING__?.retry();rendererEpoch++;clearKavitaAhead();clearKomgaAhead();invalidateAll();}
        if(config.quick) platform.settings.quick=config.quick;
        if(['左上','右上','左下','右下'].includes(config.hudPosition))platform.settings.hudPosition=config.hudPosition;
        if(Array.isArray(config.rendererOrder))platform.settings.rendererOrder=config.rendererOrder;
        if(Array.isArray(config.disabledRenderers)) disabledRenderers=new Set(config.disabledRenderers);
        for(const key of ['developerMode','diagnosticRecording','diagnosticClearRevision'])if(config[key]!==undefined)platform.settings[key]=config[key];globalThis.__KKGR_DIAGNOSTICS__?.configure(platform.settings);if(['normal','details'].includes(config.hudMode))detailsVisible=!!platform.settings.developerMode&&config.hudMode==='details';if(!platform.settings.developerMode)detailsVisible=false;
        if (typeof config.hud === 'boolean' && config.hud !== hudVisible) toggleHud();
        if (rendererChoices().includes(config.renderer) && config.renderer !== quality) {
          quality = config.renderer;
          clearKavitaAhead(); clearKomgaAhead(); invalidateAll();
        }
        if (config.enabled !== enabled) toggleEnabled();
        else schedule();
        if(cachePolicyChanged){kavitaGeneration++;komgaGeneration++;kavitaApiController?.abort();komgaApiController?.abort();kavitaApiPlanCache=null;komgaApiPlanCache=null;kavitaApiIdentity='';komgaWindowIdentity=null;kavitaAttempts.clear();komgaAttempts.clear();trimCacheBudget();const current=hudTarget();if(current){queueKavitaApi(current);const plan=komgaApiPlan(current);if(plan)queueKomgaApi(current,plan);else if(state.get(current)?.nw)queueKomgaAhead(current,targetSize(current,state.get(current).nw,state.get(current).nh));}updateHud();}
        activePanel?.refresh();
        syncPowerCompanion();
      } finally { applyingConfig = false; }
    },
    stop() {
      suspended = true;
      KavitaSplit.stop();
      enabled = false;
      clearKavitaAhead(); clearKomgaAhead();
      // History owns these URLs; current display URLs are restored before dropCache.
      for (const item of historyLRU.values()) releaseProcessedURL(item.url);
      historyLRU.clear(); historyBytes = 0;
      closeTouchMenu(); closeSettings(); removePowerCompanion();
      invalidateAll();
      // Busy image jobs restore in finally, without revoking a live display URL.
    },
  });

  // Debug handle, for when something looks wrong and the overlay is not enough.
  // In DevTools:
  //   __crispImages.report()                 - every tracked image and its status
  //   __crispImages.memory()                 - what the resample cache is holding
  //   __crispImages.process(document.images[0])
  //   __crispImages.trace = true            - per-stage timings, for "why is it slow"
  window.__crispImages = {
    sweep, invalidateAll,
    komgaCacheState:()=>{const img=hudTarget(),plan=img&&komgaApiPlan(img);return {api:!!plan,farEnabled:siteFullscreen(),sizeStable:!!farPolicies.Komga&&performance.now()>=farPolicies.Komga.stableAt,job:komgaJob,timer:!!komgaApiTimer,visiblePending:RenderQueue.visiblePending(),attempts:komgaAttempts.size,error:komgaApiError,pageList:(()=>{const r=img&&KomgaPages.peek(state.get(img)?.origUrl||komgaSourceInfo(img).sourceUrl);return r?{pending:r.pending,error:r.error,count:r.pages?.length||0,missingDimensions:r.pages?.filter(p=>!(p.width>0&&p.height>0)).length||0}:null;})(),identityMatch:plan?.signature===komgaWindowIdentity,near:plan?.near.map(e=>({page:e.page.number,offset:e.offset,decoded:e.key?completedResult(e.key).decoded:false,blob:e.key?!!completedResult(e.key).url:false}))||[],farBlobs:plan?.far.filter(e=>completedOwner(e.key)).length||0,farDecoded:plan?.far.filter(e=>completedResult(e.key).decoded).length||0};},
    kavitaCacheState:()=>{const plan=kavitaApiPlan(),meta=kavitaPlanSource&&KavitaPages?.peek(kavitaPlanSource);return {api:!!plan,farEnabled:siteFullscreen(),sizeStable:!!farPolicies.Kavita&&performance.now()>=farPolicies.Kavita.stableAt,reason:kavitaPlanReason,metadata:meta?{pending:meta.pending,error:meta.error,pages:meta.pages?.length||0,pairs:Object.keys(meta.pairs||{}).length}:null,identityMatch:plan?.signature===kavitaApiIdentity,layout:plan?.layout,job:kavitaJob,timer:!!kavitaApiTimer,error:kavitaApiError,visiblePending:RenderQueue.visiblePending(),near:plan?.near.map(e=>({page:e.page.number,part:e.part,offset:e.offset,decoded:e.key?!!kavitaApiResult(e.key).decoded:false,blob:e.key?!!kavitaApiResult(e.key).url:false}))||[],farBlobs:plan?.far.filter(e=>kavitaApiResult(e.key).url).length||0,farDecoded:plan?.far.filter(e=>kavitaApiResult(e.key).decoded).length||0};},
    pipelineDiagnostics:()=>globalThis.__KKGR_GPU_LAST_JOB__||null,
    splitDiagnostics:()=>KavitaSplit.diagnostics(),
    kavitaStageDiagnostic: () => kavitaStageDiagnostic.map(({img,...entry})=>({...entry})),
    process: (img) => processImage(img || document.images[0]),
    memory: () => ({ blobs: blobs.size, history: historyLRU.size,
                     aheadKavita: kavitaAhead.size, aheadKomga: komgaAhead.size,
                     mb: +(totalCacheBytes() / 1e6).toFixed(2),
                     budgetMb: CFG.blobBudget / 1e6 }),
    state: (img) => state.get(img || document.images[0]),
    report: () => [...document.images].map((img) => {
      const s = state.get(img);
      return s ? {
        id: s.id, src: s.origUrl.slice(0, 60), natural: `${s.nw}x${s.nh}`,
        origin: originKind(s.origUrl),
        output: s.report ? `${s.report.w}x${s.report.h} @${s.report.factor.toFixed(3)}` : '-',
        status: s.status,
      } : { src: (img.currentSrc || img.src).slice(0, 60), status: 'not tracked' };
    }),
    get quality() { return quality; },
    set quality(v) {
      if(!rendererChoices().includes(v)) throw new Error('Unknown renderer');
      quality=v;writeRenderer(quality);
      clearKavitaAhead();clearKomgaAhead();invalidateAll();
    },
    get trace() { return trace; },
    set trace(v) { trace = !!v; },
  };

  // Nothing is worth keeping once the document is on its way out - unless it is
  // only going into the back/forward cache, in which case it can be restored
  // intact and the per-image caches would be left pointing at revoked URLs.
  addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    KavitaSplit.clear();
    clearKavitaAhead();
    clearKomgaAhead();
    for (const item of historyLRU.values()) releaseProcessedURL(item.url);
    historyLRU.clear();
    historyBytes = 0;
    for (const url of blobs.keys()) releaseProcessedURL(url);
    blobs.clear();
    blobBytes = 0;
  });

  addEventListener('resize', invalidateAll);
  window.visualViewport?.addEventListener('resize', invalidateAll);
  addEventListener('load', schedule);
  addEventListener('popstate', schedule);
  addEventListener('hashchange', schedule);
  document.addEventListener('visibilitychange', () => {
    // Coming back to a tab is the moment a timed-out image is most likely to
    // succeed, and it takes a deliberate action to get here, so this cannot spin.
    if (document.visibilityState === 'visible') {
      for (const img of document.images) {
        const st = state.get(img);
        if (st && st.retryable) { st.retryable = false; st.key = null; }
      }
    }
    schedule();
  });
  bindKavitaNativeObserver();
  new MutationObserver(bindKomgaNativeObserver).observe(document.documentElement,
    {attributes:true,attributeFilter:['class']});
  bindKomgaNativeObserver();
  schedule();
})();
