// Verify the authoritative registry without touching GPU state. Core consumes the
// pending queue; once it exists, a missing queue is normal and Core owns the IDs.
(() => {
 const entries=globalThis.__KKGR_RENDERER_PROVIDERS__;
 const catalog=globalThis.__KKGR_RENDERER_CATALOG__;
 const core=globalThis.__KKGR_CORE__;
 const expected=Array.isArray(catalog)?catalog.map(e=>e?.id):null;
 const actual=core?(typeof core.ids==='function'?core.ids():null):(Array.isArray(entries)?entries.map(p=>p?.id):null);
 if(!expected||!Array.isArray(actual)||expected.length!==actual.length||new Set(expected).size!==expected.length||
 expected.some(id=>actual.filter(value=>value===id).length!==1)||(!core&&entries.some(p=>p?.apiVersion!==1)))
 throw Error('Provider registration mismatch: '+JSON.stringify({source:core?'core':'pending',expected,actual}));
 Object.defineProperty(globalThis,'__KKGR_DEV4_1_4_READY__',{value:true,configurable:false});
 Object.defineProperty(globalThis,'__KKGR_DEV4_MODULES_READY__',{value:true,configurable:false});
 Object.defineProperty(globalThis,'__KKGR_E3_PROVIDERS_READY__',{value:true,configurable:false});
})();
