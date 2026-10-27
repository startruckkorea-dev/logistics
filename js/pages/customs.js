'use strict';
/* ===== Logistics 탭 2~4 (10/26 No.1): Request of Customs Clearance · Update Customs Clearance Info · Insurance =====
   탭 골격·전환은 logistics.js(LOGI_TABS · renderLogiBody). 여기서는 탭 본문만 그린다. 데이터 쓰기는 Store.vehicles.applyCustoms로만. */
const CU = { text:{req:'', input:'', ins:''}, upload:null }; // text: 탭별 Commission No 입력값(탭 전환 후 복귀 시 유지) · upload: Excel 업로드 미리보기 행(null = 미선택)
window.addEventListener('hashchange', ()=>{ CU.upload=null; });
const CU_REQ_COLS = ['commission_no','vin_no','bl_no','gen','series','model','axle','cab','option','model_year','customs_clearance_date','current_status','option_remarks','ata','vessel']; // 머리글 라벨은 COLUMNS(keyinLabel): series=Model · model=Type · model_year=MY · option_remarks=Option Note
const CU_INS_COLS = ['commission_no','current_status','model','axle','cab','vin_no','bl_no','vessel','dispatch','shipping','ata','tsc_arrival_date'];
const CU_MONO = new Set(['commission_no','vin_no','bl_no','customs_clearance_date','ata','dispatch','shipping','tsc_arrival_date','import_license']);

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
  return {box, info, run};
}
function pillEl(kind, text){ return mk('span', {class:'pill '+kind}, text); } // statusPill(문자열)의 DOM 버전
function cuCell(k, v){
  const val = v[k];
  if(k==='current_status') return mk('td', null, stagePillEl(val));
  if(val==null || val==='') return mk('td', null, mk('span', {class:'muted'}, '·'));
  return mk('td', {class: CU_MONO.has(k)? 'mono' : null}, String(val));
}
// 조회 결과 표: 열 key 배열 → 머리글 = COLUMNS 라벨 · 행 클릭 → 차량 상세 Drawer
function cuTable(keys, vs){
  return mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact clickable'},
    mk('thead', null, mk('tr', null, keys.map(k=>mk('th', null, tx(keyinLabel(k)))))),
    mk('tbody', null, vs.map(v=>mk('tr', {'data-comm':v.commission_no, onclick:()=>openVehicle(v.commission_no)}, keys.map(k=>cuCell(k, v)))))));
}

// ---- 탭 2: Request of Customs Clearance — 통관 여부 조회 ----
function renderCuRequest(body){
  const out = mk('div');
  const {box, info} = cuCommBox('req', found=>{ out.replaceChildren(); if(found.length) out.append(cuTable(CU_REQ_COLS, found)); });
  body.append(mk('div', {class:'card-h'}, mk('h2', null, 'Request of Customs Clearance'), mk('span', {class:'desc'}, tx('Commission No로 통관 여부 조회')+' · '+tx('행 클릭 → 차량 상세'))), box, info, out);
}

// ---- 탭 3: Update Customs Clearance Info — 통관일 · 수입필증번호 입력 (수동 + Unipass Excel 업로드) ----
function renderCuInput(body){
  const editable = isEditor();
  // 저장 결과 토스트 (수동·업로드 공용)
  const report = (r, how)=>toast(`통관 정보 ${how} · ${num(r.vehicles)}건`, r.vehicles? `${num(r.fields)}개 필드 → Vehicles 갱신(Customs Clearance Date · Import License) · Vehicle_History 기록${r.cleared? ` · Bonded Stock → OH Stock 전환 ${num(r.cleared)}대 (출처: 규칙)` : ''} · 대시보드·재고현황 즉시 반영` : '변경된 값이 없습니다.');
  // ① 수동 입력: 조회한 Commission No마다 입력칸 (현재 값으로 채움) → 저장 시 바뀐 값만 반영
  const manual = mk('div');
  const drawManual = found=>{ manual.replaceChildren(); if(!found.length) return;
    const inputs = {};
    const rowOf = v=>{ const d = mk('input', {type:'date', value:v.customs_clearance_date||''}), l = mk('input', {type:'text', value:v.import_license||'', placeholder:'예) 2610-123456M', style:'width:150px'}); inputs[v.commission_no] = {d, l};
      return mk('tr', null, mk('td', {class:'mono'}, v.commission_no), mk('td', null, stagePillEl(v.current_status)), mk('td', {class:'mono'}, v.vin_no||'·'), mk('td', {class:'mono'}, v.ata||'·'),
        mk('td', null, editable? d : (v.customs_clearance_date||'·')), mk('td', null, editable? l : (v.import_license||'·'))); };
    const tbl = mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact'},
      mk('thead', null, mk('tr', null, ['Commission No','Current Status','Vin No','ATA','Customs Clearance Date','Import License'].map(x=>mk('th', null, x)))),
      mk('tbody', null, found.map(rowOf))));
    const save = mk('button', {class:'btn primary editor-only', onclick:()=>{
      const rows = found.map(v=>({commission_no:v.commission_no, customs_clearance_date:inputs[v.commission_no].d.value, import_license:inputs[v.commission_no].l.value}));
      const r = Store.vehicles.applyCustoms(rows, state.user, '수동'); report(r, '저장'); drawManual(found); }}, tx('저장'));
    manual.append(tbl, mk('div', {class:'btn-group', style:'margin-top:8px'}, save, mk('span', {class:'muted small'}, '비워 두면 기존 값을 지웁니다 · 통관일 입력 시 Bonded Stock → OH Stock'))); };
  const {box, info, run} = cuCommBox('input', drawManual); // run: 업로드 반영 후 수동 입력 표의 값 갱신용
  // ② Excel 업로드(목업): 드롭존 클릭 → 샘플 파일(CUSTOMS_UPLOAD_SAMPLE) 미리보기 → 매칭된 행만 반영. 매칭 키 = Excel 'Commission' 열
  const up = mk('div');
  const drawUpload = ()=>{ up.replaceChildren();
    if(!CU.upload){
      up.append(mk('div', {class:'dropzone', onclick:()=>{ if(!editable){ toast('Viewer는 업로드 권한이 없습니다'); return; } CU.upload = CUSTOMS_UPLOAD_SAMPLE; drawUpload(); }},
        mk('b', null, tx('통관 Excel(Unipass 수입신고 목록)을 여기에 놓거나 클릭하여 선택')),
        tx('Excel 열 매핑: Commission → Commission No(매칭 키) · 수리일 → Customs Clearance Date · 신고번호 → Import License'),
        mk('div', {class:'small', style:'margin-top:10px'}, '목업: 클릭하면 시연 파일 ', mk('b', null, CUSTOMS_UPLOAD_FILE), `(${num(CUSTOMS_UPLOAD_SAMPLE.length)}행)로 진행합니다. 브라우저에서 SheetJS로 파싱(서버 불필요).`)));
      return; }
    const rows = CU.upload.map(r=>({...r, v:VEHICLE_BY_COMM[r.commission]})); const ok = rows.filter(r=>r.v);
    up.append(mk('div', {class:'card-h'}, mk('h2', null, tx('미리보기 — {f}', {f:CUSTOMS_UPLOAD_FILE})), mk('span', {class:'desc'}, tx('매칭 {a}건 · 미매칭 {b}건', {a:num(ok.length), b:num(rows.length-ok.length)}))),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact'},
        mk('thead', null, mk('tr', null, ['Commission', tx('수리일'), tx('신고번호'), 'Current Status', 'Customs Clearance Date', 'Import License', tx('매칭')].map(x=>mk('th', null, x)))),
        mk('tbody', null, rows.map(r=>mk('tr', null, mk('td', {class:'mono'}, r.commission), mk('td', {class:'mono'}, r.clear_date), mk('td', {class:'mono'}, r.decl_no),
          mk('td', null, r.v? stagePillEl(r.v.current_status) : mk('span', {class:'muted'}, '·')), mk('td', {class:'mono muted'}, r.v? (r.v.customs_clearance_date||'·') : '·'), mk('td', {class:'mono muted'}, r.v? (r.v.import_license||'·') : '·'),
          mk('td', null, r.v? pillEl('ok', tx('일치')) : pillEl('danger', tx('미등록')))))))),
      mk('div', {class:'btn-group', style:'margin-top:8px'},
        mk('button', {class:'btn', onclick:()=>{ CU.upload=null; drawUpload(); }}, tx('다른 파일')),
        mk('button', {class:'btn primary editor-only', disabled: !ok.length, onclick:()=>{
          const r = Store.vehicles.applyCustoms(ok.map(x=>({commission_no:x.commission, customs_clearance_date:x.clear_date, import_license:x.decl_no})), state.user, '통관 업로드');
          CU.upload=null; drawUpload(); report(r, '반영 (Excel)'); if(CU.text.input.trim()) run(); }}, tx('반영 ({n}건)', {n:num(ok.length)})))); };
  drawUpload();
  body.append(mk('div', {class:'card-h'}, mk('h2', null, 'Update Customs Clearance Info'), mk('span', {class:'desc'}, tx('통관일·수입필증번호 입력 → 차량 마스터 Customs Clearance Date · Import License 반영 · 통관일 입력 시 Bonded Stock → OH Stock'))),
    mk('div', {class:'section-h', style:'margin-top:0'}, tx('① 수동 입력')), box, info, manual,
    mk('div', {class:'section-h cu-sec'}, tx('② Excel 업로드 (Unipass)')), up);
}

// ---- 탭 4: Insurance — 보험 조회 · Excel(CSV) Export ----
function renderCuInsurance(body){
  let cur = [];
  const out = mk('div');
  const exp = mk('button', {class:'btn', disabled:true, onclick:()=>exportCsv(CU_INS_COLS, cur, `Insurance_${TODAY_S}.csv`)}, 'Excel Export');
  const {box, info} = cuCommBox('ins', found=>{ cur = found; exp.disabled = !found.length; out.replaceChildren(); if(found.length) out.append(cuTable(CU_INS_COLS, found)); });
  body.append(mk('div', {class:'card-h'}, mk('h2', null, 'Insurance'), mk('span', {class:'desc'}, tx('보험 조회 · 조회 결과를 Excel(CSV)로 내보내기')), mk('span', {class:'spacer'}), exp), box, info, out);
}
// CSV 다운로드 (UTF-8 BOM, 머리글 = COLUMNS 라벨). 라이브러리 없이 Blob으로 생성 — 실제 구현은 SheetJS .xlsx + /Exports/ 저장
function exportCsv(keys, vs, fileName){
  const cell = s=>{ s = String(s==null? '' : s); return /[",\r\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s; };
  const lines = [keys.map(k=>cell(keyinLabel(k))).join(','), ...vs.map(v=>keys.map(k=>cell(v[k])).join(','))];
  const url = URL.createObjectURL(new Blob(['﻿'+lines.join('\r\n')], {type:'text/csv;charset=utf-8'}));
  const a = mk('a', {href:url, download:fileName}); document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast(`Excel Export · ${fileName}`, `${num(vs.length)}행 · ${keys.length}열 CSV 다운로드. 실제 구현은 .xlsx(SheetJS) 생성 + SharePoint /Exports/ 저장.`);
}
