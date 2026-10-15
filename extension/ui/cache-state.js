// Exact processing result readiness; no fetching, rendering or allocation.
(()=>{'use strict';
 function resolve(key,candidates){const matches=candidates.filter(x=>x&&x.key===key&&x.url);const ready=matches.find(x=>x.decoded);const x=ready||matches[0];return x?{key,owner:x.owner,url:x.url,decoded:!!x.decoded,state:x.decoded?'READY':x.warming?'DECODING':'BLOB',item:x.item}: {key,owner:null,url:null,decoded:false,state:'MISSING',item:null};}
 function contiguous(rows,direction,limit){let count=0,expected=1;for(const row of rows.filter(x=>Math.sign(x.offset)===direction).sort((a,b)=>Math.abs(a.offset)-Math.abs(b.offset))){if(Math.abs(row.offset)!==expected||row.status==='END')break;expected++;const entries=row.entries||[{ready:row.ready===1}];if(!entries.length)break;const ordered=direction<0?[...entries].reverse():entries;for(const entry of ordered){if(!entry.ready)return count;if(++count>=limit)return count;}}return count;}
 globalThis.__KKGR_CACHE_STATE__=Object.freeze({resolve,contiguous});
})();
