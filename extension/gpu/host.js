// GPU execution API 1: reader pipeline with optional original-image CPU analysis.
// Copyright (c) 2026 sosboy-san. See project licensing documentation.
(() => {
 'use strict';
 const fail=(code,message)=>Object.assign(new Error(message),{code});
 const size=n=>Number.isSafeInteger(n)&&n>0;
 const VERT=`#version 300 es
out vec2 v_uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);v_uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
 const COPY=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 v_uv;uniform sampler2D image;layout(location=0) out vec4 outColor;
void main(){outColor=texture(image,vec2(v_uv.x,1.0-v_uv.y));}`;
 function create({canvas=document.createElement('canvas'),format='auto',budgetBytes=512*1024*1024,waitMs=10000,poolBytes=128*1024*1024,processingTimeoutMs=2000,onStage=()=>{}}={}) {
  if(!size(budgetBytes)||!size(waitMs)||!Number.isSafeInteger(poolBytes)||poolBytes<0)throw fail('CONTRACT_VIOLATION','Invalid host policy');
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw fail('UNSUPPORTED','WebGL2 unavailable');
  let generation=(globalThis.__KKGR_GPU_GENERATION__=(globalThis.__KKGR_GPU_GENERATION__||0)+1),jobCounter=0,disposed=false,stopped=false,active=null,allocated=0,peak=0;
  const analysisEngine=globalThis.__KKGR_CPU_ANALYSIS__?.create({timeoutMs:processingTimeoutMs});
  const surfaces=new WeakMap(),programs=new WeakMap(),resources=new Set(),owners=new Set(),pool=[];
  const maxSize=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  const units=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),vao=gl.createVertexArray();
  let floatSupported=false;
  const ext=gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float');
  function configTexture(){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
  if(ext){const t=gl.createTexture(),f=gl.createFramebuffer();try{gl.bindTexture(gl.TEXTURE_2D,t);configTexture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,1,1,0,gl.RGBA,gl.HALF_FLOAT,null);gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);floatSupported=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE&&gl.getError()===gl.NO_ERROR;}finally{gl.deleteFramebuffer(f);gl.deleteTexture(t);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}}
  if(!['auto','rgba8','rgba16f'].includes(format))throw fail('CONTRACT_VIOLATION','Invalid format');
  if(format==='rgba16f'&&!floatSupported)throw fail('UNSUPPORTED','RGBA16F unavailable');
  const selected=format==='auto'?(floatSupported?'rgba16f':'rgba8'):format;
  const capabilities=Object.freeze({generation,supportedFormats:Object.freeze(floatSupported?['rgba8','rgba16f']:['rgba8']),format:selected,maxTextureSize:maxSize,maxRenderbufferSize:maxSize,maxTextureUnits:units,analysis:Object.freeze({cpuOriginal:!!analysisEngine,cpuStageInput:false,gpu:false,maskUpload:false,limits:Object.freeze({...globalThis.__KKGR_ANALYSIS__?.limits,timeoutMs:processingTimeoutMs})}),originalInput:true,workBudgetBytes:budgetBytes});
  function check(){if(disposed)throw fail('CONTRACT_VIOLATION','Host disposed');if(gl.isContextLost())throw fail('CONTEXT_LOST','WebGL context lost');if(stopped)throw fail('GPU_TIMEOUT','Host stopped; reconnect required');}
  function validateSize(w,h){if(!size(w)||!size(h))throw fail('CONTRACT_VIOLATION','Invalid dimensions');if(w>maxSize||h>maxSize)throw fail('SIZE_LIMIT','Dimensions exceed GPU limit');}
  function bytes(w,h,f){const n=w*h*(f==='rgba16f'?8:4);if(!Number.isSafeInteger(n))throw fail('SIZE_LIMIT','Surface size overflow');return n;}
  function destroy(r){if(!resources.delete(r))return;gl.deleteFramebuffer(r.fbo);gl.deleteTexture(r.tex);allocated-=r.bytes;}
  function trim(target=poolBytes){let total=pool.reduce((n,r)=>n+r.bytes,0);while(pool.length&&total>target){const r=pool.shift();total-=r.bytes;destroy(r);}}
  function acquire(w,h,f){validateSize(w,h);const index=pool.findIndex(r=>r.w===w&&r.h===h&&r.format===f);if(index>=0)return pool.splice(index,1)[0];const amount=bytes(w,h,f);if(allocated+amount>budgetBytes)trim(0);if(allocated+amount>budgetBytes)throw fail('MEMORY_BUDGET_EXCEEDED','GPU Surface budget exceeded');const r={w,h,format:f,bytes:amount,tex:gl.createTexture(),fbo:gl.createFramebuffer()};if(!r.tex||!r.fbo){if(r.tex)gl.deleteTexture(r.tex);if(r.fbo)gl.deleteFramebuffer(r.fbo);throw fail('ALLOCATION_FAILED','GPU allocation failed');}try{gl.bindTexture(gl.TEXTURE_2D,r.tex);configTexture();gl.texImage2D(gl.TEXTURE_2D,0,f==='rgba16f'?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,f==='rgba16f'?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,r.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,r.tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw fail('FRAMEBUFFER_INCOMPLETE','Incomplete framebuffer');if(gl.getError()!==gl.NO_ERROR)throw fail('ALLOCATION_FAILED','Texture allocation error');resources.add(r);allocated+=amount;peak=Math.max(peak,allocated);return r;}catch(e){gl.deleteFramebuffer(r.fbo);gl.deleteTexture(r.tex);throw e;}}
  function surface(w,h,f,owner,kind){validateSize(w,h);const handle=Object.freeze({width:w,height:h,format:f,colorEncoding:'srgb-nonlinear',alphaMode:'straight',orientation:'top-left',generation});surfaces.set(handle,{owner,kind,job:active,released:false,initialized:false,resource:null});active.handles.push(handle);return handle;}
  function entry(h){const e=surfaces.get(h);if(!e||e.released||e.job!==active||h.generation!==generation)throw fail('CONTRACT_VIOLATION','Stale or unknown Surface');return e;}
  function ensure(h){const e=entry(h);if(!e.resource)e.resource=acquire(h.width,h.height,h.format);return e;}
  function release(h){const e=entry(h);e.released=true;if(e.resource){pool.push(e.resource);e.resource=null;}}
  function compile(type,text){const sh=gl.createShader(type);gl.shaderSource(sh,text);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const why=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw fail('SHADER_FAILED',why);}return sh;}
  const setters={float:'uniform1f',int:'uniform1i',bool:'uniform1i',vec2:'uniform2fv',vec3:'uniform3fv',vec4:'uniform4fv',ivec2:'uniform2iv',ivec3:'uniform3iv',ivec4:'uniform4iv'};
  const components={float:1,int:1,bool:1,vec2:2,vec3:3,vec4:4,ivec2:2,ivec3:3,ivec4:4};
  function makeProgram(owner,{fragment,uniforms={},samplers=[]}){
   if(active)throw fail('CONTRACT_VIOLATION','createProgram outside prepare');
   check();if(typeof fragment!=='string'||!Array.isArray(samplers)||new Set(samplers).size!==samplers.length||samplers.length>units)throw fail('CONTRACT_VIOLATION','Invalid program');
   if(samplers.some(n=>Object.hasOwn(uniforms,n))||Object.values(uniforms).some(d=>!setters[d.type]||(d.length!==undefined&&!size(d.length))))throw fail('CONTRACT_VIOLATION','Invalid uniform declarations');
   let v,f,p;try{v=compile(gl.VERTEX_SHADER,VERT);f=compile(gl.FRAGMENT_SHADER,fragment);p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw fail('SHADER_FAILED',gl.getProgramInfoLog(p));const types={float:gl.FLOAT,int:gl.INT,bool:gl.BOOL,vec2:gl.FLOAT_VEC2,vec3:gl.FLOAT_VEC3,vec4:gl.FLOAT_VEC4,ivec2:gl.INT_VEC2,ivec3:gl.INT_VEC3,ivec4:gl.INT_VEC4};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p,i),name=u.name.replace(/\[0\]$/,'');if(samplers.includes(name)){if(u.type!==gl.SAMPLER_2D||u.size!==1)throw fail('CONTRACT_VIOLATION','Sampler mismatch');}else{const d=uniforms[name];if(!d||u.type!==types[d.type]||u.size!==(d.length||1))throw fail('CONTRACT_VIOLATION','Uniform mismatch: '+name);}}
    const handle=Object.freeze({});programs.set(handle,{p,owner,uniforms:structuredClone(uniforms),samplers:[...samplers],locations:new Map([...Object.keys(uniforms),...samplers].map(n=>[n,gl.getUniformLocation(p,n)]))});owner.programs.add(handle);return handle;
   }catch(e){if(p)gl.deleteProgram(p);throw e;}finally{if(v)gl.deleteShader(v);if(f)gl.deleteShader(f);}
  }
  function releaseProgram(owner,h){const p=programs.get(h);if(!p||p.owner!==owner)throw fail('CONTRACT_VIOLATION','Unknown program owner');gl.deleteProgram(p.p);programs.delete(h);owner.programs.delete(h);}
  function draw(owner,{program,inputs={},output,uniforms={}}){
   check();if(!active||active.owner!==owner)throw fail('CONTRACT_VIOLATION','drawPass outside execute');const p=programs.get(program);if(!p||p.owner!==owner)throw fail('CONTRACT_VIOLATION','Program owner mismatch');const dest=entry(output);if(dest.owner!==owner||dest.kind==='input')throw fail('CONTRACT_VIOLATION','Output not writable');
   if(Object.keys(inputs).length!==p.samplers.length||p.samplers.some(n=>!inputs[n])||Object.keys(uniforms).length!==Object.keys(p.uniforms).length)throw fail('CONTRACT_VIOLATION','Missing/extra pass values');
   const src=p.samplers.map(n=>{if(inputs[n]===output)throw fail('CONTRACT_VIOLATION','Input/output alias');const e=entry(inputs[n]);if(!e.initialized||!e.resource)throw fail('CONTRACT_VIOLATION','Uninitialized input');return e.resource;});
   const values=[];for(const [n,d]of Object.entries(p.uniforms)){const v=uniforms[n],count=components[d.type]*(d.length||1),a=Array.isArray(v)?v:[v];if(a.length!==count)throw fail('CONTRACT_VIOLATION','Uniform length');for(const x of a){if(d.type==='bool'){if(typeof x!=='boolean')throw fail('CONTRACT_VIOLATION','Boolean uniform');}else if(typeof x!=='number'||!Number.isFinite(x)||((d.type==='int'||d.type.startsWith('ivec'))?(!Number.isInteger(x)||x< -2147483648||x>2147483647):!Number.isFinite(Math.fround(x))))throw fail('CONTRACT_VIOLATION','Uniform range');}values.push([n,d,a]);}
   ensure(output);gl.bindFramebuffer(gl.FRAMEBUFFER,dest.resource.fbo);gl.viewport(0,0,output.width,output.height);gl.useProgram(p.p);gl.bindVertexArray(vao);for(const flag of [gl.BLEND,gl.DEPTH_TEST,gl.STENCIL_TEST,gl.SCISSOR_TEST,gl.CULL_FACE,gl.RASTERIZER_DISCARD])gl.disable(flag);gl.colorMask(true,true,true,true);
   p.samplers.forEach((n,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,src[i].tex);gl.bindSampler(i,null);gl.uniform1i(p.locations.get(n),i);});
   for(const[n,d,a]of values){const loc=p.locations.get(n);if(loc===null)continue;if(d.length){const int=d.type==='int'||d.type==='bool'||d.type.startsWith('ivec');const c=components[d.type];gl['uniform'+c+(int?'iv':'fv')](loc,int?new Int32Array(a.map(Number)):new Float32Array(a));}else if(components[d.type]===1)gl[setters[d.type]](loc,Number(a[0]));else gl[setters[d.type]](loc,a);}
   gl.drawArrays(gl.TRIANGLES,0,3);if(gl.getError()!==gl.NO_ERROR)throw fail('EXECUTION_FAILED','drawPass GL error');dest.initialized=true;active.trace.push({stage:active.stage,width:output.width,height:output.height,kind:'draw'});
  }
  function ownerFor(){const o={programs:new Set()};owners.add(o);const host=Object.freeze({capabilities,createProgram:s=>makeProgram(o,s),releaseProgram:h=>releaseProgram(o,h),acquireScratch:({width,height})=>{check();if(!active||active.owner!==o)throw fail('CONTRACT_VIOLATION','Scratch outside execute');return surface(width,height,selected,o,'scratch');},releaseScratch:h=>{const e=entry(h);if(e.owner!==o||e.kind!=='scratch')throw fail('CONTRACT_VIOLATION','Not owned scratch');release(h);},drawPass:p=>draw(o,p),colorToRgb:hex=>{if(!/^#[0-9a-f]{6}$/i.test(hex))throw fail('CONTRACT_VIOLATION','Invalid color');return Object.freeze([1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));}});return {o,host};}
  const outputOwner=ownerFor();const copy=makeProgram(outputOwner.o,{fragment:COPY,samplers:['image']});
  function bind(d){check();if(d.moduleApiVersion!==1||d.executionApiVersion!==1||!['renderer','filter'].includes(d.kind)||typeof d.create!=='function'||!Array.isArray(d.parameters))throw fail('INVALID_DESCRIPTOR','Invalid GPU module');if(d.originalInput!==undefined&&typeof d.originalInput!=='boolean')throw fail('INVALID_DESCRIPTOR','Invalid originalInput');if(d.analysis){if(!analysisEngine)throw fail('UNSUPPORTED','CPU analysis unavailable');d={...d,analysis:globalThis.__KKGR_ANALYSIS__.normalize(d.analysis,d.parameters)};}if(d.parameters.length)globalThis.__KKGR_PARAMETERS__.schema(d.parameters);const {o,host}=ownerFor();let instance;try{instance=d.create(host);if(!instance||['prepare','execute','dispose'].some(k=>typeof instance[k]!=='function'))throw fail('CONTRACT_VIOLATION','Invalid instance');if(d.analysis&&typeof instance.analyze!=='function')throw fail('CONTRACT_VIOLATION','Missing analyze');const p=instance.prepare();if(!p||p.supported!==true)throw fail(p?.code||'UNSUPPORTED',p?.reason?.fallback||'Invalid prepare result');return {d,o,instance,disposed:false};}catch(e){try{instance?.dispose();}finally{for(const h of [...o.programs])releaseProgram(o,h);owners.delete(o);}throw e;}}
  async function wait(){const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync){stopped=true;throw fail('GPU_WAIT_FAILED','Fence unavailable');}gl.flush();const start=performance.now();try{for(;;){if(gl.isContextLost()){stopped=true;throw fail('CONTEXT_LOST','Context lost while waiting');}const r=gl.clientWaitSync(sync,0,0);if(r===gl.ALREADY_SIGNALED||r===gl.CONDITION_SATISFIED)return;if(r===gl.WAIT_FAILED){stopped=true;throw fail('GPU_WAIT_FAILED','Fence wait failed');}if(performance.now()-start>=waitMs){stopped=true;throw fail('GPU_TIMEOUT','GPU deadline exceeded');}await new Promise(r=>setTimeout(r,0));}}finally{gl.deleteSync(sync);}}
  function run(module,source,w,h,options={}) {return runPipeline({renderer:module},source,w,h,options);}
  async function runPipeline({pre=null,renderer=null,post=null},source,w,h,{sourceWidth=source.width,sourceHeight=source.height,parameters={},settingsRevision=0,signal,isCurrent=()=>true,onDiagnostic=null,bypassAnalysisStage=null}={}) {
   check();const current=()=>{if(performance.now()>(globalThis.__KKGR_PROCESSING_DEADLINE__??Infinity))throw fail('PROCESSING_TIMEOUT','Image processing deadline exceeded');if(signal?.aborted||!isCurrent())throw fail('ANALYSIS_CANCELLED','Job cancelled');};current();if(active)throw fail('CONTRACT_VIOLATION','GPU host busy');validateSize(w,h);validateSize(sourceWidth,sourceHeight);
   for(const [stage,m] of [['pre',pre],['renderer',renderer],['post',post]]) {
    if(!m)continue;
    if(m.disposed||!owners.has(m.o))throw fail('CONTRACT_VIOLATION','Foreign or disposed module');
    if(stage==='renderer'?m.d.kind!=='renderer':m.d.kind!=='filter'||!m.d.supportedStages?.includes(stage))throw fail('CONTRACT_VIOLATION','Module slot mismatch');
   }
   active={handles:[],trace:[],owner:null,stage:null};let completed=false;
   try{const uploadStarted=onDiagnostic?performance.now():0;const input=surface(sourceWidth,sourceHeight,'rgba8',null,'input'),e=ensure(input);gl.bindTexture(gl.TEXTURE_2D,e.resource.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);if(ArrayBuffer.isView(source)){if(source.byteLength!==sourceWidth*sourceHeight*4)throw fail('CONTRACT_VIOLATION','Input byte length');gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,sourceWidth,sourceHeight,gl.RGBA,gl.UNSIGNED_BYTE,source);}else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);if(gl.getError()!==gl.NO_ERROR)throw fail('EXECUTION_FAILED','Input upload');e.initialized=true;onDiagnostic?.({timings:{uploadMs:performance.now()-uploadStarted}});

    let final=input;const retainOriginal=[pre,renderer,post].some(m=>m?.d.originalInput);const jobId=`${globalThis.__KKGR_GPU_INSTANCE_ID__||"gpu"}-${generation}-${++jobCounter}`;
    for(const [stage,m] of [['pre',pre],['renderer',renderer],['post',post]]) {
     if(!m)continue;
     current();active.owner=null;active.stage=stage;
     const stageParameters=m.d.parameters.length?globalThis.__KKGR_PARAMETERS__.values(m.d.parameters,parameters[stage]||{}):Object.freeze({});
     const job=Object.freeze({id:jobId+":"+stage,stage,settingsRevision,generation});
     onDiagnostic?.({stage,module:{id:m.d.id,packageId:m.d.packageId||m.d.id,name:m.d.name,version:m.d.version,implementationRevision:m.d.implementationRevision,stamp:m.d.stamp||null},parameters:stageParameters});onStage(stage,m.d,m.d.analysis?'analyze':'execute');const analysis=m.d.analysis?await analysisEngine.run(m,source,sourceWidth,sourceHeight,stageParameters,job,signal,isCurrent,onDiagnostic?(analysis)=>onDiagnostic({stage,analysis}):null,bypassAnalysisStage===stage):undefined;current();if(m.d.parameters?.some(p=>p.suggestions)||m.d.analysisDisplay?.length){active.colorSuggestions??={};active.colorSuggestions[stage]={module:{id:m.d.id,version:m.d.version,implementationRevision:m.d.implementationRevision},parameters:stageParameters,settingsRevision,...(m.d.analysisDisplay?.length?{displays:globalThis.__KKGR_PARAMETERS__.displayColors(m.d.analysisDisplay,analysis)}:{}),items:Object.fromEntries(m.d.parameters.filter(p=>p.suggestions).map(p=>[p.key,globalThis.__KKGR_PARAMETERS__.candidates(p,analysis)]))};}active.owner=m.o;
     const ow=stage==='renderer'?w:final.width,oh=stage==='renderer'?h:final.height;
     const output=surface(ow,oh,selected,m.o,'output');
     onStage(stage,m.d,'execute');const commandStarted=onDiagnostic?performance.now():0;const result=m.instance.execute({input:final,output,parameters:stageParameters,analysis,originalInput:m.d.originalInput?input:undefined,job});
     onDiagnostic?.({stage,commandSubmissionMs:performance.now()-commandStarted});if(!result||!['written','passthrough'].includes(result.kind))throw fail('CONTRACT_VIOLATION','Invalid execute result');
     const out=entry(output);
     if(result.kind==='written'&&!out.initialized)throw fail('CONTRACT_VIOLATION','Written without draw');
     if(result.kind==='passthrough'&&(out.initialized||ow!==final.width||oh!==final.height))throw fail('CONTRACT_VIOLATION','Invalid passthrough');
     const leaked=active.handles.some(x=>{const q=surfaces.get(x);return q.owner===m.o&&q.kind==='scratch'&&!q.released;});
     if(leaked)throw fail('CONTRACT_VIOLATION','Scratch not returned');
     if(result.kind==='written'){if(final!==input||!retainOriginal)release(final);final=output;}else {release(output);active.trace.push({stage,width:ow,height:oh,kind:'passthrough'});}
    }
    // Browser omits the renderer: filters retain source dimensions; display scaling belongs to the browser.
    canvas.width=final.width;canvas.height=final.height;const p=programs.get(copy),f=entry(final);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,final.width,final.height);gl.useProgram(p.p);gl.bindVertexArray(vao);gl.disable(gl.BLEND);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,f.resource.tex);gl.bindSampler(0,null);gl.uniform1i(p.locations.get('image'),0);gl.drawArrays(gl.TRIANGLES,0,3);if(gl.getError()!==gl.NO_ERROR)throw fail('EXECUTION_FAILED','Final copy GL error');const waitStarted=onDiagnostic?performance.now():0;await wait();onDiagnostic?.({timings:{gpuWaitMs:performance.now()-waitStarted}});current();completed=true;return {canvas,colorSuggestions:active.colorSuggestions||{},trace:[...active.trace],format:selected,peakBytes:peak};
   }finally{if(completed||!stopped){for(const h of active.handles){const e=surfaces.get(h);if(!e.released)release(h);}trim(completed?Math.min(poolBytes,Math.floor(budgetBytes/4)):0);active=null;} /* timed-out resources remain pinned until dispose/context teardown */}
  }
  function disposeModule(m){if(active)throw fail('CONTRACT_VIOLATION','Dispose while job active');if(m.disposed)return;m.disposed=true;try{m.instance.dispose();}finally{for(const h of [...m.o.programs])releaseProgram(m.o,h);owners.delete(m.o);}}
  function dispose(){if(disposed)return;disposed=true;analysisEngine?.clear();for(const o of owners)for(const h of [...o.programs])releaseProgram(o,h);for(const r of [...resources])destroy(r);pool.length=0;gl.deleteVertexArray(vao);active=null;}
  return Object.freeze({canvas,capabilities,bind,run,runPipeline,disposeModule,dispose,stats:()=>({allocatedBytes:allocated,peakBytes:peak,poolCount:pool.length,programCount:[...owners].reduce((n,o)=>n+o.programs.size,0),stopped,analysisCache:analysisEngine?.stats()})});
 }
 globalThis.__KKGR_GPU__=Object.freeze({create});
})();
