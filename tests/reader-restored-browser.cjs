// Recovery checks for the native-image fallback; no GPU/cache adapter is supplied.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../extension');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TEST_CHROME||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const layout of ['single','double','manga'])for(const direction of ['ltr','rtl'])for(const full of [false,true]){
   const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://reader.test/**',r=>new URL(r.request().url()).pathname.endsWith('/image')?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="orange"/></svg>'}):r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#222}app-manga-reader,.reading-area{display:block;width:100%;height:700px}.image-container{display:flex;justify-content:center;height:600px}img{width:300px;height:600px}</style><app-manga-reader><div class="reading-area"></div><div class="pagination-area"><div class="left"></div><div class="right"></div></div><button aria-describedby="reading-direction"><i></i></button></app-manga-reader>'}));
   await page.goto('https://reader.test/kavita/manga/1');
   await page.evaluate(({layout,direction})=>{
    document.querySelector('[aria-describedby] i').className=direction==='ltr'?'fa-angle-double-right':'fa-angle-double-left';
    const renderer=document.createElement(layout==='single'?'app-single-renderer':layout==='double'?'app-double-renderer':'app-double-no-cover-renderer');
    renderer.innerHTML='<div class="image-container"></div>';document.querySelector('.reading-area').append(renderer);
    window.showPage=async(n,chapter=1)=>{const container=document.querySelector('.image-container');container.replaceChildren();const images=[];for(let i=0;i<(layout==='single'?1:2);i++){const img=new Image();img.src='/kavita/api/reader/image?chapterId='+chapter+'&page='+(n+i);images.push(img);container.append(img);}await Promise.all(images.map(img=>img.decode()));};
   },{layout,direction});
   if(full)await page.evaluate(()=>document.documentElement.requestFullscreen());
   await page.evaluate(()=>showPage(0));await page.addScriptTag({path:path.join(root,'content/kavita-page-motion.js')});
   await page.evaluate(()=>{window.motion=__KKGR_KAVITA_MOTION__.create();motion.configure(true);});
   await page.waitForFunction(()=>motion.status().reason===null);
   const step=layout==='single'?1:2;
   await page.evaluate(n=>showPage(n),step);await page.waitForFunction(()=>motion.status().starts===1);
   assert.equal(await page.locator('[data-gpuie-motion]').count(),1);
   const geometry=await page.evaluate(()=>{const layer=document.querySelector('[data-gpuie-motion]'),track=layer.firstChild,img=document.querySelector('.image-container img');return {transform:track.style.transform,transition:track.style.transition,nativeTransform:img.style.transform,planes:track.children.length,pictures:layer.querySelectorAll('img').length};});
   assert(geometry.transform.includes(direction==='ltr'?'-1100':'1100'));assert(geometry.transition.includes('300ms'));assert.equal(geometry.nativeTransform,'');assert.equal(geometry.planes,2);assert.equal(geometry.pictures,layout==='single'?2:4);
   await page.waitForFunction(()=>!motion.status().running);
   await page.evaluate(()=>showPage(0));await page.waitForFunction(()=>motion.status().starts===2);
   await page.evaluate(()=>motion.configure(false));assert.equal(await page.locator('[data-gpuie-motion]').count(),0);
   await page.evaluate(n=>showPage(n),step);assert.equal(await page.evaluate(()=>motion.status().starts),2);
   await page.evaluate(()=>motion.configure(true));await page.waitForFunction(()=>motion.status().reason===null);
   await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(n=>showPage(n),step*2);await page.waitForFunction(()=>motion.status().reason==='motion-suppressed');assert.equal(await page.locator('[data-gpuie-motion]').count(),0);
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>motion.status().reason===null);
   await page.evaluate(n=>showPage(n,2),step*2);await page.waitForFunction(()=>document.querySelector('.image-container img').src.includes('chapterId=2'));assert.equal(await page.locator('[data-gpuie-motion]').count(),0,'Chapter changes must not slide');
   await page.evaluate(()=>{document.querySelector('app-manga-reader').remove();});await page.waitForFunction(()=>motion.status().reason==='no-reader');assert.equal(await page.locator('[data-gpuie-motion]').count(),0);
   await page.evaluate(()=>motion.stop());assert.deepEqual(errors,[]);await page.close();
   console.log('PASS native image slide',layout,direction,full?'fullscreen':'normal','ON/OFF, reverse, reduced motion, chapter, leave');
  }
  // Test the actual API with trusted browser clicks; no forced activation in evaluate.
  const p=await browser.newPage();await p.setContent('<button id="enter">Read</button><div id="reader"></div>');
  await p.addScriptTag({path:path.join(root,'content/kavita-fullscreen.js')});
  await p.evaluate(()=>{window.auto=__KKGR_KAVITA_FULLSCREEN__.create();auto.configure(true);document.querySelector('#enter').onclick=()=>document.querySelector('#reader').innerHTML='<app-manga-reader><button><i class="fa-expand-alt"></i></button></app-manga-reader>';});
  await p.click('#enter');await p.waitForFunction(()=>!!document.fullscreenElement);await p.waitForFunction(()=>!!document.querySelector('.fa-compress-alt'));
  await p.evaluate(()=>document.exitFullscreen());await p.waitForFunction(()=>!!document.querySelector('.fa-expand-alt'));
  await p.evaluate(()=>document.querySelector('app-manga-reader').append(document.createElement('span')));assert.equal(await p.evaluate(()=>!!document.fullscreenElement),false);
  await p.evaluate(()=>{auto.configure(false);document.querySelector('#reader').replaceChildren();});await p.click('#enter');assert.equal(await p.evaluate(()=>!!document.fullscreenElement),false);
  await p.evaluate(()=>auto.stop());await p.close();console.log('PASS automatic fullscreen, native icon sync, manual exit, OFF');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
