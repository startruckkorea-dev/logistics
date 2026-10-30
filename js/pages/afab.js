'use strict';
/* ===== AFAB 업로드 (A1~A5) — 10/29 #4: 상단 메뉴에서 Logistics 차량 마스터의 탭(Logistics 옆)으로 이동. renderAfabTab(root)는 logistics.js renderLogiBody가 탭 본문(#lgBody)에 그린다. 옛 주소 #/afab 는 app.js route가 #/logistics?tab=afab 로 보낸다 ===== */
const AF = { step:1, tab:'changed', file:null };
// SDISP Raw data 수동 업로드 → 검증 → 변경점 확인 → 반영
function renderAfabTab(root){
    AF.step=1; AF.tab='changed';
    root.innerHTML = `<div class="stepper" id="stepper"></div><div id="stepBody"></div>
      <div class="grid2" style="margin-top:14px"><div class="card"><div class="card-h"><h2>${tx('반영 이력')}</h2>${note('A4')}<span class="desc">${tx('AFAB_Uploads · 하루 2회 이상 가능')}</span></div>
        <div class="tbl-wrap" style="max-height:320px"><table class="tbl compact"><thead><tr><th>${tx('일시')}</th><th>${tx('사용자')}</th><th>${tx('파일')}</th><th class="num">${tx('행')}</th><th class="num">${tx('신규')}</th><th class="num">${tx('변경')}</th><th class="num">${tx('제외')}</th><th>${tx('상태')}</th></tr></thead><tbody>
        ${AFAB_UPLOADS.map(u=>`<tr><td class="mono">${u.upload_at}</td><td>${u.user}</td><td><a href="#" onclick="describe('원본 파일 열기','/AFAB_Raw/${u.upload_at.slice(0,4)}/${u.upload_at.slice(5,7)}/${u.file_name} (문서 라이브러리)');return false;">${u.file_name}</a></td><td class="num">${num(u.rows)}</td><td class="num">${u.new_count}</td><td class="num">${u.changed_count}</td><td class="num">${u.removed_count}</td><td class="wrap">${u.status.startsWith('검증 실패')?statusPill('danger',u.status):statusPill('ok',u.status)}${u.error_log?`<div class="small muted">${esc(u.error_log)}</div>`:''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-h"><h2>${tx('매핑 요약')}</h2>${note('A5')}<span class="desc">${tx('SDISP 32열 → 시스템 필드 (✓ 사용 · △ 보관 · ✗ 미사용)')}</span></div>
        <div class="tbl-wrap" style="max-height:320px"><table class="tbl"><thead><tr><th>${tx('열')}</th><th>${tx('AFAB 헤더')}</th><th>${tx('시스템 필드')}</th><th>${tx('변환')}</th><th>${tx('사용')}</th></tr></thead><tbody>
        ${AFAB_MAP.map(r=>`<tr><td class="mono">${r[0]}</td><td>${esc(r[1])}</td><td class="mono">${esc(r[2])}</td><td class="muted">${esc(r[3])}</td><td>${r[4]==='✓'?statusPill('ok',tx('✓ 사용')):r[4]==='△'?statusPill('neutral',tx('△ 보관')):statusPill('danger',tx('✗ 미사용'))}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    renderStep();
}
// CHANGES(변경점 샘플)는 data.js에 선언 — 여기서는 참조만
function renderStep(){
  const steps = ['파일 선택','검증','변경점 확인','반영'].map(x=>tx(x));
  el('stepper').innerHTML = steps.map((s,i)=>`<div class="step ${i+1<AF.step?'done':''} ${i+1===AF.step?'cur':''}"><span class="n">${i+1<AF.step?'✓':i+1}</span>${s}${i===0?note('A1'):''}</div>`).join('');
  const b = el('stepBody');
  if(AF.step===1){
    b.innerHTML = `<div class="dropzone" id="drop"><b>${tx('AFAB Raw data 파일을 여기에 놓거나 클릭하여 선택')}</b>.xlsx · 시트 "SDISP" · 헤더 32열(독일어) · 날짜 dd.mm.yyyy · 금액 독일식(124.337,75)<div class="small" style="margin-top:10px">목업: 클릭하면 시연 파일 <b>SDISP_2026-10-07.xlsx</b>(677행)로 진행합니다. 브라우저에서 SheetJS로 파싱(서버 불필요).</div></div>
      ${isEditor()?'':'<div class="callout warn" style="margin-top:10px">Viewer 역할은 업로드할 수 없습니다. (이력·매핑 조회만 가능)</div>'}`;
    el('drop').onclick = ()=>{ if(!isEditor()){ toast('Viewer는 업로드 권한이 없습니다'); return; } AF.file='SDISP_2026-10-07.xlsx'; AF.step=2; renderStep(); };
  } else if(AF.step===2){
    b.innerHTML = `<div class="card-h"><h2>${tx('검증 결과 — {f}', {f:AF.file})}</h2>${note('A2')}<span class="desc">${tx('677행 × 32열')}</span></div>
      <ul class="checklist">
        <li><span class="ok">✓</span> 시트 "SDISP" 존재</li>
        <li><span class="ok">✓</span> 헤더 32개 명칭·순서 일치 (Auftragsnummer … GLT-BAT-Soll-AO)</li>
        <li><span class="ok">✓</span> Auftragsnummer 중복 0건 · 공란 0건</li>
        <li><span class="ok">✓</span> 날짜 형식 변환 성공 (dd.mm.yyyy → YYYY-MM-DD) 5,416셀 · 실패 0</li>
        <li><span class="ok">✓</span> 금액 형식 변환 성공 (독일식 → 숫자) 1,354셀 · 실패 0</li>
        <li><span class="ok">✓</span> FIN 형식 (17자리) 310건 · 공란 367건 (신규 2027 오더, 허용)</li>
        <li><span class="warn">△</span> Baumuster 매핑 없음 1건 (96340610) → "매핑 필요" 알림, 등록은 진행</li>
      </ul>
      <div class="btn-group" style="margin-top:12px"><button class="btn" id="back1">${tx('다른 파일')}</button><button class="btn primary" id="go3">${tx('변경점 계산 →')}</button></div>`;
    el('back1').onclick=()=>{ AF.step=1; renderStep(); }; el('go3').onclick=()=>{ AF.step=3; renderStep(); };
  } else if(AF.step===3){
    const c = CHANGES;
    const tabs = [['added',tx('신규'),c.added.length],['changed',tx('변경'),c.changed.length],['removed',tx('제외(확인 필요)'),c.removed.length],['unchanged',tx('변동없음'),c.unchanged]];
    let body='';
    if(AF.tab==='added') body = `<table class="tbl"><thead><tr><th><input type="checkbox" checked></th><th>Commission No</th><th>Baumuster</th><th>Fahrzeugtyp</th><th>PM(final)</th><th>Model_Master</th><th>${tx('처리')}</th></tr></thead><tbody>${c.added.map(a=>`<tr><td><input type="checkbox" checked></td><td class="mono">${a.comm}</td><td class="mono">${a.baumuster}</td><td>${a.type}</td><td class="mono">${a.pm}</td><td>${a.mapped?statusPill('ok',tx('매핑됨')):statusPill('warn',tx('매핑 필요 — Editor 지정'))}</td><td class="small">${tx('Ordered로 등록 · Order (Changeable)')}</td></tr>`).join('')}</tbody></table>`;
    else if(AF.tab==='changed') body = `<table class="tbl"><thead><tr><th><input type="checkbox" checked></th><th>Commission No</th><th>${tx('모델')}</th><th>${tx('필드')}</th><th>Before → After</th><th>${tx('영향')}</th></tr></thead><tbody>${c.changed.map(x=>`<tr><td><input type="checkbox" checked></td><td class="mono">${x.comm}</td><td class="small">${esc(x.model)}</td><td class="mono">${x.field}</td><td class="diff"><span class="old">${esc(x.old)||tx('(공란)')}</span><span class="new">${esc(x.nw)||tx('(공란)')}</span></td><td class="small">${esc(x.impact)}</td></tr>`).join('')}</tbody></table>`;
    else if(AF.tab==='removed') body = `<div class="callout warn">AFAB 목록에서 사라진 Commission은 <b>자동 삭제하지 않습니다</b>. Cancelled 확정 또는 보류를 선택하세요. (보류 시 "확인 필요" 목록에 남음)</div><table class="tbl"><thead><tr><th>Commission No</th><th>${tx('모델')}</th><th>${tx('현재 단계')}</th><th>PM(final)</th><th>${tx('처리')}</th></tr></thead><tbody>${c.removed.map(r=>`<tr><td class="mono">${r.comm}</td><td class="small">${esc(r.model)}</td><td>${stagePill(r.stage)}</td><td class="mono">${r.pm}</td><td><select><option>${tx('보류 (확인 필요)')}</option><option>${tx('Cancelled 확정 (사유 입력)')}</option></select></td></tr>`).join('')}</tbody></table>`;
    else body = `<div class="muted" style="padding:20px;text-align:center">${tx('{n}건은 모든 필드가 현재 Vehicles와 동일합니다. (표시 생략)', {n:num(c.unchanged)})}</div>`;
    b.innerHTML = `<div class="card-h"><h2>${tx('변경점 — {f}', {f:AF.file})}</h2>${note('A3')}<span class="desc">${tx('현재 Vehicles와 비교 · 체크한 항목만 반영')}</span></div>
      <div class="tabs">${tabs.map(t=>`<span class="tab ${AF.tab===t[0]?'active':''}" data-tab="${t[0]}">${t[1]}<span class="n">${num(t[2])}</span></span>`).join('')}</div>${body}
      <div class="btn-group" style="margin-top:12px"><button class="btn" id="back2">${tx('← 검증')}</button><button class="btn" id="cancel3">${tx('취소')}</button><button class="btn primary editor-only" id="apply">${tx('체크 항목 반영 ({n}건)', {n:c.added.length+c.changed.length})}</button></div>`;
    qa('.tab', b).forEach(t=>t.onclick=()=>{ AF.tab=t.dataset.tab; renderStep(); });
    el('back2').onclick=()=>{ AF.step=2; renderStep(); }; el('cancel3').onclick=()=>{ AF.step=1; renderStep(); toast('업로드 취소', '반영 전 미리보기 단계에서 취소되었습니다. 파일은 저장되지 않습니다.'); };
    el('apply').onclick=()=>{ AF.step=4; renderStep(); };
  } else {
    const c=CHANGES;
    b.innerHTML = `<div class="card-h"><h2>${tx('반영 완료 — {f}', {f:AF.file})}</h2><span class="desc">${TODAY_S} 08:42 · ${state.user}</span></div>
      <ul class="checklist">
        <li><span class="ok">✓</span> 신규 ${c.added.length}건 Ordered로 등록 (Model_Master 매핑 ${c.added.filter(a=>a.mapped).length}, 매핑 필요 ${c.added.filter(a=>!a.mapped).length})</li>
        <li><span class="ok">✓</span> 변경 ${c.changed.length}건 반영 → Vehicle_History 기록 (출처 "AFAB 업로드", 사용자 ${state.user})</li>
        <li><span class="warn">△</span> 제외 ${c.removed.length}건 "확인 필요" 목록으로 분리 (자동 삭제 없음)</li>
        <li><span class="ok">✓</span> AFAB_Uploads 기록 · 원본 파일 /AFAB_Raw/2026/10/${AF.file} 보관</li>
        <li><span class="ok">✓</span> 단계 재판정 · 파생 재계산 · 대시보드/KUFRI 즉시 반영 · 다른 사용자 화면 60초 이내 갱신</li>
      </ul>
      <div class="btn-group" style="margin-top:12px"><button class="btn primary" id="again">${tx('새 업로드')}</button><a class="btn" href="#/logistics?stage=Ordered(Changeable)">${tx('Logistics 확인 →')}</a></div>`;
    el('again').onclick=()=>{ AF.step=1; renderStep(); };
    toast('[목업] AFAB 반영', '실제 시스템에서는 Graph API로 Vehicles/Vehicle_History/AFAB_Uploads에 기록됩니다.');
  }
}
