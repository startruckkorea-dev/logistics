'use strict';
/* ===== Logistics 탭 2~4 (10/26 No.1): Request of Customs Clearance · Update Customs Clearance Info · Insurance =====
   탭 골격·전환은 logistics.js(LOGI_TABS · renderLogiBody). 여기서는 탭 본문만 그린다. 데이터 쓰기는 Store.vehicles.applyCustoms로만. */
const CU = { text:{req:'', ins:''}, upload:null }; // text: 탭별 Commission No 입력값(탭 전환 후 복귀 시 유지) · upload: Excel 업로드 미리보기 행(null = 미선택)
window.addEventListener('hashchange', ()=>{ CU.upload=null; });
// 머리글 라벨은 COLUMNS(keyinLabel): series=Model · model=Type · model_year=MY · option_remarks=Option Note · 10/27: 열 순서 확정(BM·PM·Vehicle 추가, Gen 삭제)
const CU_REQ_COLS = ['commission_no','current_status','customs_clearance_date','model_year','bm','vin_no','bl_no','vehicle','series','model','axle','cab','option','pm','ata','vessel','option_remarks'];
const CU_INS_COLS = ['commission_no','current_status','model','axle','cab','pm','vin_no','bl_no','vessel','dispatch','shipping','ata','tsc_arrival_date']; // 10/27: Cab 다음 PM
const CU_MONO = new Set(['commission_no','vin_no','bl_no','bm','pm','customs_clearance_date','ata','dispatch','shipping','tsc_arrival_date','import_license']);

function renderCustomsTab(body, tab){
  if(tab==='req') renderCuRequest(body);
  else if(tab==='input') renderCuInput(body);
  else if(tab==='ins') renderCuInsurance(body);
}
// Commission No 여러 개: 줄바꿈·쉼표·세미콜론·공백 구분 → 중복 제거 (입력 순서 유지)
function parseComms(text){ const seen = new Set(); return String(text||'').split(/[\s,;]+/).map(s=>s.trim()).filter(s=>{ if(!s || seen.has(s)) return false; seen.add(s); return true; }); }
function cuLookup(comms){ return { found: comms.map(c=>VEHICLE_BY_COMM[c]).filter(Boolean), missing: comms.filter(c=>!VEHICLE_BY_COMM[c]) }; }
// 입력 영역: textarea + '조회' 버튼 + 결과 안내줄. onSearch(found, missing, info)
function cuCommBox(tab, onSearch){
  const ta = mk('textarea', {class:'cu-ta', rows:'3', placeholder:tx('Commission No 여러 개 (줄바꿈·쉼표 구분)'), oninput:e=>{ CU.text[tab]=e.target.value; }});
  ta.value = CU.text[tab];
  const info = mk('div', {class:'muted small'});
  const run = ()=>{ const comms = parseComms(ta.value); if(!comms.length){ info.textContent = tx('Commission No를 입력하세요.'); onSearch([], [], info); return; }
    const r = cuLookup(comms); const parts = [tx('조회 {n}건', {n:num(r.found.length)})];
    if(r.missing.length) parts.push(' · ', mk('span', {style:'color:var(--danger)'}, tx('미등록 {n}건: {list}', {n:num(r.missing.length), list:r.missing.join(', ')})));
    info.replaceChildren(...parts);
    onSearch(r.found, r.missing, info); };
  ta.onkeydown = e=>{ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)) run(); };
  const box = mk('div', {class:'cu-row'}, ta, mk('button', {class:'btn primary', onclick:run}, tx('조회')));
  if(CU.text[tab].trim()) setTimeout(run, 0); // 탭 복귀 시 이전 입력값으로 자동 조회
  return {box, info, run, ta}; // ta: 신청 접수 행 클릭 시 Commission No 채우기용 (10/27)
}
function pillEl(kind, text){ return mk('span', {class:'pill '+kind}, text); } // statusPill(문자열)의 DOM 버전
function cuCell(k, v){
  const val = v[k];
  if(k==='current_status') return mk('td', null, stagePillEl(val));
  if(val==null || val==='') return mk('td', null, mk('span', {class:'muted'}, '·'));
  return mk('td', {class: CU_MONO.has(k)? 'mono' : null}, String(val));
}
// 조회 결과 표: 열 key 배열 → 머리글 = COLUMNS 라벨 · 행 클릭 → 차량 상세 Drawer
// sel (10/27, 선택 옵션 · Sales 통관 신청) = {set: 선택된 Commission No Set, onChange: 선택 변경 콜백} → 첫 열에 체크박스(머리글 = 전체 선택) + Commission No 셀 클릭으로도 선택.
// 선택 모드에서는 행 클릭으로 차량 상세 Drawer를 열지 않는다(Sales는 상세 권한 없음)
function cuTable(keys, vs, sel){
  const toggle = (v, on)=>{ if(on) sel.set.add(v.commission_no); else sel.set.delete(v.commission_no); sel.onChange(); };
  const rowEl = v=>{
    const box = sel? mk('input', {type:'checkbox', class:'rowsel', checked: sel.set.has(v.commission_no)||null, onchange:e=>toggle(v, e.target.checked)}) : null;
    const cells = keys.map(k=>{ const td = cuCell(k, v);
      if(sel && k==='commission_no'){ td.classList.add('cu-pick'); td.title = tx('클릭 → 선택'); td.onclick = ()=>{ box.checked = !box.checked; toggle(v, box.checked); }; }
      return td; });
    return mk('tr', {'data-comm':v.commission_no, onclick: sel? null : ()=>openVehicle(v.commission_no)}, box? mk('td', null, box) : null, cells);
  };
  const allBox = ()=> mk('th', null, mk('input', {type:'checkbox', title:tx('전체 선택'), checked: (vs.length>0 && vs.every(v=>sel.set.has(v.commission_no)))||null,
    onchange:e=>{ vs.forEach(v=>{ if(e.target.checked) sel.set.add(v.commission_no); else sel.set.delete(v.commission_no); }); qa('input.rowsel', tbl).forEach(b=>{ b.checked = e.target.checked; }); sel.onChange(); }}));
  const tbl = mk('table', {class:'tbl compact'+(sel? '' : ' clickable')},
    mk('thead', null, mk('tr', null, sel? allBox() : null, keys.map(k=>mk('th', null, tx(keyinLabel(k)))))),
    mk('tbody', null, vs.map(rowEl)));
  return mk('div', {class:'tbl-wrap'}, tbl);
}

// ---- 탭 2: Request of Customs Clearance ----
// 10/27: Sales = Bonded Stock 목록에서 차량을 골라 물류 담당자에게 통관 신청 · Editor/Viewer = 신청 접수 목록 + 기존 Commission No 조회
function renderCuRequest(body){
  if(isSales()) renderCuRequestSales(body); else renderCuRequestInbox(body);
}
function pendingRequested(){ const s = new Set(); CUSTOMS_REQUESTS.filter(r=>r.status==='접수').forEach(r=>r.comms.forEach(c=>s.add(c))); return s; } // 신청 중(접수)인 Commission No
// Sales 화면: Bonded Stock 전체(신청 중 제외) + 체크박스 선택 → '통관 신청' 버튼(Sales는 body.viewer라 editor-only를 쓰지 않는다)
function renderCuRequestSales(body){
  const pend = pendingRequested();
  const all = VEHICLES.filter(v=>v.current_status==='Bonded Stock'), list = all.filter(v=>!pend.has(v.commission_no));
  const sel = new Set();
  const btn = mk('button', {class:'btn primary', onclick:()=>openCuRequestConfirm([...sel])});
  const sync = ()=>{ btn.textContent = tx('통관 신청 ({n}건)', {n:num(sel.size)}); btn.disabled = !sel.size; };
  sync();
  body.append(mk('div', {class:'card-h'}, mk('h2', null, 'Request of Customs Clearance'), mk('span', {class:'desc'}, tx('Bonded Stock 차량을 선택해 물류 담당자에게 통관 신청 · 신청 중(접수) 차량은 목록에서 제외')), mk('span', {class:'spacer'}), btn),
    mk('div', {class:'section-h', style:'margin-top:0'}, tx('신청 내역'), mk('span', {class:'sub'}, tx('보낸 통관 신청과 처리 상태'))), // 10/27: Sales에게도 신청 목록 표시 (조회창이 없어 행 클릭 없음)
    cuRequestList(null),
    mk('div', {class:'section-h'}, tx('통관 신청 대상 (Bonded Stock)')),
    mk('div', {class:'muted small', style:'margin-bottom:8px'}, tx('대상 {n}건 · 신청 중 제외 {m}건', {n:num(list.length), m:num(all.length-list.length)})+' · '+tx('체크박스 또는 Commission No 클릭 → 선택')),
    cuTable(CU_REQ_COLS, list, {set:sel, onChange:sync}));
}
// 신청 목록 표 (10/27): CUSTOMS_REQUESTS 최신순 — 신청일시 · 신청자 · 건수 · Commission No(앞 3개 + 외 n건) · 상태 · 메모. onRow(r)가 있으면 행 클릭 가능
function cuRequestList(onRow){
  if(!CUSTOMS_REQUESTS.length) return mk('div', {class:'muted small', style:'margin-bottom:14px'}, tx('신청 내역이 없습니다.'));
  const rows = CUSTOMS_REQUESTS.map(r=>mk('tr', {onclick: onRow? ()=>onRow(r) : null},
    mk('td', {class:'mono'}, r.requested_at), mk('td', null, r.requested_by, r.dept? mk('span', {class:'muted small'}, ' · '+r.dept) : null), mk('td', {class:'num'}, num(r.n)),
    mk('td', {class:'mono'}, r.comms.slice(0,3).join(' · '), r.comms.length>3? mk('span', {class:'muted'}, ' '+tx('외 {n}건', {n:num(r.comms.length-3)})) : null),
    mk('td', null, r.status==='접수'? pillEl('warn', tx('접수')) : pillEl('ok', tx('처리 완료'))), mk('td', {class:'muted'}, r.note||'')));
  return mk('div', {class:'tbl-wrap', style:'max-height:240px;margin-bottom:14px'}, mk('table', {class:'tbl compact'+(onRow? ' clickable' : '')},
    mk('thead', null, mk('tr', null, mk('th', null, tx('신청일시')), mk('th', null, tx('신청자')), mk('th', {class:'num'}, tx('건수')), mk('th', null, 'Commission No'), mk('th', null, tx('상태')), mk('th', null, tx('메모')))),
    mk('tbody', null, rows)));
}
// 신청 확인 모달: 신청자 · 수신(Ordering & Logistics Editor) · 선택 차량 표(클릭 없음 — Drawer가 모달 위로 열리지 않도록) → Store.customsRequests.add → 메일 발송 토스트(시연)
function openCuRequestConfirm(comms){
  const vs = comms.map(c=>VEHICLE_BY_COMM[c]).filter(Boolean); if(!vs.length) return;
  const me = USERS.find(u=>u.name===state.user), to = USERS.filter(u=>u.role==='Editor' && u.dept==='Ordering & Logistics');
  const cols = ['commission_no','bl_no','series','model','bm','vin_no']; // 10/27: Commission No · B/L No · Model · Type · BM · VIN No
  const body = mk('div', null,
    mk('div', {class:'callout'}, tx('선택한 차량 {n}대의 통관을 물류 담당자에게 신청합니다. 신청 내역은 Customs_Requests에 기록되고 담당자에게 메일로 안내됩니다.', {n:num(vs.length)})),
    mk('div', {class:'fields'},
      mk('div', {class:'f'}, mk('div', {class:'k'}, tx('신청자')), mk('div', {class:'v'}, state.user + (me? ' · '+me.dept : ''))),
      mk('div', {class:'f'}, mk('div', {class:'k'}, tx('수신')), mk('div', {class:'v'}, to.map(u=>u.name).join(', ') + ' (Ordering & Logistics)')),
      mk('div', {class:'f wide'}, mk('div', {class:'k'}, tx('선택 차량')), mk('div', {class:'tbl-wrap', style:'max-height:40vh;margin-top:4px'}, mk('table', {class:'tbl compact'},
        mk('thead', null, mk('tr', null, cols.map(k=>mk('th', null, tx(keyinLabel(k)))))),
        mk('tbody', null, vs.map(v=>mk('tr', null, cols.map(k=>cuCell(k, v))))))))));
  openModal(tx('통관 신청 확인'), '', ' ');
  el('modal-body').replaceChildren(body);
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick:closeModal}, tx('취소')),
    mk('button', {class:'btn primary', onclick:()=>{ const r = Store.customsRequests.add(vs.map(v=>v.commission_no), state.user); closeModal();
      toast(`통관 신청 ${num(r.req.n)}건 · 물류 담당자에게 메일 발송`, `수신: ${r.to.join(', ')} · 신청 ID ${r.req.id} · Customs_Requests 저장 · Audit_Log 기록 (실제 구현: Graph sendMail로 담당자 메일 발송)`);
      renderLogiBody(); }}, tx('신청 ({n}건)', {n:num(vs.length)})));
}
// Editor·Viewer 화면: 신청 접수 목록(최신순) → 행 클릭 시 아래 조회창에 Commission No를 채워 조회 · 그 아래는 기존 Commission No 조회 그대로
function renderCuRequestInbox(body){
  const out = mk('div');
  const {box, info, run, ta} = cuCommBox('req', found=>{ out.replaceChildren(); if(found.length) out.append(cuTable(CU_REQ_COLS, found)); });
  body.append(mk('div', {class:'card-h'}, mk('h2', null, 'Request of Customs Clearance'), mk('span', {class:'desc'}, tx('Commission No로 통관 여부 조회')+' · '+tx('행 클릭 → 차량 상세'))),
    mk('div', {class:'section-h', style:'margin-top:0'}, tx('신청 접수'), mk('span', {class:'sub'}, tx('영업(Sales)이 보낸 통관 신청 · 행 클릭 → 아래 조회창에 Commission No 채워 조회'))),
    cuRequestList(r=>{ CU.text.req = r.comms.join('\n'); ta.value = CU.text.req; run(); }),
    mk('div', {class:'section-h'}, tx('통관 여부 조회')),
    box, info, out);
}

// ---- 탭 3: Update Customs Clearance Info — 통관일 · 수입필증번호 Unipass Excel 업로드 (10/27: 수동 입력 칸 삭제) ----
function renderCuInput(body){
  const editable = isEditor();
  const report = r=>toast(`통관 정보 반영 (Excel) · ${num(r.vehicles)}건`, r.vehicles? `${num(r.fields)}개 필드 → Vehicles 갱신(Customs Clearance Date · Import License) · Vehicle_History 기록${r.cleared? ` · Bonded Stock → OH Stock 전환 ${num(r.cleared)}대 (출처: 규칙)` : ''} · 대시보드·재고현황 즉시 반영` : '변경된 값이 없습니다.');
  // Excel 업로드(목업): 드롭존 클릭 → 샘플 파일(CUSTOMS_UPLOAD_SAMPLE) 미리보기 → 매칭된 행만 반영. 열 매핑·매칭 키는 data.js CUSTOMS_UPLOAD_MAP (10/27)
  const applyMap = CUSTOMS_UPLOAD_MAP.filter(m=>m.role==='apply');
  // 열 매핑 표 (10/27, 읽기 전용): Excel 열 → 차량 마스터 필드 · 역할(매칭 키/반영) · 예시 값(샘플 첫 행). 파일 선택 전·후 모두 표시
  const mappingCard = ()=>{ const ex = CUSTOMS_UPLOAD_SAMPLE[0]||{};
    return mk('div', null,
      mk('div', {class:'section-h'}, tx('열 매핑 (읽기 전용)'), mk('span', {class:'sub'}, tx('Excel 머리글(Unipass 수입신고 목록)은 고정 · 매핑 변경 불가'))),
      mk('div', {class:'tbl-wrap', style:'max-width:760px;margin-bottom:12px'}, mk('table', {class:'tbl compact'},
        mk('thead', null, mk('tr', null, mk('th', null, tx('Excel 열')), mk('th', null, ''), mk('th', null, tx('시스템 필드 (차량 마스터)')), mk('th', null, tx('역할')), mk('th', null, tx('예시 값')))),
        mk('tbody', null, CUSTOMS_UPLOAD_MAP.map(m=>mk('tr', null, mk('td', {class:'mono'}, mk('b', null, m.col)), mk('td', {class:'muted', style:'text-align:center'}, '→'),
          mk('td', null, keyinLabel(m.key), ' ', mk('span', {class:'mono muted small'}, m.key)),
          mk('td', null, m.role==='key'? pillEl('warn', tx('매칭 키')) : pillEl('ok', tx('반영'))),
          mk('td', {class:'mono muted'}, ex[m.field]||'')))))));
  };
  const up = mk('div');
  const drawUpload = ()=>{ up.replaceChildren();
    if(!CU.upload){
      up.append(mk('div', {class:'dropzone', onclick:()=>{ if(!editable){ toast('Viewer는 업로드 권한이 없습니다'); return; } CU.upload = CUSTOMS_UPLOAD_SAMPLE; drawUpload(); }},
        mk('b', null, tx('통관 Excel(Unipass 수입신고 목록)을 여기에 놓거나 클릭하여 선택')),
        mk('div', {class:'small', style:'margin-top:10px'}, '목업: 클릭하면 시연 파일 ', mk('b', null, CUSTOMS_UPLOAD_FILE), `(${num(CUSTOMS_UPLOAD_SAMPLE.length)}행)로 진행합니다. 브라우저에서 SheetJS로 파싱(서버 불필요).`)),
        mappingCard());
      return; }
    const rows = CU.upload.map(r=>({...r, v:VEHICLE_BY_COMM[r.commission]})); const ok = rows.filter(r=>r.v);
    up.append(mappingCard(),
      mk('div', {class:'card-h'}, mk('h2', null, tx('미리보기 — {f}', {f:CUSTOMS_UPLOAD_FILE})), mk('span', {class:'desc'}, tx('매칭 {a}건 · 미매칭 {b}건', {a:num(ok.length), b:num(rows.length-ok.length)}))),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact'},
        mk('thead', null, mk('tr', null, [...CUSTOMS_UPLOAD_MAP.map(m=> m.col==='Commission'? m.col : tx(m.col)), 'Current Status', ...applyMap.map(m=>keyinLabel(m.key)), tx('매칭')].map(x=>mk('th', null, x)))),
        mk('tbody', null, rows.map(r=>mk('tr', null, CUSTOMS_UPLOAD_MAP.map(m=>mk('td', {class:'mono'}, r[m.field])),
          mk('td', null, r.v? stagePillEl(r.v.current_status) : mk('span', {class:'muted'}, '·')), applyMap.map(m=>mk('td', {class:'mono muted'}, r.v? (r.v[m.key]||'·') : '·')),
          mk('td', null, r.v? pillEl('ok', tx('일치')) : pillEl('danger', tx('미등록')))))))),
      mk('div', {class:'btn-group', style:'margin-top:8px'},
        mk('button', {class:'btn', onclick:()=>{ CU.upload=null; drawUpload(); }}, tx('다른 파일')),
        mk('button', {class:'btn primary editor-only', disabled: !ok.length, onclick:()=>{
          const r = Store.vehicles.applyCustoms(ok.map(x=>Object.fromEntries(CUSTOMS_UPLOAD_MAP.map(m=>[m.key, x[m.field]]))), state.user, '통관 업로드');
          CU.upload=null; drawUpload(); report(r); }}, tx('반영 ({n}건)', {n:num(ok.length)})))); };
  drawUpload();
  body.append(mk('div', {class:'card-h'}, mk('h2', null, 'Update Customs Clearance Info'), mk('span', {class:'desc'}, tx('Unipass Excel 업로드 → 차량 마스터 Customs Clearance Date · Import License 반영 · 통관일 입력 시 Bonded Stock → OH Stock'))), up);
}

// ---- 탭 4: Insurance — 보험 조회 · Excel(xlsx) Export ----
function renderCuInsurance(body){
  let cur = [];
  const out = mk('div');
  const exp = mk('button', {class:'btn', disabled:true, onclick:()=>exportXlsx(CU_INS_COLS, cur, `Insurance_${TODAY_S}.xlsx`, 'Insurance')}, 'Excel Export');
  const {box, info} = cuCommBox('ins', found=>{ cur = found; exp.disabled = !found.length; out.replaceChildren(); if(found.length) out.append(cuTable(CU_INS_COLS, found)); });
  body.append(mk('div', {class:'card-h'}, mk('h2', null, 'Insurance'), mk('span', {class:'desc'}, tx('보험 조회 · 조회 결과를 Excel(xlsx)로 내보내기')), mk('span', {class:'spacer'}), exp), box, info, out);
}
// .xlsx 다운로드 (10/27): 라이브러리 없이 최소 SpreadsheetML 6개 파트를 무압축 ZIP으로 묶는다. 머리글 = COLUMNS 라벨(굵게) · 시트 1개
// 값이 YYYY-MM-DD이면 Excel 날짜(일련번호 + yyyy-mm-dd 서식), 그 외(Commission No 앞자리 0 · PM YYYY-MM · VIN 등)는 문자열 · 열 너비 = 머리글·값 최대 글자 수 + 2 (8~40)
// 실제 구현은 SharePoint /Exports/ 저장 추가
function exportXlsx(keys, vs, fileName, sheetName){
  const xml = s=>String(s==null? '' : s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const col = i=>{ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; };
  const isDate = v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v==null? '' : v));
  const serial = v=>{ const [y,m,d]=String(v).split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000); }; // Excel 1900 날짜 체계 일련번호
  const cell = (v, r, i, head)=> head? `<c r="${col(i)}${r}" s="1" t="inlineStr"><is><t>${xml(v)}</t></is></c>`
    : isDate(v)? `<c r="${col(i)}${r}" s="2"><v>${serial(v)}</v></c>` : `<c r="${col(i)}${r}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
  const row = (vals, r, head)=>`<row r="${r}">${vals.map((v,i)=>cell(v, r, i, head)).join('')}</row>`;
  const labels = keys.map(keyinLabel);
  const widths = keys.map((k,i)=>Math.min(40, Math.max(8, Math.max(labels[i].length, ...vs.map(v=>String(v[k]==null? '' : v[k]).length)) + 2)));
  const cols = `<cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${row(labels, 1, true)}${vs.map((v,i)=>row(keys.map(k=>v[k]), i+2, false)).join('')}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`; // 0 기본 · 1 머리글 굵게 · 2 날짜
  const parts = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName||'Sheet1')}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  const url = URL.createObjectURL(new Blob([zipStored(parts)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a = mk('a', {href:url, download:fileName}); document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast(`Excel Export · ${fileName}`, `${num(vs.length)}행 · ${keys.length}열 .xlsx 다운로드 (날짜 서식 · 열 너비 · 머리글 굵게). 실제 구현은 SharePoint /Exports/ 저장 추가.`);
}
// 무압축(stored) ZIP 생성: parts = [[경로, 문자열]] → Uint8Array. 로컬 헤더 + 데이터 … + 중앙 디렉터리 + 끝 레코드 (ZIP 규격 최소 구성, UTF-8 파일명 플래그)
function zipStored(parts){
  const CRC = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
  const crc32 = b=>{ let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c = CRC[(c^b[i])&0xFF] ^ (c>>>8); return (c^0xFFFFFFFF)>>>0; };
  const enc = new TextEncoder(); const d = new Date(); const dosT = (d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1), dosD = ((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  const u16 = v=>[v&255, (v>>>8)&255], u32 = v=>[v&255, (v>>>8)&255, (v>>>16)&255, (v>>>24)&255];
  const local=[], central=[]; let off=0;
  parts.forEach(([name, text])=>{ const nm=enc.encode(name), data=enc.encode(text), crc=crc32(data);
    const common=[...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosT), ...u16(dosD), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
    local.push(Uint8Array.from([0x50,0x4B,3,4, ...common]), nm, data);
    central.push(Uint8Array.from([0x50,0x4B,1,2, ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
    off += 30 + nm.length + data.length; });
  const cdSize = central.reduce((a,b)=>a+b.length,0);
  const end = Uint8Array.from([0x50,0x4B,5,6, ...u16(0), ...u16(0), ...u16(parts.length), ...u16(parts.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all=[...local, ...central, end]; const out=new Uint8Array(all.reduce((a,b)=>a+b.length,0)); let p=0; all.forEach(b=>{ out.set(b,p); p+=b.length; }); return out;
}
