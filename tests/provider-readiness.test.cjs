const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../extension/content/providers-ready.js','utf8');
const ids=['lohalo','nohalo'],catalog=ids.map(id=>({id})),providers=ids.map(id=>({id,apiVersion:1}));
function run(values){const context=vm.createContext({__KKGR_RENDERER_CATALOG__:catalog,...values});vm.runInContext(source,context);assert.equal(context.__KKGR_DEV4_1_4_READY__,true);return context;}
run({__KKGR_RENDERER_PROVIDERS__:providers});
run({__KKGR_CORE__:{ids:()=>ids}}); // The normal post-consumption state: no pending queue.
const ready=run({__KKGR_CORE__:{ids:()=>ids}});vm.runInContext(source,ready); // Rechecking is idempotent.
assert.throws(()=>run({}),/"source":"pending".*"actual":null/);
assert.throws(()=>run({__KKGR_RENDERER_PROVIDERS__:[providers[0],{id:'nohalo',apiVersion:2}]}),/Provider registration mismatch/);
assert.throws(()=>run({__KKGR_CORE__:{ids:()=>['lohalo']},__KKGR_RENDERER_PROVIDERS__:providers}),/"source":"core"/); // A good queue cannot hide a broken active registry.
assert.throws(()=>run({__KKGR_CORE__:{ids:()=>[...ids,'unexpected']}}),/Provider registration mismatch/);
assert.throws(()=>run({__KKGR_CORE__:{ids:()=>ids},__KKGR_RENDERER_CATALOG__:[catalog[0],catalog[0]]}),/Provider registration mismatch/);
assert.throws(()=>run({__KKGR_CORE__:{},__KKGR_RENDERER_PROVIDERS__:providers}),/"source":"core".*"actual":null/);
console.log('PASS pending API validation, consumed queue, active registry authority, missing/extra/duplicate providers, repeat readiness');
