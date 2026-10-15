const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('module translations: required English, locale fallback and label validation',()=>{
 const c={URL,TextEncoder};vm.createContext(c);
 for(const f of ['parameter-schema','package-metadata','analysis-contract','module-contract'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/ui',f+'.js'),'utf8'),c);
 const d={moduleApiVersion:1,executionApiVersion:1,kind:'filter',id:'test.translations',name:'English name',version:'1.0.0',implementationRevision:'1',supportedStages:['pre'],parameters:[{key:'amount',type:'integer',min:0,max:10,step:1,default:1,label:{key:'test.amount',fallback:'Amount'}}],translations:{en:{name:'English name',description:'Description',readme:'Instructions',labels:{'test.amount':'Amount'}},ja:{name:'日本語名',labels:{'test.amount':'強さ'}}}};
 const M=c.__KKGR_PACKAGE_METADATA__,C=c.__KKGR_MODULE_CONTRACT__,n=C.normalize(d);
 assert.equal(M.translated(n,'name','ja-JP'),'日本語名');
 assert.equal(M.translated(n,'readme','ja'),'Instructions');
 assert.equal(M.translated(n,'labels','fr','test.amount'),'Amount');
 assert.throws(()=>C.normalize({...d,translations:{ja:d.translations.ja}}),/English/);
 assert.throws(()=>C.normalize({...d,translations:{en:{...d.translations.en,labels:{}}}}),/English label/);
 assert.throws(()=>M.normalize({translations:{en:{...d.translations.en,unexpected:'x'}}}),/Unknown/);
});
