const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'examples/Brightness-Filter-1.0.0.js'), 'utf8');

function metadata(code) {
  const context = {URL};
  vm.createContext(context);
  for (const name of ['parameter-schema', 'package-metadata', 'module-contract']) {
    vm.runInContext(fs.readFileSync(path.join(root, `extension/ui/${name}.js`), 'utf8'), context);
  }
  vm.runInContext(code, context);
  assert.equal(context.__KKGR_MODULES__.length, 1);
  return context.__KKGR_MODULE_CONTRACT__.validatePublic(context.__KKGR_MODULES__[0]);
}

(async () => {
  // Exercise the actual service-worker import/update path used by the guide.
  const prefix = fs.readFileSync(path.join(__dirname, 'dev2-sites.test.cjs'), 'utf8').split('(async()=>{')[0];
  const box = {require, __dirname, console, URL, URLSearchParams, TextEncoder, setTimeout, clearTimeout, setImmediate};
  vm.createContext(box);
  vm.runInContext(prefix + ';globalThis.harness=harness', box);
  const h = await box.harness();
  h.tabs.clear();
  h.ctx.chrome.tabs.query = async () => [];
  const first = metadata(source);
  assert.equal(first.translations.ja.labels['example.brightness'], '明るさ');
  assert((await h.send({type: 'ADD_PACKAGE', metadata: first, code: source})).ok);
  assert((await h.send({type: 'ADD_PACKAGE', metadata: first, code: source})).error);
  const saved = await h.send({type: 'SET_FILTER_PARAMETERS', stage: 'post', filterId: first.id, values: {brightness: 0.2}});
  assert(!saved.error, saved.error);

  const edited = source.replace('brightness * 0.5', 'brightness')
    .replace("version: '1.0.0'", "version: '1.0.1'")
    .replace("implementationRevision: 'brightness-1'", "implementationRevision: 'brightness-2'");
  const second = metadata(edited);
  assert.equal(second.id, first.id);
  assert((await h.send({type: 'UPDATE_PACKAGE', packageId: first.id, metadata: second, code: edited})).ok);
  assert.equal(h.data.managedRenderers.items.length, 1);
  assert.equal(h.data.managedRenderers.items[0].metadata.version, '1.0.1');
  assert.equal(h.data.managedRenderers.items[0].code, edited);
  assert.equal(h.data.config.filterParameters.post[first.id].brightness, 0.2);

  const comparison = await box.harness();
  comparison.tabs.clear();
  comparison.ctx.chrome.tabs.query = async () => [];
  assert((await comparison.send({type: 'ADD_PACKAGE', metadata: first, code: source})).ok);
  assert((await comparison.send({type: 'ADD_PACKAGE', mode: 'additional', metadata: second, code: edited})).ok);
  assert.equal(comparison.data.managedRenderers.items.length, 2);
  console.log('PASS bilingual brightness example: import, duplicate rejection, update with retained settings, and side-by-side versions');
})().catch(error => {console.error(error); process.exitCode = 1;});
