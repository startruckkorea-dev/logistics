'use strict';
/* ===== 선적 · 입항 (S1~S2) ===== */
const SH = { edit:false }; // 선박별 현황 편집 모드: '편집' 클릭 후에만 입력란 표시 (10/15 No.20)
window.addEventListener('hashchange', ()=>{ SH.edit=false; });
PAGES.shipping = {
  title:'선적 · 입항', sub:'운송중 · 입항 예정 · 선박별 현황',
  render(root){
    const moving = VEHICLES.filter(v=>v.current_status==='In Transit'||v.current_status==='Shipment scheduled');
    const transit = VEHICLES.filter(v=>v.current_status==='In Transit');
    const m0=BASE_YM, m1=ymAdd(BASE_YM,1);
    const arrM0 = moving.filter(v=>expectedArrivalYm(v)===m0).length, arrM1 = moving.filter(v=>expectedArrivalYm(v)===m1).length;
    const kpi = `<div class="grid3">
      <div class="card kpi"><span class="label">운송중 (In Transit) ${note('S1')}</span><span class="value num">${num(transit.length)}</span><span class="foot">Shipped / Invoiced · ${new Set(transit.map(v=>v.vessel)).size}척 · 선적 예정 ${num(moving.length-transit.length)}대 별도</span></div>
      <div class="card kpi"><span class="label">당월 입항 예정 (${m0})</span><span class="value num">${num(arrM0)}</span><span class="foot">ETA Final 기준, 없으면 Pl. arrival</span></div>
      <div class="card kpi"><span class="label">익월 입항 예정 (${m1})</span><span class="value num">${num(arrM1)}</span><span class="foot">Shipment scheduled 포함</span></div>
    </div>`;

    // 월별 입항 예정: 엑셀 'Arrival Schedule' 피벗 구조 (행: 구분 > 차종 > 모델 / 열: 월 > 선박, 월 Total, Grand Total / 값: 선박별 선적 대수)
    const voyYm = y=> (y.eta_final||y.eta_carrier||y.pl).slice(0,7);
    const voyByYm = {}; VOYAGES.forEach(y=>{ const k=voyYm(y); (voyByYm[k]=voyByYm[k]||[]).push(y); });
    const yms = Object.keys(voyByYm).sort(); yms.forEach(k=>voyByYm[k].sort((a,b)=>a.shipping<b.shipping?-1:1));
    const cntByVessel = {}; moving.forEach(v=>{ const k=v.model_classification; const c = cntByVessel[k] = cntByVessel[k] || {gen:v.gen, vehicle:v.vehicle, by:{}}; c.by[v.vessel]=(c.by[v.vessel]||0)+1; });
    const gens = [...new Set(MODEL_MASTER.map(m=>m.gen))].filter(g=>Object.values(cntByVessel).some(c=>c.gen===g));
    const cellN = n=> n? mk('td', {class:'num'}, num(n)) : mk('td', {class:'num'}, mk('span', {class:'muted'}, '·'));
    const sumRow = by=> ({ perV: yms.flatMap(k=>voyByYm[k].map(y=>by[y.vessel]||0)), perM: yms.map(k=>voyByYm[k].reduce((a,y)=>a+(by[y.vessel]||0),0)) });
    const valueCells = by=>{ const s=sumRow(by); const cells=[]; yms.forEach((k,mi)=>{ voyByYm[k].forEach(y=>cells.push(cellN(by[y.vessel]||0))); const t=cellN(s.perM[mi]); t.classList.add('tot'); cells.push(t); });
      const g=mk('td', {class:'num gt'}, num(s.perM.reduce((a,b)=>a+b,0))); cells.push(g); return cells; };
    const nCols = 1 + VOYAGES.length + yms.length + 1;
    const bodyRows = [];
    gens.forEach(g=>{ bodyRows.push(mk('tr', {class:'g1'}, mk('td', {colspan:nCols}, g)));
      VEHICLE_TYPES.filter(t=>Object.values(cntByVessel).some(c=>c.gen===g&&c.vehicle===t)).forEach(t=>{ bodyRows.push(mk('tr', {class:'g2'}, mk('td', {colspan:nCols}, t)));
        Object.keys(cntByVessel).filter(k=>cntByVessel[k].gen===g&&cntByVessel[k].vehicle===t).sort().forEach(k=>bodyRows.push(mk('tr', null, mk('td', {class:'model'}, k), valueCells(cntByVessel[k].by)))); }); });
    const grand = {}; moving.forEach(v=>{ grand[v.vessel]=(grand[v.vessel]||0)+1; });
    bodyRows.push(mk('tr', {class:'total'}, mk('td', null, 'Grand Total'), valueCells(grand)));
    const monthly = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '월별 입항 예정 (Arrival Schedule)'), mk('span', {class:'desc'}, '행: 구분 > 차종 > 모델 · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)')),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact pivot'},
        mk('thead', null,
          mk('tr', null, mk('th', {rowspan:2}, 'Model'), yms.flatMap(k=>[mk('th', {class:'ym', colspan:voyByYm[k].length}, k.slice(2)), mk('th', {class:'num tot', rowspan:2}, k.slice(2)+' Total')]), mk('th', {class:'num gt', rowspan:2}, 'Grand Total')),
          mk('tr', null, yms.flatMap(k=>voyByYm[k].map(y=>mk('th', {class:'num', title:`${y.carrier} · Shipping ${y.shipping}`}, y.vessel))))),
        mk('tbody', null, bodyRows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, '선박의 입항 월은 ATA → ETA 선사 → Pl. arrival(AFAB) 순으로 결정. 실제 구현에서는 셀 클릭 → 해당 선박·모델 Logistics 목록.'));

    // 선박별 현황: B/L · Shipping · Pl. arrival · ETA 선사 · ATA · TSC 입고일(Key-in) · 대수
    const dash = ()=>mk('span', {class:'muted'}, '—');
    // 선박 단위 입력(B/L No · ETA From EUKOR/PIRT · ATA) → VOYAGES + 해당 선박 차량(Vehicles) 필드에 반영(Store). TSC 입고일은 Key-in만(차량 마스터 미반영).
    const applyToVehicles = (y, voyKey, vehKey, label, val)=>{
      Store.voyages.update(y.id, {[voyKey]: val});
      const n = Store.voyages.applyToVehicles(y.vessel, vehKey, val);
      toast(`${label} 입력 · ${y.vessel}`, `${val||'(삭제)'} → 해당 선박 차량 ${num(n)}대의 ${vehKey}에 반영(차량 마스터) · Vehicle_History(출처: 수동) 기록`);
    };
    const edit = SH.edit && isEditor(); // 편집 모드에서만 입력란, 그 외에는 값 표시
    const vIn = (y, voyKey, vehKey, label, type, ph, empty)=> edit
      ? mk('input', {type, class:'tsc-in', value:y[voyKey]||'', placeholder:ph||'', title:`${label} 입력 → 차량 마스터 반영`, onclick:e=>e.stopPropagation(), onchange:e=>applyToVehicles(y, voyKey, vehKey, label, e.target.value.trim())})
      : mk('span', null, y[voyKey] || empty);
    const rows = VOYAGES.map(y=>{ const vs=moving.filter(v=>v.vessel===y.vessel); // 10/19: ETA 불일치 표시 삭제
      const tsc = !edit ? mk('span', {class:'muted'}, '미입력') : mk('input', {type:'date', class:'tsc-in', title:'TSC 입고일 수기 입력 (Key-in) — 차량 마스터에는 반영하지 않음', onclick:e=>e.stopPropagation(), onchange:e=>describe('TSC 입고일 입력', `${y.vessel} · TSC Arrival Date ${e.target.value||'(삭제)'} → 해당 선박 차량의 tsc_arrival_date에 일괄 저장하고 Vehicle_History(출처: 수동)에 기록합니다. (차량 마스터 열에는 반영하지 않음)`)});
      return mk('tr', {'data-vessel':y.vessel},
        mk('td', null, mk('b', null, y.vessel), mk('div', {class:'muted small'}, `${y.carrier} · ${y.kind==='transit'?'운송중':'선적 예정'}`)),
        mk('td', {class:'mono'}, vIn(y, 'bl', 'bl_no', 'B/L No', 'text', '미확정', mk('span', {class:'muted'}, '미확정'))),
        mk('td', {class:'mono'}, y.shipping, y.kind==='scheduled'? mk('div', {class:'muted small'}, '예정') : null),
        mk('td', {class:'mono'}, y.pl),
        mk('td', {class:'mono'}, vIn(y, 'eta_carrier', 'eta_from_eukor_pirt', 'ETA From EUKOR/PIRT', 'date', '', dash())),
        mk('td', {class:'mono'}, vIn(y, 'eta_final', 'ata', 'ATA', 'date', '', mk('span', {class:'muted'}, '미입력'))),
        mk('td', null, tsc),
        mk('td', {class:'num'}, mk('b', null, vs.length))); });
    const vessels = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '선박별 현황'), noteEl('S2'), mk('span', {class:'desc'}, 'ATA = 실제 입항일(구 ETA Final) · TSC 입고일(TSC Arrival Date)은 Editor 수기 입력(Key-in)'), mk('span', {class:'spacer'}),
        mk('button', {class:'btn editor-only '+(edit?'primary':''), title: edit? '편집을 종료합니다 (입력값은 입력 즉시 저장됨)' : 'B/L No · ETA 선사 · ATA · TSC 입고일 입력란을 엽니다', onclick:()=>{ SH.edit=!SH.edit; PAGES.shipping.render(root); }}, edit? '편집 종료' : '편집'),
        mk('button', {class:'btn primary editor-only', id:'btnSched'}, '선사 스케줄 일괄 업데이트'), mk('button', {class:'btn', onclick:()=>describe('엑셀 내보내기','선박별 현황 표를 .xlsx로 내보냅니다.')}, '엑셀')),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl clickable compact'},
        mk('thead', null, mk('tr', null, ['Vessel','B/L No','Shipping','Planned Arrival','ETA 선사 (EUKOR/MOL)','ATA','TSC 입고일 (TSC Arrival Date)'].map(t=>mk('th', null, t)), mk('th', {class:'num'}, '대수'))),
        mk('tbody', null, rows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, '행 클릭 → 해당 선박의 차량 Logistics 목록. ATA 입력은 Logistics 그리드/상세 또는 아래 일괄 업데이트에서.'));

    root.innerHTML = kpi;
    root.append(vessels, monthly); // 10/19 No.8: 선박별 현황을 월별 입항 예정 위로
    qa('tr[data-vessel]', root).forEach(tr=>tr.onclick=()=>location.hash='#/logistics?q='+encodeURIComponent(tr.dataset.vessel));
    const b=el('btnSched'); if(b) b.onclick = ()=>openModal('선사 스케줄 일괄 업데이트', `<div class="callout">선사(EUKOR/MOL) 스케줄 파일 또는 붙여넣기 → Vessel명 매칭 → ETA 선사·ETA Final 미리보기 → 체크한 선박만 반영. 수신 방식(메일/포털)과 파일 형식은 §15 열린 질문 5번.</div>
      <ol style="padding-left:18px;line-height:1.9"><li>파일 선택(.xlsx/.csv) 또는 스케줄 텍스트 붙여넣기</li><li>Vessel / Voyage 기준 매칭 (매칭 실패 선박은 수동 선택)</li><li>미리보기: 선박별 ETA 선사 before/after, Δ(Pl. arrival 대비), 영향 차량 수</li><li>체크한 선박만 반영 → 해당 차량 eta_carrier 일괄 갱신, ETA Final은 Editor 확인 후 입력</li></ol>
      <table class="tbl"><thead><tr><th>Vessel</th><th>ETA 선사 (현재)</th><th>ETA 선사 (신규)</th><th class="num">영향 대수</th><th>반영</th></tr></thead><tbody>
      ${VOYAGES.slice(0,4).map(y=>`<tr><td>${y.vessel}</td><td class="mono muted">${y.eta_carrier||'—'}</td><td class="mono"><b>${y.eta_carrier? fmtD(addD(parseD(y.eta_carrier),1)) : y.pl}</b></td><td class="num">${y.n}</td><td><input type="checkbox" checked></td></tr>`).join('')}</tbody></table>`,
      `<button class="btn" onclick="closeModal()">취소</button><button class="btn primary" onclick="closeModal();describe('선사 스케줄 반영','체크한 선박의 차량 eta_carrier를 일괄 PATCH하고 Vehicle_History(출처: 수동/일괄)에 기록합니다.')">반영</button>`);
  }
};
