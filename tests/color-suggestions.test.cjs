const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../extension'),c={TextEncoder,console};vm.createContext(c);
for(const f of ['ui/parameter-schema.js','ui/package-metadata.js','ui/analysis-contract.js','ui/module-contract.js','ui/developer-diagnostics.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);
vm.runInContext(`
const P=__KKGR_PARAMETERS__,M=__KKGR_MODULE_CONTRACT__;
const parameter={key:'paper',type:'color',label:{key:'paper',fallback:'Paper'},default:'#FFFFFF',suggestions:{items:[{value:'#d9c58e',label:{key:'warm',fallback:'Warm'}}],analysisPath:'data.colors',maxItems:4}};
const descriptor={moduleApiVersion:1,executionApiVersion:1,kind:'filter',id:'sample',name:'Sample',version:'1.0.0',implementationRevision:'a',supportedStages:['pre'],requiresFeatures:['color-suggestions'],parameters:[parameter],analysis:{revision:'a',backend:'cpu',target:'original',parameterKeys:[],sample:{regions:[{rect:[0,0,1,1],method:'nearest',width:2,height:2}]},resultSchema:{type:'object',properties:{colors:{type:'array',maxItems:8,items:{type:'string',maxLength:7}}}}},create(){}};
globalThis.fixture=descriptor;globalThis.metadata=M.validate(descriptor);globalThis.colors=P.candidates(P.schema([parameter])[0],{data:{colors:['#D9C58E','bad','#000000','#FFFFFF','#123456','#654321']}});
`,c);
assert.deepEqual(JSON.parse(JSON.stringify(c.colors)).map(x=>x.value),['#D9C58E','#000000','#FFFFFF','#123456']);
assert.throws(()=>vm.runInContext('M.validate({...descriptor,requiresFeatures:[]})',c),/require/);
assert.throws(()=>vm.runInContext("M.validate({...descriptor,requiresFeatures:['unknown']})",c),/Unsupported/);
assert.throws(()=>vm.runInContext("M.validate({...descriptor,parameters:[{...parameter,suggestions:{analysisPath:'data.missing'}}]})",c),/declared/);
assert.throws(()=>vm.runInContext("P.schema([{...parameter,suggestions:{analysisPath:'data.constructor'}}])",c),/path/);
assert.throws(()=>vm.runInContext("P.schema([{...parameter,suggestions:{items:[],maxItems:9}}])",c),/limit/);
vm.runInContext(`
globalThis.__KKGR_CORE__={processingEpoch:5};
const D=__KKGR_DIAGNOSTICS__;D.configure({developerMode:false});const blob={};
D.bindBlob(blob,null,{pre:{settingsRevision:5,module:{id:'sample'},items:{paper:[{value:'#FFFFFF'}]}}});D.bindURL('blob:current',blob);D.select('source','blob:current',true);
globalThis.initial=D.snapshot();
for(let i=0;i<300;i++){const b={};D.bindBlob(b,null,{pre:{settingsRevision:5,items:{paper:[{value:'#000000'}]}}});D.bindURL('blob:prefetch-'+i,b);}
globalThis.after=D.snapshot();__KKGR_CORE__.processingEpoch=6;globalThis.stale=D.snapshot();D.select('other','blob:missing',true);globalThis.missing=D.snapshot();
`,c);
assert.equal(c.initial.developerMode,false);assert.equal(c.initial.colorSuggestions.pre.items.paper[0].value,'#FFFFFF');assert.equal(c.after.colorSuggestions.pre.items.paper[0].value,'#FFFFFF');assert.equal(Object.keys(c.stale.colorSuggestions).length,0);assert.equal(Object.keys(c.missing.colorSuggestions).length,0);
// The submitted filter works unchanged. Palette variant changes declarations only.
for(const filename of ['Monochrome-Line-Color-Filter-1.2.0.txt','Monochrome-Line-Color-Filter-1.2.1.txt']){
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../tests/fixtures/modules',filename),'utf8'),c);assert.equal(c.__KKGR_MODULE_CONTRACT__.validate(c.__KKGR_MODULES__.at(-1)).moduleApiVersion,1);
}
vm.runInContext(`
const params=P.values(metadata.parameters);
globalThis.__KKGR_PLATFORM__={settings:{filters:{pre:'sample'},filterCatalog:[metadata],filterParameters:{pre:{sample:params}}}};
const reused={};D.bindBlob(reused,null,{pre:{settingsRevision:5,module:{id:'sample',version:'1.0.0',implementationRevision:'a'},parameters:params,items:{paper:[{value:'#D9C58E'}]}}});D.bindURL('blob:reused',reused);D.select('source','blob:reused',true);
globalThis.restoredAfterEpoch=D.snapshot();
__KKGR_PLATFORM__.settings.filters.pre=null;globalThis.off=D.snapshot();
__KKGR_CORE__.processingEpoch++;__KKGR_PLATFORM__.settings.filters.pre='sample';globalThis.on=D.snapshot();
__KKGR_PLATFORM__.settings.filterParameters.pre.sample={paper:'#000000'};globalThis.changedValue=D.snapshot();
__KKGR_PLATFORM__.settings.filterParameters.pre.sample=params;__KKGR_PLATFORM__.settings.filterCatalog=[{...metadata,implementationRevision:'new'}];globalThis.changedModule=D.snapshot();
`,c);
assert.equal(c.restoredAfterEpoch.colorSuggestions.pre.items.paper[0].value,'#D9C58E');
assert.equal(Object.keys(c.off.colorSuggestions).length,0);
assert.equal(c.on.colorSuggestions.pre.items.paper[0].value,'#D9C58E');
assert.equal(Object.keys(c.changedValue.colorSuggestions).length,0);
assert.equal(Object.keys(c.changedModule.colorSuggestions).length,0);
vm.runInContext(`
__KKGR_PLATFORM__.settings.filterCatalog=[metadata];
const earlier={};D.bindBlob(earlier,null,{pre:{settingsRevision:1,module:{id:'sample',version:'1.0.0',implementationRevision:'a'},parameters:params,items:{paper:[{value:'#D9C58E'}]}}});D.bindURL('blob:earlier-filter',earlier);
for(let i=0;i<300;i++){const b={};D.bindBlob(b,null,{pre:{settingsRevision:1,module:{id:'other'},items:{paper:[{value:'#000000'}]}}});D.bindURL('blob:rotation-prefetch-'+i,b);}
D.select('source','blob:earlier-filter',true);globalThis.earlierAfterPrefetch=D.snapshot();
D.releaseURL('blob:earlier-filter');globalThis.releasedCandidates=D.snapshot();
for(let i=0;i<300;i++)D.releaseURL('blob:rotation-prefetch-'+i);
`,c);
assert.equal(c.earlierAfterPrefetch.colorSuggestions.pre.items.paper[0].value,'#D9C58E');
assert.equal(Object.keys(c.releasedCandidates.colorSuggestions).length,0);
console.log('PASS API 1.1 contract, current pinning, OFF/ON cached restoration across processing epochs, changed values/module rejection');
