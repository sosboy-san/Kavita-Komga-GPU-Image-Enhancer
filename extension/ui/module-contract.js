// Public GPU module API 1 validation. Old standalone Canvas renderers are unsupported.
(()=>{'use strict';
 const normalize=d=>{
  if(!d||typeof d!=='object'||!/^[a-z][a-z0-9._-]*$/.test(d.id)||d.id==='browser'||typeof d.name!=='string'||!d.name||typeof d.version!=='string'||!/^\d+\.\d+\.\d+$/.test(d.version)||typeof d.implementationRevision!=='string'||!d.implementationRevision)throw Error('Invalid package descriptor');
  const filter=d.kind==='filter',renderer=d.kind==='renderer';
  if(d.moduleApiVersion!==1||d.executionApiVersion!==1||(!renderer&&!filter))throw Error('This build accepts public GPU API 1 only');
  if(!Array.isArray(d.parameters))throw Error('Missing parameters');
  if(renderer&&(d.parameters.length||d.analysis||d.analysisDisplay||d.originalInput!==undefined||d.supportedStages!==undefined))throw Error('Renderer API 1 uses no parameters, analysis or originalInput');
  if(filter&&d.requirements?.length)throw Error('Requirements are not supported');
  if(filter&&d.originalInput!==undefined&&typeof d.originalInput!=='boolean')throw Error('Invalid originalInput');
  if(filter&&(!Array.isArray(d.supportedStages)||!d.supportedStages.length||new Set(d.supportedStages).size!==d.supportedStages.length||!d.supportedStages.every(x=>x==='pre'||x==='post')))throw Error('Invalid filter stages');
  if(filter){const known=new Set(['moduleApiVersion','executionApiVersion','kind','id','name','version','implementationRevision','parameters','supportedStages','analysis','originalInput','create','author','description','createdAt','readme','license','source','homepage','extensions','requiresFeatures','analysisDisplay','translations']);if(Object.keys(d).some(k=>!known.has(k)))throw Error('Unknown descriptor field');}
  const features=d.requiresFeatures;if(features!==undefined&&(!Array.isArray(features)||new Set(features).size!==features.length||features.some(x=>!['color-suggestions','visible-when','analysis-display','ui-audience'].includes(x))))throw Error('Unsupported required API feature');
  const params=filter?globalThis.__KKGR_PARAMETERS__.schema(d.parameters):[];
  if(d.translations){const en=d.translations.en?.labels;for(const p of params){for(const l of [p.label,...(p.options||[]).map(o=>o.label),...(p.suggestions?.items||[]).map(o=>o.label).filter(Boolean)])if(!en?.[l.key])throw Error('Missing English label: '+l.key); }for(const item of d.analysisDisplay||[])if(!en?.[item.label.key])throw Error('Missing English label: '+item.label.key);}
  const displays=d.analysisDisplay!==undefined?globalThis.__KKGR_PARAMETERS__.displaySchema(d.analysisDisplay,params,d.analysis):undefined;
  if((params.some(p=>p.audience!==undefined)||displays?.some(p=>p.audience!==undefined))&&!features?.includes('ui-audience'))throw Error('audience requires ui-audience feature');
  if((params.some(p=>p.visibleWhen)||displays?.some(p=>p.visibleWhen))&&!features?.includes('visible-when'))throw Error('visibleWhen requires visible-when feature');
  if(displays&&!features?.includes('analysis-display'))throw Error('analysisDisplay requires analysis-display feature');
  if(params.some(p=>p.suggestions)&&!features?.includes('color-suggestions'))throw Error('Color suggestions require color-suggestions feature');
  for(const p of params){const path=p.suggestions?.analysisPath;if(!path)continue;let s=d.analysis?.resultSchema;for(const k of path.split('.').slice(1))s=s?.type==='object'?s.properties?.[k]:null;if(s?.type!=='array'||!['string','object'].includes(s.items?.type)||s.items.type==='object'&&s.items.properties?.value?.type!=='string')throw Error('Color suggestion path must reference a declared color array');}
  return {...(displays?{analysisDisplay:displays}:{}),...(features?{requiresFeatures:[...features]}:{}),id:d.id,name:d.name,version:d.version,implementationRevision:d.implementationRevision,moduleApiVersion:d.moduleApiVersion,executionApiVersion:d.executionApiVersion,kind:d.kind,parameters:filter?(d.parameters.length?globalThis.__KKGR_PARAMETERS__.schema(d.parameters):[]):[],...(filter?{supportedStages:[...d.supportedStages],...(d.analysis?{analysis:globalThis.__KKGR_ANALYSIS__.normalize(d.analysis,d.parameters)}:{}),...(d.originalInput!==undefined?{originalInput:d.originalInput}:{})}:{}),...globalThis.__KKGR_PACKAGE_METADATA__.normalize(d)};
 };
 const validate=d=>{if(typeof d?.create!=='function')throw Error('Missing create');return normalize(d);};
 // Object property order is not part of the persisted package contract.
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const equivalent=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const validatePublic=d=>{const result=normalize(d);if(!result.translations?.en)throw Error('Public modules require English translations');return result;};
 globalThis.__KKGR_MODULE_CONTRACT__=Object.freeze({normalize,validate,validatePublic,equivalent});
})();
