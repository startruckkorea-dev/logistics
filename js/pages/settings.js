'use strict';
/* ===== 마스터 · 설정 (C1~C8) ===== */
const ST = { tab:'arch' };
PAGES.settings = {
  title:'마스터 · 설정', sub:'아키텍처 · 모델 마스터 · AFAB 매핑 · 상태 규칙 · 기준값 · 사용자 · 이력 · 감사',
  render(root, params){
    if(params.get('tab')) ST.tab=params.get('tab');
    const tabs = [['arch',tx('아키텍처·연결 정보'),'C1'],['model',tx('모델 마스터'),'C2'],['map',tx('AFAB 매핑'),'C3'],['rules',tx('상태 규칙'),'C4'],['values',tx('기준값'),'C5'],['users',tx('사용자·권한'),'C6'],['history',tx('변경 이력'),'C7'],['audit',tx('감사 로그'),'C8']];
    root.innerHTML = `<div class="card"><div class="vtabs"><div class="side">${tabs.map(t=>`<button data-tab="${t[0]}" class="${ST.tab===t[0]?'active':''}">${t[1]} ${note(t[2])}</button>`).join('')}</div><div class="body" id="stBody"></div></div></div>`;
    qa('.side button', root).forEach(b=>b.onclick=()=>{ ST.tab=b.dataset.tab; qa('.side button',root).forEach(x=>x.classList.toggle('active',x===b)); drawSettings(); });
    drawSettings();
  }
};
function drawSettings(){
  const b = el('stBody'); const admin = isEditor();
  const adminNote = admin? '' : '<div class="callout warn">Viewer 역할은 조회만 가능합니다. 마스터·기준값 수정은 Editor 중 관리자만.</div>';
  if(ST.tab==='arch'){
    b.innerHTML = `<h2 style="margin-bottom:8px">${tx('아키텍처 · 연결 정보')}</h2>
      <div class="arch"><div class="node"><b>${tx('브라우저 (SPA)')}</b>HTML/CSS/JS · 빌드 없음<br><span class="muted small">GitHub Pages: stk-logistics-hub</span></div><span class="arr">→</span><div class="node"><b>${tx('M365 로그인')}</b>MSAL.js (PKCE) · Entra ID 앱(SPA)<br><span class="muted small">그룹: STK-Logistics-Editors / -Viewers</span></div><span class="arr">→</span><div class="node"><b>Microsoft Graph API</b>Sites.Selected (권장)<br><span class="muted small">PATCH 즉시 저장 · 60초 변경분 조회 · ETag 충돌 방지</span></div><span class="arr">→</span><div class="node"><b>${tx('SharePoint 사이트 STK-Logistics')}</b>Lists 7개 + 문서 라이브러리<br><span class="muted small">/AFAB_Raw · /Exports · /Migration</span></div></div>
      <dl class="kv"><dt>Lists</dt><dd>Vehicles(약 2,100행, 연 500 증가) · Model_Master · KUFRI_Plan · AFAB_Uploads · Vehicle_History · Settings · Audit_Log</dd>
      <dt>${tx('인덱스 열')}</dt><dd>Commission No. · Status · PM · ETA Month (5,000행 뷰 임계값 대비)</dd>
      <dt>${tx('실시간 정의')}</dt><dd>① 저장 즉시 모든 집계 재계산(단일 데이터 스토어) ② 다른 사용자 화면 60초 이내 자동 갱신 ③ 수식 수작업 없음</dd>
      <dt>${tx('엑셀 파싱·내보내기')}</dt><dd>브라우저 SheetJS (서버 불필요) · 내보내기는 다운로드 + /Exports/ 저장</dd>
      <dt>${tx('연결 상태 (목업)')}</dt><dd>${statusPill('neutral',tx('로그인 미연동'))} ${statusPill('neutral',tx('Graph 미연동'))} ${statusPill('neutral',tx('SharePoint 미연동'))} <span class="muted small">— 이 목업은 하드코딩 데이터만 사용</span></dd>
      <dt>${tx('열린 질문')}</dt><dd class="muted">GitHub Pages 공개 범위(Private Pages) · Entra 앱 등록 담당자 · 통관 데이터 출처 · 선사 ETA 수신 방식 (§15)</dd></dl>`;
  } else if(ST.tab==='model'){
    drawModelMaster(b, admin); // 11/3 #10·#11 + 11/4 Option 4열 분리: createElement로 그림
  } else if(ST.tab==='map'){
    b.innerHTML = `${adminNote}<div class="card-h"><h2>${tx('AFAB(SDISP) → 시스템 필드 매핑')}</h2><span class="desc">${tx('헤더 32개 명칭·순서가 바뀌면 업로드 검증에서 차단')}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${tx('열')}</th><th>${tx('AFAB 헤더(독일어)')}</th><th>${tx('시스템 필드')}</th><th>${tx('변환')}</th><th>${tx('사용')}</th></tr></thead><tbody>${AFAB_MAP.map(r=>`<tr><td class="mono">${r[0]}</td><td>${esc(r[1])}</td><td class="mono">${esc(r[2])}</td><td class="muted">${esc(r[3])}</td><td>${r[4]==='✓'?statusPill('ok',tx('✓ 사용')):r[4]==='△'?statusPill('neutral',tx('△ 보관')):statusPill('danger',tx('✗ 미사용'))}</td></tr>`).join('')}</tbody></table></div>
      <div class="muted small" style="margin-top:6px">기존 엑셀 VLOOKUP 3종(Changeability Date, Color, AFAB 수정 가능)은 이 매핑으로 대체. 날짜 dd.mm.yyyy → YYYY-MM-DD, 금액 독일식(124.337,75) → 숫자.</div>`;
  } else if(ST.tab==='rules'){
    b.innerHTML = `${adminNote}<div class="card-h"><h2>${tx('Current Status 판정 규칙')}</h2><span class="desc">${tx('상태별 Source · 판정 기준 (10/20 확정) · 1대 = 1단계 · 수동 override 시 사유 필수')}</span></div>
      <table class="tbl"><thead><tr><th>No.</th><th>Source</th><th>Current Status</th><th>${tx('판정 규칙')}</th><th class="num">${tx('현재 건수')}</th></tr></thead><tbody>${STAGE_RULES.map(r=>`<tr><td class="num">${r.order}</td><td>${esc(r.source)}</td><td>${stagePill(r.stage)}</td><td>${esc(r.cond)}</td><td class="num">${num(VEHICLES.filter(v=>v.current_status===r.stage).length)}</td></tr>`).join('')}</tbody></table>
      <div class="muted small" style="margin-top:8px">샘플 검증(2026-10-07): Ordered 454 · In Production 162(생산월 경과 80 포함) · Shipment scheduled 14 · In Transit 66 · Bonded 186 · OH 91 · Sold 1,054 · Cancelled 34 = 2,061</div>`;
  } else if(ST.tab==='values'){
    b.innerHTML = `${adminNote}<div class="card-h"><h2>${tx('기준값 (Settings)')}</h2><span class="desc">key / value</span><span class="spacer"></span><button class="btn primary sm editor-only" onclick="describe('기준값 저장','Settings List 갱신 → Audit_Log 기록 → 파생 계산·KUFRI 판정 색이 즉시 재계산됩니다.')">${tx('저장')}</button></div>
      <table class="tbl"><thead><tr><th>Key</th><th>Value</th><th>${tx('설명')}</th></tr></thead><tbody>${SETTINGS.map(s=>`<tr><td class="mono">${s.key}</td><td>${admin?`<input value="${esc(s.value)}" style="width:160px">`:`<b>${esc(s.value)}</b>`}</td><td class="muted">${esc(s.desc)}</td></tr>`).join('')}</tbody></table>`;
  } else if(ST.tab==='users'){
    b.innerHTML = `<div class="card-h"><h2>${tx('사용자 · 권한')}</h2><span class="desc">${tx('M365 보안 그룹 2개로 역할 결정 · 5명 미만')}</span></div>
      <table class="tbl"><thead><tr><th>${tx('이름')}</th><th>UPN</th><th>${tx('부서')}</th><th>${tx('M365 그룹')}</th><th>${tx('역할')}</th><th>${tx('관리자')}</th><th>${tx('권한')}</th></tr></thead><tbody>${USERS.map(u=>`<tr><td><b>${u.name}</b></td><td class="mono">${u.upn}</td><td>${u.dept}</td><td class="mono">${u.group}</td><td>${statusPill(u.role==='Editor'?'ok':'neutral',u.role)}</td><td>${u.admin?statusPill('warn',tx('관리자')):'<span class="muted">—</span>'}</td><td class="small muted">${u.role==='Editor'?tx('입력·수정·AFAB 반영·계획 확정')+(u.admin?tx(' · 마스터·기준값·되돌리기'):''):tx('조회·내보내기')}</td></tr>`).join('')}</tbody></table>
      <div class="callout" style="margin-top:12px">그룹 멤버 변경은 IT(Entra ID)에서 처리하며 이 화면은 조회 전용입니다. Viewer에게는 입력·반영·확정 버튼이 보이지 않습니다. (상단 역할 전환으로 확인)</div>`;
  } else if(ST.tab==='history'){
    b.innerHTML = `<div class="card-h"><h2>${tx('변경 이력 (Vehicle_History)')}</h2><span class="desc">${tx('{n}건 · 필드 단위 before/after', {n:num(VEHICLE_HISTORY.length)})}</span><span class="spacer"></span><input id="hq" placeholder="${tx('Commission 검색')}" style="border:1px solid var(--line-strong);border-radius:6px;padding:4px 8px"><button class="btn sm editor-only" onclick="describe('되돌리기','관리자만. 선택한 이력의 old_value로 복원하고 Audit_Log에 기록합니다.')">${tx('되돌리기')}</button></div>
      <div class="tbl-wrap" style="max-height:60vh"><table class="tbl clickable" id="htbl"><thead><tr><th>${tx('일시')}</th><th>Commission No</th><th>${tx('필드')}</th><th>${tx('이전')}</th><th>${tx('이후')}</th><th>${tx('사용자')}</th><th>${tx('출처')}</th></tr></thead><tbody></tbody></table></div>`;
    const draw=()=>{ const qq=(el('hq').value||'').trim(); const rows=VEHICLE_HISTORY.filter(h=>!qq||h.commission_no.includes(qq)).slice(0,200); q('#htbl tbody').innerHTML = rows.map(h=>`<tr data-comm="${h.commission_no}"><td class="mono">${h.changed_at}</td><td class="mono">${h.commission_no}</td><td class="mono">${h.field}</td><td class="muted">${esc(h.old_value)||'—'}</td><td><b>${esc(h.new_value)||'—'}</b></td><td>${esc(h.changed_by)}</td><td>${statusPill('neutral',h.source)}</td></tr>`).join(''); qa('#htbl tbody tr').forEach(tr=>tr.onclick=()=>openVehicle(tr.dataset.comm)); };
    el('hq').oninput=draw; draw();
  } else if(ST.tab==='audit'){
    b.innerHTML = `<div class="card-h"><h2>${tx('감사 로그 (Audit_Log)')}</h2><span class="desc">${tx('시스템 전체 행위 기록(로그인 제외): 누가·언제·무엇을')}</span></div>
      <table class="tbl"><thead><tr><th>${tx('일시')}</th><th>${tx('사용자')}</th><th>${tx('행위')}</th><th>${tx('대상')}</th><th>${tx('상세')}</th></tr></thead><tbody>${AUDIT_LOG.map(a=>`<tr><td class="mono">${a.at}</td><td>${a.user}</td><td><b>${a.action}</b></td><td class="mono small">${esc(a.target)}</td><td class="muted">${esc(a.detail)}</td></tr>`).join('')}</tbody></table>`;
  }
}

// ---- 11/3 리뷰 #10·#11: 모델 마스터 — 편집 모드 + 저장 · 모델 추가 (11/4: Option 열 → Cab Gen · Wheelbase · PTO · Emission) ----
// 11/4 리뷰 #2: 기본 모델·주문제작 구분 삭제 — 모든 모델 행을 같은 방식으로 추가·수정('모델 구분' 열·custom 값 없음)
// 편집 모드(ST.mmEdit): 모든 행의 전 열 + Active가 입력칸. '저장' → Store.modelMaster.update(바뀐 행만) → BM(Code1-Code2) 일치 차량 반영 + Audit_Log
// [key, 머리글, 입력칸 너비(px), td class]
const MM_COLS = [
  ['prefix','Baumuster Code1',84,'mono'], ['code2','Baumuster Code2',48,'mono'], ['my','MY',0,''], ['gen','Gen',64,''], ['vehicle','Vehicle',0,''],
  ['series','Model',72,''], ['model','Type',84,''], ['axle','Axle',40,''], ['cab','Cab',44,''],
  ['cab_gen','Cab Gen',0,''], ['wheelbase','Wheelbase',52,''], ['pto','PTO',44,''], ['emission','Emission',56,''],
  ['lead_days','리드타임(일)',48,'num'], ['lead','리드타임(월)',40,'num'],
]; // 11/6: Model In AFAB(type_desc) 열 삭제 — 표·모델 추가 창 모두에서 입력·표시하지 않음(샘플 데이터 값은 유지)
const MY_LIST = Object.values(MY_FROM_LETTER).map(n=>'MY'+n); // MY21~MY28
const MM_SELECT = {vehicle: VEHICLE_TYPES, cab_gen: ['SFTP','ProCabin'], my: MY_LIST}; // 드롭다운 열 (Cab Gen 값은 10/27 #18: SFTP / ProCabin · MY는 11/4: Code2에 묶여 BM이 연식을 결정)
const MM_TITLES = {series:"차량 마스터 'Model' 열과 연동 (series)", model:"차량 마스터 'Type' 열과 연동 (model)", lead_days:'기준 구간: PM(생산월 1일) ~ Shipping(선적일) · 일 단위 · Logistics Shipping Calc = PM 1일 + 이 값', lead:'기준 구간: PM ~ ETA(입항) · 월 단위 · 입항 예정월(대시보드·KUFRI) 계산에 사용'};
const MM_SUB = {lead_days:'PM ~ Shipping', lead:'PM ~ ETA'};
function pillEl(kind, text){ return mk('span', {class:'pill '+kind}, text); }
function drawModelMaster(b, admin){
  const edit = admin && !!ST.mmEdit; const inputs = new Map(); // MODEL_MASTER 행 → {key: input|select|checkbox}
  b.replaceChildren();
  if(!admin) b.append(mk('div', {class:'callout warn'}, 'Viewer 역할은 조회만 가능합니다. 마스터·기준값 수정은 Editor 중 관리자만.'));
  // 헤더: 보기 모드 [편집] [＋ 모델 추가] · 편집 모드 [저장] [취소] (모델 추가는 비활성)
  const head = mk('div', {class:'card-h'}, mk('h2', null, tx('모델 마스터 (Model_Master)')), mk('span', {class:'spacer'}));
  if(admin){
    if(edit) head.append(mk('button', {class:'btn primary sm', onclick: save}, tx('저장')), mk('button', {class:'btn sm', onclick: ()=>{ ST.mmEdit = false; drawSettings(); }}, tx('취소')));
    else head.append(mk('button', {class:'btn sm', onclick: ()=>{ ST.mmEdit = true; drawSettings(); }}, tx('편집')));
    head.append(mk('button', {class:'btn primary sm', disabled: edit, onclick: openAddModel}, tx('＋ 모델 추가')));
  }
  // 머리글
  const thead = mk('thead', null, mk('tr', null,
    ...MM_COLS.map(([key, label, , cls])=>{ const th = mk('th', {class: cls==='num'? 'num' : null, title: MM_TITLES[key]||null}, MM_SUB[key]? tx(label) : label);
      if(MM_SUB[key]) th.append(mk('div', {class:'muted small', style:'font-weight:500'}, MM_SUB[key])); return th; }),
    mk('th', {class:'num', title:'PM ~ Shipping 실적 중앙값 (최근 6개월, 일)'}, tx('실적 중앙값')), mk('th', {class:'num'}, tx('차량 수')), mk('th', null, 'Active')));
  // 행
  const tbody = mk('tbody', null, ...MODEL_MASTER.map(m=>{
    const bm = Store.modelMaster.bmOf(m); const n = VEHICLES.filter(v=>v.bm===bm).length; const ins = {}; // 11/4: 차량 수는 BM 기준(연식별 행)
    const tr = mk('tr');
    MM_COLS.forEach(([key, , w, cls])=>{ const td = mk('td', {class: cls||null});
      if(edit){ let inp;
        if(MM_SELECT[key]){ inp = mk('select', null, ...MM_SELECT[key].map(o=>mk('option', {value:o}, o))); inp.value = m[key]; }
        else inp = mk('input', {value: m[key]==null? '' : String(m[key]), style:`width:${w}px${cls==='num'? ';text-align:right' : ''}`});
        ins[key] = inp; td.append(inp); }
      else { const val = m[key]; if(val==null || val==='') td.append(mk('span', {class:'muted'}, '—')); else td.textContent = String(val); }
      tr.append(td); });
    tr.append(mk('td', {class:'num muted'}, m.lead_days+'일'), mk('td', {class:'num'}, num(n)));
    const act = mk('td');
    if(edit){ const cb = mk('input', {type:'checkbox'}); cb.checked = !!m.active; ins.active = cb; act.append(cb); }
    else act.append(pillEl(m.active? 'ok' : 'neutral', m.active? 'Y' : 'N'));
    tr.append(act); inputs.set(m, ins); return tr; }));
  b.append(head, mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl'}, thead, tbody)),
    mk('div', {class:'muted small', style:'margin-top:6px'}, tx('모든 열을 수정할 수 있습니다. 저장 시 BM(Code1-Code2)이 같은 차량에 반영됩니다.')),
    mk('div', {class:'muted small', style:'margin-top:4px'}, "리드타임(일) = PM(생산월 1일) ~ Shipping(선적일) 실적 중앙값으로 자동 제안 → Logistics 'Shipping Calc' = PM 1일 + 리드타임(일) · 리드타임(월) = PM ~ ETA 기준, 입항 예정월(대시보드 월별 추이·KUFRI Arrival) 계산에 사용."));
  // 저장: 바뀐 행만 patch → 검증(Code1 8자리 숫자 · Code2 필수 · 리드타임 숫자 · BM 중복) → Store.modelMaster.update → 편집 종료
  function save(){
    const changes = [], errs = [], bmSeen = {};
    inputs.forEach((ins, m)=>{ const patch = {}; const bm0 = Store.modelMaster.bmOf(m);
      Object.entries(ins).forEach(([k, inp])=>{ let nv = inp.type==='checkbox'? inp.checked : inp.value.trim();
        if(k==='lead' || k==='lead_days'){ if(!/^\d+$/.test(nv)){ errs.push(`${bm0}: ${k==='lead'? '리드타임(월)' : '리드타임(일)'}은 숫자만`); return; } nv = Number(nv); }
        if(k==='prefix' && !/^\d{8}$/.test(nv)) errs.push(`${bm0}: Baumuster Code1은 숫자 8자리`);
        if(k==='code2' && !nv) errs.push(`${bm0}: Baumuster Code2 필수`);
        if(nv!==m[k]) patch[k] = nv; });
      const bm1 = (patch.prefix||m.prefix)+'-'+(patch.code2||m.code2); if(bmSeen[bm1]) errs.push(`BM ${bm1} 중복`); bmSeen[bm1] = true;
      if(Object.keys(patch).length) changes.push({m, patch}); });
    if(errs.length){ toast('저장 불가', errs.slice(0,4).join(' · ')+(errs.length>4? ` 외 ${errs.length-4}건` : '')); return; }
    ST.mmEdit = false;
    if(!changes.length){ drawSettings(); toast(tx('변경 없음'), '수정된 값이 없어 저장하지 않았습니다.'); return; }
    const r = Store.modelMaster.update(changes, state.user); drawSettings();
    toast(`모델 마스터 저장 ${num(r.models)}건`, `차량 ${num(r.vehicles)}대에 반영 (BM 기준: bm · baumuster · 모델 속성 · Cab Gen~Emission · MY · 리드타임 · 파생 모델명) · Audit_Log 기록`);
  }
}
// 모델 추가 모달 (11/3 #10 · 11/4 리뷰 #2: 구분 없이 모든 모델): 입력 → 검증 → Store.modelMaster.add → 표 다시 그림
// 11/6: 항목 이름의 * 표시 삭제 · 'Baumuster 접미'·'Model In AFAB' 입력칸 삭제(추가 행의 suffix·type_desc는 공란) · 필수 검증은 그대로
function openAddModel(){
  const field = (label, ctl, wide)=> mk('div', {class:'f'+(wide? ' wide' : '')}, mk('div', {class:'k'}, label), mk('div', {class:'v'}, ctl));
  const inp = (ph, val)=> mk('input', {placeholder: ph||'', value: val||'', style:'width:100%'});
  const sel = (opts, val)=>{ const s = mk('select', {style:'width:100%'}, ...opts.map(o=>mk('option', {value:o}, o))); s.value = val; return s; };
  const f = { prefix: inp('8자리 숫자 (예: 96340610)'), code2: inp('예: 7AV'), my: sel(MY_LIST, 'MY'+MY_FROM_LETTER[myLetterFromPm(ymAdd(BASE_YM,3))]),
    gen: inp('예: MP5', 'MP5'), vehicle: sel(VEHICLE_TYPES, 'Tractor'), series: inp('예: Actros', 'Actros'), model: inp('예: 2863LS'), axle: inp('예: 6x2'), cab: inp('예: S5F'),
    cab_gen: sel(['SFTP','ProCabin'], 'SFTP'), wheelbase: inp('예: 3900'), pto: inp('예: PTO'), emission: inp('예: Euro6', 'Euro6'),
    lead_days: mk('input', {type:'number', min:'0', value:'40', style:'width:100%'}), lead: mk('input', {type:'number', min:'0', value:'3', style:'width:100%'}), active: mk('input', {type:'checkbox', checked:true, style:'width:auto'}) };
  const err = mk('div', {class:'small', style:'color:var(--danger);font-weight:600', hidden:true});
  const body = mk('div', null,
    mk('div', {class:'fields'},
      field('Baumuster Code1', f.prefix), field('Baumuster Code2', f.code2),
      field('MY', f.my), field('Gen', f.gen),
      field('Vehicle', f.vehicle), field('Model', f.series),
      field('Type', f.model), field('Axle', f.axle),
      field('Cab', f.cab), field('Cab Gen', f.cab_gen),
      field('Wheelbase', f.wheelbase), field('PTO', f.pto),
      field('Emission', f.emission), field('Active', mk('label', null, f.active, ' Y')),
      field(tx('리드타임(일)'), f.lead_days), field(tx('리드타임(월)'), f.lead)),
    mk('div', {class:'muted small', style:'margin-top:8px'}, '추가한 모델은 오더 생성·오더 변경의 모델 목록에 바로 나타납니다(Active인 경우).'),
    err);
  openModal(tx('모델 추가'), '', ' ');
  el('modal-body').replaceChildren(body);
  const fail = msg=>{ err.textContent = msg; err.hidden = false; };
  el('modal-foot').replaceChildren(
    mk('button', {class:'btn', onclick: closeModal}, tx('취소')),
    mk('button', {class:'btn primary', onclick: ()=>{ err.hidden = true;
      const val = k=> f[k].value.trim();
      if(!/^\d{8}$/.test(val('prefix'))) return fail('Baumuster Code1은 숫자 8자리로 입력하세요.');
      if(!val('code2')) return fail('Baumuster Code2를 입력하세요.');
      const names = {gen:'Gen', series:'Model', model:'Type', axle:'Axle', cab:'Cab'};
      const miss = Object.keys(names).filter(k=>!val(k)); if(miss.length) return fail('필수 항목을 입력하세요: '+miss.map(k=>names[k]).join(', '));
      if(!/^\d+$/.test(val('lead_days')) || !/^\d+$/.test(val('lead'))) return fail('리드타임(일)·(월)은 숫자로 입력하세요.');
      const row = {prefix:val('prefix'), code2:val('code2'), my:f.my.value, suffix:'', type_desc:'', vehicle:f.vehicle.value, series:val('series'), gen:val('gen'), model:val('model'), axle:val('axle'), cab:val('cab'),
        cab_gen:f.cab_gen.value, wheelbase:val('wheelbase'), pto:val('pto'), emission:val('emission'), lead:Number(val('lead')), lead_days:Number(val('lead_days')), active:f.active.checked};
      const m = Store.modelMaster.add(row, state.user); if(!m) return fail(`BM ${row.prefix}-${row.code2}는 이미 등록된 모델입니다.`);
      closeModal(); drawSettings();
      toast(tx('모델 추가'), `${Store.modelMaster.bmOf(m)} · ${m.my} · ${[m.vehicle, m.series, m.model, m.axle, m.cab, modelOptTag(m)].filter(Boolean).join(' ')} · Model_Master 추가 · Audit_Log 기록`); }}, tx('추가')));
}
