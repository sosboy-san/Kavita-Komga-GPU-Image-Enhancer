// Verify every catalog entry without touching GPU state.
(() => {
 const entries=globalThis.__KKGR_RENDERER_PROVIDERS__;
 const catalog=globalThis.__KKGR_RENDERER_CATALOG__;
 if(!Array.isArray(entries)||!Array.isArray(catalog)||entries.length!==catalog.length||
 catalog.some(e=>entries.filter(p=>p.id===e.id&&p.apiVersion===1).length!==1))throw Error('Provider registration mismatch: '+JSON.stringify({expected:Array.isArray(catalog)?catalog.map(e=>e?.id):null,actual:Array.isArray(entries)?entries.map(p=>p?.id):null}));
 Object.defineProperty(globalThis,'__KKGR_DEV4_1_4_READY__',{value:true,configurable:false});
 Object.defineProperty(globalThis,'__KKGR_DEV4_MODULES_READY__',{value:true,configurable:false});
 Object.defineProperty(globalThis,'__KKGR_E3_PROVIDERS_READY__',{value:true,configurable:false});
})();
