const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:process.env.TEST_CHROME});try{
 const p=await b.newPage();await p.route('https://icons.test/**',route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(__dirname,'../extension',new URL(route.request().url()).pathname))}));
 const source=fs.readFileSync(path.join(__dirname,'../extension/background/service-worker.js'),'utf8');
 await p.evaluate(source=>{globalThis.chrome={runtime:{getURL:path=>'https://icons.test/'+path}};eval(source.slice(source.indexOf('const actionPaintSequence'),source.indexOf('async function paint'))+';globalThis.getIcons=actionImageData;');},source);
 for(const state of ['unregistered','registered-off','registered-on']){const result=await p.evaluate(async state=>{const icons=await getIcons(state),d=icons[32].data;let green=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&d[i+1]>d[i]+40&&d[i+1]>d[i+2]+40)green++;return {sizes:Object.keys(icons),green};},state);assert.equal(result.sizes.length,4);assert.equal(result.green>0,state==='registered-on');}
 console.log('PASS real PNG fetch/bitmap/ImageData path and green ON distinction at 32px');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
