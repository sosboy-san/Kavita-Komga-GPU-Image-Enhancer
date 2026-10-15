// Presentation only. No image processing, filter execution, cache or storage.
(() => {
  'use strict';
  const KEY='__KKGR_HUD_MODEL_V1__';
  if(globalThis[KEY]) return;
  const messages={
  "ja": {
 "rendererLabel":"レンダラー","statusLabel":"ステータス","preLabel":"前フィルター","postLabel":"後フィルター",
 "diagnostics":"--- 診断 ---",
    "gpu": "GPU表示",
    "processed": "加工画像表示",
    "browser": "ブラウザ表示",
    "native": "原寸表示",
    "offRestoring": "OFF · 原画へ復帰中",
    "offOriginal": "OFF · 原画表示",
    "loadingSource": "原画読み込み中",
    "waitingSplit": "分割画像の取得待ち",
    "settlingDisplay": "表示サイズ調整中",
    "processing": "画像処理中",
    "preparingDisplay": "表示準備中",
    "waiting": "待機",
    "gpuUnavailable": "GPU利用不可",
    "sizeLimit": "サイズ制限",
    "splitUnsupported": "分割処理対象外",
    "alignmentUnavailable": "分割表示の位置合わせ不可",
    "transformUnsupported": "分割表示の変形未対応",
    "processingFailed": "処理失敗",
    "sourceUnavailable": "原画取得不可",
    "checkDisplay": "表示を確認",
    "historyReuse": "履歴再利用",
    "prefetchReuse": "先読み再利用",
    "cacheReuse": "キャッシュ再利用",
    "filterSkipped": "フィルター一部省略",
    "noProcessing": "処理不要",
    "original": "原画表示",
    "settlingOutput": "出力サイズ調整中",
    "browserRendering": "ブラウザ描画",
    "waitingInput": "取得待ち",
    "prefetchUnsupported": "GPU先読み：未対応",
    "output": "出力 {size} px",
    "input": "入力",
    "half": "半ページ",
    "prepared": "表示準備済み：前方 {ahead}/{aheadTarget}枚 · 後方 {back}/{backTarget}枚",
    "history": "キャッシュ {mb} / {budget} MB（目安）",
    "splitHistory": "キャッシュ {mb} / {budget} MB（目安）",
    "normal": "通常",
    "single": "単ページ", "spread": "見開き", "splitBadge": "画像分割",
    "split": "分割",
    "page": "原画 {page}",
    "splitPage": "原画 {page} · {part}",
    "left": "左半分",
    "right": "右半分"
  },
  "en": {
 "rendererLabel":"Renderer","statusLabel":"Status","preLabel":"Pre filter","postLabel":"Post filter",
 "diagnostics":"--- Diagnostics ---",
    "gpu": "GPU display",
    "processed": "Processed image",
    "browser": "Browser display",
    "native": "Native size",
    "offRestoring": "OFF · Restoring original",
    "offOriginal": "OFF · Original image",
    "loadingSource": "Loading source",
    "waitingSplit": "Waiting for split surface",
    "settlingDisplay": "Settling display size",
    "processing": "Processing image",
    "preparingDisplay": "Preparing display",
    "waiting": "Waiting",
    "gpuUnavailable": "GPU unavailable",
    "sizeLimit": "Size limit",
    "splitUnsupported": "Unsupported split surface",
    "alignmentUnavailable": "Split alignment unavailable",
    "transformUnsupported": "Unsupported split transform",
    "processingFailed": "Processing failed",
    "sourceUnavailable": "Source unavailable",
    "checkDisplay": "Check display",
    "historyReuse": "History reuse",
    "prefetchReuse": "Prefetch reuse",
    "cacheReuse": "Cache reuse",
    "filterSkipped": "Some filters skipped",
    "noProcessing": "No processing needed",
    "original": "Original image",
    "settlingOutput": "Settling output size",
    "browserRendering": "Browser rendering",
    "waitingInput": "Waiting",
    "prefetchUnsupported": "GPU prefetch: not supported",
    "output": "Output {size} px",
    "input": "Input",
    "half": "Half page",
    "prepared": "Display ready: {ahead}/{aheadTarget} ahead · {back}/{backTarget} behind",
    "history": "Cache {mb} / {budget} MB (approx.)",
    "splitHistory": "Cache {mb} / {budget} MB (approx.)",
    "normal": "Normal",
    "single": "Single page", "spread": "Spread", "splitBadge": "Image splitting",
    "split": "Split",
    "page": "Source {page}",
    "splitPage": "Source {page} · {part}",
    "left": "Left half",
    "right": "Right half"
  }
};
  const locale=language=>String(language || globalThis.navigator?.language || 'en').toLowerCase().split('-')[0];
  const text=(key,values={},language)=>{
    const lang=locale(language), table=messages[lang] || messages.en;
    return (table[key] || messages.en[key] || key).replace(/\{(\w+)\}/g,(_,name)=>String(values[name] ?? ''));
  };
  const patch=(previous,changes)=>({...{phase:'waiting',stage:'source',route:null,
    reuse:null,issue:null,actualRenderer:null,filters:null},...previous,...changes});
  const activeFilter=f=>!!f && f.enabled!==false && f.id!=='off';
  const routeText=(route,t)=>({gpu:t('gpu'),processed:t('processed'),browser:t('browser'),native:t('native')})[route]||'';
  function status({enabled,state,displayRoute,selectedBrowser=false,locale:language}) {
    const t=key=>text(key,{},language);
    if(!enabled) return displayRoute==='gpu'?t('offRestoring'):t('offOriginal');
    const s=patch(null,state),route=displayRoute || s.route;
    const active=['working','waiting'].includes(s.phase);
    if(active) {
      const label=({source:t('loadingSource'),split:t('waitingSplit'),layout:t('settlingDisplay'),
        preFilter:t('processing'),renderer:t('processing'),postFilter:t('processing'),encode:t('processing'),decode:t('preparingDisplay')})[s.stage] || t('waiting');
      // A known original may remain visible while a final result is prepared.
      return displayRoute==='browser'?t('original')+' · '+label:displayRoute==='gpu'?t('gpu')+' · '+label:label;
    }
    if(s.phase==='failed' || s.phase==='fallback') {
      const reason=({unavailable:t('gpuUnavailable'),limit:t('sizeLimit'),splitUnsupported:t('splitUnsupported'),
        alignment:t('alignmentUnavailable'),transform:t('transformUnsupported'),failure:t('processingFailed'),source:t('sourceUnavailable')})[s.issue?.kind] || t('processingFailed');
      return (routeText(route,t)||t('checkDisplay'))+' · '+reason;
    }
    if(selectedBrowser && !['native','gpu','processed'].includes(route) && !s.actualRenderer && !activeFilter(s.filters?.pre) && !activeFilter(s.filters?.post)) return t('browser');
    const label=routeText(route,t)||t('waiting');
    const reuse=({history:t('historyReuse'),prefetch:t('prefetchReuse'),cache:t('cacheReuse')})[s.reuse];
    const skipped=s.issue?.kind==='filterSkipped'?t('filterSkipped'):null;
    return [label,route==='native'?t('noProcessing'):null,skipped].filter(Boolean).join(' · ');
  }
  function lines(v) {
    const t=(key,values)=>text(key,values,v.locale);
    // Display mode comes from host facts; processing layout is not a mode.
    const mode=v.hostDisplay?.label || ({single:t('single'),spread:t('spread'),webtoon:'Webtoon'})[v.hostDisplay?.mode] || (v.mode==='Webtoon'?'Webtoon':null);
    const header=[`Reader ${v.enabled?'ON':'OFF'}`,v.site,mode,v.split?t('splitBadge'):null].filter(Boolean).join(' · ');
    const rows=[header,
      `${t('rendererLabel')} ${v.rendererName}`,`${t('statusLabel')} ${status(v)}`];
    const filters=v.state?.filters;
    if(activeFilter(filters?.pre) || activeFilter(filters?.post))
      rows.push(`${t('preLabel')} ${activeFilter(filters.pre)?filters.pre.label:'OFF'} · ${t('postLabel')} ${activeFilter(filters.post)?filters.post.label:'OFF'}`);
    if(v.pageLabel) rows.push(v.pageLabel);
    const final=v.output?t('output',{size:v.output}):!v.enabled?t('original'):
      ['ready','fallback','failed'].includes(v.state?.phase)&&v.state?.route==='browser'?t('browserRendering'):t('settlingOutput');
    rows.push(`${v.split?t('half'):t('input')} ${v.input? v.input+' px':t('waitingInput')} → ${final}`);
    rows.push(v.split&&!v.splitPrepared?t('prefetchUnsupported'):t('prepared',{ahead:v.ahead||0,back:v.back||0,aheadTarget:v.aheadTarget??4,backTarget:v.backTarget??2}));
    rows.push(t(v.split?'splitHistory':'history',{count:v.history||0,mb:v.mb,budget:v.budgetMb}));
    return rows;
  }
  Object.defineProperty(globalThis,KEY,{value:Object.freeze({version:1,patch,status,lines,text,locale,languages:Object.freeze(['ja','en'])}),configurable:false});
})();
