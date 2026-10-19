'use strict';
/* ===== Logistics 차량 마스터 (L1~L7) ===== */
const LF = { stage:'', q:'', col:{}, sort:'commission_no', dir:1, page:1, size:50 }; // col: 열 필터 {key: Set(선택값)} (10/15 No.18)

const KEYIN_COLS = ['b1_factory_order','sales_month']; // 편집 모드 Key-in 대상 열 (10/15 No.5: Option은 Model_Master 자동 반영으로 제외)
const FILTER_COLS = ['pm','ata','model','vessel'];   // 열 필터 적용 열: PM · ATA · Type · Vessel (10/15 No.18)
const EDIT = { on:false, sel:new Set(), pending:{} }; // 편집 모드(오더 복수 선택) · pending: {comm:{field:{old,nw,src}}} → '편집 종료' 시 저장 (10/15 No.9)

PAGES.logistics = {
  title:'Logistics 차량 마스터', sub:`Commission No. 기준 1행 · ${COLUMNS.length}열`,
  render(root, params){
    LF.stage = params.get('stage')||''; LF.q = params.get('q')||''; LF.page=1; LF.col={};
    EDIT.on=false; EDIT.sel.clear(); EDIT.pending={}; closeColFilter();
    root.innerHTML = `<div class="card">
      <div class="card-h"><div class="filters" id="filters"></div><span class="spacer"></span>
        <div class="btn-group">
          <button class="btn editor-only" id="btnAdd">오더 생성 ${note('L7')}</button>
          <button class="btn" id="btnExport">엑셀 내보내기</button>
        </div></div>
      <div class="editbar editor-only" id="editbar" hidden></div>
      <div class="grp-nav" id="grpnav"></div>
      <div class="grid-wrap" id="gridwrap"></div>
      <div class="pager" id="pager"></div>
    </div>`;
    renderFilters(); renderGrid();
    el('btnExport').onclick = ()=>describe('엑셀 내보내기', `현재 필터·열 그대로 .xlsx 생성(SheetJS) → 다운로드 + SharePoint /Exports/ 저장. 현재 ${num(filtered().length)}행 · ${visibleCols().length}열.`);
    el('btnAdd').onclick = openAddOrder;
  }
};
window.addEventListener('hashchange', ()=>closeColFilter());

function filterVal(v, key){ const x = v[key]; return (x==null||x==='')? '(빈 값)' : String(x); }
function filtered(){
  const qq = LF.q.trim().toLowerCase();
  let rows = VEHICLES.filter(v=>
    (!LF.stage || v.current_status===LF.stage) &&
    FILTER_COLS.every(k=> !LF.col[k] || LF.col[k].has(filterVal(v,k))) &&
    (!qq || [v.commission_no,v.vin_no,v.bl_no,v.vessel,v.model,v.engine_no,v.order_note].some(x=>x&&String(x).toLowerCase().includes(qq))));
  const k=LF.sort, d=LF.dir;
  rows.sort((a,b)=>{ const x=a[k], y=b[k]; if(x===y) return 0; if(x===''||x==null) return 1; if(y===''||y==null) return -1; return (x>y?1:-1)*d; });
  return rows;
}
function visibleCols(){ return COLUMNS.filter(c=>!state.hiddenCols.has(c.key)); }

function renderFilters(){
  const by = countBy(VEHICLES, v=>v.current_status);
  const stages = ['', ...STAGES, 'Cancelled'];
  el('filters').innerHTML = `${note('L1')}
    <label>단계 <select id="fStage">${stages.map(s=>`<option value="${s}" ${LF.stage===s?'selected':''}>${s? `${s} (${num(by[s]||0)})` : `전체 (${num(VEHICLES.length)})`}</option>`).join('')}</select></label>
    ${note('L2')}
    <label>검색 <input id="fQ" placeholder="Comm / VIN / B/L / Vessel / 메모" value="${esc(LF.q)}" style="width:220px"></label>
    <button class="btn sm" id="fReset">초기화</button>
    <span class="muted small" id="fCount"></span>`;
  el('fStage').onchange = e=>{ LF.stage=e.target.value; LF.page=1; renderGrid(); };
  el('fQ').oninput = e=>{ LF.q=e.target.value; LF.page=1; renderGrid(); };
  el('fReset').onclick = ()=>{ Object.assign(LF,{stage:'',q:'',page:1}); LF.col={}; renderFilters(); renderGrid(); };
}
// 편집 중 저장 대기 값이 있으면 그 값을, 없으면 저장된 값을 돌려준다
function pendingVal(v, key){ const p = EDIT.pending[v.commission_no]; return (p && key in p)? p[key].nw : v[key]; }
function cellHtml(c, v){
  const val = pendingVal(v, c.key);
  if(c.key==='current_status') return stagePill(val);
  // 상태점은 셀 오른쪽 끝에 표시 (10/15 No.7)
  if(c.key==='model'){ const ok = String(val||'').slice(0,4)===String(v.model_in_afab||'').slice(0,4); return `${esc(val)}<span class="dot r ${ok?'ok':'bad'}" title="${ok?'Model In AFAB 앞 4글자 일치':'Model In AFAB 앞 4글자 불일치: '+esc(v.model_in_afab)}"></span>`; }
  if(c.key==='changeability_date'){
    const dc = {J:'ok', N:'bad', B:'warn'}[v.afab_editable];
    const dot = dc? `<span class="dot r ${dc}" title="AFAB 수정 가능(Ä): ${esc(v.afab_editable)}"></span>` : '';
    const dd = (v.changeability_dday!=null && v.changeability_dday<=30)? ` <span class="pill warn">D-${v.changeability_dday}</span>` : '';
    return `${val? esc(val) : '<span class="dim">·</span>'}${dd}${dot}`;
  }
  if(c.key==='ata' && v.eta_mismatch && (v.current_status==='In Transit'||v.current_status==='Shipment scheduled')) return `${val||''} <span class="pill warn" title="선사 ETA 불일치 >7일">Δ</span>`;
  if(c.key==='color_code') return `<span title="${esc(COLOR_NAMES[val]||'')}">${val}</span>`;
  if(c.num) return num(val);
  if(val==null||val==='') return '<span class="dim">·</span>';
  return esc(val);
}
function renderGrid(){
  const rows = filtered(); const cols = EDIT.on ? COLUMNS : visibleCols(); // 편집 모드에서는 숨긴 열도 머리글(체크박스)만 표시 (10/15 No.15)
  const totalPages = Math.max(1, Math.ceil(rows.length/LF.size)); if(LF.page>totalPages) LF.page=totalPages;
  const pageRows = rows.slice((LF.page-1)*LF.size, LF.page*LF.size);
  const fkeys = Object.keys(LF.col);
  el('fCount').textContent = `${num(rows.length)}건 / 전체 ${num(VEHICLES.length)}` + (fkeys.length? ` · 열 필터: ${fkeys.map(keyinLabel).join(' · ')}` : '');
  // 헤더 1줄 (그룹 헤더 줄 없음 · Comm No.는 첫 열 고정)
  const sortIcon = k=> LF.sort===k? `<span class="sort">${LF.dir>0?'▲':'▼'}</span>`:'';
  const canEdit = isEditor();
  const hid = c=> EDIT.on && state.hiddenCols.has(c.key);
  const colBox = c=> EDIT.on? `<input type="checkbox" class="colvis" data-col="${c.key}" ${hid(c)?'':'checked'} title="열 표시/숨김 (체크 해제 → 숨김)">` : '';
  const filtBtn = c=> FILTER_COLS.includes(c.key)? `<button class="cf ${LF.col[c.key]?'on':''}" data-filter="${c.key}" title="${esc(c.label)} 열 필터">▼</button>` : '';
  let h = `<table class="grid"><thead><tr class="fld"><th class="sticky" data-sort="commission_no">${EDIT.on?'<input type="checkbox" id="selAll" title="현재 페이지 전체 선택">':''}Commission No ${srcBadge('AFAB')}${sortIcon('commission_no')} <button class="btn sm editor-only ${EDIT.on?'primary':''}" id="btnEdit" title="${EDIT.on?'변경 내용을 저장하고 편집을 종료합니다':'오더 복수 선택 → 오더 변경 · Key-in 입력 · 열 표시/숨김'}">${EDIT.on?'편집 종료':'편집'}</button></th>`;
  h += cols.filter(c=>c.key!=='commission_no').map(c=>`<th data-sort="${c.key}" class="${hid(c)?'hid':''}" title="${c.key}">${colBox(c)}${esc(c.label)} ${srcBadge(c.src)}${sortIcon(c.key)}${filtBtn(c)}</th>`).join('') + '</tr></thead><tbody>';
  const selBox = v=> EDIT.on? `<input type="checkbox" class="rowsel" ${EDIT.sel.has(v.commission_no)?'checked':''}>` : '';
  const keyin = c=> canEdit && EDIT.on && KEYIN_COLS.includes(c.key); // Key-in 열도 편집 모드에서만 입력 (10/15 No.4)
  const pend = (v,c)=> EDIT.pending[v.commission_no] && c.key in EDIT.pending[v.commission_no];
  h += pageRows.map(v=>`<tr data-comm="${v.commission_no}" class="${EDIT.sel.has(v.commission_no)?'sel':''}">`+cols.map(c=>`<td class="${c.key==='commission_no'?'sticky':''} ${c.num?'num':''} ${c.memo?'memo':''} ${keyin(c)?'keyin':''} ${hid(c)?'hid':''} ${pend(v,c)?'pend':''}" data-key="${c.key}" ${c.memo?`title="${esc(v[c.key])}"`:''} ${keyin(c)?'title="클릭하여 개별 입력 (Key-in) · 편집 종료 시 저장"':''}>${hid(c)?'':(c.key==='commission_no'?selBox(v):'')+cellHtml(c,v)}</td>`).join('')+'</tr>').join('');
  h += '</tbody></table>';
  if(!rows.length) h = '<div class="muted" style="padding:30px;text-align:center">조건에 맞는 차량이 없습니다.</div>';
  const wrap = el('gridwrap'); wrap.innerHTML = h;
  qa('th[data-sort]', wrap).forEach(th=>th.onclick=e=>{ if(e.target.closest('.colvis,.cf')) return; const k=th.dataset.sort; if(LF.sort===k) LF.dir*=-1; else { LF.sort=k; LF.dir=1; } renderGrid(); });
  qa('th .colvis', wrap).forEach(cb=>{ cb.onclick=e=>e.stopPropagation(); cb.onchange=()=>{ if(cb.checked) state.hiddenCols.delete(cb.dataset.col); else state.hiddenCols.add(cb.dataset.col); renderGrid(); }; }); // 변경 이력 없음
  qa('th .cf', wrap).forEach(b=>b.onclick=e=>{ e.stopPropagation(); openColFilter(b, b.dataset.filter); });
  qa('tbody tr', wrap).forEach(tr=>tr.onclick=e=>{
    if(canEdit && e.target.closest('td.keyin')) return;             // Key-in 셀은 개별 입력
    if(!EDIT.on){ openVehicle(tr.dataset.comm); return; }
    const box = q('.rowsel', tr); const on = e.target===box? box.checked : !EDIT.sel.has(tr.dataset.comm);
    if(on) EDIT.sel.add(tr.dataset.comm); else EDIT.sel.delete(tr.dataset.comm);
    box.checked = on; tr.classList.toggle('sel', on); renderEditbar();
  });
  qa('td.keyin', wrap).forEach(td=>td.onclick=e=>{ e.stopPropagation(); startCellEdit(td, td.closest('tr').dataset.comm, td.dataset.key); });
  const be = el('btnEdit'); if(be) be.onclick = e=>{ e.stopPropagation();
    if(EDIT.on){ commitEdits(); EDIT.on=false; EDIT.sel.clear(); renderGrid(); return; }
    EDIT.on=true; EDIT.sel.clear(); renderGrid();
    toast('편집 모드', '행 클릭 또는 체크박스로 오더를 복수 선택한 뒤 위 버튼으로 일괄 변경합니다. Key-in 열은 셀 클릭, 열 표시/숨김은 머리글 체크박스. 변경 내용은 \'편집 종료\' 클릭 시 저장됩니다.'); };
  const sa = el('selAll'); if(sa){ sa.onclick = e=>e.stopPropagation(); sa.onchange = ()=>{ pageRows.forEach(v=>{ if(sa.checked) EDIT.sel.add(v.commission_no); else EDIT.sel.delete(v.commission_no); }); renderGrid(); }; }
  renderEditbar();
  el('grpnav').innerHTML = `${note('L3')} 바로가기: ` + GRID_JUMPS.map(k=>{ const c=COLUMNS.find(x=>x.key===k); return `<button data-go="${k}" title="${esc(c?c.label:k)} 열로 이동">${esc(c?c.label:k)}</button>`; }).join('') + ` <span class="muted">· 열 ${visibleCols().length}/${COLUMNS.length} · 가로 스크롤 · Comm No. 고정 ${note('L5')}</span>`;
  // 바로가기 이동: 고정된 Comm No. 열(AFAB 배지·편집 버튼 포함) 실제 너비만큼 띄워 대상 열이 가려지지 않게 함 (10/15 No.14)
  qa('#grpnav button').forEach(b=>b.onclick=()=>{ const th = b.dataset.go==='current_status' ? null : q(`thead th[data-sort="${b.dataset.go}"]`, wrap); const sticky = q('thead th.sticky', wrap); const stickyW = sticky? sticky.offsetWidth : 0;
    if(th) wrap.scrollTo({left: Math.max(0, th.offsetLeft - stickyW - 8), behavior:'smooth'}); else wrap.scrollTo({left:0,behavior:'smooth'}); });
  el('pager').innerHTML = `<span>${num(rows.length)}건 중 ${num((LF.page-1)*LF.size+1)}–${num(Math.min(rows.length, LF.page*LF.size))}</span>
    <button class="btn sm" id="pgPrev" ${LF.page<=1?'disabled':''}>‹ 이전</button><span>${LF.page} / ${totalPages}</span><button class="btn sm" id="pgNext" ${LF.page>=totalPages?'disabled':''}>다음 ›</button>
    <span class="muted">50행 페이지 (실제 구현은 가상 스크롤 또는 50행 페이지)</span>`;
  el('pgPrev').onclick=()=>{ LF.page--; renderGrid(); el('gridwrap').scrollTop=0; }; el('pgNext').onclick=()=>{ LF.page++; renderGrid(); el('gridwrap').scrollTop=0; };
}
function renderEditbar(){
  const bar = el('editbar'); if(!bar) return;
  bar.hidden = !EDIT.on; bar.replaceChildren();
  if(!EDIT.on) return;
  const n = EDIT.sel.size;
  bar.append(
    mk('b', null, '편집 모드'), mk('span', {class:'muted'}, '· 선택 '), mk('b', null, num(n)), mk('span', {class:'muted'}, '건'),
    mk('button', {class:'btn sm primary', disabled: n===0, onclick: openModelChange}, '오더 변경 (모델 일괄)'),
    mk('button', {class:'btn sm', disabled: n===0, onclick: openBulkKeyin}, 'Key-in 일괄 입력'),
    mk('button', {class:'btn sm', disabled: n===0, onclick: ()=>{ EDIT.sel.clear(); renderGrid(); }}, '선택 해제'),
    mk('span', {class:'muted small'}, 'Key-in 대상 열: B1 Factory Order · Sales Month (셀 클릭 → 개별 입력)'),
    mk('span', {class:'muted small'}, `· 저장 대기 ${num(pendingCount())}건 → '편집 종료' 시 저장·변경 이력 기록`));
}
function keyinLabel(key){ const c = COLUMNS.find(x=>x.key===key); return c? c.label : key; }
function setKeyinCell(td, val){ td.replaceChildren(); if(val==null||val==='') td.append(mk('span', {class:'dim'}, '·')); else td.append(String(val)); }

// ---- 편집 단위 저장 (10/15 No.9): 편집 중 변경은 pending에 쌓고 '편집 종료' 시 Store로 저장 + Vehicle_History 기록 ----
function stageChange(comm, key, nw, src){
  const v = VEHICLE_BY_COMM[comm]; if(!v) return;
  const p = EDIT.pending[comm] || (EDIT.pending[comm] = {});
  const old = key in p ? p[key].old : (v[key]==null? '' : v[key]);
  if(String(old)===String(nw==null? '' : nw)){ delete p[key]; if(!Object.keys(p).length) delete EDIT.pending[comm]; return; }
  p[key] = {old, nw, src};
}
function pendingCount(){ return Object.values(EDIT.pending).reduce((a,p)=>a+Object.keys(p).length, 0); }
function commitEdits(){
  const comms = Object.keys(EDIT.pending);
  if(!comms.length){ toast('편집 종료', '변경 내용이 없습니다.'); return; }
  const d = new Date(); const at = TODAY_S+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
  const hist = [];
  comms.forEach(comm=>{ const patch = {};
    Object.entries(EDIT.pending[comm]).forEach(([k,c])=>{ patch[k]=c.nw; hist.push({commission_no:comm, field:k, old_value:c.old, new_value:c.nw, changed_by:state.user, changed_at:at, source:c.src}); });
    Store.vehicles.update(comm, patch); });
  Store.history.add(hist);
  EDIT.pending = {};
  toast(`편집 종료 · 저장 ${num(comms.length)}건`, `${num(hist.length)}개 필드 → Vehicles 갱신 · Vehicle_History ${num(hist.length)}건 기록 · 대시보드·KUFRI 즉시 반영`);
}
function startCellEdit(td, comm, key){
  if(q('input', td)) return;
  const v = VEHICLE_BY_COMM[comm]; if(!v) return;
  const before = pendingVal(v, key)||'';
  const inp = mk('input', {class:'cell-in', value: before, placeholder: key==='sales_month'?'YYYY-MM':''});
  let done = false;
  const finish = save=>{ if(done) return; done = true;
    const val = inp.value.trim();
    if(save && val!==before){ stageChange(comm, key, val, '수동'); renderEditbar(); }
    setKeyinCell(td, save? val : before); td.classList.toggle('pend', !!(EDIT.pending[comm] && key in EDIT.pending[comm])); };
  inp.onkeydown = e=>{ if(e.key==='Enter') finish(true); else if(e.key==='Escape') finish(false); e.stopPropagation(); };
  inp.onblur = ()=>finish(true);
  inp.onclick = e=>e.stopPropagation();
  td.replaceChildren(inp); inp.focus(); inp.select();
}
function selectedVehicles(){ return [...EDIT.sel].map(c=>VEHICLE_BY_COMM[c]).filter(Boolean); }
function openModelChange(){
  const vs = selectedVehicles(); if(!vs.length) return;
  const by = countBy(vs, v=>pendingVal(v,'model'));
  const byBm = countBy(vs, v=>pendingVal(v,'bm'));
  const sel = mk('select', {id:'mmSel', style:'width:100%'}, MODEL_MASTER.filter(m=>m.active).map(m=>mk('option', {value:m.prefix}, `${m.prefix}-${m.code2} — ${m.type_desc} (${m.vehicle} ${m.model} ${m.axle} ${m.cab}${m.option?' '+m.option:''})`)));
  // 시작값 = 선택한 오더의 차량 마스터 BM (복수 선택 시 첫 오더 기준) (10/15 No.6)
  const curBm = String(pendingVal(vs[0],'bm')||''); const curPrefix = curBm.split('-')[0];
  if(MODEL_MASTER.some(m=>m.active && m.prefix===curPrefix)) sel.value = curPrefix;
  const body = mk('div', null,
    mk('div', {class:'callout'}, `선택한 오더 ${num(vs.length)}건의 모델 속성(Vehicle · Gen · Model · Axle · Cab · Option · Baumuster · BM)을 Model_Master에서 선택한 모델로 일괄 변경합니다. Model In AFAB는 AFAB 업로드 값이라 바뀌지 않으며, 'Type' 열의 점(초록/빨강)으로 일치 여부를 확인합니다. 변경 내용은 '편집 종료' 시 저장됩니다.`),
    mk('div', {class:'fields'},
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, '현재 BM'), mk('div', {class:'v'}, Object.keys(byBm).sort().map(k=>`${k} ${num(byBm[k])}건`).join(' · '))),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, '현재 모델 분포'), mk('div', {class:'v'}, Object.keys(by).sort().map(k=>`${k} ${num(by[k])}건`).join(' · '))),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, '변경할 모델 (Model_Master) *'), mk('div', {class:'v'}, sel))));
  openModal('오더 변경 — 모델 일괄 변경', '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, '취소'),
    mk('button', {class:'btn primary', onclick: ()=>{ const m = MODEL_MASTER.find(x=>x.prefix===sel.value); if(!m) return;
      const patch = Store.vehicles.modelMasterPatch(m);
      vs.forEach(v=>Object.entries(patch).forEach(([k,val])=>stageChange(v.commission_no, k, val, '수동/일괄'))); closeModal(); renderGrid();
      toast(`오더 변경 ${num(vs.length)}건 (저장 대기)`, `→ ${m.model} ${m.axle} ${m.cab}${m.option?' '+m.option:''} · '편집 종료' 시 Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록`); }}, '변경'));
}
function openBulkKeyin(){
  const vs = selectedVehicles(); if(!vs.length) return;
  const inputs = {};
  const row = (key, ph)=>{ inputs[key] = mk('input', {placeholder: ph}); return mk('div', {class:'f'}, mk('div', {class:'k'}, keyinLabel(key)), mk('div', {class:'v'}, inputs[key])); };
  const body = mk('div', null,
    mk('div', {class:'callout'}, `선택한 오더 ${num(vs.length)}건에 아래 값을 일괄 입력합니다. 비워 둔 열은 변경하지 않습니다. 변경 내용은 '편집 종료' 시 저장됩니다.`),
    mk('div', {class:'fields'}, row('b1_factory_order','예) B1-12345'), row('sales_month','YYYY-MM')));
  openModal('Key-in 일괄 입력', '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, '취소'),
    mk('button', {class:'btn primary', onclick: ()=>{ const changed = KEYIN_COLS.filter(k=>inputs[k].value.trim()!=='');
      if(!changed.length){ toast('입력값 없음', '하나 이상의 열에 값을 입력하세요.'); return; }
      vs.forEach(v=>changed.forEach(k=>stageChange(v.commission_no, k, inputs[k].value.trim(), '수동/일괄'))); closeModal(); renderGrid();
      toast(`Key-in 일괄 입력 ${num(vs.length)}건 (저장 대기)`, `열: ${changed.map(keyinLabel).join(' · ')} · '편집 종료' 시 Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록`); }}, '적용'));
}

// ---- 열 필터 (10/15 No.18): 머리글 ▼ → 값 목록 체크 선택 (값 검색 가능) ----
function openColFilter(btn, key){
  closeColFilter();
  const c = COLUMNS.find(x=>x.key===key); if(!c) return;
  const vals = [...new Set(VEHICLES.map(v=>filterVal(v,key)))].sort();
  const counts = countBy(VEHICLES, v=>filterVal(v,key));
  const checked = new Set(LF.col[key] || vals);
  const search = mk('input', {type:'text', placeholder: key==='model'? '값 검색 (예: 2853)' : '값 검색'});
  const list = mk('div', {class:'cf-list'});
  const shown = ()=>{ const t = search.value.trim().toLowerCase(); return vals.filter(x=>!t || x.toLowerCase().includes(t)); };
  const draw = ()=>{ list.replaceChildren();
    shown().forEach(x=>{ const cb = mk('input', {type:'checkbox', onchange:()=>{ if(cb.checked) checked.add(x); else checked.delete(x); }}); cb.checked = checked.has(x);
      list.append(mk('label', null, cb, mk('span', null, x), mk('span', {class:'muted small'}, num(counts[x]||0)))); });
    if(!list.childElementCount) list.append(mk('div', {class:'muted small'}, '일치하는 값이 없습니다.')); };
  search.oninput = draw; draw();
  const pop = mk('div', {class:'colfilter', id:'colfilter'},
    mk('div', {class:'cf-h'}, mk('b', null, c.label+' 열 필터'), mk('button', {class:'x', title:'닫기', onclick: closeColFilter}, '×')),
    search,
    mk('div', {class:'cf-tools'},
      mk('button', {class:'btn sm', onclick:()=>{ shown().forEach(x=>checked.add(x)); draw(); }}, '표시된 값 전체 선택'),
      mk('button', {class:'btn sm', onclick:()=>{ shown().forEach(x=>checked.delete(x)); draw(); }}, '표시된 값 해제')),
    list,
    mk('div', {class:'cf-foot'},
      mk('button', {class:'btn sm', onclick:()=>{ delete LF.col[key]; LF.page=1; closeColFilter(); renderGrid(); }}, '필터 해제'),
      mk('button', {class:'btn sm primary', onclick:()=>{ if(checked.size>=vals.length) delete LF.col[key]; else LF.col[key]=new Set(checked); LF.page=1; closeColFilter(); renderGrid(); }}, '적용')));
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom+4)+'px'; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth-296))+'px';
  document.body.append(pop); search.focus();
  setTimeout(()=>document.addEventListener('mousedown', colFilterOutside), 0);
}
function colFilterOutside(e){ if(!e.target.closest('#colfilter') && !e.target.closest('.cf')) closeColFilter(); }
function closeColFilter(){ const p = el('colfilter'); if(p) p.remove(); document.removeEventListener('mousedown', colFilterOutside); }

function openAddOrder(){
  const f = (l, inner)=>`<div class="f"><div class="k">${l}</div><div class="v">${inner}</div></div>`;
  openModal('오더 생성 '+note('L7'), `<div class="callout">AFAB에 아직 없는 오더(예: 구두 확정 오더, 특수 사양)를 수동 등록합니다. 이후 AFAB 업로드에서 같은 Commission No.가 들어오면 AFAB 필드가 덮어쓰고 출처가 AFAB로 바뀝니다.</div>
    <div class="fields">${f('Commission No. *','<input id="addComm" placeholder="예) 071009999">')}${f('Baumuster (8자리) *',`<select>${MODEL_MASTER.filter(m=>m.active).map(m=>`<option>${m.prefix} — ${m.type_desc} (${m.model} ${m.axle} ${m.cab})</option>`).join('')}</select>`)}
    ${f('PM *','<input placeholder="YYYY-MM" value="2027-03">')}${f('Color Code',`<select>${COLORS.map(c=>`<option>${c} ${COLOR_NAMES[c]}</option>`).join('')}</select>`)}${f('Order Note','<input placeholder="메모">')}</div>
    <div class="muted small" style="margin-top:8px">* 필수. 단계는 규칙 판정(Ordered), 모델 속성은 Model_Master 매핑으로 자동 채워집니다. Commission No.는 중복 생성할 수 없습니다.</div>
    <div class="small" id="addErr" style="color:var(--danger);margin-top:6px;font-weight:600" hidden></div>`,
    `<button class="btn" onclick="closeModal()">취소</button><button class="btn primary" id="addSave">저장</button>`);
  // Commission No. 중복 생성 불가 (10/15 No.12)
  el('addSave').onclick = ()=>{ const comm = el('addComm').value.trim(); const err = el('addErr');
    if(!comm){ err.textContent = 'Commission No.를 입력하세요.'; err.hidden = false; return; }
    if(VEHICLE_BY_COMM[comm]){ err.textContent = `Commission No. ${comm}는 이미 등록된 오더입니다. 중복 생성할 수 없습니다.`; err.hidden = false; toast('오더 생성 불가', `Commission No. ${comm} 중복`); return; }
    closeModal(); describe('오더 생성 저장', 'Vehicles에 1행 추가(출처: 수동) → 단계 Ordered 판정 → Vehicle_History·Audit_Log 기록 → 대시보드·KUFRI 즉시 반영'); };
}
