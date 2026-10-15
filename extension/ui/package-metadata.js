// Shared renderer/filter author metadata. No execution or markup interpretation.
(()=>{'use strict';
 const limits={author:256,description:2048,createdAt:64,readme:65536,license:256,source:2048,homepage:2048};
 function normalize(d){const out={};for(const [key,max]of Object.entries(limits)){if(d[key]===undefined)continue;if(typeof d[key]!=='string'||d[key].length>max)throw Error('パッケージ情報 '+key+' が不正です。');out[key]=d[key];}
 if(out.homepage){let u;try{u=new URL(out.homepage);}catch{throw Error('公式サイトURLが不正です。');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('公式サイトはhttp/httpsのURLを指定してください。');out.homepage=u.href;}
 if(out.createdAt&&!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(out.createdAt))throw Error('作成日はISO形式で指定してください。');
 if(out.createdAt&&!Number.isFinite(Date.parse(out.createdAt)))throw Error('作成日が不正です。');
 if(d.extensions!==undefined){let nodes=0;const walk=(v,depth)=>{if(++nodes>10000||depth>16)throw Error('拡張情報が大きすぎます。');if(v===null||typeof v==='string'||typeof v==='boolean')return;if(typeof v==='number'&&Number.isFinite(v))return;if(typeof v!=='object')throw Error('拡張情報はJSONデータにしてください。');if(!Array.isArray(v)&&Object.prototype.toString.call(v)!=='[object Object]')throw Error('拡張情報はJSONデータにしてください。');for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('拡張情報のキーが不正です。');walk(v[k],depth+1);}};
 if(!d.extensions||Array.isArray(d.extensions)||typeof d.extensions!=='object')throw Error('extensionsはオブジェクトにしてください。');walk(d.extensions,0);const s=JSON.stringify(d.extensions);if(s.length>65536)throw Error('拡張情報は64Ki文字以下にしてください。');out.extensions=JSON.parse(s);}
 if(d.translations!==undefined){
  const translations=d.translations;if(!translations||typeof translations!=='object'||Array.isArray(translations)||!translations.en||Object.keys(translations).length>32)throw Error('Translations require English');
  out.translations={};for(const [locale,entry]of Object.entries(translations)){if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)||!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('Invalid translation locale');const row={};for(const [key,v]of Object.entries(entry)){if(['name','description','readme'].includes(key)){if(typeof v!=='string'||!v||v.length>(key==='readme'?65536:key==='name'?200:2048))throw Error('Invalid translated text');row[key]=v;}else if(key==='labels'){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>512)throw Error('Invalid translated labels');row.labels={};for(const [k,text]of Object.entries(v)){if(!k||k.length>160||['__proto__','constructor','prototype'].includes(k)||typeof text!=='string'||!text||text.length>200)throw Error('Invalid translated label');row.labels[k]=text;}}else throw Error('Unknown translation field');}out.translations[locale]=row;}
  const en=out.translations.en;for(const field of ['name','description','readme'])if(!en[field])throw Error('Missing English '+field);
  if(JSON.stringify(out.translations).length>262144)throw Error('Translations exceed limit');
 }
 return out;}
 const displayWidth=value=>Array.from(value).reduce((n,c)=>n+(/\p{Mark}|[\u200d\ufe0e\ufe0f]/u.test(c)?0:/[\u0020-\u007e\uff61-\uff9f]/u.test(c)?1:2),0);
 const translated=(d,field,language,key)=>{const all=d.translations;if(!all)return undefined;const locale=String(language||'en'),row=all[locale]||all[locale.split('-')[0]];return field==='labels'?(row?.labels?.[key]??all.en?.labels?.[key]):(row?.[field]??all.en?.[field]);};
 globalThis.__KKGR_PACKAGE_METADATA__={normalize,displayWidth,translated};
})();
