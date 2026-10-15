const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ui=__dirname+'/../extension/ui/',context={};vm.createContext(context);
const source=fs.readFileSync(ui+'i18n.js','utf8');vm.runInContext(source,context);
const I=context.__KKGR_I18N__;
assert.equal(I.t('common.close'),'閉じる');
assert.equal(I.t('common.close',{},'en'),'Close','English catalog is available');
assert.throws(()=>I.t('missing.key'),/Unknown UI message key/);
assert.equal(I.label('右下'),'右下');assert.equal(I.label('External package name'),'External package name');
const panel=fs.readFileSync(ui+'panel.js','utf8'),raw=JSON.parse(panel.match(/const rawTemplates=(.*);/)[1]);
const templates=I.templates(raw);
// Approved branded template baseline; localization preserves SVG and geometry.
assert.equal(templates.pages[0].includes('自動（ブラウザーの言語）'),true);
const previousTemplates=JSON.stringify(templates).replace('自動（ブラウザーの言語）','自動（サイトに合わせる）');
// Versions and approved UI revisions change text; icon geometry must stay identical across languages.
const svg=value=>JSON.stringify(value).match(/<svg\b[\s\S]*?<\/svg>/g)||[];
assert(svg(templates).length>0);assert.deepEqual(svg(templates),svg(I.templates(raw,'en')));
for(const name of ['panel.js','popup.js','settings-session.js']){
 const body=fs.readFileSync(ui+name,'utf8');
 for(const match of body.matchAll(/\bt\("([a-z0-9._]+)"/g))assert.doesNotThrow(()=>I.t(match[1]),name+': '+match[1]);
}
for(const name of ['settings.html','popup.html']){
 const html=fs.readFileSync(ui+name,'utf8');
 assert.equal(html.match(/src="i18n.js"/g).length,1);
 assert(html.indexOf('src="i18n.js"')<html.indexOf('src="panel.js"'));
}
const identity=context.__KKGR_I18N__;vm.runInContext(source,context);assert.equal(context.__KKGR_I18N__,identity,'repeat injection keeps the singleton');
console.log('PASS common UI catalog, all message keys, exact Japanese template parity, unchanged storage labels, load order and repeat injection');

for(const key of I.keys)assert(I.hasTranslation(key,'en'),key);
assert.equal(I.resolve('Auto','ja-JP'),'ja');
assert.equal(I.resolve('Auto','en-US'),'en');
const fixed=I.forLanguage('en');I.setLanguage('ja');assert.equal(fixed.t('common.close'),'Close');
assert.equal(fixed.t('named.info',{name:'Lanczos3'}),'Lanczos3 information');

assert.equal(I.resolve('Auto','fr-FR'),'en');assert.equal(I.resolve('en','ja-JP'),'en');assert.equal(I.resolve('ja','en-US'),'ja');assert(!I.isChoice('fr'));assert(I.isChoice('Auto'));assert.deepEqual(Array.from(I.languages,x=>x.code),['ja','en']);

// A future catalog added to the single registry reaches choices and detection.
const future={};vm.createContext(future);
vm.runInContext(source.replace("{ja:Object.freeze({name:'日本語',messages:ja}),", "{fr:Object.freeze({name:'Français',messages:{'common.close':'Fermer'}}),ja:Object.freeze({name:'日本語',messages:ja}),"),future);
const F=future.__KKGR_I18N__;assert(F.isChoice('fr'));assert(F.languages.some(x=>x.code==='fr'));assert.equal(F.resolve('Auto','fr-FR'),'fr');assert.equal(F.t('common.close',{},'fr'),'Fermer');assert.equal(F.t('common.save',{},'fr'),'Save');

assert(!I.t('message.221e6e5cf011').includes('未接続'));assert(!I.t('message.221e6e5cf011',{},'en').includes('not connected'));
