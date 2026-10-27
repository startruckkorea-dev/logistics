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

// ---- 탭 3: Update Customs Clearance Info — 통관일 · 수입필증번호 Unipass Excel 업로드 (10/27: 수동 입력 칸 삭제) ----
function renderCuInput(body){
  const editable = isEditor();
  const report = r=>toast(`통관 정보 반영 (Excel) · ${num(r.vehicles)}건`, r.vehicles? `${num(r.fields)}개 필드 → Vehicles 갱신(Customs Clearance Date · Import License) · Vehicle_History 기록${r.cleared? ` · Bonded Stock → OH Stock 전환 ${num(r.cleared)}대 (출처: 규칙)` : ''} · 대시보드·재고현황 즉시 반영` : '변경된 값이 없습니다.');
  // Excel 업로드(목업): 드롭존 클릭 → 샘플 파일(CUSTOMS_UPLOAD_SAMPLE) 미리보기 → 매칭된 행만 반영. 매칭 키 = Excel 'Commission' 열
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
