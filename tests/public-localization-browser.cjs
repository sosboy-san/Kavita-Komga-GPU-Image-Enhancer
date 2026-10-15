const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch({executablePath:process.env.TEST_CHROME});try{
for(const touch of [false,true])for(const language of ['ja','en']){
 const p=await b.newPage({viewport:{width:touch?390:1100,height:touch?844:900},isMobile:touch,hasTouch:touch});
 for(const f of [...fs.readFileSync(path.join(root,'extension/ui/settings.html'),'utf8').matchAll(/<script src="([^"]+)"/g)].map(x=>'ui/'+x[1]).filter(x=>['ui/package-metadata.js','ui/parameter-schema.js','ui/i18n.js','ui/parameter-editor.js'].includes(x)))await p.addScriptTag({content:fs.readFileSync(path.join(root,'extension',f),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'reference-packages/Paper-Restoration-1.0.0.txt'),'utf8')});
 await p.evaluate(language=>{const entry=__KKGR_MODULES__[0],host=document.createElement('div');document.body.append(host);const shadow=host.attachShadow({mode:'open'});__KKGR_PARAMETER_EDITOR__.open(shadow,entry,'pre',{},async()=>{},__KKGR_I18N__.forLanguage(language));},language);
 const text=await p.locator('dialog').innerText();
 assert(text.includes(language==='ja'?'紙色の決定方法':'Paper color mode'));
 assert(text.includes(language==='ja'?'鮮やかな色の保護':'Vivid color protection'));
 if(language==='en')assert(!/[ぁ-んァ-ン一-龯]/.test(text),'Japanese remains in English editor');
 console.log('PASS '+(touch?'touch':'desktop')+' '+language+' public filter editor');await p.close();
}}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
