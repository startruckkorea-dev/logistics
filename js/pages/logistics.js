'use strict';
/* ===== Logistics 차량 마스터 (L1~L7) ===== */
const LF = { stage:'', cls:'', vehicle:'', model:'', pm:'', eta:'', q:'', sort:'commission_no', dir:1, page:1, size:50 };

PAGES.logistics = {
  title:'Logistics 차량 마스터', sub:`Commission No. 기준 1행 · ${COLUMNS.length}열`,
  render(root, params){
    LF.stage = params.get('stage')||''; LF.cls = params.get('cls')||''; LF.q = params.get('q')||''; LF.page=1;
    if(LF.stage==='Cancelled') LF.cls='';
    root.innerHTML = `<div class="card">
      <div class="card-h"><h2>단계 필터</h2>${note('L1')}<span class="spacer"></span>
        <div class="btn-group">
          <button class="btn editor-only" id="btnAdd">＋ 수동 오더 추가 ${note('L7')}</button>
          <button class="btn" id="btnCols">열 설정 ${note('L4')}</button>
          <button class="btn" id="btnExport">엑셀 내보내기</button>
        </div></div>
      <div class="chips" id="chips"></div>
      <div class="filters" id="filters" style="margin-top:10px"></div>
      <div class="grp-nav" id="grpnav"></div>
      <div class="grid-wrap" id="gridwrap"></div>
      <div class="pager" id="pager"></div>
    </div>`;
    renderChips(); renderFilters(); renderGrid();
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

function renderChips(){
  const by = countBy(VEHICLES, v=>v.current_status);
  const all = ['', ...STAGES, 'Cancelled'];
  el('chips').innerHTML = all.map(s=>`<span class="chip ${LF.stage===s?'active':''}" data-stage="${s}">${s?`<span class="dot" style="background:${STAGE_COLOR[s]}"></span>`:''}${s||'전체'} <span class="n">${num(s? (by[s]||0) : VEHICLES.length)}</span></span>`).join('');
  qa('#chips .chip').forEach(c=>c.onclick=()=>{ LF.stage=c.dataset.stage; LF.page=1; renderChips(); renderGrid(); });
}
function renderFilters(){
  const models = [...new Set(VEHICLES.map(v=>v.model))].sort();
  const pms = [...new Set(VEHICLES.map(v=>v.pm))].filter(Boolean).sort();
  const etas = [...new Set(VEHICLES.map(expectedArrivalYm))].filter(Boolean).sort();
  const opt = (arr, cur, all)=>`<option value="">${all}</option>`+arr.map(x=>`<option ${x===cur?'selected':''}>${x}</option>`).join('');
  el('filters').innerHTML = `${note('L2')}
    <label>Order 분류 <select id="fCls"><option value="">전체</option>${['Fixed order','Order (Changeable)'].map(c=>`<option ${LF.cls===c?'selected':''}>${c}</option>`).join('')}</select></label>
    <label>차종 <select id="fVeh">${opt(VEHICLE_TYPES, LF.vehicle, '전체')}</select></label>
    <label>모델 <select id="fModel">${opt(models, LF.model, '전체')}</select></label>
    <label>생산월(PM) <select id="fPm">${opt(pms, LF.pm, '전체')}</select></label>
    <label>입항월(ETA·예정) <select id="fEta">${opt(etas, LF.eta, '전체')}</select></label>
    <label>검색 <input id="fQ" placeholder="Comm / VIN / B/L / Vessel / 메모" value="${esc(LF.q)}" style="width:220px"></label>
    <button class="btn sm" id="fReset">초기화</button>
    <span class="muted small" id="fCount"></span>`;
  const bind=(id,key)=>{ el(id).onchange=e=>{ LF[key]=e.target.value; LF.page=1; renderGrid(); }; };
  bind('fCls','cls'); bind('fVeh','vehicle'); bind('fModel','model'); bind('fPm','pm'); bind('fEta','eta');
  el('fQ').oninput = e=>{ LF.q=e.target.value; LF.page=1; renderGrid(); };
  el('fReset').onclick = ()=>{ Object.assign(LF,{stage:'',cls:'',vehicle:'',model:'',pm:'',eta:'',q:'',page:1}); renderChips(); renderFilters(); renderGrid(); };
}
function cellHtml(c, v){
  const val = v[c.key];
  if(c.key==='current_status') return stagePill(val);
  if(c.key==='order_class') return classPill(val);
  if(c.key==='stock_level') return val==='Intransit'? `<span class="muted">${val}</span>` : val;
  if(c.key==='changeability_date' && v.changeability_dday!=null && v.changeability_dday<=30) return `${val} <span class="pill warn">D-${v.changeability_dday}</span>`;
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
  let h = `<table class="grid"><thead><tr class="fld"><th class="sticky" data-sort="commission_no">Commission No ${srcBadge('AFAB')}${sortIcon('commission_no')}</th>`;
  h += cols.filter(c=>c.key!=='commission_no').map(c=>`<th data-sort="${c.key}" title="${c.key}">${esc(c.label)} ${srcBadge(c.src)}${sortIcon(c.key)}</th>`).join('') + '</tr></thead><tbody>';
  h += pageRows.map(v=>`<tr data-comm="${v.commission_no}">`+cols.map(c=>`<td class="${c.key==='commission_no'?'sticky':''} ${c.num?'num':''} ${c.memo?'memo':''}" ${c.memo?`title="${esc(v[c.key])}"`:''}>${cellHtml(c,v)}</td>`).join('')+'</tr>').join('');
  h += '</tbody></table>';
  if(!rows.length) h = '<div class="muted" style="padding:30px;text-align:center">조건에 맞는 차량이 없습니다.</div>';
  const wrap = el('gridwrap'); wrap.innerHTML = h;
  qa('th[data-sort]', wrap).forEach(th=>th.onclick=()=>{ const k=th.dataset.sort; if(LF.sort===k) LF.dir*=-1; else { LF.sort=k; LF.dir=1; } renderGrid(); });
  qa('tbody tr', wrap).forEach(tr=>tr.onclick=()=>openVehicle(tr.dataset.comm));
  el('grpnav').innerHTML = `${note('L3')} 바로가기: ` + GRID_JUMPS.map(k=>{ const c=COLUMNS.find(x=>x.key===k); return `<button data-go="${k}" title="${esc(c?c.label:k)} 열로 이동">${esc(c?c.label:k)}</button>`; }).join('') + ` <span class="muted">· 열 ${cols.length}/${COLUMNS.length} · 가로 스크롤 · Comm No. 고정 ${note('L5')}</span>`;
  qa('#grpnav button').forEach(b=>b.onclick=()=>{ const th = b.dataset.go==='current_status' ? null : q(`thead th[data-sort="${b.dataset.go}"]`, wrap); if(th) wrap.scrollTo({left: Math.max(0, th.offsetLeft - 140), behavior:'smooth'}); else wrap.scrollTo({left:0,behavior:'smooth'}); });
  el('pager').innerHTML = `<span>${num(rows.length)}건 중 ${num((LF.page-1)*LF.size+1)}–${num(Math.min(rows.length, LF.page*LF.size))}</span>
    <button class="btn sm" id="pgPrev" ${LF.page<=1?'disabled':''}>‹ 이전</button><span>${LF.page} / ${totalPages}</span><button class="btn sm" id="pgNext" ${LF.page>=totalPages?'disabled':''}>다음 ›</button>
    <span class="muted">50행 페이지 (실제 구현은 가상 스크롤 또는 50행 페이지)</span>`;
  el('pgPrev').onclick=()=>{ LF.page--; renderGrid(); el('gridwrap').scrollTop=0; }; el('pgNext').onclick=()=>{ LF.page++; renderGrid(); el('gridwrap').scrollTop=0; };
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
