const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),test=require('node:test');
test('actual popup/settings load translations before both Info and adjustment UI',()=>{
 for(const name of ['popup.html','settings.html']){
 const html=fs.readFileSync(path.join(__dirname,'../extension/ui',name),'utf8');
 const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(x=>x[1]);
 assert(scripts.includes('package-metadata.js'));
 assert(scripts.indexOf('package-metadata.js')<scripts.indexOf('parameter-editor.js'));
 assert(scripts.indexOf('package-metadata.js')<scripts.indexOf('panel.js'));
 }
 const source=fs.readFileSync(path.join(__dirname,'../extension/background/service-worker.js'),'utf8');
 assert(source.includes("world:'MAIN',files:['ui/package-metadata.js','ui/parameter-editor.js'"));
});
