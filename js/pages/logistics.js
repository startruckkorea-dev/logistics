'use strict';
/* ===== Logistics 차량 마스터 (L1~L7) ===== */
const LF = { q:'', col:{}, sort:'commission_no', dir:-1, page:1, size:50, tab:'grid' }; // col: 열 필터 {key: Set(선택값)} (10/15 No.18) · 기본 정렬 Commission No 최신순 (10/19 No.18) · 단계는 상단 필터 대신 Current Status 열 필터로 (10/22 No.2) · tab: 페이지 탭 (10/26 No.1)
// 페이지 탭 4개 (10/26 No.1): 1번 = 차량 마스터 그리드(홈), 2~4번 = 통관·보험(js/pages/customs.js). 이름은 영문 고정. ?tab= 으로 진입 가능, 없으면 grid
const LOGI_TABS = [['grid','Logistics'], ['req','Request of Customs Clearance'], ['input','Update Customs Clearance Info'], ['ins','Insurance']];

const KEYIN_COLS = ['b1_factory_order','sales_month']; // 편집 모드 Key-in 대상 열 (10/15 No.5: Option은 Model_Master 자동 반영으로 제외)
// 열 필터 적용 열 (10/19 No.3): Current Status(단계 순) + 모델 관련 Vehicle~Option + 날짜 열(연·월 단위) + Vessel · 모두 URL 파라미터(?vessel=…&model=…&ata=YYYY-MM)로 미리 설정 가능 (10/22)
const DATE_FILTER_COLS = ['changeability_date','pm','original_pm','tdd_calc','dispatch','shipping','invoice','planned_arrival','eta_from_tdd','eta_from_eukor_pirt','ata','tsc_arrival_date','customs_clearance_date']; // 10/26 No.9: TSC Arrival Date 추가
const FILTER_COLS = ['current_status','gen','vehicle','series','model','axle','cab','option', ...DATE_FILTER_COLS, 'vessel']; // gen: 선적·입항 구분 그룹 행 링크용 (10/22)
const STAGE_ORDER = [...STAGES.filter(s=>s!=='Rejected'), 'Cancelled']; STAGE_ORDER.splice(STAGE_ORDER.indexOf('In Production'), 0, 'Rejected'); // Current Status 열 필터 값 순서 (10/22 No.2): Rejected는 In Production 앞 (STAGE_RULES 순서와 동일)
const SEARCH_COLS = ['commission_no','vin_no','bl_no','vessel','model','engine_no','order_note','option_remarks']; // 검색 대상 열 (10/19 No.4: VIN·Comm·Order Note·Option Note 필수 포함)
const EDIT = { on:false, sel:new Set(), pending:{} }; // 편집 모드(오더 복수 선택) · pending: {comm:{field:{old,nw,src}}} → '편집 종료' 시 저장 (10/15 No.9)

PAGES.logistics = {
  title:'Logistics 차량 마스터', sub:`Commission No. 기준 1행 · ${COLUMNS.length}열 · Customs · Insurance`,
  render(root, params){
    LF.q = params.get('q')||''; LF.page=1; LF.col={};
    const st = params.get('stage'); if(st) LF.col.current_status = new Set(st.split(',')); // ?stage= (대시보드 카드·파이프라인·AFAB 링크, 쉼표 구분 복수) → Current Status 열 필터
    FILTER_COLS.forEach(k=>{ const v = params.get(k); if(v!=null) LF.col[k] = new Set(v.split(',').map(x=> x===''? '(빈 값)' : x)); }); // 열 필터 파라미터 (10/22 선적·입항 수량 셀 클릭): 쉼표 구분 복수 · 빈 문자열 = '(빈 값)'
    const tabs = isSales()? LOGI_TABS.filter(t=>t[0]==='req') : LOGI_TABS; // 10/27: Sales는 Request of Customs Clearance 탭만 (그리드·Update·Insurance 없음)
    LF.tab = isSales()? 'req' : (LOGI_TABS.some(t=>t[0]===params.get('tab')) ? params.get('tab') : 'grid'); // 대시보드·선적·입항 링크(?stage=·?vessel=)는 tab 없음 → 그리드
    EDIT.on=false; EDIT.sel.clear(); EDIT.pending={}; closeColFilter();
    root.innerHTML = `<div class="card"><div class="tabs" id="lgTabs"></div><div id="lgBody"></div></div>`;
    el('lgTabs').append(...tabs.map(([k,label])=>mk('span', {class:'tab', 'data-tab':k, onclick:()=>switchLogiTab(k)}, label)), noteEl('L1'));
    renderLogiBody();
  }
};
window.addEventListener('hashchange', ()=>closeColFilter());
// 탭 전환 (10/26 No.1): 편집 중 저장 대기 값이 있으면 전환하지 않음(언어 토글과 동일) · 전환 시 편집 모드·선택 해제, 검색어·열 필터(LF)는 유지
function switchLogiTab(k){
  if(k===LF.tab) return;
  if(EDIT.on && pendingCount()>0){ toast(tx('탭 전환 불가'), tx("저장 대기 중인 편집 내용이 있습니다. '편집 종료'로 저장한 뒤 전환하세요.")); return; }
  EDIT.on=false; EDIT.sel.clear(); EDIT.pending={}; closeColFilter(); LF.tab=k; renderLogiBody();
}
function renderLogiBody(){
  qa('#lgTabs .tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===LF.tab));
  const body = el('lgBody');
  if(LF.tab!=='grid'){ body.replaceChildren(); renderCustomsTab(body, LF.tab); return; } // 탭 2~4: js/pages/customs.js
  body.innerHTML = `<div class="card-h"><div class="filters" id="filters"></div><span class="spacer"></span>
      <div class="btn-group">
        <button class="btn editor-only" id="btnAdd">${tx('오더 생성')} ${note('L7')}</button>
        <button class="btn" id="btnExport">${tx('엑셀 내보내기')}</button>
      </div></div>
    <div class="editbar editor-only" id="editbar" hidden></div>
    <div class="grp-nav" id="grpnav"></div>
    <div class="grid-wrap" id="gridwrap"></div>
    <div class="pager" id="pager"></div>`;
  renderFilters(); renderGrid(); // ?q= 로 들어온 경우 검색어만 자동 입력하고 스크롤은 하지 않음 (검색창 입력 시에만 일치 위치로 이동)
  el('btnExport').onclick = ()=>describe('엑셀 내보내기', `현재 필터·열 그대로 .xlsx 생성(SheetJS) → 다운로드 + SharePoint /Exports/ 저장. 현재 ${num(filtered().length)}행 · ${visibleCols().length}열.`);
  el('btnAdd').onclick = openAddOrder;
}

// 날짜 열은 연·월(YYYY-MM) 단위로 필터 (10/19 No.3)
function filterVal(v, key){ const x = v[key]; if(x==null||x==='') return '(빈 값)'; return DATE_FILTER_COLS.includes(key)? String(x).slice(0,7) : String(x); }
// 검색어 → 검색 항목 배열 (10/27): 쉼표·세미콜론으로 나눠 여러 Commission No를 한 번에 조회 (OR). 숫자·공백만 있으면 공백 구분도 허용(엑셀 열 붙여넣기). 그 외(선박명 등 공백 포함 문구)는 한 덩어리로 검색
function searchTerms(){
  const qq = LF.q.trim(); if(!qq) return [];
  let t = qq.split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
  if(t.length===1 && /^[\d\s]+$/.test(qq)) t = qq.split(/\s+/).filter(Boolean);
  return [...new Set(t.map(s=>s.toLowerCase()))];
}
function filtered(){
  const terms = searchTerms();
  let rows = VEHICLES.filter(v=>
    FILTER_COLS.every(k=> !LF.col[k] || LF.col[k].has(filterVal(v,k))) &&
    (!terms.length || terms.some(qq=>SEARCH_COLS.some(k=>v[k]&&String(v[k]).toLowerCase().includes(qq)))));
  const k=LF.sort, d=LF.dir;
  rows.sort((a,b)=>{ const x=a[k], y=b[k]; if(x===y) return 0; if(x===''||x==null) return 1; if(y===''||y==null) return -1; return (x>y?1:-1)*d; });
  return rows;
}
function visibleCols(){ return COLUMNS.filter(c=>!state.hiddenCols.has(c.key)); }

function renderFilters(){
  el('filters').innerHTML = `${note('L2')}
    <label>${tx('검색')} <input id="fQ" placeholder="${esc(tx('Comm(여러 개는 쉼표 구분) / VIN / B/L / Vessel / Type / Order·Option Note'))}" title="${esc(tx('Comm(여러 개는 쉼표 구분) / VIN / B/L / Vessel / Type / Order·Option Note'))}" value="${esc(LF.q)}" style="width:520px;max-width:60vw"></label>
    <button class="btn sm" id="fReset">${tx('초기화')}</button>
    <button class="btn sm editor-only" id="btnEdit"></button>
    <span class="muted small" id="fCount"></span>`;
  el('fQ').oninput = e=>{ LF.q=e.target.value; LF.page=1; renderGrid(); scrollToMatch(); };
  el('fReset').onclick = ()=>{ Object.assign(LF,{q:'',page:1}); LF.col={}; renderFilters(); renderGrid(); };
  el('btnEdit').onclick = toggleEdit; syncEditBtn();
}
// 편집 버튼: '초기화' 옆 (10/19 No.1) · 라벨·상태는 편집 모드에 맞춰 갱신
// 검색 실행 시 검색어가 포함된 첫 셀(하이라이트)이 보이도록 그리드를 스크롤 (10/19 No.1): 행은 맨 위, 열은 고정 Comm No. 열 너비만큼 띄워 이동
function scrollToMatch(){
  const wrap = el('gridwrap'); if(!wrap) return; wrap.scrollTop = 0;
  const m = q('tbody mark', wrap); const td = m && m.closest('td');
  if(!td || td.classList.contains('sticky')){ wrap.scrollLeft = 0; return; }
  const sticky = q('thead th.sticky', wrap); const stickyW = sticky? sticky.offsetWidth : 0;
  wrap.scrollLeft = Math.max(0, td.offsetLeft - stickyW - 8); // 입력마다 표가 다시 그려지므로 애니메이션 없이 즉시 이동
}
function syncEditBtn(){
  const be = el('btnEdit'); if(!be) return;
  be.textContent = EDIT.on? tx('편집 종료') : tx('편집');
  be.classList.toggle('primary', EDIT.on);
  be.title = EDIT.on? '변경 내용을 저장하고 편집을 종료합니다' : '오더 복수 선택 → 오더 변경 · Key-in 입력 · 열 표시/숨김';
}
function toggleEdit(){
  if(EDIT.on){ commitEdits(); EDIT.on=false; EDIT.sel.clear(); renderGrid(); return; }
  EDIT.on=true; EDIT.sel.clear(); renderGrid();
  toast('편집 모드', '행 클릭 또는 체크박스로 오더를 복수 선택한 뒤 위 버튼으로 일괄 변경합니다. Key-in 열은 셀 클릭, 열 표시/숨김은 머리글 체크박스. 변경 내용은 \'편집 종료\' 클릭 시 저장됩니다.');
}
// 검색어 일치 부분 하이라이트 (10/19 No.5) — esc 처리 후 <mark>로 감싼다 · 10/27: 검색 항목 여러 개(searchTerms)를 모두 표시
function hl(s){
  const t = String(s==null?'':s); const terms = searchTerms(); if(!terms.length) return esc(t);
  const re = new RegExp(terms.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  let out = '', last = 0, m;
  while((m = re.exec(t))){ out += esc(t.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; }
  return out + esc(t.slice(last));
}
// 편집 중 저장 대기 값이 있으면 그 값을, 없으면 저장된 값을 돌려준다
function pendingVal(v, key){ const p = EDIT.pending[v.commission_no]; return (p && key in p)? p[key].nw : v[key]; }
function cellHtml(c, v){
  const val = pendingVal(v, c.key);
  if(c.key==='current_status') return stagePill(val);
  // 상태점은 셀 오른쪽 끝에 표시 (10/15 No.7)
  if(c.key==='model'){ const ok = String(val||'').slice(0,4)===String(v.model_in_afab||'').slice(0,4); return `${hl(val)}<span class="dot r ${ok?'ok':'bad'}" title="${ok?'Model In AFAB 앞 4글자 일치':'Model In AFAB 앞 4글자 불일치: '+esc(v.model_in_afab)}"></span>`; }
  if(c.key==='changeability_date'){
    const dc = {J:'ok', N:'bad', B:'warn'}[v.afab_editable];
    const dot = dc? `<span class="dot r ${dc}" title="AFAB 수정 가능(Ä): ${esc(v.afab_editable)}"></span>` : '';
    const dd = (v.changeability_dday!=null && v.changeability_dday<=30)? ` <span class="pill warn">D-${v.changeability_dday}</span>` : '';
    return `${val? esc(val) : '<span class="dim">·</span>'}${dd}${dot}`;
  }
  if(c.key==='color_code') return `<span title="${esc(COLOR_NAMES[val]||'')}">${val}</span>`;
  if(c.num) return num(val);
  if(val==null||val==='') return '<span class="dim">·</span>';
  return SEARCH_COLS.includes(c.key)? hl(val) : esc(val);
}
function renderGrid(){
  const rows = filtered(); const cols = EDIT.on ? COLUMNS : visibleCols(); // 편집 모드에서는 숨긴 열도 머리글(체크박스)만 표시 (10/15 No.15)
  const totalPages = Math.max(1, Math.ceil(rows.length/LF.size)); if(LF.page>totalPages) LF.page=totalPages;
  const pageRows = rows.slice((LF.page-1)*LF.size, LF.page*LF.size);
  const fkeys = Object.keys(LF.col);
  el('fCount').textContent = tx('{n}건 / 전체 {m}', {n:num(rows.length), m:num(VEHICLES.length)}) + (fkeys.length? tx(' · 열 필터: {cols}', {cols:fkeys.map(keyinLabel).join(' · ')}) : '');
  // 헤더 2줄 (10/19 No.2): 1행 = 열 이름만 · 2행 = 체크박스 · 출처 배지 · 정렬 표시 · 열 필터 (Comm No.는 첫 열 고정)
  const sortIcon = k=> LF.sort===k? `<span class="sort">${LF.dir>0?'▲':'▼'}</span>`:'';
  const canEdit = isEditor();
  const hid = c=> EDIT.on && state.hiddenCols.has(c.key);
  const colBox = c=> EDIT.on? `<input type="checkbox" class="colvis" data-col="${c.key}" ${hid(c)?'':'checked'} title="열 표시/숨김 (체크 해제 → 숨김)">` : '';
  const filtBtn = c=> FILTER_COLS.includes(c.key)? `<button class="cf ${LF.col[c.key]?'on':''}" data-filter="${c.key}" title="${esc(c.label)} 열 필터">▼</button>` : '';
  const rest = cols.filter(c=>c.key!=='commission_no');
  let h = `<table class="grid"><thead><tr class="fld"><th class="sticky" data-sort="commission_no" title="commission_no">Commission No</th>`;
  h += rest.map(c=>`<th data-sort="${c.key}" class="${hid(c)?'hid':''}" title="${c.key}">${esc(tx(c.label))}</th>`).join('') + '</tr>';
  h += `<tr class="sub"><th class="sticky" data-sort="commission_no">${EDIT.on?'<input type="checkbox" id="selAll" title="현재 페이지 전체 선택">':''}${srcBadge('AFAB')}${sortIcon('commission_no')}</th>`;
  h += rest.map(c=>`<th data-sort="${c.key}" class="${hid(c)?'hid':''}">${colBox(c)}${srcBadge(c.src, c.keyin)}${sortIcon(c.key)}${filtBtn(c)}</th>`).join('') + '</tr></thead><tbody>';
  const selBox = v=> EDIT.on? `<input type="checkbox" class="rowsel" ${EDIT.sel.has(v.commission_no)?'checked':''}>` : '';
  const keyin = c=> canEdit && EDIT.on && KEYIN_COLS.includes(c.key); // Key-in 열도 편집 모드에서만 입력 (10/15 No.4)
  const pend = (v,c)=> EDIT.pending[v.commission_no] && c.key in EDIT.pending[v.commission_no];
  h += pageRows.map(v=>`<tr data-comm="${v.commission_no}" class="${EDIT.sel.has(v.commission_no)?'sel':''}">`+cols.map(c=>`<td class="${c.key==='commission_no'?'sticky':''} ${c.num?'num':''} ${c.memo?'memo':''} ${keyin(c)?'keyin':''} ${hid(c)?'hid':''} ${pend(v,c)?'pend':''} ${(c.key==='model'||c.key==='changeability_date')?'dotcell':''}" data-key="${c.key}" ${c.memo?`title="${esc(v[c.key])}"`:''} ${keyin(c)?'title="클릭하여 개별 입력 (Key-in) · 편집 종료 시 저장"':''}>${hid(c)?'':(c.key==='commission_no'?selBox(v):'')+cellHtml(c,v)}</td>`).join('')+'</tr>').join('');
  h += '</tbody></table>';
  if(!rows.length) h = `<div class="muted" style="padding:30px;text-align:center">${tx('조건에 맞는 차량이 없습니다.')}</div>`;
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
  syncEditBtn();
  const sa = el('selAll'); if(sa){ sa.onclick = e=>e.stopPropagation(); sa.onchange = ()=>{ pageRows.forEach(v=>{ if(sa.checked) EDIT.sel.add(v.commission_no); else EDIT.sel.delete(v.commission_no); }); renderGrid(); }; }
  renderEditbar();
  el('grpnav').innerHTML = `${note('L3')} ${tx('바로가기')}: ` + GRID_JUMPS.map(k=>{ const c=COLUMNS.find(x=>x.key===k); return `<button data-go="${k}" title="${esc(c?c.label:k)} 열로 이동">${esc(c?c.label:k)}</button>`; }).join('') + ` <span class="muted">${tx('· 열 {a}/{b} · 가로 스크롤 · Comm No. 고정', {a:visibleCols().length, b:COLUMNS.length})} ${note('L5')}</span>`;
  // 바로가기 이동: 고정된 Comm No. 열 실제 너비만큼 띄워 대상 열이 가려지지 않게 함 (10/15 No.14)
  qa('#grpnav button').forEach(b=>b.onclick=()=>{ const th = b.dataset.go==='current_status' ? null : q(`thead th[data-sort="${b.dataset.go}"]`, wrap); const sticky = q('thead th.sticky', wrap); const stickyW = sticky? sticky.offsetWidth : 0;
    if(th) wrap.scrollTo({left: Math.max(0, th.offsetLeft - stickyW - 8), behavior:'smooth'}); else wrap.scrollTo({left:0,behavior:'smooth'}); });
  el('pager').innerHTML = `<span>${tx('{n}건 중 {a}–{b}', {n:num(rows.length), a:num((LF.page-1)*LF.size+1), b:num(Math.min(rows.length, LF.page*LF.size))})}</span>
    <button class="btn sm" id="pgPrev" ${LF.page<=1?'disabled':''}>${tx('‹ 이전')}</button><span>${LF.page} / ${totalPages}</span><button class="btn sm" id="pgNext" ${LF.page>=totalPages?'disabled':''}>${tx('다음 ›')}</button>
    <span class="muted">${tx('50행 페이지 (실제 구현은 가상 스크롤 또는 50행 페이지)')}</span>`;
  el('pgPrev').onclick=()=>{ LF.page--; renderGrid(); el('gridwrap').scrollTop=0; }; el('pgNext').onclick=()=>{ LF.page++; renderGrid(); el('gridwrap').scrollTop=0; };
}
function renderEditbar(){
  const bar = el('editbar'); if(!bar) return;
  bar.hidden = !EDIT.on; bar.replaceChildren();
  if(!EDIT.on) return;
  const n = EDIT.sel.size;
  bar.append(
    mk('b', null, tx('편집 모드')), mk('span', {class:'muted'}, tx('· 선택 ')), mk('b', null, num(n)), mk('span', {class:'muted'}, tx('건')),
    mk('button', {class:'btn sm primary', disabled: n===0, onclick: openModelChange}, tx('오더 변경 (모델 일괄)')),
    mk('button', {class:'btn sm', disabled: n===0, onclick: openBulkKeyin}, tx('Key-in 일괄 입력')),
    mk('button', {class:'btn sm', disabled: n===0, onclick: ()=>{ EDIT.sel.clear(); renderGrid(); }}, tx('선택 해제')),
    mk('span', {class:'muted small'}, tx('Key-in 대상 열: B1 Factory Order · Sales Month (셀 클릭 → 개별 입력)')),
    mk('span', {class:'muted small'}, tx("· 저장 대기 {n}건 → '편집 종료' 시 저장·변경 이력 기록", {n:num(pendingCount())})));
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
  // 10/27: PM(생산월)도 같은 모달에서 일괄 변경 — 비워 두면 PM은 바꾸지 않음. 모델은 현재 BM이 그대로면 변경 없음(같은 값은 저장 대기에 오르지 않음)
  const byPm = countBy(vs, v=>pendingVal(v,'pm'));
  const pmIn = mk('input', {type:'month', style:'width:160px'}); // 10/27: 월 달력(브라우저 month picker) · 값은 YYYY-MM
  const body = mk('div', null,
    mk('div', {class:'callout'}, `선택한 오더 ${num(vs.length)}건의 모델 속성(Vehicle · Gen · Model · Axle · Cab · Option · Baumuster · BM)을 Model_Master에서 선택한 모델로, PM(생산월)을 입력한 월로 일괄 변경합니다. PM을 비워 두면 모델만 바뀝니다. Model In AFAB는 AFAB 업로드 값이라 바뀌지 않으며, 'Type' 열의 점(초록/빨강)으로 일치 여부를 확인합니다. 변경 내용은 '편집 종료' 시 저장됩니다.`),
    mk('div', {class:'fields'},
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, tx('현재 BM')), mk('div', {class:'v'}, Object.keys(byBm).sort().map(k=>tx('{k} {n}건', {k, n:num(byBm[k])})).join(' · '))),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, tx('현재 모델 분포')), mk('div', {class:'v'}, Object.keys(by).sort().map(k=>tx('{k} {n}건', {k, n:num(by[k])})).join(' · '))),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, tx('변경할 모델 (Model_Master) *')), mk('div', {class:'v'}, sel)),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, tx('현재 PM 분포')), mk('div', {class:'v'}, Object.keys(byPm).sort().map(k=>tx('{k} {n}건', {k:k||tx('(공란)'), n:num(byPm[k])})).join(' · ') || tx('(공란)'))),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, tx('변경할 PM (생산월, 비우면 변경 없음)')), mk('div', {class:'v'}, pmIn))));
  openModal(tx('오더 변경 — 모델·PM 일괄 변경'), '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, tx('취소')),
    mk('button', {class:'btn primary', onclick: ()=>{ const m = MODEL_MASTER.find(x=>x.prefix===sel.value); if(!m) return;
      const pm = pmIn.value.trim(); if(pm && !/^\d{4}-(0[1-9]|1[0-2])$/.test(pm)){ toast('PM 형식 오류', 'YYYY-MM 형식으로 입력하세요 (예: 2027-03).'); return; }
      const patch = Store.vehicles.modelMasterPatch(m); if(pm) patch.pm = pm;
      vs.forEach(v=>Object.entries(patch).forEach(([k,val])=>stageChange(v.commission_no, k, val, '수동/일괄'))); closeModal(); renderGrid();
      toast(`오더 변경 ${num(vs.length)}건 (저장 대기)`, `→ ${m.model} ${m.axle} ${m.cab}${m.option?' '+m.option:''}${pm? ` · PM ${pm}` : ''} · '편집 종료' 시 Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록`); }}, tx('변경')));
}
function openBulkKeyin(){
  const vs = selectedVehicles(); if(!vs.length) return;
  const inputs = {};
  const row = (key, ph)=>{ inputs[key] = mk('input', {placeholder: ph}); return mk('div', {class:'f'}, mk('div', {class:'k'}, keyinLabel(key)), mk('div', {class:'v'}, inputs[key])); };
  const body = mk('div', null,
    mk('div', {class:'callout'}, `선택한 오더 ${num(vs.length)}건에 아래 값을 일괄 입력합니다. 비워 둔 열은 변경하지 않습니다. 변경 내용은 '편집 종료' 시 저장됩니다.`),
    mk('div', {class:'fields'}, row('b1_factory_order',tx('예) B1-12345')), row('sales_month','YYYY-MM')));
  openModal(tx('Key-in 일괄 입력'), '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, tx('취소')),
    mk('button', {class:'btn primary', onclick: ()=>{ const changed = KEYIN_COLS.filter(k=>inputs[k].value.trim()!=='');
      if(!changed.length){ toast('입력값 없음', '하나 이상의 열에 값을 입력하세요.'); return; }
      vs.forEach(v=>changed.forEach(k=>stageChange(v.commission_no, k, inputs[k].value.trim(), '수동/일괄'))); closeModal(); renderGrid();
      toast(`Key-in 일괄 입력 ${num(vs.length)}건 (저장 대기)`, `열: ${changed.map(keyinLabel).join(' · ')} · '편집 종료' 시 Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록`); }}, tx('적용')));
}

// ---- 열 필터 (10/15 No.18): 머리글 ▼ → 값 목록 체크 선택 (값 검색 가능) ----
function openColFilter(btn, key){
  closeColFilter();
  const c = COLUMNS.find(x=>x.key===key); if(!c) return;
  const vals = [...new Set(VEHICLES.map(v=>filterVal(v,key)))].sort();
  if(key==='current_status') vals.sort((a,b)=>{ const i=STAGE_ORDER.indexOf(a), j=STAGE_ORDER.indexOf(b); return (i<0?99:i)-(j<0?99:j); }); // 단계 순서 (10/22 No.2)
  const counts = countBy(VEHICLES, v=>filterVal(v,key));
  const checked = new Set(LF.col[key] || vals);
  const isDate = DATE_FILTER_COLS.includes(key); // 날짜 열: 연도 → 월 체크 트리 (10/19 No.3)
  const search = mk('input', {type:'text', placeholder: key==='model'? tx('값 검색 (예: 2853)') : isDate? tx('연·월 검색 (예: 2026-11)') : tx('값 검색')});
  const list = mk('div', {class:'cf-list'});
  const shown = ()=>{ const t = search.value.trim().toLowerCase(); return vals.filter(x=>!t || x.toLowerCase().includes(t)); };
  const leaf = (x, cls, text, onchange)=>{ const cb = mk('input', {type:'checkbox', onchange:()=>{ if(cb.checked) checked.add(x); else checked.delete(x); if(onchange) onchange(); }}); cb.checked = checked.has(x);
    return mk('label', {class:cls}, cb, mk('span', null, text), mk('span', {class:'muted small'}, num(counts[x]||0))); };
  const draw = ()=>{ list.replaceChildren();
    if(!isDate){ shown().forEach(x=>list.append(leaf(x, null, x==='(빈 값)'? tx(x) : x))); }
    else {
      const byYear = {}; shown().forEach(x=>{ const y = x==='(빈 값)'? x : x.slice(0,4); (byYear[y] = byYear[y]||[]).push(x); });
      Object.keys(byYear).sort().forEach(y=>{
        const months = byYear[y];
        if(y==='(빈 값)'){ list.append(leaf(y, null, tx(y))); return; }
        const ycb = mk('input', {type:'checkbox', onchange:()=>{ months.forEach(x=>{ if(ycb.checked) checked.add(x); else checked.delete(x); }); draw(); }});
        const sync = ()=>{ const n = months.filter(x=>checked.has(x)).length; ycb.checked = n===months.length; ycb.indeterminate = n>0 && n<months.length; };
        sync();
        list.append(mk('label', {class:'yr'}, ycb, mk('span', null, tx('{y}년', {y})), mk('span', {class:'muted small'}, num(months.reduce((a,x)=>a+(counts[x]||0),0)))));
        months.forEach(x=>list.append(leaf(x, 'mo', tx('{m}월', {m:x.slice(5), mon:monEn(x)}), sync)));
      });
    }
    if(!list.childElementCount) list.append(mk('div', {class:'muted small'}, tx('일치하는 값이 없습니다.'))); };
  search.oninput = draw; draw();
  const pop = mk('div', {class:'colfilter', id:'colfilter'},
    mk('div', {class:'cf-h'}, mk('b', null, tx('{c} 열 필터', {c:tx(c.label)})), mk('button', {class:'x', title:'닫기', onclick: closeColFilter}, '×')),
    search,
    mk('div', {class:'cf-tools'},
      mk('button', {class:'btn sm', onclick:()=>{ shown().forEach(x=>checked.add(x)); draw(); }}, tx('표시된 값 전체 선택')),
      mk('button', {class:'btn sm', onclick:()=>{ shown().forEach(x=>checked.delete(x)); draw(); }}, tx('표시된 값 해제'))),
    list,
    mk('div', {class:'cf-foot'},
      mk('button', {class:'btn sm', onclick:()=>{ delete LF.col[key]; LF.page=1; closeColFilter(); renderGrid(); }}, tx('필터 해제')),
      mk('button', {class:'btn sm primary', onclick:()=>{ if(checked.size>=vals.length) delete LF.col[key]; else LF.col[key]=new Set(checked); LF.page=1; closeColFilter(); renderGrid(); }}, tx('적용'))));
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom+4)+'px'; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth-296))+'px';
  document.body.append(pop); search.focus();
  setTimeout(()=>document.addEventListener('mousedown', colFilterOutside), 0);
}
function colFilterOutside(e){ if(!e.target.closest('#colfilter') && !e.target.closest('.cf')) closeColFilter(); }
function closeColFilter(){ const p = el('colfilter'); if(p) p.remove(); document.removeEventListener('mousedown', colFilterOutside); }

// ---- 오더 생성 (10/19): Type 숫자 검색 → Type 선택 → MY → 모델(Model_Master 행) 선택 → 속성 표시 → Original PM·수량·단계 → Commission No 생성 방식 → 생성 ----
// 10/20 No.22: 입력받는 생산월은 Original PM(배지: 오더 생성)에 기록하고 PM은 공란 · No.10: Create Order Date = 생성일
function openAddOrder(){
  const active = MODEL_MASTER.filter(m=>m.active);
  const field = (label, ctl, wide)=> mk('div', {class:'f'+(wide?' wide':'')}, mk('div', {class:'k'}, label), mk('div', {class:'v'}, ctl));
  const modelLine = m=> [m.vehicle, m.series, m.model, m.axle, m.cab, m.option].filter(Boolean).join(' · ');
  // 1~2. Type 숫자 검색 → 해당 숫자가 포함된 Type 드롭다운
  const search = mk('input', {placeholder:tx('Type 숫자 3~4자리 (예: 2863)'), maxlength:'4', style:'width:100%'});
  const typeSel = mk('select', {style:'width:100%', disabled:true}, mk('option', {value:''}, tx('검색어를 입력하세요')));
  // 3. MY
  const mySel = mk('select', {style:'width:100%'}, Object.values(MY_FROM_LETTER).map(n=>mk('option', {value:'MY'+n}, 'MY'+n)));
  mySel.value = 'MY'+MY_FROM_LETTER[myLetterFromPm(ymAdd(BASE_YM,3))];
  // 5. 모델 한 줄 드롭다운 (Vehicle · Model · Type · Axle · Cab · Option)
  const modelSel = mk('select', {style:'width:100%', disabled:true}, mk('option', {value:''}, tx('Type을 먼저 선택하세요')));
  // 4. 매칭된 Model_Master 속성 표시 (BM = Baumuster Code1-Code2)
  const attrs = mk('div', {class:'kv small', style:'grid-template-columns:140px 1fr'});
  const drawAttrs = ()=>{ attrs.replaceChildren();
    const m = active[Number(modelSel.value)]; if(!m){ attrs.append(mk('dt', {class:'muted'}, tx('모델을 선택하면 속성이 표시됩니다.'))); return; }
    [['BM', m.prefix+'-'+m.code2], ['Baumuster', m.prefix+' '+m.suffix], ['Model In AFAB', m.type_desc], ['Vehicle', m.vehicle], ['Model', m.series], ['Type', m.model], ['Axle', m.axle], ['Cab', m.cab], ['Option', m.option||'—'], ['Gen', m.gen], [tx('리드타임(월)'), String(m.lead)], ['MY', mySel.value]]
      .forEach(([k,v])=>attrs.append(mk('dt', null, k), mk('dd', {class:'mono'}, v))); };
  // 6. Original PM(생산월) · 수량 · Current Status
  const pmIn = mk('input', {placeholder:'YYYY-MM', value: ymAdd(BASE_YM,3), style:'width:100%'});
  const qtyIn = mk('input', {type:'number', min:'1', max:'500', value:'1', style:'width:100%'});
  const stSel = mk('select', {style:'width:100%'}, STAGES.map(s=>mk('option', {value:s}, s)));
  stSel.value = 'Ordered(Changeable)';
  // 7. Commission No 생성 방식: 끝번호에 이어서 / 새 번호로 시작
  const last = Store.vehicles.lastCommissionNo() || '000000000';
  const nextOf = (s, k)=> String(Number(s)+k).padStart(s.length, '0');
  const rCont = mk('input', {type:'radio', name:'commMode', value:'cont', checked:true, style:'width:auto'});
  const rNew = mk('input', {type:'radio', name:'commMode', value:'new', style:'width:auto'});
  const startIn = mk('input', {placeholder:tx('시작 번호 (예) 071009001'), value: nextOf(last,1), disabled:true, style:'width:160px'});
  const preview = mk('div', {class:'muted small'});
  const err = mk('div', {class:'small', style:'color:var(--danger);font-weight:600', hidden:true});
  const commList = ()=>{ const n = Math.max(1, Math.floor(Number(qtyIn.value)||1)); const start = rCont.checked? nextOf(last,1) : startIn.value.trim();
    if(!/^\d+$/.test(start)) return []; return Array.from({length:n}, (_,i)=>nextOf(start,i)); };
  const drawPreview = ()=>{ const cs = commList(); preview.textContent = cs.length? tx('생성될 Commission No: {range} ({n}건) · 마지막 번호 {last}', {range:`${cs[0]}${cs.length>1?` ~ ${cs[cs.length-1]}`:''}`, n:num(cs.length), last}) : tx('시작 번호는 숫자만 입력하세요.'); };
  const setMode = ()=>{ startIn.disabled = !rNew.checked; drawPreview(); };
  rCont.onchange = rNew.onchange = setMode; startIn.oninput = drawPreview; qtyIn.oninput = drawPreview;
  // 흐름 연결
  search.oninput = ()=>{ const t = search.value.replace(/\D/g,''); search.value = t;
    const types = [...new Set(active.filter(m=>m.model.includes(t)).map(m=>m.model))].sort();
    typeSel.replaceChildren(mk('option', {value:''}, t.length>=3 && types.length? tx('Type 선택 ({n})', {n:num(types.length)}) : t.length<3? tx('숫자 3~4자리를 입력하세요') : tx('일치하는 Type 없음')), ...(t.length>=3? types.map(x=>mk('option', {value:x}, x)) : []));
    typeSel.disabled = !(t.length>=3 && types.length); typeSel.onchange(); };
  typeSel.onchange = ()=>{ const t = typeSel.value;
    const rows = active.map((m,i)=>({m,i})).filter(x=>x.m.model===t);
    modelSel.replaceChildren(mk('option', {value:''}, t? tx('모델 선택 ({n})', {n:num(rows.length)}) : tx('Type을 먼저 선택하세요')), ...rows.map(x=>mk('option', {value:String(x.i)}, modelLine(x.m))));
    modelSel.disabled = !rows.length; if(rows.length===1) modelSel.value = String(rows[0].i); drawAttrs(); };
  modelSel.onchange = drawAttrs; mySel.onchange = drawAttrs;
  pmIn.oninput = ()=>{ if(/^\d{4}-\d{2}$/.test(pmIn.value.trim())){ mySel.value = 'MY'+MY_FROM_LETTER[myLetterFromPm(pmIn.value.trim())]; drawAttrs(); } };
  drawAttrs(); drawPreview();
  const body = mk('div', null,
    mk('div', {class:'callout'}, 'AFAB에 아직 없는 오더(예: 구두 확정 오더, 특수 사양)를 수동 등록합니다. 이후 AFAB 업로드에서 같은 Commission No.가 들어오면 AFAB 필드가 덮어쓰고 출처가 AFAB로 바뀝니다.'),
    mk('div', {class:'fields'},
      field(tx('① Type 검색 *'), search), field('② Type *', typeSel),
      field('③ MY *', mySel), field(tx('④ 모델 (Model_Master) *'), modelSel),
      field(tx('매칭된 모델 속성'), attrs, true),
      field(tx('⑤ Original PM (생산월) *'), pmIn), field(tx('수량 *'), qtyIn), field('Current Status *', stSel),
      field(tx('⑥ Commission No 생성 방식 *'), mk('div', {style:'display:flex;gap:14px;align-items:center;flex-wrap:wrap'},
        mk('label', null, rCont, tx(' 마지막 번호에 이어서 생성')), mk('label', null, rNew, tx(' 새 번호로 시작 '), startIn)), true),
      field('', preview, true)),
    mk('div', {class:'muted small', style:'margin-top:8px'}, '* 필수. 모델 속성(Vehicle · Model · Type · Axle · Cab · Option · Baumuster · BM)은 선택한 Model_Master 행에서 채워집니다. 생산월은 Original PM에 기록되고 PM은 AFAB 확정 후 채워집니다. Create Order Date = 생성일. Commission No.는 중복 생성할 수 없습니다.'),
    err);
  openModal(tx('오더 생성')+' '+note('L7'), '', ' ');
  el('modal-body').replaceChildren(body);
  const fail = msg=>{ err.textContent = msg; err.hidden = false; };
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, tx('취소')),
    mk('button', {class:'btn primary', onclick: ()=>{ err.hidden = true;
      const m = active[Number(modelSel.value)]; if(!modelSel.value || !m) return fail('Type과 모델을 선택하세요.');
      const pm = pmIn.value.trim(); if(!/^\d{4}-\d{2}$/.test(pm)) return fail('Original PM(생산월)은 YYYY-MM 형식으로 입력하세요.');
      const cs = commList(); if(!cs.length) return fail('Commission No 시작 번호는 숫자만 입력하세요.');
      const dup = cs.filter(c=>VEHICLE_BY_COMM[c]); if(dup.length) return fail(`Commission No. ${dup.slice(0,3).join(', ')}${dup.length>3?' 외':''}는 이미 등록된 오더입니다. 중복 생성할 수 없습니다.`);
      const rows = cs.map(c=>Store.vehicles.create({commission_no:c, m, pm, status:stSel.value, model_year:mySel.value, by:state.user}));
      const n = Store.vehicles.add(rows);
      const d = new Date(); const at = TODAY_S+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
      Store.history.add(rows.map(v=>({commission_no:v.commission_no, field:'(전체)', old_value:'', new_value:'수동 생성', changed_by:state.user, changed_at:at, source:'수동'})));
      closeModal(); renderGrid();
      toast(`오더 생성 ${num(n)}건`, `${cs[0]}${n>1?` ~ ${cs[n-1]}`:''} · ${modelLine(m)} · Original PM ${pm} · ${stSel.value} → Vehicles 추가(출처: 수동) · Vehicle_History 기록 · 대시보드·KUFRI 즉시 반영`); }}, tx('생성')));
}
