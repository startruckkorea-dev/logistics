'use strict';
/* ===== Logistics 차량 마스터 (L1~L7) ===== */
const LF = { q:'', col:{}, sort:'commission_no', dir:-1, page:1, size:50, tab:'grid', delayed:false }; // col: 열 필터 {key: Set(선택값)} (10/15 No.18) · 기본 정렬 Commission No 최신순 (10/19 No.18) · 단계는 상단 필터 대신 Current Status 열 필터로 (10/22 No.2) · tab: 페이지 탭 (10/26 No.1)
// 페이지 탭 5개 (10/26 No.1 · 10/29 #3·#4): 1번 = 차량 마스터 그리드(홈), 2번 = AFAB 업로드(상단 메뉴에서 이동, js/pages/afab.js renderAfabTab), 3~5번 = 통관·보험(js/pages/customs.js). ?tab= 으로 진입 가능, 없으면 grid
// 10/29 #3: 한글 탭명 확정(EN 모드는 I18N으로 영문) · 10/29 #5: 역할별 표시 — Editor 전체 · Viewer 'Logistics'만 · Sales '수입통관 신청'만
const LOGI_TABS = [['grid','Logistics'], ['afab','AFAB 업로드'], ['req','수입통관 신청'], ['input','통관 완료 처리'], ['ins','보험 조회']];
function logiTabsForRole(){ return isSales()? LOGI_TABS.filter(t=>t[0]==='req') : isEditor()? LOGI_TABS : LOGI_TABS.filter(t=>t[0]==='grid'); }

const KEYIN_COLS = ['b1_factory_order','sales_month']; // 편집 모드 Key-in 대상 열 (10/15 No.5: Option은 Model_Master 자동 반영으로 제외)
const NOTE_COLS = ['option_remarks','order_note']; // 11/3 리뷰 #6: 편집 모드에서 셀 클릭 → 여러 줄 팝업 편집창(openNoteEditor) · 그리드 셀 안 직접 입력(startCellEdit)은 KEYIN_COLS만
// 열 필터 적용 열 (10/19 No.3): Current Status(단계 순) + 모델 관련 Vehicle~Emission(11/4: Option → Cab Gen·Wheelbase·PTO·Emission) + 날짜 열(연·월 단위) + Vessel · 모두 URL 파라미터(?vessel=…&model=…&ata=YYYY-MM)로 미리 설정 가능 (10/22)
const DATE_FILTER_COLS = ['changeability_date','pm','original_pm','tdd_calc','dispatch','shipping_calc','shipping','invoice','planned_arrival','eta_from_tdd','eta_from_eukor_pirt','ata','tsc_arrival_date','customs_clearance_date','order_update_date']; // 10/26 No.9: TSC Arrival Date 추가 · 11/4: Order Update Date 추가
const FILTER_COLS = ['current_status','gen','vehicle','series','model','axle','cab','cab_gen','wheelbase','pto','emission', ...DATE_FILTER_COLS, 'vessel']; // gen: 선적·입항 구분 그룹 행 링크용 (10/22)
const STAGE_ORDER = [...STAGES.filter(s=>s!=='Rejected'), 'Cancelled']; STAGE_ORDER.splice(STAGE_ORDER.indexOf('In Production'), 0, 'Rejected'); // Current Status 열 필터 값 순서 (10/22 No.2): Rejected는 In Production 앞 (STAGE_RULES 순서와 동일)
const SEARCH_COLS = ['commission_no','vin_no','bl_no','vessel','model','engine_no','order_note','option_remarks']; // 검색 대상 열 (10/19 No.4: VIN·Comm·Order Note·Option Note 필수 포함)
const EDIT = { on:false, sel:new Set(), pending:{} }; // 편집 모드(오더 복수 선택) · pending: {comm:{field:{old,nw,src}}} → '편집 종료' 시 저장 (10/15 No.9)

PAGES.logistics = {
  title:'Logistics 차량 마스터', sub:`Commission No. 기준 1행 · ${COLUMNS.length}열 · Customs · Insurance`,
  render(root, params){
    LF.q = params.get('q')||''; LF.page=1; LF.col={}; LF.delayed = params.get('delayed')==='1'; // 10/30 재검토 1단계: ?delayed=1 → 경과 배지 행만
    const st = params.get('stage'); if(st) LF.col.current_status = new Set(st.split(',')); // ?stage= (대시보드 카드·파이프라인·AFAB 링크, 쉼표 구분 복수) → Current Status 열 필터
    FILTER_COLS.forEach(k=>{ const v = params.get(k); if(v!=null) LF.col[k] = new Set(v.split(',').map(x=> x===''? '(빈 값)' : x)); }); // 열 필터 파라미터 (10/22 선적·입항 수량 셀 클릭): 쉼표 구분 복수 · 빈 문자열 = '(빈 값)'
    const tabs = logiTabsForRole(); // 10/27: Sales는 수입통관 신청 탭만 · 10/29 #5: Viewer는 Logistics 탭만
    LF.tab = isSales()? 'req' : (tabs.some(t=>t[0]===params.get('tab')) ? params.get('tab') : 'grid'); // 대시보드·선적·입항 링크(?stage=·?vessel=)는 tab 없음 → 그리드 · 역할에 없는 탭 주소는 그리드
    EDIT.on=false; EDIT.sel.clear(); EDIT.pending={}; closeColFilter(); closeNoteEditor(); clearNoteRange();
    root.innerHTML = `<div class="card"><div class="tabs" id="lgTabs"></div><div id="lgBody"></div></div>`;
    el('lgTabs').append(...tabs.map(([k,label])=>mk('span', {class:'tab', 'data-tab':k, onclick:()=>switchLogiTab(k)}, tx(label))), noteEl('L1')); // tx: 한글 탭명만 번역 (10/27 #5)
    renderLogiBody();
  }
};
window.addEventListener('hashchange', ()=>{ closeColFilter(); closeNoteEditor(); clearNoteRange(); });
// 탭 전환 (10/26 No.1): 편집 중 저장 대기 값이 있으면 전환하지 않음(언어 토글과 동일) · 전환 시 편집 모드·선택 해제, 검색어·열 필터(LF)는 유지
function switchLogiTab(k){
  if(k===LF.tab) return;
  if(EDIT.on && pendingCount()>0){ toast(tx('탭 전환 불가'), tx("저장 대기 중인 편집 내용이 있습니다. '편집 종료'로 저장한 뒤 전환하세요.")); return; }
  EDIT.on=false; EDIT.sel.clear(); EDIT.pending={}; closeColFilter(); closeNoteEditor(); clearNoteRange(); LF.tab=k; renderLogiBody();
}
function renderLogiBody(){
  qa('#lgTabs .tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===LF.tab));
  const body = el('lgBody');
  if(LF.tab==='afab'){ body.replaceChildren(); renderAfabTab(body); return; } // 탭 2 (10/29 #4): js/pages/afab.js
  if(LF.tab!=='grid'){ body.replaceChildren(); renderCustomsTab(body, LF.tab); return; } // 탭 3~5: js/pages/customs.js
  body.innerHTML = `<div class="card-h"><div class="filters" id="filters"></div><span class="spacer"></span>
      <div class="btn-group">
        <button class="btn editor-only" id="btnStatus" hidden></button>
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
  el('btnStatus').onclick = openStatusUpdate; syncStatusBtn(); autoStatusCheck(); // 10/28: Current Status 자동 점검 배지 + 하루 1회 자동 팝업
}

// ---- Current Status 자동 업데이트 (10/28): 편집자가 그리드 탭에 들어오면 상태 규칙 3·5·7 대상을 훑어 팝업 → 제외 선택 → 즉시 반영 ----
const STATUS_CHECK_KEY = 'stk_statusCheck'; // localStorage: 자동 팝업을 띄운 실제 달력 날짜(YYYY-MM-DD). 기준일 TODAY_S는 고정이라 쓰지 않는다
let statusCheckedDay = ''; // localStorage를 못 쓰는 환경용 대체(세션 변수)
function realToday(){ return fmtD(new Date()); }
// 배지 버튼: 대상 건수 표시 · 0건이면 숨김 (렌더·반영 후 호출)
function syncStatusBtn(){
  const b = el('btnStatus'); if(!b) return;
  const n = Store.vehicles.statusUpdateCandidates().length;
  b.hidden = n===0; b.classList.toggle('primary', n>0);
  b.textContent = tx('상태 업데이트 대상 {n}건', {n:num(n)});
  b.title = 'Current Status 자동 전환 대상 (규칙 3·5·7) — 클릭하면 목록을 다시 엽니다';
}
// 하루 1회 자동 팝업: Editor만 · 같은 날(실제 날짜)에 이미 띄웠으면 건너뜀 · 대상이 없어도 '없음' 안내를 띄운다
function autoStatusCheck(){
  if(!isEditor()) return;
  const today = realToday(); let last;
  try{ last = localStorage.getItem(STATUS_CHECK_KEY); }catch(e){ last = statusCheckedDay; }
  if(last===today) return;
  statusCheckedDay = today;
  try{ localStorage.setItem(STATUS_CHECK_KEY, today); }catch(e){}
  setTimeout(openStatusUpdate, 0); // 그리드를 먼저 그린 뒤 팝업
}
function openStatusUpdate(){
  const items = Store.vehicles.statusUpdateCandidates();
  const ruleCond = r=>{ const x = STAGE_RULES.find(s=>s.order===r); return x? x.cond : ''; };
  const intro = mk('div', {class:'callout'}, `기준일 ${TODAY_S} 기준으로 상태 규칙 3·5·7에 해당하는 차량을 자동 판정합니다 — Ordered(Changeable) → Ordered(Fixed): Changeability Date 경과 · Ordered(Fixed) → In Production: PM(생산월) 도래 · In Production/Shipment scheduled → In Transit: Shipping Date 경과. 제외할 차량을 체크한 뒤 '반영'을 누르면 즉시 저장되고 Vehicle_History(출처: 규칙)·Audit_Log에 기록됩니다. Status override 지정 차량과 Bonded·OH·Sold 전환(TSC 확정·통관·월말 입력)은 대상이 아닙니다.`);
  // override 보류 (10/28): 규칙에는 맞지만 status_override 때문에 전환하지 않는 차량 — 0건이어도 건수를 항상 보여 override 때문인지 확인할 수 있게 한다
  const held = Store.vehicles.statusUpdateHeld();
  const heldLine = mk('div', {class:'muted small', style:'margin-bottom:8px'}, mk('b', null, tx('Status override로 보류: {n}건', {n:num(held.length)})), ' (override가 지정된 차량은 규칙에 맞아도 자동 전환하지 않음 · 상세 Drawer의 Status override · Status reason 참고)');
  const cols = ['commission_no','series','model']; // Commission No · Model · Type (customs.js cuCell 재사용)
  const heldGroup = held.length? mk('div', null,
    mk('div', {class:'section-h'}, tx('Status override로 보류'), mk('span', {class:'sub'}, tx('{n}건', {n:num(held.length)}))),
    mk('div', {class:'tbl-wrap', style:'max-height:220px'}, mk('table', {class:'tbl compact'},
      mk('thead', null, mk('tr', null, cols.map(k=>mk('th', null, tx(keyinLabel(k)))), mk('th', null, tx('현재 상태')), mk('th', null, tx('규칙 적용 시')), mk('th', null, 'Status override'), mk('th', null, 'Status reason'), mk('th', null, tx('수정 이유')))),
      mk('tbody', null, held.map(it=>mk('tr', null, cols.map(k=>cuCell(k, it.v)), mk('td', null, stagePillEl(it.from)), mk('td', null, stagePillEl(it.to)), mk('td', null, it.v.status_override), mk('td', {class:'small'}, it.v.status_reason||'—'), mk('td', {class:'small'}, it.reason))))))) : null;
  openModal(tx('Current Status 업데이트'), '', ' ');
  if(!items.length){
    el('modal-body').replaceChildren(...[intro, heldLine, mk('div', {class:'muted', style:'padding:20px;text-align:center'}, tx('자동 전환 대상이 없습니다.')), heldGroup].filter(Boolean)); // heldGroup null이면 제외(replaceChildren은 null을 'null' 문자로 넣는다)
    el('modal-foot').replaceChildren(mk('button', {class:'btn', onclick:closeModal}, tx('닫기')));
    return;
  }
  const excluded = new Set(); // 제외한 Commission No
  const applyBtn = mk('button', {class:'btn primary'});
  const exInfo = mk('span', {class:'muted small', style:'margin-right:auto;align-self:center'});
  const sync = ()=>{ const n = items.length - excluded.size; applyBtn.textContent = tx('반영 ({n}건)', {n:num(n)}); applyBtn.disabled = n===0; exInfo.textContent = tx('제외 {n}건', {n:num(excluded.size)}); };
  const groups = [...new Set(items.map(it=>it.rule))].sort().map(rule=>{
    const gi = items.filter(it=>it.rule===rule); const {from, to} = gi[0];
    const boxes = [];
    const rowEl = it=>{ const box = mk('input', {type:'checkbox', class:'rowsel', onchange:e=>{ if(e.target.checked) excluded.add(it.v.commission_no); else excluded.delete(it.v.commission_no); sync(); }}); boxes.push(box);
      return mk('tr', null, mk('td', null, box), cols.map(k=>cuCell(k, it.v)), mk('td', null, stagePillEl(it.from)), mk('td', null, stagePillEl(it.to)), mk('td', {class:'small'}, it.reason)); };
    const allBox = mk('input', {type:'checkbox', title:tx('반영 제외'), onchange:e=>{ boxes.forEach(b=>{ b.checked = e.target.checked; }); gi.forEach(it=>{ if(e.target.checked) excluded.add(it.v.commission_no); else excluded.delete(it.v.commission_no); }); sync(); }});
    const froms = [...new Set(gi.map(it=>it.from))]; // 규칙 7은 In Production·Shipment scheduled 두 상태에서 출발
    return mk('div', null,
      mk('div', {class:'section-h'}, froms.map(f=>stagePillEl(f)), '→', stagePillEl(to), mk('span', {class:'sub'}, tx('{n}건 · 규칙 {r}: {c}', {n:num(gi.length), r:rule, c:ruleCond(rule)}))),
      mk('div', {class:'tbl-wrap', style:'max-height:220px'}, mk('table', {class:'tbl compact'},
        mk('thead', null, mk('tr', null, mk('th', {title:tx('반영 제외')}, allBox), cols.map(k=>mk('th', null, tx(keyinLabel(k)))), mk('th', null, tx('변경 전')), mk('th', null, tx('변경 후')), mk('th', null, tx('수정 이유')))),
        mk('tbody', null, gi.map(rowEl)))));
  });
  el('modal-body').replaceChildren(...[intro, heldLine, mk('div', {class:'muted small', style:'margin-bottom:4px'}, tx('첫 열 체크 = 반영 제외 (머리글 체크 = 그룹 전체 제외)')), ...groups, heldGroup].filter(Boolean));
  applyBtn.onclick = ()=>{
    const picked = items.filter(it=>!excluded.has(it.v.commission_no)); if(!picked.length) return;
    const r = Store.vehicles.applyStatusUpdate(picked, excluded.size, state.user);
    closeModal(); renderGrid(); syncStatusBtn();
    toast(`Current Status 업데이트 ${num(r.n)}건 반영`, `${Object.entries(r.by).map(([k,n])=>`${k} ${num(n)}`).join(' · ')} · 제외 ${num(r.excluded)}건 · Vehicle_History ${num(r.n)}건(출처: 규칙) · Audit_Log 기록${held.length? ` · override 보류 ${num(held.length)}건` : ''}`);
  };
  el('modal-foot').replaceChildren(exInfo, mk('button', {class:'btn', onclick:closeModal, title:"닫기만 합니다. 상단 '상태 업데이트 대상' 배지로 다시 열 수 있습니다"}, tx('나중에')), applyBtn);
  sync();
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
    (!LF.delayed || shipDelayDays(v)>0) && // 10/30 재검토 1단계: 경과 배지 행만
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
  el('fReset').onclick = ()=>{ Object.assign(LF,{q:'',page:1, delayed:false}); LF.col={}; renderFilters(); renderGrid(); };
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
  if(EDIT.on){ commitEdits(); EDIT.on=false; EDIT.sel.clear(); clearNoteRange(); renderGrid(); return; }
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
// 10/30 #8·재검토 1단계: 경과 배지 일수. 선적 후 = Shipping − Shipping Calc(저장값 기준이라 고정) · 선적 전 = 기준일 − Shipping Calc(In Production만, 매일 증가). 0 이하·Cancelled·Calc 없음 = 0. calc·ship 인자는 편집 중 pending 값용
function shipDelayDays(v, calc, ship){ calc = calc===undefined? v.shipping_calc : calc; ship = ship===undefined? v.shipping : ship;
  if(!calc || v.current_status==='Cancelled') return 0;
  if(ship) return Math.max(0, diffDays(parseD(ship), parseD(calc)));
  return (calc < TODAY_S && v.current_status==='In Production') ? diffDays(TODAY, parseD(calc)) : 0; }
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
  // 10/27 #7 Shipping Calc = PM 1일 + 리드타임(일, PM~Shipping) — 편집 중 PM·모델 변경도 즉시 반영 · 10/30 #8: 경과 배지 '+n일'은 회색(비강조) 하나, 선적 전엔 매일 증가 · Shipping 입력 후엔 Shipping − Shipping Calc로 고정되어 유지(재검토 후보 표시용, 숫자는 참고값)
  if(c.key==='shipping_calc'){
    const calc = v.shipping_calc; // 10/30: In Production 진입 시 저장된 값만 표시 (편집 중 PM 변경으로 재계산하지 않음)
    if(!calc) return '<span class="dim">·</span>';
    const ship = pendingVal(v,'shipping'), n = shipDelayDays(v, calc, ship);
    if(n<=0) return esc(calc);
    const tip = ship? tx('Shipping {s} · 실적 PM~Shipping {m}일 (계획 {p}일, 초과 {n}일)', {s:ship, m:diffDays(parseD(ship), parseD(v.pm+'-01')), p:v.lead_days, n})
                    : tx('Shipping 미입력 · Shipping Calc 경과 {n}일 (기준일 {d})', {n, d:TODAY_S});
    return esc(calc) + ` <span class="pill ${ship? 'neutral' : 'danger'}" title="${esc(tip)}">D+${n}</span>`; // 선적 전 빨강(증가 중) · 선적 후 회색(확정)
  }
  if(c.num) return num(val);
  if(val==null||val==='') return '<span class="dim">·</span>';
  return SEARCH_COLS.includes(c.key)? hl(val) : esc(val);
}
function renderGrid(){
  const rows = filtered(); const cols = EDIT.on ? COLUMNS : visibleCols(); // 편집 모드에서는 숨긴 열도 머리글(체크박스)만 표시 (10/15 No.15)
  const totalPages = Math.max(1, Math.ceil(rows.length/LF.size)); if(LF.page>totalPages) LF.page=totalPages;
  const pageRows = rows.slice((LF.page-1)*LF.size, LF.page*LF.size);
  const fkeys = Object.keys(LF.col); if(LF.delayed && !LF.col.shipping_calc) fkeys.push('shipping_calc'); // 10/30: '경과 배지 행만'도 Shipping Calc 열 필터로 요약
  el('fCount').textContent = tx('{n}건 / 전체 {m}', {n:num(rows.length), m:num(VEHICLES.length)}) + (fkeys.length? tx(' · 열 필터: {cols}', {cols:fkeys.map(keyinLabel).join(' · ')}) : '');
  // 헤더 2줄 (10/19 No.2): 1행 = 열 이름만 · 2행 = 체크박스 · 출처 배지 · 정렬 표시 · 열 필터 (Comm No.는 첫 열 고정)
  const sortIcon = k=> LF.sort===k? `<span class="sort">${LF.dir>0?'▲':'▼'}</span>`:'';
  const canEdit = isEditor();
  const hid = c=> EDIT.on && state.hiddenCols.has(c.key);
  const colBox = c=> EDIT.on? `<input type="checkbox" class="colvis" data-col="${c.key}" ${hid(c)?'':'checked'} title="열 표시/숨김 (체크 해제 → 숨김)">` : '';
  const filtBtn = c=> FILTER_COLS.includes(c.key)? `<button class="cf ${(LF.col[c.key] || (c.key==='shipping_calc' && LF.delayed))?'on':''}" data-filter="${c.key}" title="${esc(c.label)} 열 필터">▼</button>` : '';
  const rest = cols.filter(c=>c.key!=='commission_no');
  let h = `<table class="grid"><thead><tr class="fld"><th class="sticky" data-sort="commission_no" title="commission_no">Commission No</th>`;
  h += rest.map(c=>`<th data-sort="${c.key}" class="${hid(c)?'hid':''}" title="${c.key}">${esc(tx(c.label))}</th>`).join('') + '</tr>';
  h += `<tr class="sub"><th class="sticky" data-sort="commission_no">${EDIT.on?'<input type="checkbox" id="selAll" title="현재 페이지 전체 선택">':''}${srcBadge('AFAB')}${sortIcon('commission_no')}</th>`;
  h += rest.map(c=>`<th data-sort="${c.key}" class="${hid(c)?'hid':''}">${colBox(c)}${srcBadge(c.src, c.keyin)}${sortIcon(c.key)}${filtBtn(c)}</th>`).join('') + '</tr></thead><tbody>';
  const selBox = v=> EDIT.on? `<input type="checkbox" class="rowsel" ${EDIT.sel.has(v.commission_no)?'checked':''}>` : '';
  const keyin = c=> canEdit && EDIT.on && (KEYIN_COLS.includes(c.key) || NOTE_COLS.includes(c.key)); // Key-in 열도 편집 모드에서만 입력 (10/15 No.4) · 11/3 리뷰 #6: Note 열은 팝업 편집창
  const pend = (v,c)=> EDIT.pending[v.commission_no] && c.key in EDIT.pending[v.commission_no];
  const rsel = (v,c)=> EDIT.on && NOTE_RANGE.key===c.key && NOTE_RANGE.set.has(v.commission_no); // 11/4: Note 셀 범위 선택 표시
  h += pageRows.map(v=>`<tr data-comm="${v.commission_no}" class="${EDIT.sel.has(v.commission_no)?'sel':''}">`+cols.map(c=>`<td class="${c.key==='commission_no'?'sticky':''} ${c.num?'num':''} ${c.memo?'memo':''} ${keyin(c)?'keyin':''} ${hid(c)?'hid':''} ${pend(v,c)?'pend':''} ${rsel(v,c)?'rsel':''} ${(c.key==='model'||c.key==='changeability_date')?'dotcell':''}" data-key="${c.key}" ${c.memo?`title="${esc(v[c.key])}"`:''} ${keyin(c)?'title="클릭하여 개별 입력 (Key-in) · 편집 종료 시 저장"':''}>${hid(c)?'':(c.key==='commission_no'?selBox(v):'')+cellHtml(c,v)}</td>`).join('')+'</tr>').join('');
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
  qa('td.keyin', wrap).forEach(td=>{ const comm = td.closest('tr').dataset.comm, key = td.dataset.key; // 11/3 리뷰 #6: Note 열은 여러 줄 팝업 + 끌어서 범위 선택(엑셀식 복사·붙여넣기)
    if(NOTE_COLS.includes(key)){ td.onmousedown = e=>noteCellDown(e, comm, key); td.onmouseenter = ()=>noteCellEnter(comm, key); td.onclick = e=>{ e.stopPropagation(); noteCellClick(e, td, comm, key); }; }
    else td.onclick = e=>{ e.stopPropagation(); startCellEdit(td, comm, key); }; });
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
    mk('span', {class:'muted small'}, tx('Key-in 대상 열: B1 Factory Order · Sales Month · Order Note · Option Note (셀 클릭 → 개별 입력 · Note는 여러 줄 팝업, 셀을 끌어 선택 → Ctrl+C / Ctrl+V)')),
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
// ---- 11/3 리뷰 #6: Order Note·Option Note 여러 줄 입력 — 편집 모드에서 셀 클릭 → 셀 아래 6줄 팝업 편집창 ----
// Enter = 줄바꿈 · Ctrl+Enter·바깥 클릭·'이 행에 적용' = 이 행만 저장 대기(출처 수동) · Esc·취소 = 버림 · '선택한 n건에 적용' = 체크한 오더 전부(이 행 포함)에 같은 내용(출처 수동/일괄)
// 11/4 엑셀식 복사·붙여넣기: Note 셀을 누른 채 끌거나 Shift+클릭하면 같은 열 안에서 범위 선택(NOTE_RANGE, 파란 테두리 · 팝업 없음) · Ctrl+C = 선택한 셀 내용 복사(여러 줄·탭·따옴표는 엑셀 규칙 "…")
// · Ctrl+V = 범위 전체에 붙여넣기 — 클립보드 1칸이면 범위 모두 같은 값, 여러 행이면 범위 맨 위부터 아래로 순서대로(출처 수동/일괄) · Esc·다른 곳 클릭 = 범위 해제
// · 팝업 안: 글자를 따로 선택하지 않은 Ctrl+C = 칸 전체 복사, Ctrl+V = 보통 붙여넣기. 셀 클릭(끌지 않음) = 그 셀 1칸 선택 + 팝업
const NOTE_RANGE = { key:'', set:new Set(), anchor:'' }; // 범위 선택 (현재 페이지 50행 안)
const NOTE_DRAG = { on:false, moved:false, key:'', anchor:'' };
function pageRowsNow(){ return filtered().slice((LF.page-1)*LF.size, LF.page*LF.size); }
function excelCell(s){ s = String(s==null? '' : s); return /[\t\n"]/.test(s)? '"'+s.replace(/"/g, '""')+'"' : s; } // 엑셀 클립보드 규칙으로 감싸기
function rangeComms(){ const set = NOTE_RANGE.set; return pageRowsNow().map(v=>v.commission_no).filter(c=>set.has(c)); } // 페이지 표시 순서
function paintNoteRange(){ const wrap = el('gridwrap'); if(!wrap) return; qa('td.rsel', wrap).forEach(td=>td.classList.remove('rsel'));
  NOTE_RANGE.set.forEach(c=>{ const td = q(`tr[data-comm="${c}"] td[data-key="${NOTE_RANGE.key}"]`, wrap); if(td) td.classList.add('rsel'); }); }
function setNoteRange(key, from, to){ const order = pageRowsNow().map(v=>v.commission_no); let i = order.indexOf(from), j = order.indexOf(to); if(i<0||j<0) return;
  if(i>j){ const t = i; i = j; j = t; } NOTE_RANGE.key = key; NOTE_RANGE.set = new Set(order.slice(i, j+1)); paintNoteRange(); }
function clearNoteRange(){ NOTE_RANGE.key = ''; NOTE_RANGE.set = new Set(); NOTE_RANGE.anchor = ''; paintNoteRange(); }
function isTyping(){ const a = document.activeElement; return !!a && (a.tagName==='INPUT' || a.tagName==='TEXTAREA' || a.tagName==='SELECT'); }
// Note 셀 이벤트 (renderGrid에서 연결): 누른 채 다른 셀로 움직이면 드래그 범위, 그대로 떼면 클릭(팝업)
function noteCellDown(e, comm, key){ if(e.button!==0) return; e.preventDefault(); /* 글자 드래그 선택 방지 */ NOTE_DRAG.on = true; NOTE_DRAG.moved = false; NOTE_DRAG.key = key; NOTE_DRAG.anchor = comm; }
function noteCellEnter(comm, key){ if(!NOTE_DRAG.on || key!==NOTE_DRAG.key) return; NOTE_DRAG.moved = true; closeNoteEditor(); NOTE_RANGE.anchor = NOTE_DRAG.anchor; setNoteRange(key, NOTE_DRAG.anchor, comm); }
function noteCellClick(e, td, comm, key){
  if(NOTE_DRAG.moved){ NOTE_DRAG.moved = false; return; } // 드래그를 끝내는 클릭은 무시
  if(e.shiftKey && NOTE_RANGE.anchor && NOTE_RANGE.key===key){ closeNoteEditor(); setNoteRange(key, NOTE_RANGE.anchor, comm); return; }
  NOTE_RANGE.anchor = comm; setNoteRange(key, comm, comm); openNoteEditor(td, comm, key);
}
document.addEventListener('mouseup', ()=>{ NOTE_DRAG.on = false; });
document.addEventListener('mousedown', e=>{ if(NOTE_RANGE.set.size && !e.target.closest('td.keyin, #notepop')) clearNoteRange(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && NOTE_RANGE.set.size && !el('notepop')) clearNoteRange(); });
document.addEventListener('copy', e=>{
  const pop = el('notepop'); const ta = pop && q('textarea', pop);
  if(ta && document.activeElement===ta){ if(ta.selectionStart!==ta.selectionEnd) return; e.clipboardData.setData('text/plain', excelCell(ta.value)); e.preventDefault(); return; } // 글자 선택 없으면 칸 전체
  if(!EDIT.on || !NOTE_RANGE.set.size || pop || isTyping()) return;
  const vals = rangeComms().map(c=>excelCell(pendingVal(VEHICLE_BY_COMM[c], NOTE_RANGE.key)));
  e.clipboardData.setData('text/plain', vals.join('\r\n')); e.preventDefault();
  toast(tx('{col} {n}칸 복사', {col:keyinLabel(NOTE_RANGE.key), n:num(vals.length)}), tx('다른 행의 Note 셀을 끌어 선택한 뒤 Ctrl+V'));
});
document.addEventListener('paste', e=>{
  if(!EDIT.on || !NOTE_RANGE.set.size || el('notepop') || isTyping()) return;
  const cells = clipboardCells((e.clipboardData||window.clipboardData).getData('text/plain')); if(!cells.length) return;
  e.preventDefault();
  const order = pageRowsNow().map(v=>v.commission_no); const sel = rangeComms(); if(!sel.length) return;
  const key = NOTE_RANGE.key; let targets;
  if(cells.length===1) targets = sel.map(c=>[c, cells[0]]); // 1칸 복사 → 범위 전체 같은 값
  else { const start = order.indexOf(sel[0]); targets = order.slice(start, start+cells.length).map((c,i)=>[c, cells[i]]); } // 여러 행 → 범위 맨 위부터 아래로
  targets.forEach(([c,val])=>stageChange(c, key, val, '수동/일괄'));
  NOTE_RANGE.set = new Set(targets.map(t=>t[0])); renderGrid();
  toast(tx('{col} 붙여넣기 {n}칸 (저장 대기)', {col:keyinLabel(key), n:num(targets.length)}), tx("'편집 종료' 시 Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록"));
});
function openNoteEditor(td, comm, key){
  closeNoteEditor();
  const v = VEHICLE_BY_COMM[comm]; if(!v) return;
  const before = pendingVal(v, key); const beforeS = before==null? '' : String(before);
  const ta = mk('textarea', {rows:'6', placeholder: tx('여러 줄 입력 가능 (Enter = 줄바꿈)')}); ta.value = beforeS;
  const selN = EDIT.sel.size;
  let done = false;
  const finish = mode=>{ if(done) return; done = true; closeNoteEditor();
    if(mode==='cancel') return;
    const val = ta.value.trim();
    if(mode==='sel'){ const comms = [...new Set([...EDIT.sel, comm])]; comms.forEach(c=>stageChange(c, key, val, '수동/일괄')); renderGrid();
      toast(tx('{col} 선택 {n}건에 적용 (저장 대기)', {col:keyinLabel(key), n:num(comms.length)}), tx("같은 내용으로 덮어씀 · '편집 종료' 시 Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록")); return; }
    if(val!==beforeS){ stageChange(comm, key, val, '수동'); renderEditbar(); }
    setKeyinCell(td, val); td.classList.toggle('pend', !!(EDIT.pending[comm] && key in EDIT.pending[comm])); };
  ta.onkeydown = e=>{ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)) finish('row'); else if(e.key==='Escape') finish('cancel'); e.stopPropagation(); };
  const pop = mk('div', {class:'colfilter note-pop', id:'notepop'},
    mk('div', {class:'cf-h'}, mk('b', null, keyinLabel(key)), mk('span', {class:'muted small mono'}, comm), mk('button', {class:'x', title:tx('취소'), onclick:()=>finish('cancel')}, '×')),
    ta,
    mk('div', {class:'muted small'}, tx('Enter = 줄바꿈 · Ctrl+Enter = 이 행에 적용 · Esc = 취소 · Ctrl+C = 칸 전체 복사')),
    mk('div', {class:'muted small'}, tx('다른 행에 같은 내용: Note 셀을 끌어 범위 선택 → Ctrl+V (엑셀 열 복사도 가능)')),
    mk('div', {class:'cf-foot'},
      mk('button', {class:'btn sm', onclick:()=>finish('cancel')}, tx('취소')),
      mk('button', {class:'btn sm', disabled: selN===0, title:tx('체크한 오더 전부(이 행 포함)에 같은 내용으로 덮어씁니다 · 출처 수동/일괄'), onclick:()=>finish('sel')}, tx('선택한 {n}건에 적용', {n:num(selN)})),
      mk('button', {class:'btn sm primary', onclick:()=>finish('row')}, tx('이 행에 적용'))));
  pop._finish = finish;
  const r = td.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth-436))+'px';
  document.body.append(pop);
  const h = pop.offsetHeight; pop.style.top = (r.bottom+4+h <= window.innerHeight-8 ? r.bottom+4 : Math.max(8, r.top-4-h))+'px'; // 아래 공간이 없으면 셀 위에
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  setTimeout(()=>document.addEventListener('mousedown', noteEditorOutside), 0);
}
function noteEditorOutside(e){ const p = el('notepop'); if(p && !e.target.closest('#notepop')) p._finish('row'); }
function closeNoteEditor(){ const p = el('notepop'); if(p) p.remove(); document.removeEventListener('mousedown', noteEditorOutside); }
// 엑셀 클립보드 → 행별 첫 열 값 배열. 탭 = 열 구분, 줄바꿈 = 행 구분, 여러 줄·탭·따옴표가 든 셀은 "…"로 감싸고 안의 "는 ""(엑셀 규칙). 끝의 빈 행은 버림
function clipboardCells(text){
  const s = String(text||'').replace(/\r\n?/g, '\n'); const out = []; let cur = '', col = 0, inQ = false;
  for(let i=0; i<s.length; i++){ const ch = s[i];
    if(inQ){ if(ch!=='"'){ cur += ch; continue; } if(s[i+1]==='"'){ cur += '"'; i++; continue; } inQ = false; continue; }
    if(ch==='"' && cur===''){ inQ = true; continue; }
    if(ch==='\t'){ if(col===0) out.push(cur); cur = ''; col++; continue; }
    if(ch==='\n'){ if(col===0) out.push(cur); cur = ''; col = 0; continue; }
    cur += ch; }
  if(col===0 && cur!=='') out.push(cur);
  while(out.length && out[out.length-1]==='') out.pop();
  return out;
}
function selectedVehicles(){ return [...EDIT.sel].map(c=>VEHICLE_BY_COMM[c]).filter(Boolean); }
// ---- 오더 변경 (11/3 리뷰 #2~#4): 오더 생성과 같은 모델 매칭(modelPicker) · Current Status 선택 과정 없음 → 대상 행은 Ordered(Changeable)로 변경(유지) · 생산월은 Original PM(#3) · Order Update Date = 변경일(#4) ----
// 대상 = Ordered(Dummy)·Ordered(Changeable) 행만(KUFRI 확정 후 Dummy 오더 확정 → Changeable 전환 + Changeable 모델 변경 용도, 11/4 사용자 확정). 그 외 상태 행은 제외 안내만 하고 바꾸지 않는다. 변경 내용은 '편집 종료' 시 저장(stageChange → commitEdits)
const ORDER_CHANGE_STATUSES = ['Ordered(Dummy)','Ordered(Changeable)'];
function openModelChange(){
  const all = selectedVehicles(); if(!all.length) return;
  const vs = all.filter(v=>ORDER_CHANGE_STATUSES.includes(pendingVal(v,'current_status')));
  const excluded = all.filter(v=>!vs.includes(v));
  const by = countBy(vs, v=>pendingVal(v,'model'));
  const byBm = countBy(vs, v=>pendingVal(v,'bm'));
  const byPm = countBy(vs, v=>pendingVal(v,'original_pm'));
  const byEx = countBy(excluded, v=>pendingVal(v,'current_status'));
  const pk = modelPicker();
  // 시작값 = 첫 대상 오더의 Type · MY · BM (복수 선택 시 첫 오더 기준) (10/15 No.6)
  if(vs.length) pk.preset(pendingVal(vs[0],'model'), pendingVal(vs[0],'model_year'), pendingVal(vs[0],'bm'));
  // Original PM(생산월)도 같은 모달에서 일괄 변경 — 비워 두면 바꾸지 않음 (10/27, 11/3 #3: PM → Original PM). 입력하면 생성 모달과 같이 MY 자동 갱신
  const pmIn = mk('input', {type:'month', style:'width:160px'}); // 월 달력(브라우저 month picker) · 값은 YYYY-MM
  pmIn.oninput = ()=>{ const t = pmIn.value.trim(); if(/^\d{4}-\d{2}$/.test(t)) pk.setMy('MY'+MY_FROM_LETTER[myLetterFromPm(t)]); };
  const dist = o=> Object.keys(o).sort().map(k=>tx('{k} {n}건', {k:k||tx('(공란)'), n:num(o[k])})).join(' · ') || tx('(공란)');
  const field = (label, ctl, wide)=> mk('div', {class:'f'+(wide?' wide':'')}, mk('div', {class:'k'}, label), mk('div', {class:'v'}, ctl));
  const body = mk('div', null,
    mk('div', {class:'callout'}, `선택한 오더 ${num(vs.length)}건의 모델 속성(Vehicle · Gen · Model · Axle · Cab · Cab Gen · Wheelbase · PTO · Emission · Baumuster · BM · MY)을 Model_Master에서 매칭한 모델로, Original PM(생산월)을 입력한 월로 일괄 변경합니다. Original PM을 비워 두면 모델만 바뀝니다. Model In AFAB는 AFAB 업로드 값이라 바뀌지 않으며, 'Type' 열의 점(초록/빨강)으로 일치 여부를 확인합니다. 변경 내용은 '편집 종료' 시 저장되고 Order Update Date에 변경일이 기록됩니다.`),
    mk('div', {class:'callout', style:'font-weight:600'}, tx('Current Status가 Ordered(Changeable)로 변경(유지)됩니다')),
    excluded.length? mk('div', {class:'callout warn'}, tx('선택 {n}건 중 {m}건은 Ordered(Dummy)·Ordered(Changeable)가 아니라 제외됩니다', {n:num(all.length), m:num(excluded.length)}), ' (', dist(byEx), ')') : null,
    mk('div', {class:'fields'},
      field(tx('현재 BM'), dist(byBm), true),
      field(tx('현재 모델 분포'), dist(by), true),
      field(tx('① Type 검색 *'), pk.search), field('② Type *', pk.typeSel),
      field('③ MY *', pk.mySel), field(tx('④ 모델 (Model_Master) *'), pk.modelSel),
      field(tx('매칭된 모델 속성'), pk.attrs, true),
      field(tx('현재 Original PM 분포'), dist(byPm), true),
      field(tx('변경할 Original PM (생산월, 비우면 변경 없음)'), pmIn, true)));
  openModal(tx('오더 변경 — 모델·Original PM 일괄 변경'), '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, tx('취소')),
    mk('button', {class:'btn primary', disabled: !vs.length, onclick: ()=>{ const m = pk.current(); if(!m){ toast('모델 선택', 'Type과 모델을 선택하세요.'); return; }
      const pm = pmIn.value.trim(); if(pm && !/^\d{4}-(0[1-9]|1[0-2])$/.test(pm)){ toast('Original PM 형식 오류', 'YYYY-MM 형식으로 입력하세요 (예: 2027-03).'); return; }
      const patch = Store.vehicles.modelMasterPatch(m); if(pm) patch.original_pm = pm;
      patch.current_status = 'Ordered(Changeable)'; patch.order_update_date = TODAY_S; // #2 상태 전환(유지) · #4 변경일 기록 — 같은 값은 stageChange에서 저장 대기에 오르지 않음
      vs.forEach(v=>Object.entries(patch).forEach(([k,val])=>stageChange(v.commission_no, k, val, '수동/일괄'))); closeModal(); renderGrid();
      toast(`오더 변경 ${num(vs.length)}건 (저장 대기)`, `→ ${[m.model, m.axle, m.cab, modelOptTag(m)].filter(Boolean).join(' ')} · ${m.my}${pm? ` · Original PM ${pm}` : ''} · Current Status → Ordered(Changeable) · Order Update Date ${TODAY_S} · '편집 종료' 시 Vehicles 갱신 · Vehicle_History(출처: 수동/일괄) 기록`); }}, tx('변경')));
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
  // 10/30 재검토 1단계: Shipping Calc 열 필터 맨 위 '경과 배지 행만' (연·월 체크와 AND · LF.delayed · '적용' 때 반영)
  const delayedCb = key==='shipping_calc'? mk('input', {type:'checkbox', checked: LF.delayed||null}) : null;
  const delayedRow = delayedCb? mk('label', {class:'cf-delayed', title:tx('Shipping Calc 경과 배지가 있는 행만 표시 (선적 전·후 모두) · 리드타임 재검토 후보')}, delayedCb, mk('span', null, tx('경과 배지 행만')), mk('span', {class:'muted small'}, num(VEHICLES.filter(x=>shipDelayDays(x)>0).length))) : null;
  const pop = mk('div', {class:'colfilter', id:'colfilter'},
    mk('div', {class:'cf-h'}, mk('b', null, tx('{c} 열 필터', {c:tx(c.label)})), mk('button', {class:'x', title:'닫기', onclick: closeColFilter}, '×')),
    delayedRow, search,
    mk('div', {class:'cf-tools'},
      mk('button', {class:'btn sm', onclick:()=>{ shown().forEach(x=>checked.add(x)); draw(); }}, tx('표시된 값 전체 선택')),
      mk('button', {class:'btn sm', onclick:()=>{ shown().forEach(x=>checked.delete(x)); draw(); }}, tx('표시된 값 해제'))),
    list,
    mk('div', {class:'cf-foot'},
      mk('button', {class:'btn sm', onclick:()=>{ delete LF.col[key]; if(delayedCb) LF.delayed=false; LF.page=1; closeColFilter(); renderGrid(); }}, tx('필터 해제')),
      mk('button', {class:'btn sm primary', onclick:()=>{ if(checked.size>=vals.length) delete LF.col[key]; else LF.col[key]=new Set(checked); if(delayedCb) LF.delayed = delayedCb.checked; LF.page=1; closeColFilter(); renderGrid(); }}, tx('적용'))));
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom+4)+'px'; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth-296))+'px';
  document.body.append(pop); search.focus();
  setTimeout(()=>document.addEventListener('mousedown', colFilterOutside), 0);
}
function colFilterOutside(e){ if(!e.target.closest('#colfilter') && !e.target.closest('.cf')) closeColFilter(); }
function closeColFilter(){ const p = el('colfilter'); if(p) p.remove(); document.removeEventListener('mousedown', colFilterOutside); }

// ---- 모델 매칭 공용 (11/3 리뷰 #2): 오더 생성·오더 변경이 같은 흐름을 쓴다 — Type 숫자 검색 → Type 선택 → MY → 모델(Model_Master 행, 선택한 MY의 행만) 선택 → 매칭 속성 표시 ----
// 반환 {search, typeSel, mySel, modelSel, attrs, modelLine, current(): 선택한 Model_Master 행 또는 null, setMy(my): MY 지정 + 모델 목록 재필터, preset(type, my, bm): 시작값(Type·MY·현재 BM 행)}
function modelPicker(){
  const active = MODEL_MASTER.filter(m=>m.active);
  const modelLine = m=> [m.vehicle, m.series, m.model, m.axle, m.cab, modelOptTag(m)].filter(Boolean).join(' · '); // 11/4: Option 대신 비표준 옵션(ProCabin·PTO 등)만
  // 1~2. Type 숫자 검색 → 해당 숫자가 포함된 Type 드롭다운
  const search = mk('input', {placeholder:tx('Type 숫자 3~4자리 (예: 2863)'), maxlength:'4', style:'width:100%'});
  const typeSel = mk('select', {style:'width:100%', disabled:true}, mk('option', {value:''}, tx('검색어를 입력하세요')));
  // 3. MY
  const mySel = mk('select', {style:'width:100%'}, Object.values(MY_FROM_LETTER).map(n=>mk('option', {value:'MY'+n}, 'MY'+n)));
  mySel.value = 'MY'+MY_FROM_LETTER[myLetterFromPm(ymAdd(BASE_YM,3))];
  // 5. 모델 한 줄 드롭다운 (Vehicle · Model · Type · Axle · Cab · 비표준 옵션) · 11/4: Model_Master 행이 연식별이라 ③ MY로 거른 행만 보인다
  const modelSel = mk('select', {style:'width:100%', disabled:true}, mk('option', {value:''}, tx('Type을 먼저 선택하세요')));
  // 4. 매칭된 Model_Master 속성 표시 (BM = Baumuster Code1-Code2)
  const attrs = mk('div', {class:'kv small', style:'grid-template-columns:140px 1fr'});
  const current = ()=> modelSel.value? (active[Number(modelSel.value)] || null) : null; // 미선택('')이면 null (Number('')=0으로 첫 행이 보이던 것 수정)
  const drawAttrs = ()=>{ attrs.replaceChildren();
    const m = current(); if(!m){ attrs.append(mk('dt', {class:'muted'}, tx('모델을 선택하면 속성이 표시됩니다.'))); return; }
    [['BM', m.prefix+'-'+m.code2], ['Baumuster', m.prefix+' '+m.suffix], ['Model In AFAB', m.type_desc], ['Vehicle', m.vehicle], ['Model', m.series], ['Type', m.model], ['Axle', m.axle], ['Cab', m.cab], ['Cab Gen', m.cab_gen||'—'], ['Wheelbase', m.wheelbase||'—'], ['PTO', m.pto||'—'], ['Emission', m.emission||'—'], ['Gen', m.gen], [tx('리드타임(일)'), String(m.lead_days)], [tx('리드타임(월)'), String(m.lead)], ['MY', m.my]]
      .forEach(([k,v])=>attrs.append(mk('dt', null, k), mk('dd', {class:'mono'}, v))); };
  // 흐름 연결
  search.oninput = ()=>{ const t = search.value.replace(/\D/g,''); search.value = t;
    const types = [...new Set(active.filter(m=>m.model.includes(t)).map(m=>m.model))].sort();
    typeSel.replaceChildren(mk('option', {value:''}, t.length>=3 && types.length? tx('Type 선택 ({n})', {n:num(types.length)}) : t.length<3? tx('숫자 3~4자리를 입력하세요') : tx('일치하는 Type 없음')), ...(t.length>=3? types.map(x=>mk('option', {value:x}, x)) : []));
    typeSel.disabled = !(t.length>=3 && types.length); typeSel.onchange(); };
  typeSel.onchange = ()=>{ const t = typeSel.value;
    const rows = active.map((m,i)=>({m,i})).filter(x=>x.m.model===t && x.m.my===mySel.value); // 11/4: 선택한 MY의 행만
    modelSel.replaceChildren(mk('option', {value:''}, t? (rows.length? tx('모델 선택 ({n})', {n:num(rows.length)}) : tx('선택한 MY에 해당 모델 없음')) : tx('Type을 먼저 선택하세요')), ...rows.map(x=>mk('option', {value:String(x.i)}, modelLine(x.m))));
    modelSel.disabled = !rows.length; if(rows.length===1) modelSel.value = String(rows[0].i); drawAttrs(); };
  modelSel.onchange = drawAttrs; mySel.onchange = ()=>typeSel.onchange(); // 11/4: MY가 바뀌면 모델 목록을 다시 거른다
  const setMy = my=>{ if(my && [...mySel.options].some(o=>o.value===my)) mySel.value = my; typeSel.onchange(); };
  const preset = (type, my, bm)=>{ // 오더 변경 시작값: Type 숫자로 검색 → 해당 Type 선택 → MY → 현재 BM과 같은 행이 있으면 선택
    if(my && [...mySel.options].some(o=>o.value===my)) mySel.value = my;
    search.value = String(type||'').replace(/\D/g,'').slice(0,4); search.oninput();
    if(type && [...typeSel.options].some(o=>o.value===type)){ typeSel.value = type; typeSel.onchange(); }
    const i = active.findIndex(m=>m.model===type && m.my===mySel.value && Store.modelMaster.bmOf(m)===bm);
    if(i>=0 && [...modelSel.options].some(o=>o.value===String(i))){ modelSel.value = String(i); drawAttrs(); } };
  drawAttrs();
  return {search, typeSel, mySel, modelSel, attrs, modelLine, current, setMy, preset};
}

// ---- 오더 생성 (10/19): Type 숫자 검색 → Type 선택 → MY → 모델(Model_Master 행) 선택 → 속성 표시(modelPicker 공용) → Original PM·수량·단계 → Commission No 생성 방식 → 생성 ----
// 10/20 No.22: 입력받는 생산월은 Original PM(배지: 오더 생성)에 기록하고 PM은 공란 · No.10: Order Update Date = 생성일(11/3 #4: 오더 변경 시 변경일로 갱신)
// 11/3 #1: Current Status는 Ordered(Dummy) / Ordered(Changeable) 두 가지만 입력(기본 Dummy) · 주문제작 모델 오더도 Changeable
function openAddOrder(){
  const field = (label, ctl, wide)=> mk('div', {class:'f'+(wide?' wide':'')}, mk('div', {class:'k'}, label), mk('div', {class:'v'}, ctl));
  const pk = modelPicker(); const modelLine = pk.modelLine;
  // 6. Original PM(생산월) · 수량 · Current Status
  const pmIn = mk('input', {placeholder:'YYYY-MM', value: ymAdd(BASE_YM,3), style:'width:100%'});
  const qtyIn = mk('input', {type:'number', min:'1', max:'500', value:'1', style:'width:100%'});
  const stSel = mk('select', {style:'width:100%'}, ORDER_CHANGE_STATUSES.map(s=>mk('option', {value:s}, s))); // 11/3 #1: Dummy / Changeable만
  stSel.value = 'Ordered(Dummy)';
  const stNote = mk('div', {class:'muted small', style:'margin-top:4px'}, tx('주문제작 모델 오더도 Ordered(Changeable)로 입력합니다'));
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
  pmIn.oninput = ()=>{ if(/^\d{4}-\d{2}$/.test(pmIn.value.trim())) pk.setMy('MY'+MY_FROM_LETTER[myLetterFromPm(pmIn.value.trim())]); };
  drawPreview();
  const body = mk('div', null,
    mk('div', {class:'callout'}, 'AFAB에 아직 없는 오더(예: 구두 확정 오더, 특수 사양)를 수동 등록합니다. 이후 AFAB 업로드에서 같은 Commission No.가 들어오면 AFAB 필드가 덮어쓰고 출처가 AFAB로 바뀝니다.'),
    mk('div', {class:'fields'},
      field(tx('① Type 검색 *'), pk.search), field('② Type *', pk.typeSel),
      field('③ MY *', pk.mySel), field(tx('④ 모델 (Model_Master) *'), pk.modelSel),
      field(tx('매칭된 모델 속성'), pk.attrs, true),
      field(tx('⑤ Original PM (생산월) *'), pmIn), field(tx('수량 *'), qtyIn), field('Current Status *', mk('div', null, stSel, stNote)),
      field(tx('⑥ Commission No 생성 방식 *'), mk('div', {style:'display:flex;gap:14px;align-items:center;flex-wrap:wrap'},
        mk('label', null, rCont, tx(' 마지막 번호에 이어서 생성')), mk('label', null, rNew, tx(' 새 번호로 시작 '), startIn)), true),
      field('', preview, true)),
    mk('div', {class:'muted small', style:'margin-top:8px'}, '* 필수. 모델 속성(Vehicle · Model · Type · Axle · Cab · Cab Gen · Wheelbase · PTO · Emission · Baumuster · BM)은 선택한 Model_Master 행에서 채워집니다. 생산월은 Original PM에 기록되고 PM은 AFAB 확정 후 채워집니다. Order Update Date = 생성일(오더 변경 시 변경일로 갱신). Commission No.는 중복 생성할 수 없습니다.'),
    err);
  openModal(tx('오더 생성')+' '+note('L7'), '', ' ');
  el('modal-body').replaceChildren(body);
  const fail = msg=>{ err.textContent = msg; err.hidden = false; };
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, tx('취소')),
    mk('button', {class:'btn primary', onclick: ()=>{ err.hidden = true;
      const m = pk.current(); if(!m) return fail('Type과 모델을 선택하세요.');
      const pm = pmIn.value.trim(); if(!/^\d{4}-\d{2}$/.test(pm)) return fail('Original PM(생산월)은 YYYY-MM 형식으로 입력하세요.');
      const cs = commList(); if(!cs.length) return fail('Commission No 시작 번호는 숫자만 입력하세요.');
      const dup = cs.filter(c=>VEHICLE_BY_COMM[c]); if(dup.length) return fail(`Commission No. ${dup.slice(0,3).join(', ')}${dup.length>3?' 외':''}는 이미 등록된 오더입니다. 중복 생성할 수 없습니다.`);
      const rows = cs.map(c=>Store.vehicles.create({commission_no:c, m, pm, status:stSel.value, model_year:pk.mySel.value, by:state.user}));
      const n = Store.vehicles.add(rows);
      const d = new Date(); const at = TODAY_S+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
      Store.history.add(rows.map(v=>({commission_no:v.commission_no, field:'(전체)', old_value:'', new_value:'수동 생성', changed_by:state.user, changed_at:at, source:'수동'})));
      closeModal(); renderGrid();
      toast(`오더 생성 ${num(n)}건`, `${cs[0]}${n>1?` ~ ${cs[n-1]}`:''} · ${modelLine(m)} · Original PM ${pm} · ${stSel.value} → Vehicles 추가(출처: 수동) · Vehicle_History 기록 · 대시보드·KUFRI 즉시 반영`); }}, tx('생성')));
}
