// Read-only host UI adapter. No network requests, host settings writes or processing changes.
(() => {
 'use strict';
 if(globalThis.__KKGR_HOST_DISPLAY__) return;
 let route='', remembered=null, readerRoot=null;
 const HOLD_MS=600;
 const now=()=>globalThis.performance?.now?.() ?? Date.now();
 function activeContainer(root,selector){
  const container=root.querySelector(selector);
  if(!container) return false;
  // Inspect host containers, never the IMG hidden/replaced by GPU Image Enhancer.
  for(let el=container;el && el!==root;el=el.parentElement){
   if(el.hidden || el.classList?.contains('d-none') ||
      globalThis.getComputedStyle?.(el)?.display==='none') return false;
  }
  return true;
 }
 const labels={
  Kavita:{ja:{single:'単ページ',double:'見開き',manga:'見開き (マンガ)',horizontal:'水平',vertical:'垂直',webtoon:'ウェブトゥーン'},en:{single:'Single',double:'Double',manga:'Double (Manga)',horizontal:'Horizontal',vertical:'Vertical',webtoon:'Webtoon'}},
  Komga:{ja:{single:'単ページ',double:'見開き',noCover:'見開き (カバーなし)',rtl:'右から左',ltr:'左から右',vertical:'縦',webtoon:'Webtoon'},en:{single:'Single page',double:'Double pages',noCover:'Double pages (no cover)',rtl:'Right to left',ltr:'Left to right',vertical:'Vertical',webtoon:'Webtoon'}}
 };
 const layoutKomga=v=>({'bookreader.paged_reader_layout.single':'single','bookreader.paged_reader_layout.double':'double','bookreader.paged_reader_layout.double_no_cover':'noCover'})[v]||null;
 const directionKomga=v=>({RIGHT_TO_LEFT:'rtl',LEFT_TO_RIGHT:'ltr',VERTICAL:'vertical',WEBTOON:'webtoon'})[v]||null;
 function normalize(site,layout,navigation,language,source){
  const lang=String(language||'en').toLowerCase().split('-')[0];
  const t=labels[site]?.[lang]||labels[site]?.en||{};
  return {layout,navigation,locale:lang,source,mode:navigation==='webtoon'?'webtoon':null,
   label:navigation==='webtoon'?t.webtoon:[t[layout],t[navigation]].filter(Boolean).join(' · ')};
 }
 function kavitaLanguage(){
  const valid=value=>typeof value==='string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.trim())?value.trim():null;
  try{
   const saved=valid(globalThis.localStorage?.getItem('kavita-locale'));
   if(saved) return {language:saved,source:'kavita-locale'};
   const user=globalThis.localStorage?.getItem('kavita-user');
   const preference=user?valid(JSON.parse(user)?.preferences?.locale):null;
   if(preference) return {language:preference,source:'user preferences locale'};
  }catch(_){ /* Storage unavailable or malformed: continue with UI/browser fallback. */ }
  return null;
 }
 function read(site){
  const current=location.pathname+location.search;
  if(route!==current){route=current;remembered=null;}
  let language=document.documentElement?.lang||navigator.language, layout=null,navigation=null,source='unavailable';
  if(site==='Kavita'){
   const root=document.querySelector('app-manga-reader');
   if(!root){remembered=null;readerRoot=null;return normalize(site,null,null,language,source);}
   if(readerRoot!==root){readerRoot=root;remembered=null;}
   const hostLanguage=kavitaLanguage();
   let languageSource=hostLanguage?.source||'document/browser fallback';
   if(hostLanguage) language=hostLanguage.language;
   const select=root.querySelector('#layout-mode');
   if(select?.selectedOptions?.[0]?.textContent){const label=select.selectedOptions[0].textContent;const observed=/[\u3040-\u30ff\u3400-\u9fff]/.test(label)?'ja':/^(Single|Double)/.test(label.trim())?'en':null;if(observed){language=observed;languageSource='live translated layout control';}}
   else if(!hostLanguage && remembered?.language){language=remembered.language;languageSource='last observed UI language';}
   const selectedLayout=select?({1:'single',2:'double',3:'manga'})[Number(select.value)]||null:null;
   const candidates=[];
   for(const [selector,value] of [
    ['app-single-renderer .image-container','single'],
    ['app-double-renderer .image-container','double'],
    ['app-double-reverse-renderer .image-container, app-double-no-cover-renderer .image-container','manga']])
    if(activeContainer(root,selector)) candidates.push(value);
   const splitSurface=activeContainer(root,'app-canvas-renderer .image-container');
   if(root.querySelector('.webtoon-images')) navigation='webtoon';
   else if(root.querySelector('.pagination-area .top')) navigation='vertical';
   else if(root.querySelector('.pagination-area .left')) navigation='horizontal';
   if(navigation==='webtoon'){layout=null;source='live Webtoon DOM';}
   else if(candidates.length===1){layout=candidates[0];source='live renderer DOM';}
   else if(candidates.length===0 && splitSurface){layout='single';source='live split canvas container';}
   else if(candidates.length===0 && selectedLayout){layout=selectedLayout;source='live layout control fallback';}
   else source=candidates.length>1?'ambiguous renderer DOM':'unavailable';
   const timestamp=now();
   if(layout || navigation==='webtoon') remembered={layout,navigation,language,time:timestamp};
   else if(remembered && timestamp-remembered.time<HOLD_MS &&
           (!navigation || navigation===remembered.navigation)){
    layout=remembered.layout;navigation=navigation||remembered.navigation;source='transition hold';
   }
   const result=normalize(site,layout,navigation,language,source);
   result.localeSource=languageSource;
   result.selectedLayout=selectedLayout;
   result.layoutMismatch=!!selectedLayout && !!layout && selectedLayout!==layout;
   return result;
  }
  if(site==='Komga'){
   // Vue 2 exposes the live reader component on its DOM ancestors in production.
   const image=document.querySelector('.v-carousel img, .continuous-reader img, img');
   for(let el=image;el;el=el.parentElement){
    for(let vm=el.__vue__,i=0;vm&&i<12;vm=vm.$parent,i++){
     const direction=directionKomga(vm.readingDirection), candidate=layoutKomga(vm.pageLayout);
     if(direction && (candidate||vm.continuousReader===true)){
      layout=candidate;navigation=direction;language=vm.$i18n?.locale||language;source='live Vue reader';
      return normalize(site,layout,navigation,language,source);
     }
    }
   }
   // Stored preferences are diagnostics only: metadata may override the live reader.
  }
  return normalize(site,layout,navigation,language,source);
 }
 Object.defineProperty(globalThis,'__KKGR_HOST_DISPLAY__',{value:Object.freeze({read,normalize}),configurable:false});
})();
