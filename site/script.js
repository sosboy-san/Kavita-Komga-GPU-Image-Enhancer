'use strict';
// No network requests other than same-directory assets. No analytics or storage.
const html=document.documentElement;
html.classList.add('js');
let language=(navigator.language||'en').toLowerCase().startsWith('ja')?'ja':'en';
function applyLanguage(next){
 language=next==='ja'?'ja':'en';html.dataset.language=language;html.lang=language;
 document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===language)));
 document.querySelectorAll('.readme-link').forEach(a=>a.href=`https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer/blob/main/README.${language}.md`);
 document.querySelectorAll('.comparison').forEach(c=>{
  c.querySelector('.before').alt=language==='ja'?'補正前・比較基準の実画像':'Actual image before processing / reference';
  c.querySelector('.after').alt=language==='ja'?'同一原画像の実際の処理結果':'Actual processing result from the same original image';
 });
 document.title='Kavita & Komga GPU Image Enhancer';
}
document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>applyLanguage(b.dataset.lang)));
applyLanguage(language);
const readyImage=img=>new Promise((resolve,reject)=>{
 if(img.complete){img.naturalWidth?resolve():reject(new Error('image'));return;}
 img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true});
});
for(const card of document.querySelectorAll('.comparison')){
 const before=card.querySelector('.before'),after=card.querySelector('.after');
 const select=card.querySelector('.variant'),empty=card.querySelector('.empty'),error=card.querySelector('.error');
 const enhancement=card.querySelector('.enhancement'),canvas=card.querySelector('.canvas'),viewer=card.querySelector('.viewer');
 const base=card.querySelector('.view-before'),result=card.querySelector('.view-after'),slider=card.querySelector('.reveal');
 let mode='actual',width=0,height=0,revision=0;
 if(select)select.disabled=!after.dataset.lohalo||!after.dataset.nohalo;
 function message(ja,en){error.hidden=false;error.replaceChildren();for(const [l,t] of [['ja',ja],['en',en]]){const s=document.createElement('span');s.className=l;s.lang=l;s.textContent=t;error.append(s);}}
 function size(){if(!width)return;const dpr=window.devicePixelRatio||1;const w=mode==='actual'?width/dpr:Math.min(viewer.clientWidth,width/dpr);canvas.style.width=w+'px';canvas.style.height=(w*height/width)+'px';}
 async function initialize(){
  const r=++revision;enhancement.hidden=true;card.classList.remove('enhanced');error.hidden=true;
  const bsrc=before.getAttribute('src'),asrc=after.getAttribute('src');
  if(!bsrc||!asrc){card.classList.remove('ready');empty.hidden=false;return;}
  card.classList.add('ready');empty.hidden=true;
  const links=card.querySelector('.asset-links');links.hidden=false;
  card.querySelector('.before-link').href=bsrc;card.querySelector('.after-link').href=asrc;
  const original=card.dataset.original;card.querySelector('.original-link').hidden=!original;
  if(original)card.querySelector('.original-link').href=original;
  try{
   await Promise.all([readyImage(before),readyImage(after)]);if(r!==revision)return;
   if(before.naturalWidth!==after.naturalWidth||before.naturalHeight!==after.naturalHeight){message('比較画像の寸法が一致しません。個別画像で確認してください。','Image dimensions do not match. View the individual images instead.');return;}
   width=before.naturalWidth;height=before.naturalHeight;base.src=bsrc;result.src=asrc;
   await Promise.all([readyImage(base),readyImage(result)]);if(r!==revision)return;
   enhancement.hidden=false;card.classList.add('enhanced');size();
  }catch(e){if(r!==revision)return;message('画像を読み込めませんでした。掲載ファイルを確認してください。','An image could not be loaded. Check the supplied files.');card.classList.remove('enhanced');}
 }
 const controls=card.querySelector('.compare-controls');
 for(const [value,ja,en] of [['100','比較基準のみ','Reference only'],['0','処理結果のみ','Processed only']]){
  const b=document.createElement('button');b.type='button';b.className='whole-view';
  for(const [lang,label] of [['ja',ja],['en',en]]){const s=document.createElement('span');s.className=lang;s.lang=lang;s.textContent=label;b.append(s);}
  b.addEventListener('click',()=>{slider.value=value;canvas.style.setProperty('--split',value+'%');});controls.append(b);
 }
 slider.addEventListener('input',()=>canvas.style.setProperty('--split',slider.value+'%'));
 card.querySelector('.actual').addEventListener('click',()=>{mode='actual';size();});
 card.querySelector('.fit').addEventListener('click',()=>{mode='fit';size();});
 if(select)select.addEventListener('change',()=>{after.src=select.value==='NoHalo Jr.'?after.dataset.nohalo:after.dataset.lohalo;initialize();});
 window.addEventListener('resize',size);initialize();
}
