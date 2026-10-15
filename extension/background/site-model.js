(() => {
 'use strict';
 const originOf=raw=>{try{const u=new URL(raw);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.origin:null}catch{return null}};
 function basePath(raw){if(typeof raw!=='string'||!raw.startsWith('/')||raw.includes('?')||raw.includes('#')||raw.includes('\\')||/%(?:2f|5c)/i.test(raw))throw Error('設置パスは / から始まるパスを入力してください');const u=new URL(raw,'https://path.invalid');if(u.origin!=='https://path.invalid'||u.pathname!==raw)throw Error('設置パスにURLや相対移動は指定できません');return raw==='/'?'/':raw.replace(/\/+$/,'')+'/';}
 function normalize(raw){const origin=originOf(raw.origin);if(!origin||origin!==raw.origin)throw Error('接続先はHTTP(S)のドメインとポートを入力してください');if(raw.app&&!['kavita','komga','auto'].includes(raw.app))throw Error('KavitaまたはKomgaを選択してください');return {id:raw.id||'',origin,basePath:basePath(raw.basePath||'/'),app:raw.app||'auto'};}
 function sites(c){if(Array.isArray(c.sites))return c.sites;return (c.origins||[]).map((origin,i)=>({id:'legacy-'+i,origin,basePath:'/',app:'auto'}));}
 function matches(site,url){try{const u=new URL(url),p=site.basePath;return u.origin===site.origin&&(p==='/'||u.pathname===p.slice(0,-1)||u.pathname.startsWith(p));}catch{return false}}
 function reader(site,url){return matches(site,url)&&/(?:\/book\/[^/]+\/read(?:\/|$)|\/(?:manga|reader)\/)/i.test(new URL(url).pathname);}
 function overlap(a,b){return a.origin===b.origin&&(matches(a,b.origin+b.basePath)||matches(b,a.origin+a.basePath));}
 function fromURL(raw,id=''){const u=new URL(raw);if(!originOf(raw)||u.search||u.hash)throw Error('登録URLはHTTP(S)のドメインまたは設置場所を入力してください（検索条件・ページ位置は不要です）');return normalize({id,origin:u.origin,basePath:u.pathname,app:'auto'});}
 function infer(raw){try{const u=new URL(raw);if(!originOf(raw))return null;let path='/',app='',certain=false;const routes=[['komga',/\/book\/[^/]+\/read(?:\/|$)/i],['kavita',/\/(?:manga|reader)\//i]];for(const [kind,re]of routes){const match=re.exec(u.pathname);if(match){const prefix=u.pathname.slice(0,match.index);path=kind==='kavita'?(prefix.split(/\/(?:library|series)(?:\/|$)/i)[0]||'/'):(prefix||'/');app=kind;certain=true;break}}if(!certain){const known=/^(.*?\/(?:kavita|komga))(?:\/|$)/i.exec(u.pathname);if(known){path=known[1];app=/\/komga$/i.test(path)?'komga':'kavita';certain=true;}}return {origin:u.origin,basePath:basePath(path),app,certain,sourceURL:u.href};}catch{return null}}
 const api={originOf,basePath,normalize,sites,matches,reader,infer,overlap,fromURL};globalThis.__KKGR_SITES__=api;if(typeof module!=='undefined')module.exports=api;
})();
