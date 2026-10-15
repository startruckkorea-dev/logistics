'use strict';
/* ===== Logistics 차량 마스터 (L1~L7) ===== */
const LF = { stage:'', cls:'', vehicle:'', model:'', pm:'', eta:'', q:'', sort:'commission_no', dir:1, page:1, size:50 };

const KEYIN_COLS = ['option','b1_factory_order','sales_month']; // 벌크업 모드 Key-in 대상 열
const EDIT = { on:false, sel:new Set() }; // 편집 모드(오더 복수 선택)

PAGES.logistics = {
  title:'Logistics 차량 마스터', sub:`Commission No. 기준 1행 · ${COLUMNS.length}열`,
  render(root, params){
    LF.stage = params.get('stage')||''; LF.cls = params.get('cls')||''; LF.q = params.get('q')||''; LF.page=1;
    if(LF.stage==='Cancelled') LF.cls='';
    EDIT.on=false; EDIT.sel.clear();
    root.innerHTML = `<div class="card">
      <div class="card-h"><div class="filters" id="filters"></div><span class="spacer"></span>
        <div class="btn-group">
          <button class="btn editor-only" id="btnAdd">＋ 수동 오더 추가 ${note('L7')}</button>
          <button class="btn" id="btnCols">열 설정 ${note('L4')}</button>
          <button class="btn" id="btnExport">엑셀 내보내기</button>
        </div></div>
      <div class="editbar editor-only" id="editbar" hidden></div>
      <div class="grp-nav" id="grpnav"></div>
      <div class="grid-wrap" id="gridwrap"></div>
      <div class="pager" id="pager"></div>
    </div>`;
    renderFilters(); renderGrid();
    el('btnCols').onclick = openColSettings;
    el('btnExport').onclick = ()=>describe('엑셀 내보내기', `현재 필터·열 그대로 .xlsx 생성(SheetJS) → 다운로드 + SharePoint /Exports/ 저장. 현재 ${num(filtered().length)}행 · ${visibleCols().length}열.`);
    el('btnAdd').onclick = openAddOrder;
  }
};

function filtered(){
  const qq = LF.q.trim().toLowerCase();
  let rows = VEHICLES.filter(v=>
    (!LF.stage || v.current_status===LF.stage) && (!LF.cls || v.order_class===LF.cls) && (!LF.vehicle || v.vehicle===LF.vehicle) && (!LF.model || v.model===LF.model) &&
    (!LF.pm || v.pm===LF.pm) && (!LF.eta || expectedArrivalYm(v)===LF.eta) &&
    (!qq || [v.commission_no,v.vin_no,v.bl_no,v.vessel,v.model,v.engine_no,v.invoice_no,v.order_note,v.tm_memo].some(x=>x&&String(x).toLowerCase().includes(qq))));
  const k=LF.sort, d=LF.dir;
  rows.sort((a,b)=>{ const x=a[k], y=b[k]; if(x===y) return 0; if(x===''||x==null) return 1; if(y===''||y==null) return -1; return (x>y?1:-1)*d; });
  return rows;
}
function visibleCols(){ return COLUMNS.filter(c=>!state.hiddenCols.has(c.key)); }

function renderFilters(){
  const models = [...new Set(VEHICLES.map(v=>v.model))].sort();
  const pms = [...new Set(VEHICLES.map(v=>v.pm))].filter(Boolean).sort();
  const etas = [...new Set(VEHICLES.map(expectedArrivalYm))].filter(Boolean).sort();
  const opt = (arr, cur, all)=>`<option value="">${all}</option>`+arr.map(x=>`<option ${x===cur?'selected':''}>${x}</option>`).join('');
  const by = countBy(VEHICLES, v=>v.current_status);
  const stages = ['', ...STAGES, 'Cancelled'];
  el('filters').innerHTML = `${note('L1')}
    <label>단계 <select id="fStage">${stages.map(s=>`<option value="${s}" ${LF.stage===s?'selected':''}>${s? `${s} (${num(by[s]||0)})` : `전체 (${num(VEHICLES.length)})`}</option>`).join('')}</select></label>
    ${note('L2')}
    <label>Order 분류 <select id="fCls"><option value="">전체</option>${['Fixed order','Order (Changeable)'].map(c=>`<option ${LF.cls===c?'selected':''}>${c}</option>`).join('')}</select></label>
    <label>차종 <select id="fVeh">${opt(VEHICLE_TYPES, LF.vehicle, '전체')}</select></label>
    <label>모델 <select id="fModel">${opt(models, LF.model, '전체')}</select></label>
    <label>생산월(PM) <select id="fPm">${opt(pms, LF.pm, '전체')}</select></label>
    <label>입항월(ETA·예정) <select id="fEta">${opt(etas, LF.eta, '전체')}</select></label>
    <label>검색 <input id="fQ" placeholder="Comm / VIN / B/L / Vessel / 메모" value="${esc(LF.q)}" style="width:220px"></label>
    <button class="btn sm" id="fReset">초기화</button>
    <span class="muted small" id="fCount"></span>`;
  const bind=(id,key)=>{ el(id).onchange=e=>{ LF[key]=e.target.value; LF.page=1; renderGrid(); }; };
  bind('fStage','stage'); bind('fCls','cls'); bind('fVeh','vehicle'); bind('fModel','model'); bind('fPm','pm'); bind('fEta','eta');
  el('fQ').oninput = e=>{ LF.q=e.target.value; LF.page=1; renderGrid(); };
  el('fReset').onclick = ()=>{ Object.assign(LF,{stage:'',cls:'',vehicle:'',model:'',pm:'',eta:'',q:'',page:1}); renderFilters(); renderGrid(); };
}
function cellHtml(c, v){
  const val = v[c.key];
  if(c.key==='current_status') return stagePill(val);
  if(c.key==='order_class') return classPill(val);
  if(c.key==='stock_level') return val==='Intransit'? `<span class="muted">${val}</span>` : val;
  if(c.key==='model'){ const ok = String(val||'').slice(0,4)===String(v.model_in_afab||'').slice(0,4); return `<span class="dot ${ok?'ok':'bad'}" title="${ok?'Model In AFAB 앞 4글자 일치':'Model In AFAB 앞 4글자 불일치: '+esc(v.model_in_afab)}"></span>${esc(val)}`; }
  if(c.key==='changeability_date'){
    const dc = {J:'ok', N:'bad', B:'warn'}[v.afab_editable];
    const dot = dc? `<span class="dot ${dc}" title="AFAB 수정 가능(Ä): ${esc(v.afab_editable)}"></span>` : '';
    const dd = (v.changeability_dday!=null && v.changeability_dday<=30)? ` <span class="pill warn">D-${v.changeability_dday}</span>` : '';
    return `${dot}${val? esc(val) : '<span class="dim">·</span>'}${dd}`;
  }
  if(c.key==='ata' && v.eta_mismatch && (v.current_status==='In Transit'||v.current_status==='Shipment scheduled')) return `${val||''} <span class="pill warn" title="선사 ETA 불일치 >7일">Δ</span>`;
  if(c.key==='color_code') return `<span title="${esc(COLOR_NAMES[val]||'')}">${val}</span>`;
  if(c.num) return num(val);
  if(val==null||val==='') return '<span class="dim">·</span>';
  return esc(val);
}
function renderGrid(){
  const rows = filtered(); const cols = visibleCols();
  const totalPages = Math.max(1, Math.ceil(rows.length/LF.size)); if(LF.page>totalPages) LF.page=totalPages;
  const pageRows = rows.slice((LF.page-1)*LF.size, LF.page*LF.size);
  el('fCount').textContent = `${num(rows.length)}건 / 전체 ${num(VEHICLES.length)}`;
  // 헤더 1줄 (그룹 헤더 줄 없음 · Comm No.는 첫 열 고정)
  const sortIcon = k=> LF.sort===k? `<span class="sort">${LF.dir>0?'▲':'▼'}</span>`:'';
  const canEdit = isEditor();
  let h = `<table class="grid"><thead><tr class="fld"><th class="sticky" data-sort="commission_no">${EDIT.on?'<input type="checkbox" id="selAll" title="현재 페이지 전체 선택">':''}Commission No ${srcBadge('AFAB')}${sortIcon('commission_no')} <button class="btn sm editor-only ${EDIT.on?'primary':''}" id="btnEdit" title="오더 복수 선택 → 오더 변경 · Key-in 일괄 입력">${EDIT.on?'편집 종료':'편집'}</button></th>`;
  h += cols.filter(c=>c.key!=='commission_no').map(c=>`<th data-sort="${c.key}" title="${c.key}">${esc(c.label)} ${srcBadge(c.src)}${sortIcon(c.key)}</th>`).join('') + '</tr></thead><tbody>';
  const selBox = v=> EDIT.on? `<input type="checkbox" class="rowsel" ${EDIT.sel.has(v.commission_no)?'checked':''}>` : '';
  const keyin = c=> canEdit && KEYIN_COLS.includes(c.key);
  h += pageRows.map(v=>`<tr data-comm="${v.commission_no}" class="${EDIT.sel.has(v.commission_no)?'sel':''}">`+cols.map(c=>`<td class="${c.key==='commission_no'?'sticky':''} ${c.num?'num':''} ${c.memo?'memo':''} ${keyin(c)?'keyin':''}" data-key="${c.key}" ${c.memo?`title="${esc(v[c.key])}"`:''} ${keyin(c)?'title="클릭하여 개별 입력 (Key-in)"':''}>${c.key==='commission_no'?selBox(v):''}${cellHtml(c,v)}</td>`).join('')+'</tr>').join('');
  h += '</tbody></table>';
  if(!rows.length) h = '<div class="muted" style="padding:30px;text-align:center">조건에 맞는 차량이 없습니다.</div>';
  const wrap = el('gridwrap'); wrap.innerHTML = h;
  qa('th[data-sort]', wrap).forEach(th=>th.onclick=()=>{ const k=th.dataset.sort; if(LF.sort===k) LF.dir*=-1; else { LF.sort=k; LF.dir=1; } renderGrid(); });
  qa('tbody tr', wrap).forEach(tr=>tr.onclick=e=>{
    if(canEdit && e.target.closest('td.keyin')) return;             // Key-in 셀은 개별 입력
    if(!EDIT.on){ openVehicle(tr.dataset.comm); return; }
    const box = q('.rowsel', tr); const on = e.target===box? box.checked : !EDIT.sel.has(tr.dataset.comm);
    if(on) EDIT.sel.add(tr.dataset.comm); else EDIT.sel.delete(tr.dataset.comm);
    box.checked = on; tr.classList.toggle('sel', on); renderEditbar();
  });
  qa('td.keyin', wrap).forEach(td=>td.onclick=e=>{ e.stopPropagation(); startCellEdit(td, td.closest('tr').dataset.comm, td.dataset.key); });
  const be = el('btnEdit'); if(be) be.onclick = e=>{ e.stopPropagation(); EDIT.on=!EDIT.on; EDIT.sel.clear(); renderGrid(); if(EDIT.on) toast('편집 모드', '행 클릭 또는 체크박스로 오더를 복수 선택한 뒤 위 버튼으로 일괄 변경합니다.'); };
  const sa = el('selAll'); if(sa){ sa.onclick = e=>e.stopPropagation(); sa.onchange = ()=>{ pageRows.forEach(v=>{ if(sa.checked) EDIT.sel.add(v.commission_no); else EDIT.sel.delete(v.commission_no); }); renderGrid(); }; }
  renderEditbar();
  el('grpnav').innerHTML = `${note('L3')} 바로가기: ` + GRID_JUMPS.map(k=>{ const c=COLUMNS.find(x=>x.key===k); return `<button data-go="${k}" title="${esc(c?c.label:k)} 열로 이동">${esc(c?c.label:k)}</button>`; }).join('') + ` <span class="muted">· 열 ${cols.length}/${COLUMNS.length} · 가로 스크롤 · Comm No. 고정 ${note('L5')}</span>`;
  qa('#grpnav button').forEach(b=>b.onclick=()=>{ const th = b.dataset.go==='current_status' ? null : q(`thead th[data-sort="${b.dataset.go}"]`, wrap); if(th) wrap.scrollTo({left: Math.max(0, th.offsetLeft - 140), behavior:'smooth'}); else wrap.scrollTo({left:0,behavior:'smooth'}); });
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
    mk('span', {class:'muted small'}, 'Key-in 대상 열: Option · B1 Factory Order · Sales Month (셀 클릭 → 개별 입력)'));
}
function keyinLabel(key){ const c = COLUMNS.find(x=>x.key===key); return c? c.label : key; }
function setKeyinCell(td, val){ td.replaceChildren(); if(val==null||val==='') td.append(mk('span', {class:'dim'}, '·')); else td.append(String(val)); }
function optionDatalist(){ const dl = mk('datalist', {id:'optList'}); [...new Set(MODEL_MASTER.map(m=>m.option).filter(Boolean))].sort().forEach(o=>dl.append(mk('option', {value:o}))); return dl; }
function startCellEdit(td, comm, key){
  if(q('input', td)) return;
  const v = VEHICLE_BY_COMM[comm]; if(!v) return;
  const before = v[key]||'';
  const inp = mk('input', {class:'cell-in', value: before, placeholder: key==='sales_month'?'YYYY-MM':'', list: key==='option'?'optList':null});
  let done = false;
  const finish = save=>{ if(done) return; done = true;
    const val = inp.value.trim();
    if(save && val!==before){ Store.vehicles.update(comm, {[key]: val}); toast('Key-in 저장', `${comm} · ${keyinLabel(key)}: ${val||'(삭제)'} → Vehicles 갱신 · Vehicle_History(출처: 수동) 기록`); }
    setKeyinCell(td, save? val : before); };
  inp.onkeydown = e=>{ if(e.key==='Enter') finish(true); else if(e.key==='Escape') finish(false); e.stopPropagation(); };
  inp.onblur = ()=>finish(true);
  inp.onclick = e=>e.stopPropagation();
  td.replaceChildren(inp, optionDatalist()); inp.focus(); inp.select();
}
function selectedVehicles(){ return [...EDIT.sel].map(c=>VEHICLE_BY_COMM[c]).filter(Boolean); }
function openModelChange(){
  const vs = selectedVehicles(); if(!vs.length) return;
  const by = countBy(vs, v=>v.model);
  const sel = mk('select', {id:'mmSel', style:'width:100%'}, MODEL_MASTER.filter(m=>m.active).map(m=>mk('option', {value:m.prefix}, `${m.prefix} — ${m.type_desc} (${m.vehicle} ${m.model} ${m.axle} ${m.cab}${m.option?' '+m.option:''})`)));
  const body = mk('div', null,
    mk('div', {class:'callout'}, `선택한 오더 ${num(vs.length)}건의 모델 속성(Vehicle · Gen · Model · Axle · Cab · Option · Baumuster · BM)을 Model_Master에서 선택한 모델로 일괄 변경합니다. Model In AFAB는 AFAB 업로드 값이라 바뀌지 않으며, 'Model' 열의 점(초록/빨강)으로 일치 여부를 확인합니다.`),
    mk('div', {class:'fields'},
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, '현재 모델 분포'), mk('div', {class:'v'}, Object.keys(by).sort().map(k=>`${k} ${num(by[k])}건`).join(' · '))),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, '변경할 모델 (Model_Master) *'), mk('div', {class:'v'}, sel))));
  openModal('오더 변경 — 모델 일괄 변경', '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, '취소'),
    mk('button', {class:'btn primary', onclick: ()=>{ const m = MODEL_MASTER.find(x=>x.prefix===sel.value); if(!m) return; vs.forEach(v=>Store.vehicles.applyModelMaster(v.commission_no, m)); closeModal(); renderGrid();
      toast(`오더 변경 ${num(vs.length)}건`, `→ ${m.model} ${m.axle} ${m.cab}${m.option?' '+m.option:''} · Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록 · 대시보드·KUFRI 즉시 반영`); }}, '변경'));
}
function openBulkKeyin(){
  const vs = selectedVehicles(); if(!vs.length) return;
  const inputs = {};
  const row = (key, ph)=>{ inputs[key] = mk('input', {placeholder: ph, list: key==='option'?'optList':null}); return mk('div', {class:'f'}, mk('div', {class:'k'}, keyinLabel(key)), mk('div', {class:'v'}, inputs[key])); };
  const body = mk('div', null,
    mk('div', {class:'callout'}, `선택한 오더 ${num(vs.length)}건에 아래 값을 일괄 입력합니다. 비워 둔 열은 변경하지 않습니다.`),
    mk('div', {class:'fields'}, row('option','예) ProCabin'), row('b1_factory_order','예) B1-12345'), row('sales_month','YYYY-MM')), optionDatalist());
  openModal('Key-in 일괄 입력', '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, '취소'),
    mk('button', {class:'btn primary', onclick: ()=>{ const changed = KEYIN_COLS.filter(k=>inputs[k].value.trim()!=='');
      if(!changed.length){ toast('입력값 없음', '하나 이상의 열에 값을 입력하세요.'); return; }
      const patch = {}; changed.forEach(k=>{ patch[k]=inputs[k].value.trim(); });
      Store.vehicles.updateMany(vs.map(v=>v.commission_no), patch); closeModal(); renderGrid();
      toast(`Key-in 일괄 입력 ${num(vs.length)}건`, `열: ${changed.map(keyinLabel).join(' · ')} → Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록`); }}, '적용'));
}
function openColSettings(){
  const body = `<div class="callout">열 표시/숨김은 이 목업에서 바로 반영됩니다. 실제 시스템에서는 사용자별 표시·순서·고정 설정이 SharePoint(사용자 설정 List)에 저장되어 다음 로그인에도 유지됩니다. 순서 변경(드래그)·추가 고정 열은 설명만 표시합니다.</div>
    <div class="grid3">${GROUPS.map(g=>`<div><h3 class="small" style="margin-bottom:6px">${g}</h3>${COLUMNS.filter(c=>c.group===g).map(c=>`<label style="display:flex;gap:6px;align-items:center;padding:3px 0"><input type="checkbox" data-col="${c.key}" ${state.hiddenCols.has(c.key)?'':'checked'} ${c.key==='commission_no'?'disabled':''}> ${esc(c.label)} ${srcBadge(c.src)}${c.key==='commission_no'?'<span class="muted small">(고정)</span>':''}</label>`).join('')}</div>`).join('')}</div>`;
  openModal('열 설정 '+note('L4'), body, `<button class="btn" onclick="describe('순서 변경·고정', '드래그로 열 순서를 바꾸고 📌로 좌측 고정 열을 추가합니다. 사용자별 저장.')">순서·고정 설정</button><button class="btn" onclick="state.hiddenCols=new Set(DEFAULT_HIDDEN_COLS);closeModal();renderGrid();">기본값</button><button class="btn primary" id="colApply">적용</button>`);
  el('colApply').onclick = ()=>{ qa('#modal-body input[data-col]').forEach(i=>{ if(i.checked) state.hiddenCols.delete(i.dataset.col); else state.hiddenCols.add(i.dataset.col); }); closeModal(); renderGrid(); toast('열 설정 적용', `표시 열 ${visibleCols().length}/${COLUMNS.length} (목업: 새로고침 시 초기화)`); };
}
function openAddOrder(){
  const f = (l, inner)=>`<div class="f"><div class="k">${l}</div><div class="v">${inner}</div></div>`;
  openModal('수동 오더 추가 '+note('L7'), `<div class="callout">AFAB에 아직 없는 오더(예: 구두 확정 오더, 특수 사양)를 수동 등록합니다. 이후 AFAB 업로드에서 같은 Commission No.가 들어오면 AFAB 필드가 덮어쓰고 출처가 AFAB로 바뀝니다.</div>
    <div class="fields">${f('Commission No. *','<input placeholder="예) 071009999">')}${f('Baumuster (8자리) *',`<select>${MODEL_MASTER.filter(m=>m.active).map(m=>`<option>${m.prefix} — ${m.type_desc} (${m.model} ${m.axle} ${m.cab})</option>`).join('')}</select>`)}
    ${f('PM *','<input placeholder="YYYY-MM" value="2027-03">')}${f('Order Date','<input value="'+TODAY_S+'">')}${f('Color Code',`<select>${COLORS.map(c=>`<option>${c} ${COLOR_NAMES[c]}</option>`).join('')}</select>`)}${f('Order Note','<input placeholder="메모">')}</div>
    <div class="muted small" style="margin-top:8px">* 필수. 단계는 규칙 판정(Ordered), 모델 속성은 Model_Master 매핑으로 자동 채워집니다.</div>`,
    `<button class="btn" onclick="closeModal()">취소</button><button class="btn primary" onclick="closeModal();describe('수동 오더 저장', 'Vehicles에 1행 추가(출처: 수동) → 단계 Ordered 판정 → Vehicle_History·Audit_Log 기록 → 대시보드·KUFRI 즉시 반영')">저장</button>`);
}
