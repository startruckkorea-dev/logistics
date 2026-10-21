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
    b.innerHTML = `${adminNote}<div class="card-h"><h2>${tx('모델 마스터 (Model_Master)')}</h2><span class="desc">${tx('baumuster_prefix(8자리) + type_desc → vehicle · gen · series(Model) · model(Type) · axle · cab · option · dms_model_name · lead_time')}</span><span class="spacer"></span><button class="btn primary sm editor-only" onclick="describe('모델 추가','Model_Master에 행 추가. 매핑 없는 Baumuster로 등록된 차량은 저장 즉시 자동 재매핑됩니다.')">${tx('＋ 모델 추가')}</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Baumuster Code1</th><th>Baumuster Code2</th><th>Model In AFAB</th><th>Gen</th><th>Vehicle</th><th title="차량 마스터 'Model' 열과 연동 (series)">Model</th><th title="차량 마스터 'Type' 열과 연동 (model)">Type</th><th>Axle</th><th>Cab</th><th>Option</th><th class="num">${tx('리드타임(월)')}</th><th class="num">${tx('실적 중앙값')}</th><th class="num">${tx('차량 수')}</th><th>Active</th></tr></thead><tbody>
      ${MODEL_MASTER.map(m=>{ const n=VEHICLES.filter(v=>v.baumuster.startsWith(m.prefix)).length; return `<tr><td class="mono">${m.prefix}</td><td class="mono">${m.code2}</td><td>${m.type_desc}</td><td>${m.gen}</td><td>${m.vehicle}</td><td>${esc(m.series)}</td><td>${m.model}</td><td>${m.axle}</td><td>${m.cab}</td><td>${m.option||'<span class="muted">—</span>'}</td><td class="num">${admin?`<input value="${m.lead}" style="width:40px;text-align:right">`:m.lead}</td><td class="num muted">${m.lead}${m.lead>=4?' (3~5)':' (2~3)'}</td><td class="num">${num(n)}</td><td>${m.active?statusPill('ok','Y'):statusPill('neutral','N')}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="muted small" style="margin-top:6px">리드타임 = PM→ETA 실적 중앙값으로 자동 제안(Rigid 2135L 2개월, Tractor 2~3, 그 외 Rigid/Tipper 3~5). 매핑 없는 Baumuster 1건(96340610) 대기 중.</div>`;
  } else if(ST.tab==='map'){
    b.innerHTML = `${adminNote}<div class="card-h"><h2>${tx('AFAB(SDISP) → 시스템 필드 매핑')}</h2><span class="desc">${tx('헤더 32개 명칭·순서가 바뀌면 업로드 검증에서 차단')}</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${tx('열')}</th><th>${tx('AFAB 헤더(독일어)')}</th><th>${tx('시스템 필드')}</th><th>${tx('변환')}</th><th>${tx('사용')}</th></tr></thead><tbody>${AFAB_MAP.map(r=>`<tr><td class="mono">${r[0]}</td><td>${esc(r[1])}</td><td class="mono">${esc(r[2])}</td><td class="muted">${esc(r[3])}</td><td>${r[4]==='✓'?statusPill('ok',tx('✓ 사용')):r[4]==='△'?statusPill('neutral',tx('△ 보관')):statusPill('danger',tx('✗ 미사용'))}</td></tr>`).join('')}</tbody></table></div>
      <div class="muted small" style="margin-top:6px">기존 엑셀 VLOOKUP 3종(Changeability Date, Color, AFAB 수정 가능)은 이 매핑으로 대체. 날짜 dd.mm.yyyy → YYYY-MM-DD, 금액 독일식(124.337,75) → 숫자.</div>`;
  } else if(ST.tab==='rules'){
    b.innerHTML = `${adminNote}<div class="card-h"><h2>${tx('Current Status 판정 규칙')}</h2><span class="desc">${tx('상태별 Source · 판정 기준 (10/20 확정) · 1대 = 1단계 · 수동 override 시 사유 필수')}</span></div>
      <table class="tbl"><thead><tr><th>No.</th><th>Source</th><th>Current Status</th><th>${tx('판정 규칙')}</th><th class="num">${tx('현재 건수')}</th></tr></thead><tbody>${STAGE_RULES.map(r=>`<tr><td class="num">${r.order}</td><td>${esc(r.source)}</td><td>${stagePill(r.stage)}</td><td>${esc(r.cond)}</td><td class="num">${num(VEHICLES.filter(v=>v.current_status===r.stage).length)}</td></tr>`).join('')}</tbody></table>
      <h3 style="margin:14px 0 6px">${tx('오더 분류 (order_class)')}</h3>
      <table class="tbl"><thead><tr><th>${tx('분류')}</th><th>${tx('조건')}</th><th class="num">${tx('현재')}</th></tr></thead><tbody>
      <tr><td>${classPill('Fixed order')}</td><td>단계 Ordered·In Production(미선적·배편 미확정) & PM(final) ∈ {당월 ${BASE_YM}, 익월 ${ymAdd(BASE_YM,1)}}</td><td class="num">${num(VEHICLES.filter(v=>v.order_class==='Fixed order').length)}</td></tr>
      <tr><td>${classPill('Order (Changeable)')}</td><td>단계 Ordered·In Production & PM(final) ≥ 당월+2 (${ymAdd(BASE_YM,2)} 이후)</td><td class="num">${num(VEHICLES.filter(v=>v.order_class==='Order (Changeable)').length)}</td></tr>
      <tr><td><span class="muted">—</span></td><td>생산월 경과·미선적분은 In Production에만 포함(분류 없음), 그 외 단계</td><td class="num">${num(VEHICLES.filter(v=>v.order_class==='—').length)}</td></tr></tbody></table>
      <div class="muted small" style="margin-top:8px">샘플 검증(2026-10-07): Ordered 454 · In Production 162(생산월 경과 80 포함) · Shipment scheduled 14 · In Transit 66 · Bonded 186 · OH 91 · Sold 1,054 · Cancelled 34 = 2,061 · Fixed order 129(10월 82·11월 47) · Order (Changeable) 407</div>`;
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
