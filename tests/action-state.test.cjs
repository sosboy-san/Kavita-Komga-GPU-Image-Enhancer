const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const prefix=fs.readFileSync(__dirname+'/dev2-sites.test.cjs','utf8').split('(async()=>{')[0],box={require,__dirname,console,URL,URLSearchParams,TextEncoder,setTimeout,clearTimeout,setImmediate};
vm.createContext(box);vm.runInContext(prefix+';globalThis.harness=harness',box);
(async()=>{const h=await box.harness(),calls=[];
for(const method of ['setIcon','setBadgeText','setTitle'])h.ctx.chrome.action[method]=async value=>calls.push({method,...value});
const site={origin:'https://nas.example:3627',basePath:'/kavita/',app:'kavita'},c={sites:[site],enabled:true};
for(const [id,enabled,state]of [[1,true,'registered-on'],[1,false,'registered-off'],[3,true,'unregistered'],[4,true,'unregistered']]){
 calls.length=0;await h.ctx.paint(id,null,{...c,enabled});
 assert.equal(calls.find(x=>x.method==='setIcon').path[16],'icons/'+state+'-16.png');
 assert.equal(calls.find(x=>x.method==='setBadgeText').text,'');
 assert(!calls.find(x=>x.method==='setTitle').title.includes('DEV'));
}
calls.length=0;await h.ctx.paint(1,null,{sites:[],enabled:true});assert(calls.find(x=>x.method==='setIcon').path[32].includes('unregistered'));
console.log('PASS action registered ON/OFF, unregistered, path and port boundaries, deletion and no DEV badge');
})().catch(e=>{console.error(e);process.exitCode=1});
