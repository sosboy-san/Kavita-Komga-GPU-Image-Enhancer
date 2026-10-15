const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
test('maintained Paper Restoration: API registration, analysis, manual anchoring and cancellation',async()=>{
 const root=path.resolve(__dirname,'..'),c={TextEncoder,console};vm.createContext(c);
 for(const f of ['parameter-schema','package-metadata','analysis-contract','module-contract'])vm.runInContext(fs.readFileSync(path.join(root,'extension/ui',f+'.js'),'utf8'),c);
 vm.runInContext(fs.readFileSync(path.join(root,'tests/fixtures/modules/Paper-Restoration-0.4.6-normal-use.txt'),'utf8'),c);
 const d=c.__KKGR_MODULES__[0];c.__KKGR_MODULE_CONTRACT__.validate(d);assert.equal(d.version,'0.4.6');
 let draw,released=false;const inst=d.create({createProgram:()=>1,colorToRgb:hex=>hex.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255),drawPass:x=>draw=x,releaseProgram:()=>released=true});inst.prepare();
 const regions=d.analysis.sample.regions.map(r=>{const pixels=new Uint8ClampedArray(r.width*r.height*4);for(let i=0;i<pixels.length;i+=4)pixels.set([220,198,143,255],i);return {...r,pixels};});
 const analysis=await inst.analyze({sample:{regions},signal:{aborted:false}});assert.equal(analysis.data.adoptedPaperColor,'#DCC68F');assert.equal(analysis.data.localPaper.length,9);assert.equal(analysis.data.edgePaper.length,4);
 const p=Object.fromEntries(d.parameters.map(x=>[x.key,x.default]));assert.equal(inst.execute({input:1,output:2,parameters:p,analysis}).kind,'written');assert.deepEqual(draw.uniforms.paperRgb,[220/255,198/255,143/255]);
 inst.execute({input:1,output:2,parameters:{...p,paperMode:'manual',paperColor:'#FFFFFF'},analysis});assert.deepEqual(draw.uniforms.paperRgb,[1,1,1]);assert.equal(p.paperColor,'#DCC68F');assert.equal(inst.execute({parameters:{...p,strength:0}}).kind,'passthrough');
 assert.throws(()=>inst.analyze({sample:{regions},signal:{aborted:true}}),/cancelled/);inst.dispose();assert.equal(released,true);
});
