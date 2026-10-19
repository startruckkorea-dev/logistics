'use strict';
/* ===== 공통: 상수·컴포넌트·Drawer·Modal·Toast ===== */

const STAGES = ['Ordered(Dummy)','Rejected','Ordered(Changeable)','Ordered(Fixed)','In Production','Shipment scheduled','In Transit','Bonded Stock','OH Stock','Sold'];
const STAGE_CLASS = {'Ordered(Dummy)':'st-ordered','Rejected':'st-cancel','Ordered(Changeable)':'st-ordered','Ordered(Fixed)':'st-ordered','In Production':'st-prod','Shipment scheduled':'st-sched','In Transit':'st-transit','Bonded Stock':'st-bonded','OH Stock':'st-oh','Sold':'st-sold','Cancelled':'st-cancel'};
const STAGE_COLOR = {'Ordered(Dummy)':'var(--st-ordered)','Rejected':'var(--st-cancel)','Ordered(Changeable)':'var(--st-ordered)','Ordered(Fixed)':'var(--st-ordered)','In Production':'var(--st-prod)','Shipment scheduled':'var(--st-sched)','In Transit':'var(--st-transit)','Bonded Stock':'var(--st-bonded)','OH Stock':'var(--st-oh)','Sold':'var(--st-sold)','Cancelled':'var(--st-cancel)'};
const STAGE_SHORT = {'Ordered(Dummy)':'Ordered(Dummy)','Rejected':'Rejected','Ordered(Changeable)':'Ordered(Changeable)','Ordered(Fixed)':'Ordered(Fixed)','In Production':'In Production','Shipment scheduled':'Shipment scheduled','In Transit':'In Transit (Shipped / Invoiced)','Bonded Stock':'Bonded Stock','OH Stock':'OH Stock','Sold':'Sold','Cancelled':'Cancelled'};
const SERIES = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','var(--s7)','var(--s8)'];

// Logistics 그리드 43열 — docs/data-dictionary_v2_1_2.csv "최종 컬럼 순서" 기준 (Commission No 고정열 → Current Status → 사전 순서 → Order Note)
// 뒤쪽 블록: 사전 '제외' 열(v2_1_1·v2_2) 중 남긴 1개(AFAB 수정 가능) + 사전 미언급 열 1개(Baumuster). group은 상세 Drawer·열 설정 모달의 묶음에만 사용.
// 10/19: Order Date · Invoice No. · SAP · SAP B1 · Days in Stock · Stock level · T/M Memo 열 제거
const COLUMNS = [
  {key:'commission_no', label:'Commission No', group:'기본', src:'AFAB'},
  {key:'current_status', label:'Current Status', group:'기본', src:'자동'},
  {key:'model_year', label:'MY', group:'기본', src:'자동'},
  {key:'bm', label:'BM', group:'기본', src:'자동'},
  {key:'vin_no', label:'Vin No', group:'기본', src:'AFAB'},
  {key:'vehicle', label:'Vehicle', group:'기본', src:'자동'},
  {key:'series', label:'Model', group:'기본', src:'자동'},   // 10/15 No.3: SAM 기준 라벨 (기존 Series → Model)
  {key:'model', label:'Type', group:'기본', src:'자동'},     // 10/15 No.3: SAM 기준 라벨 (기존 Model → Type)
  {key:'axle', label:'Axle', group:'기본', src:'자동'},
  {key:'cab', label:'Cab', group:'기본', src:'자동'},
  {key:'option', label:'Option', group:'기본', src:'자동'},   // 10/15 No.5: Model_Master에서 자동 반영 (수동 입력 제외)
  {key:'changeability_date', label:'Changeability Date', group:'일정', src:'AFAB'},
  {key:'pm', label:'PM', group:'일정', src:'AFAB'},
  {key:'original_pm', label:'Original PM', group:'일정', src:'AFAB'},
  {key:'tdd_calc', label:'TDD Calc', group:'일정', src:'AFAB'},
  {key:'dispatch', label:'Dispatch', group:'일정', src:'AFAB'},
  {key:'shipping', label:'Shipping', group:'일정', src:'AFAB'},
  {key:'invoice', label:'Invoice', group:'선적', src:'AFAB'},
  {key:'planned_arrival', label:'Planned Arrival', group:'일정', src:'AFAB'},
  {key:'eta_from_tdd', label:'ETA From TDD', group:'일정', src:'자동'},
  {key:'eta_from_eukor_pirt', label:'ETA From EUKOR/PIRT', group:'일정', src:'입력'},
  {key:'ata', label:'ATA', group:'일정', src:'입력'},
  {key:'bl_no', label:'B/L No', group:'선적', src:'입력'},
  {key:'vessel', label:'Vessel', group:'선적', src:'AFAB'},
  {key:'customs_clearance_date', label:'Customs Clearance Date', group:'통관', src:'입력'},
  {key:'color_code', label:'Color Code', group:'사양', src:'AFAB'},
  {key:'color_name', label:'Color Name', group:'사양', src:'자동'},
  {key:'tires', label:'Tires', group:'메모', src:'입력', memo:true},
  {key:'model_in_afab', label:'Model In AFAB', group:'사양', src:'AFAB'},
  {key:'engine_no', label:'Engine No', group:'기본', src:'AFAB'},
  {key:'import_license', label:'Import License', group:'통관', src:'입력'},
  {key:'ref_commission_no', label:'Ref Commission No', group:'기본', src:'입력'},
  {key:'option_remarks', label:'Option Note', group:'메모', src:'입력', memo:true},
  {key:'order_note', label:'Order Note', group:'메모', src:'입력', memo:true}, // 10/15 No.10: Option Note 다음 순서
  {key:'b1_factory_order', label:'B1 Factory Order', group:'선적', src:'입력'},
  {key:'sales_month', label:'Sales Month', group:'통관', src:'입력'},
  {key:'model_classification', label:'Model Classification', group:'사양', src:'자동'},
  {key:'gen', label:'Gen', group:'기본', src:'자동'},
  {key:'spec', label:'Spec', group:'사양', src:'자동'},
  {key:'sub_cat', label:'Sub Cat', group:'사양', src:'AFAB'},
  {key:'fleet_co', label:'Fleet C/O', group:'선적', src:'입력'},
  // ---- 사전 제외 열 (뒤쪽 배치) ----
  {key:'afab_editable', label:'AFAB 수정 가능', group:'사양', src:'AFAB'},
  // ---- 사전 미언급 열 (뒤쪽 배치) ----
  {key:'baumuster', label:'Baumuster', group:'사양', src:'AFAB'},
];
const GROUPS = ['기본','일정','선적','통관','사양','메모'];
const DEFAULT_HIDDEN_COLS = ['original_pm']; // 사전 주석: 'Original PM'은 숨기기 기능으로 구현 (편집 모드 열 머리글 체크박스로 다시 표시 가능)
const GRID_JUMPS = ['current_status','tdd_calc','bl_no','option_remarks']; // 그리드 바로가기 버튼(이름 = 열 라벨) → 이동할 열 key. current_status는 맨 처음으로

// 설계 노트 (목업 전용)
const NOTES = {
  G1:'상단 메뉴 바 7개(좌측 사이드바 아님) + AFAB 최근 반영 표시', G2:'화면 제목 줄: 통합 검색(Comm/VIN/B/L → 1건이면 상세 즉시) · 설계 노트 토글 · 로그인 사용자·역할', G3:'Viewer에게는 입력·반영·확정 버튼이 보이지 않는다. UI 한국어, 필드명은 기존 엑셀 영문',
  D1:'차량 주문·재고 흐름: 카드 7종 한 줄 수정 가능 주문(Ordered(Changeable)) → 확정 주문(Ordered(Fixed)) → 확정 재고(Factory Stock = In Production + Shipment scheduled) → 운송 중(In Transit) → 당월 입항 예정(Arrival) → 재고(Bonded + OH) → 판매(Sold YTD). 카드별 아이콘, Cancelled 카드 없음. 카드 클릭 → 관련 목록', D2:'월별 생산/입항/판매 추이: 26년 1월~27년 12월 24개월 중 당월 기준 이전 5개월~이후 6개월(12개월)만 표시, 나머지는 가로 스크롤. 막대 수치 표시, 기준월 강조, 기준월 이후 음영', D3:'입항 예정 선박: 입항예정 값은 Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환, ATA 후 2일까지 표시', D4:'차종별 파이프라인(7단계, Sold 제외)', D6:'연식별 재고: 세로 누적 막대(연식 최신순, Tractor/Rigid/Tipper/BB)',
  L1:'단계 칩 필터(10단계 + Cancelled)', L2:'열 필터(모델 관련 Vehicle~Option · 날짜 열 Changeability Date~Customs Clearance Date 연·월 체크 트리 · Vessel) · 텍스트 검색(Comm · VIN · B/L · Vessel · Type · Engine · Order Note · Option Note, 일치 텍스트 하이라이트) · 정렬(기본 Commission No 최신순)', L3:'Comm No. 기준 한 행에 전체 43열을 data-dictionary 순서로 표시, Comm No. 열 고정, 바로가기(Current Status · TDD Calc · B/L No · Option Note)', L4:'열 표시/숨김: 편집 모드에서 열 머리글 체크박스로 조정(변경 이력 없음)', L5:'출처 배지(AFAB/자동/입력)', L6:'행 클릭 → 상세 Drawer(마일스톤 타임라인, 필드 그룹, 변경 이력)', L7:'수동 오더 추가, 엑셀 내보내기',
  S1:'KPI 3종(운송중·당월/익월 입항 예정) + 월별 입항 예정(엑셀 Arrival Schedule 피벗: 구분 > 차종 > 모델 × 월 > 선박)', S2:'선박별 현황(B/L·Shipping·Pl.arrival·ETA 선사·ATA·TSC 입고일(Key-in)·대수) + 선사 스케줄 일괄 업데이트. ETA 불일치 카드·탭·표시는 제외',
  K1:'기준월 선택(최근 5개월 월말 마감 + 현재) → 요약 카드(Total Stock + 연식 MY24~27 대수·비율) → 연식 범례', K2:'By Vehicle(차종별 스택 바, 길이=대수) → By Model(차종 섹션 안 모델별 스택 바) → 마감 리포트 HTML·Excel 내보내기',
  A1:'4단계 흐름 + 드롭존', A2:'파일 검증 결과(헤더 32개, 중복 0, 날짜/금액 변환, FIN 형식)', A3:'변경점(신규/변경/제외/변동없음) 체크 반영', A4:'반영 이력(AFAB_Uploads)', A5:'매핑 요약(32열)',
  P1:'연도·차종 선택, 판매계획 입력 모드(Editor), 범례(실적/확정/계획)', P2:'모델 그룹 접기, 행 = Production/Arrival/Sales/OH Stock/In Transit/재고월수, 기준월 열 강조', P3:'전체 합계 + Fixed Order', P4:'계획 확정·시나리오(2차)·Kufri Excel',
  C1:'아키텍처·연결 정보', C2:'모델 마스터(Model_Master)', C3:'AFAB 매핑', C4:'상태 규칙(§7)', C5:'기준값(Settings)', C6:'사용자·권한(M365 그룹)', C7:'변경 이력(Vehicle_History)', C8:'감사 로그(Audit_Log)',
};

// ---- 전역 상태 ----
const PAGES = {};
const state = { role:'Editor', user: USERS.find(u=>u.role==='Editor').name, notes:false, hiddenCols:new Set(DEFAULT_HIDDEN_COLS) };
function isEditor(){ return state.role==='Editor'; }

// ---- 문자열 헬퍼 ----
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function num(n){ return (n==null||n==='')?'':Number(n).toLocaleString('ko-KR'); }
function pct(a,b){ return b? (a/b*100).toFixed(1)+'%':'0.0%'; }
function el(id){ return document.getElementById(id); }
function q(sel,root){ return (root||document).querySelector(sel); }
function qa(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }

// ---- 작은 컴포넌트 ----
function note(id){ return `<span class="note" title="${esc(NOTES[id]||'')}" data-note="${id}">${id}</span>`; }
function srcBadge(src){ const c = src==='AFAB'?'afab': src==='자동'?'auto':'input'; const t = src==='AFAB'?'AFAB 업로드로만 갱신(잠금)': src==='자동'?'시스템 계산(잠금)':'Editor 수동 입력'; return `<span class="badge ${c}" title="${t}">${src}</span>`; }
function stagePill(stage){ return `<span class="pill ${STAGE_CLASS[stage]||'neutral'}">${esc(stage)}</span>`; }
function classPill(cls){ if(!cls||cls==='—') return '<span class="muted">—</span>'; return `<span class="pill ${cls==='Fixed order'?'cls-fixed':'cls-chg'}">${esc(cls)}</span>`; }
function statusPill(kind, text){ return `<span class="pill ${kind}">${esc(text)}</span>`; }

// ---- Toast (저장·처리 버튼은 동작 설명만 표시) ----
function toast(title, detail){
  const box=el('toast'); const t=document.createElement('div'); t.className='toast';
  t.innerHTML = `<b>${esc(title)}</b>${detail?`<span class="t2">${esc(detail)}</span>`:''}`;
  box.appendChild(t); setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 3800);
}
function describe(action, detail){ toast('[목업] '+action, detail||'실제 시스템에서는 SharePoint List에 저장되고 모든 화면 집계가 즉시 재계산됩니다.'); }

// ---- Modal ----
function openModal(title, bodyHtml, footerHtml){
  el('modal-title').innerHTML = title; el('modal-body').innerHTML = bodyHtml; el('modal-foot').innerHTML = footerHtml || `<button class="btn" onclick="closeModal()">닫기</button>`;
  document.body.classList.add('modal-open');
}
function closeModal(){ document.body.classList.remove('modal-open'); }

// ---- Drawer ----
function openDrawer(headHtml, bodyHtml){
  el('drawer-head').innerHTML = headHtml + `<button class="x" onclick="closeDrawer()" title="닫기">×</button>`;
  el('drawer-body').innerHTML = bodyHtml; el('drawer-body').scrollTop=0;
  document.body.classList.add('drawer-open');
}
function closeDrawer(){ document.body.classList.remove('drawer-open'); }

// ---- 차량 상세 Drawer (L6) ----
function openVehicle(comm){
  const v = VEHICLE_BY_COMM[comm]; if(!v){ toast('차량을 찾을 수 없습니다', comm); return; }
  const ms = [
    {l:'PM', d:v.pm}, {l:'TDD', d:v.tdd_calc}, {l:'Dispatch', d:v.dispatch},
    {l:'Shipping', d:v.shipping}, {l:'ETA Final', d:v.ata}, {l:'Customs', d:v.customs_clearance_date}, {l:'Sales', d:v.sales_month},
  ]; // 10/19: 'Ordered' 단계 제거 (Order Date 열 제거에 따름)
  const doneIdx = v.current_status==='Sold'?7: v.current_status==='OH Stock'?6: v.current_status==='Bonded Stock'?5: v.current_status==='In Transit'?4: v.current_status==='Shipment scheduled'?3: v.current_status==='In Production'?(v.dispatch?3:2):0;
  const tl = ms.map((m,i)=>`<div class="ms ${i<doneIdx?'done':''} ${i===doneIdx?'cur':''}"><div class="dot"></div><div class="l">${m.l}</div><div class="d">${esc(m.d)||'—'}</div></div>`).join('');
  const editable = isEditor();
  const field = (c)=>{
    const val = v[c.key];
    let inner;
    if(c.key==='current_status') inner = stagePill(val);
    else if(c.src==='입력' && editable) inner = `<input value="${esc(val)}" data-f="${c.key}" placeholder="${c.key.includes('date')?'YYYY-MM-DD': c.key==='sales_month'?'YYYY-MM':''}">`;
    else if(editable) inner = `<input value="${esc(c.num?num(val):val)}" readonly title="${c.src==='AFAB'?'AFAB 업로드로만 갱신됩니다':'시스템 계산 값입니다'}">`;
    else inner = `<span>${esc(c.num?num(val):val)||'<span class="muted">—</span>'}</span>`;
    return `<div class="f ${c.memo?'wide':''}"><div class="k">${esc(c.label)} ${srcBadge(c.src)}${c.src!=='입력'?'<span class="lock">🔒</span>':''}</div><div class="v">${inner}</div></div>`;
  };
  const groups = GROUPS.map(g=>`<div class="card"><div class="card-h"><h2>${g}</h2></div><div class="fields">${COLUMNS.filter(c=>c.group===g).map(field).join('')}</div></div>`).join('');
  const extra = `<div class="card"><div class="card-h"><h2>파생·상태</h2><span class="desc">저장하지 않고 계산</span></div><div class="fields">
    <div class="f"><div class="k">MY ${srcBadge('자동')}</div><div class="v">${esc(v.model_year)} <span class="muted small">(VIN 10번째 자리)</span></div></div>
    <div class="f"><div class="k">Model Classification ${srcBadge('자동')}</div><div class="v">${esc(v.model_classification)}</div></div>
    <div class="f"><div class="k">DMS Model Name ${srcBadge('자동')}</div><div class="v">${esc(v.dms_model_name)}</div></div>
    <div class="f"><div class="k">Changeability D-day ${srcBadge('자동')}</div><div class="v">${v.changeability_dday==null?'—':'D-'+v.changeability_dday}</div></div>
    <div class="f"><div class="k">AFAB 금일 존재 ${srcBadge('자동')}</div><div class="v">${v.in_afab_today? statusPill('ok','있음') : (['Ordered(Changeable)','Ordered(Fixed)','In Production','Shipment scheduled','In Transit'].includes(v.current_status)? statusPill('warn','없음 — 확인 필요'):'<span class="muted">해당 없음</span>')}</div></div>
    <div class="f"><div class="k">Status override ${srcBadge('입력')}</div><div class="v">${editable?`<select data-f="status_override"><option value="">(자동 판정)</option>${['Cancelled','Rejected','Sold','OH Stock','Bonded Stock','In Transit','Shipment scheduled','In Production','Ordered(Fixed)','Ordered(Changeable)','Ordered(Dummy)'].map(s=>`<option ${v.status_override===s?'selected':''}>${s}</option>`).join('')}</select>`:esc(v.status_override||'—')}</div></div>
    <div class="f"><div class="k">Status reason ${srcBadge('입력')}</div><div class="v">${editable?`<input value="${esc(v.status_reason)}" placeholder="override 시 사유 필수">`:esc(v.status_reason||'—')}</div></div>
  </div></div>`;
  const hist = VEHICLE_HISTORY.filter(h=>h.commission_no===comm);
  const histHtml = `<div class="card"><div class="card-h"><h2>변경 이력</h2><span class="desc">Vehicle_History · 필드 단위 before/after</span></div>
    <table class="tbl"><thead><tr><th>일시</th><th>필드</th><th>이전</th><th>이후</th><th>사용자</th><th>출처</th></tr></thead><tbody>
    ${hist.map(h=>`<tr><td class="mono">${h.changed_at}</td><td class="mono">${h.field}</td><td class="muted">${esc(h.old_value)||'—'}</td><td><b>${esc(h.new_value)||'—'}</b></td><td>${esc(h.changed_by)}</td><td>${statusPill('neutral',h.source)}</td></tr>`).join('')}
    <tr><td class="mono">2026-09-15 10:00</td><td class="mono">(전체)</td><td class="muted">—</td><td>초기 적재</td><td>이관 스크립트</td><td>${statusPill('neutral','이관')}</td></tr>
    </tbody></table></div>`;
  const head = `<div><h2>${esc(v.commission_no)} ${stagePill(v.current_status)}</h2>
    <div class="meta">${esc(v.model_classification)} · ${esc(v.vehicle)} · VIN ${esc(v.vin_no)||'미부여'} · 수정 ${esc(v.modified)} (${esc(v.modified_by)})</div>
    <div class="btn-group" style="margin-top:8px">
      <button class="btn primary sm editor-only" onclick="describe('저장', 'Graph PATCH(If-Match ETag)로 입력 필드만 저장하고 Vehicle_History에 before/after를 기록합니다. 충돌 시 재조회 후 알림.')">저장</button>
      <button class="btn sm editor-only" onclick="describe('상태 override', '자동 판정 대신 지정 단계를 적용합니다. 사유(Status reason) 입력이 필수입니다.')">상태 override</button>
      <button class="btn sm danger editor-only" onclick="describe('취소 처리', 'Cancelled는 수동 지정만 가능합니다(자동 취소 금지). 사유 기록 후 KUFRI·대시보드 집계에서 제외됩니다.')">취소 처리</button>
      <button class="btn sm" onclick="describe('이력 보기', 'Vehicle_History 전체를 마스터·설정 > 변경 이력에서 Comm 필터로 조회합니다.')">이력 전체</button>
    </div></div>`;
  openDrawer(head, `<div class="card"><div class="card-h"><h2>마일스톤 타임라인</h2>${note('L6')}</div><div class="timeline">${tl}</div></div>${groups}${extra}${histHtml}`);
}

// ---- SVG 세로 막대 차트 (그룹 막대, 기준월 이후 음영) ----
function barChart(opts){
  // opts: {months:[], series:[{name,color,values:[]}], baseIdx, height}
  const W=960, H=opts.height||240, padL=40, padR=10, padT=14, padB=28;
  const n=opts.months.length, gw=(W-padL-padR)/n;
  const max=Math.max(1,...opts.series.flatMap(s=>s.values));
  const nice = Math.ceil(max/10)*10;
  const y=v=>padT+(H-padT-padB)*(1-v/nice);
  let g='';
  for(let i=0;i<n;i++){ const x=padL+i*gw; if(opts.baseIdx!=null && i>opts.baseIdx) g+=`<rect class="future" x="${x}" y="${padT}" width="${gw}" height="${H-padT-padB}"/>`; if(i===opts.baseIdx) g+=`<rect class="base" x="${x}" y="${padT}" width="${gw}" height="${H-padT-padB}"/>`; }
  for(let t=0;t<=4;t++){ const v=nice*t/4; g+=`<line class="gridl" x1="${padL}" x2="${W-padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`; }
  const bw=Math.min(14,(gw-8)/opts.series.length-2);
  opts.series.forEach((s,si)=>{ s.values.forEach((v,i)=>{ const x=padL+i*gw+(gw-(bw+2)*opts.series.length)/2+si*(bw+2); const yy=y(v);
    g+=`<rect class="bar" x="${x}" y="${yy}" width="${bw}" height="${Math.max(0,H-padB-yy)}" fill="${s.color}" data-tip="${esc(opts.months[i])} · ${esc(s.name)} ${v}대${(opts.baseIdx!=null&&i>opts.baseIdx)?' (계획/예정)':''}"/>`; }); });
  opts.months.forEach((m,i)=>{ g+=`<text x="${padL+i*gw+gw/2}" y="${H-8}" text-anchor="middle">${m.slice(2)}</text>`; });
  const legend = `<div class="legend">${opts.series.map(s=>`<span><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}${opts.baseIdx!=null?'<span><span class="sw" style="background:#fff4e0;border:1px solid #f3d9a8"></span>기준월</span><span><span class="sw" style="background:#eef1f5;border:1px solid #d3dae3"></span>기준월 이후(계획·예정)</span>':''}</div>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>${legend}`;
}

// ---- 가로 스택 바 (hbars) ----
function hbar(label, segs, total, max, cls){
  // segs: [{name,color,value}]
  const w = max? total/max*100 : 0;
  const track = segs.filter(s=>s.value>0).map(s=>`<div class="seg" style="width:${(s.value/total*w).toFixed(2)}%;background:${s.color}" data-tip="${esc(label)} · ${esc(s.name)} ${s.value}대 (${pct(s.value,total)})"></div>`).join('');
  return `<div class="hbar ${cls||''}"><div class="lbl" title="${esc(label)}">${esc(label)}</div><div class="track">${track}</div><div class="val num"><b>${num(total)}</b>${max!=null&&cls!=='nopct'?` · ${pct(total, hbar._grand||total)}`:''}</div></div>`;
}

// 툴팁
document.addEventListener('mousemove', e=>{ const t=e.target.closest&&e.target.closest('[data-tip]'); const tip=el('tip'); if(!tip) return; if(t){ tip.textContent=t.getAttribute('data-tip'); tip.style.display='block'; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY+12)+'px'; } else tip.style.display='none'; });
// 설계 노트 클릭 → 설명
document.addEventListener('click', e=>{ const n=e.target.closest&&e.target.closest('.note'); if(n){ e.stopPropagation(); toast('설계 노트 '+n.dataset.note, NOTES[n.dataset.note]); } });

// ---- DOM 생성 헬퍼 (innerHTML 미사용: 데이터는 textContent/createElement로) ----
function mk(tag, attrs, ...children){ return _mkNode(document.createElement(tag), attrs, children); }
function mkSvg(tag, attrs, ...children){ return _mkNode(document.createElementNS('http://www.w3.org/2000/svg', tag), attrs, children); }
function _mkNode(e, attrs, children){
  if(attrs) Object.entries(attrs).forEach(([k,v])=>{ if(v==null||v===false) return; if(k==='class') e.setAttribute('class', v); else if(k==='style') e.style.cssText=v; else if(k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); });
  children.flat(Infinity).forEach(c=>{ if(c==null||c===false) return; e.append(c instanceof Node? c : document.createTextNode(String(c))); });
  return e;
}
function noteEl(id){ return mk('span', {class:'note', title:NOTES[id]||'', 'data-note':id}, id); }
function stagePillEl(stage){ return mk('span', {class:'pill '+(STAGE_CLASS[stage]||'neutral')}, stage); }
function legendEl(items){ return mk('div', {class:'legend'}, items.map(it=>mk('span', null, mk('span', {class:'sw', style:'background:'+it.color+(it.border?';border:1px solid '+it.border:'')}), it.name))); }

// ---- SVG 세로 막대 차트 (DOM 버전): 그룹 막대 + 막대 수치 + 기준월 강조 + 영문 월 라벨 ----
const MON_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monEn(ym){ return MON_EN[Number(ym.slice(5,7))-1]||ym; }
function barChartEl(opts){
  // opts: {months:[ym], series:[{name,color,values:[]}], baseIdx, width, height, visible, scrollTo}
  // visible: 한 화면에 보일 월 수(나머지는 가로 스크롤) · scrollTo: 처음에 왼쪽 끝에 올 월 index (10/19 No.14)
  const n=opts.months.length, vis = (opts.visible && opts.visible<n)? opts.visible : null;
  // visible 지정 시 viewBox 폭을 n/visible배로 늘려(월당 폭·글자 크기는 그대로) SVG를 그만큼 넓게 표시하고 래퍼를 가로 스크롤
  const W=(opts.width||1200)*(vis? n/vis : 1), H=opts.height||300, padL=42, padR=10, padT=20, padB=40;
  const gw=(W-padL-padR)/n, plotH=H-padT-padB;
  const max=Math.max(1,...opts.series.flatMap(s=>s.values));
  const nice=Math.ceil(max/10)*10;
  const y=v=>padT+plotH*(1-v/nice);
  const svg=mkSvg('svg', {class:'chart', viewBox:`0 0 ${W} ${H}`, role:'img'});
  for(let i=0;i<n;i++){ const x=padL+i*gw;
    if(opts.baseIdx!=null && i>opts.baseIdx) svg.append(mkSvg('rect', {class:'future', x, y:padT, width:gw, height:plotH}));
    if(i===opts.baseIdx) svg.append(mkSvg('rect', {class:'base strong', x:x+1, y:padT, width:gw-2, height:plotH}));
  }
  for(let t=0;t<=4;t++){ const v=nice*t/4; svg.append(mkSvg('line', {class:'gridl', x1:padL, x2:W-padR, y1:y(v), y2:y(v)}), mkSvg('text', {x:padL-6, y:y(v)+4, 'text-anchor':'end'}, v)); }
  const bw=Math.min(14,(gw-8)/opts.series.length-2);
  opts.series.forEach((s,si)=>{ s.values.forEach((v,i)=>{ const x=padL+i*gw+(gw-(bw+2)*opts.series.length)/2+si*(bw+2); const yy=y(v); const future=opts.baseIdx!=null&&i>opts.baseIdx;
    svg.append(mkSvg('rect', {class:'bar', x, y:yy, width:bw, height:Math.max(0,H-padB-yy), fill:s.color, 'data-tip':`${monEn(opts.months[i])} ${opts.months[i].slice(0,4)} · ${s.name} ${v}대${future?' (계획/예정)':''}`}));
    if(v>0) svg.append(mkSvg('text', {class:'vlbl', x:x+bw/2, y:yy-3, 'text-anchor':'middle'}, v));
  }); });
  opts.months.forEach((m,i)=>{ const cx=padL+i*gw+gw/2; svg.append(mkSvg('text', {class:i===opts.baseIdx?'base-m':'', x:cx, y:H-padB+15, 'text-anchor':'middle'}, monEn(m)));
    if(i===0 || m.endsWith('-01')) svg.append(mkSvg('text', {class:'yr', x:cx, y:H-padB+30, 'text-anchor':'middle'}, m.slice(0,4))); });
  const legend = legendEl([...opts.series.map(s=>({name:s.name, color:s.color})), ...(opts.baseIdx!=null?[{name:'기준월', color:'#ffe0a8', border:'#e08a00'},{name:'기준월 이후(계획·예정)', color:'#eef1f5', border:'#d3dae3'}]:[])]);
  if(vis){
    // 초기 스크롤 위치(scrollTo 월이 왼쪽 끝)는 화면에 붙은 뒤 scrollChartTo()로 맞춘다
    svg.style.width = (n/vis*100).toFixed(1)+'%';
    const wrap = mk('div', {class:'chart-scroll'}, svg);
    wrap.dataset.scrollFrac = ((padL + (opts.scrollTo||0)*gw)/W).toFixed(4); // 스크롤 위치 = SVG 전체 폭 × 비율
    return mk('div', null, wrap, legend);
  }
  return mk('div', null, svg, legend);
}
function scrollChartTo(root){ const go=()=>qa('.chart-scroll', root).forEach(w=>{ w.scrollLeft = w.scrollWidth * Number(w.dataset.scrollFrac||0); }); go(); requestAnimationFrame(go); }

// ---- SVG 세로 누적 막대 차트 (DOM 버전) ----
function stackChartEl(opts){
  // opts: {cats:[label], series:[{name,color,values:[]}], width, height, unit}
  const W=opts.width||600, H=opts.height||260, padL=42, padR=10, padT=26, padB=28;
  const n=opts.cats.length, gw=(W-padL-padR)/Math.max(1,n), plotH=H-padT-padB;
  const totals=opts.cats.map((c,i)=>opts.series.reduce((a,s)=>a+(s.values[i]||0),0));
  const nice=Math.max(10, Math.ceil(Math.max(1,...totals)/10)*10);
  const y=v=>padT+plotH*(1-v/nice);
  const svg=mkSvg('svg', {class:'chart', viewBox:`0 0 ${W} ${H}`, role:'img'});
  for(let t=0;t<=4;t++){ const v=nice*t/4; svg.append(mkSvg('line', {class:'gridl', x1:padL, x2:W-padR, y1:y(v), y2:y(v)}), mkSvg('text', {x:padL-6, y:y(v)+4, 'text-anchor':'end'}, v)); }
  const bw=Math.min(64, gw*0.6);
  opts.cats.forEach((c,i)=>{ const x=padL+i*gw+(gw-bw)/2; let acc=0;
    opts.series.forEach(s=>{ const v=s.values[i]||0; if(!v) return; const y1=y(acc+v), hgt=y(acc)-y1;
      svg.append(mkSvg('rect', {class:'bar', x, y:y1, width:bw, height:hgt, fill:s.color, 'data-tip':`${c} · ${s.name} ${v}대 (${pct(v,totals[i])})`}));
      if(hgt>=14) svg.append(mkSvg('text', {class:'slbl', x:x+bw/2, y:y1+hgt/2, 'text-anchor':'middle', 'dominant-baseline':'middle'}, v));
      acc+=v; });
    svg.append(mkSvg('text', {class:'vlbl', x:x+bw/2, y:y(acc)-5, 'text-anchor':'middle'}, totals[i]));
    svg.append(mkSvg('text', {x:x+bw/2, y:H-padB+16, 'text-anchor':'middle'}, c)); });
  return mk('div', null, svg, legendEl(opts.series.map(s=>({name:s.name, color:s.color}))));
}
