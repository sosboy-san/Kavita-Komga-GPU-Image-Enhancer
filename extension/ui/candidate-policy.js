// Shared registration and rotation limits. Runtime catalogs supply actual modules.
(()=>{globalThis.__KKGR_CANDIDATE_POLICY__=Object.freeze({candidateLimit:5,registrationLimit:20});})();

// One persisted selection model for the action menu and reader quick controls.
(()=>{
 const slot=(state,stage)=>{
  const catalog=state.filterCatalog||[],ids=state.filterCandidates?.[stage]||[];
  const candidates=ids.filter(id=>catalog.some(d=>d.id===id&&d.supportedStages?.includes(stage)));
  const current=candidates.includes(state.filters?.[stage])?state.filters[stage]:null;
  const choices=[null,...candidates];
  return {current,candidates,next:choices[(choices.indexOf(current)+1)%choices.length],entry:catalog.find(d=>d.id===current)||null};
 };
 const name=(state,id)=>state.filterCatalog?.find(d=>d.id===id)?.name||'Filter';
 globalThis.__KKGR_FILTER_STATE__=Object.freeze({slot,name});
})();
