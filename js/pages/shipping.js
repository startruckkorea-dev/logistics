'use strict';
/* ===== 선적 · 입항 (S1~S2) ===== */
const SH = { edit:false, range:'rest' }; // 선박별 현황 편집 모드: '편집' 클릭 후에만 입력란 표시 (10/15 No.20) · range: 월별 입항 예정 기간 'rest' = 이번달~연말(기본) · 'year' = 올해 전체 (10/22)
window.addEventListener('hashchange', ()=>{ SH.edit=false; SH.range='rest'; });
PAGES.shipping = {
  title:'선적 · 입항', sub:'운송중 · 입항 예정 · 선박별 현황',
  render(root){
    const moving = VEHICLES.filter(v=>v.current_status==='In Transit'||v.current_status==='Shipment scheduled');
    const transit = VEHICLES.filter(v=>v.current_status==='In Transit');
    const m0=BASE_YM, m1=ymAdd(BASE_YM,1);
    const arrM0 = moving.filter(v=>expectedArrivalYm(v)===m0).length, arrM1 = moving.filter(v=>expectedArrivalYm(v)===m1).length;
    const kpi = `<div class="grid3">
      <div class="card kpi"><span class="label">${tx('운송중 (In Transit)')} ${note('S1')}</span><span class="value num">${num(transit.length)}</span><span class="foot">${tx('Shipped / Invoiced · {n}척 · 선적 예정 {m}대 별도', {n:new Set(transit.map(v=>v.vessel)).size, m:num(moving.length-transit.length)})}</span></div>
      <div class="card kpi"><span class="label">${tx('당월 입항 예정 ({m})', {m:m0})}</span><span class="value num">${num(arrM0)}</span><span class="foot">${tx('ETA Final 기준, 없으면 Pl. arrival')}</span></div>
      <div class="card kpi"><span class="label">${tx('익월 입항 예정 ({m})', {m:m1})}</span><span class="value num">${num(arrM1)}</span><span class="foot">${tx('Shipment scheduled 포함')}</span></div>
    </div>`;

    // 월별 입항 예정: 엑셀 'Arrival Schedule' 피벗 구조 (행: 구분 > 차종 > 모델 / 열: 월 > 선박, 월 Total, Grand Total / 값: 선박별 선적 대수)
    // 기간 (10/22): 'rest' = 이번달~연말, 'year' = 올해 1~12월 · 당월 이전 달은 입항 실적(ATA) · 선박 없는 달도 열 유지('·')
    const year = BASE_YM.slice(0,4); const range = { from: SH.range==='year'? year+'-01' : BASE_YM, to: year+'-12' };
    const sched = arrivalSchedule(null, range); const {yms, voyByYm} = sched; // 10/20: 집계·정렬은 data.js arrivalSchedule() 공용 (대시보드 당월 도착 예정과 동일 규칙) · 모델 행 = Vehicle · Model · Type · Axle · Cab · Option
    const kOf = y=> y.key||y.vessel; // 열 key: 항차 = 선박명, 입항 실적 = 'YYYY-MM|선박명'
    const cellN = n=> n? mk('td', {class:'num'}, num(n)) : mk('td', {class:'num'}, mk('span', {class:'muted'}, '·'));
    const sumRow = by=> ({ perV: yms.flatMap(k=>voyByYm[k].map(y=>by[kOf(y)]||0)), perM: yms.map(k=>voyByYm[k].reduce((a,y)=>a+(by[kOf(y)]||0),0)) });
    const valueCells = by=>{ const s=sumRow(by); const cells=[]; yms.forEach((k,mi)=>{ voyByYm[k].forEach(y=>cells.push(cellN(by[kOf(y)]||0))); const t=cellN(s.perM[mi]); t.classList.add('tot'); cells.push(t); });
      const g=mk('td', {class:'num gt'}, num(s.perM.reduce((a,b)=>a+b,0))); cells.push(g); return cells; };
    const nCols = 1 + yms.reduce((a,k)=>a+voyByYm[k].length,0) + yms.length + 1;
    const rangeBtn = (r, label)=> mk('button', {class:'btn sm'+(SH.range===r?' primary':''), onclick:()=>{ SH.range=r; PAGES.shipping.render(root); }}, label);
    const bodyRows = [];
    // 그룹 행은 첫 칸(고정 열)에 라벨, 나머지는 빈 칸 하나로 채움 — Model 열 고정(sticky) 시 가로 스크롤 중에도 라벨이 보이도록 (10/22)
    sched.groups.forEach(g=>{ bodyRows.push(mk('tr', {class:'g1'}, mk('td', null, g.gen), mk('td', {colspan:nCols-1})));
      g.vehicles.forEach(t=>{ bodyRows.push(mk('tr', {class:'g2'}, mk('td', null, t.vehicle), mk('td', {colspan:nCols-1})));
        t.rows.forEach(r=>bodyRows.push(mk('tr', null, mk('td', {class:'model'}, r.label), valueCells(r.by)))); }); });
    bodyRows.push(mk('tr', {class:'total'}, mk('td', null, 'Grand Total'), valueCells(sched.grand)));
    const monthly = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('월별 입항 예정·실적 (Arrival Schedule)')), mk('span', {class:'desc'}, tx('행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · Option) · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)') + ' · ' + tx('당월 이전 달은 입항 실적(ATA 기준, Bonded·OH·Sold)')),
        mk('span', {class:'spacer'}), mk('div', {class:'btn-group'}, rangeBtn('rest', tx('이번달~연말 ({a}~{b})', {a:ymLabel(BASE_YM), b:ymLabel(range.to)})), rangeBtn('year', tx('올해 전체 ({y})', {y:year})))),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact pivot fixcol'},
        mk('thead', null,
          mk('tr', null, mk('th', {rowspan:2}, 'Model'), yms.flatMap(k=> voyByYm[k].length? [mk('th', {class:'ym', colspan:voyByYm[k].length}, ymLabel(k)), mk('th', {class:'num tot', rowspan:2}, ymLabel(k)+' Total')] : [mk('th', {class:'num tot', rowspan:2, title:tx('해당 월 입항 선박 없음')}, ymLabel(k)+' Total')]), mk('th', {class:'num gt', rowspan:2}, 'Grand Total')),
          mk('tr', null, yms.flatMap(k=>voyByYm[k].map(y=>mk('th', {class:'num', title: y.arrived? tx('입항 실적 (ATA 기준)') : `${y.carrier} · Shipping ${y.shipping}`}, y.vessel))))),
        mk('tbody', null, bodyRows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, tx('선박의 입항 월은 ATA → ETA 선사 → Pl. arrival(AFAB) 순으로 결정. 실제 구현에서는 셀 클릭 → 해당 선박·모델 Logistics 목록.')));

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
      const tsc = !edit ? mk('span', {class:'muted'}, tx('미입력')) : mk('input', {type:'date', class:'tsc-in', title:'TSC 입고일 수기 입력 (Key-in) — 차량 마스터에는 반영하지 않음', onclick:e=>e.stopPropagation(), onchange:e=>describe('TSC 입고일 입력', `${y.vessel} · TSC Arrival Date ${e.target.value||'(삭제)'} → 해당 선박 차량의 tsc_arrival_date에 일괄 저장하고 Vehicle_History(출처: 수동)에 기록합니다. (차량 마스터 열에는 반영하지 않음)`)});
      return mk('tr', {'data-vessel':y.vessel},
        mk('td', null, mk('b', null, y.vessel), mk('div', {class:'muted small'}, `${y.carrier} · ${y.kind==='transit'?tx('운송중'):tx('선적 예정')}`)),
        mk('td', {class:'mono'}, vIn(y, 'bl', 'bl_no', 'B/L No', 'text', tx('미확정'), mk('span', {class:'muted'}, tx('미확정')))),
        mk('td', {class:'mono'}, y.shipping, y.kind==='scheduled'? mk('div', {class:'muted small'}, tx('예정')) : null),
        mk('td', {class:'mono'}, y.pl),
        mk('td', {class:'mono'}, vIn(y, 'eta_carrier', 'eta_from_eukor_pirt', 'ETA From EUKOR/PIRT', 'date', '', dash())),
        mk('td', {class:'mono'}, vIn(y, 'eta_final', 'ata', 'ATA', 'date', '', mk('span', {class:'muted'}, tx('미입력')))),
        mk('td', null, tsc),
        mk('td', {class:'num'}, mk('b', null, vs.length))); });
    const vessels = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('선박별 현황')), noteEl('S2'), mk('span', {class:'desc'}, tx('ATA = 실제 입항일(구 ETA Final) · TSC 입고일(TSC Arrival Date)은 Editor 수기 입력(Key-in)')), mk('span', {class:'spacer'}),
        mk('button', {class:'btn editor-only '+(edit?'primary':''), title: edit? '편집을 종료합니다 (입력값은 입력 즉시 저장됨)' : 'B/L No · ETA 선사 · ATA · TSC 입고일 입력란을 엽니다', onclick:()=>{ SH.edit=!SH.edit; PAGES.shipping.render(root); }}, edit? tx('편집 종료') : tx('편집')),
        mk('button', {class:'btn primary editor-only', id:'btnSched'}, tx('선사 스케줄 일괄 업데이트')), mk('button', {class:'btn', onclick:()=>describe('엑셀 내보내기','선박별 현황 표를 .xlsx로 내보냅니다.')}, tx('엑셀'))),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl clickable compact'},
        mk('thead', null, mk('tr', null, ['Vessel','B/L No','Shipping','Planned Arrival','ETA 선사 (EUKOR/MOL)','ATA','TSC 입고일 (TSC Arrival Date)'].map(x=>mk('th', null, tx(x))), mk('th', {class:'num'}, tx('대수')))),
        mk('tbody', null, rows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, tx('행 클릭 → 해당 선박의 차량 Logistics 목록. ATA 입력은 Logistics 그리드/상세 또는 아래 일괄 업데이트에서.')));

    root.innerHTML = kpi;
    root.append(vessels, monthly); // 10/19 No.8: 선박별 현황을 월별 입항 예정 위로
    qa('tr[data-vessel]', root).forEach(tr=>tr.onclick=()=>location.hash='#/logistics?q='+encodeURIComponent(tr.dataset.vessel));
    const b=el('btnSched'); if(b) b.onclick = ()=>openModal(tx('선사 스케줄 일괄 업데이트'), `<div class="callout">선사(EUKOR/MOL) 스케줄 파일 또는 붙여넣기 → Vessel명 매칭 → ETA 선사·ETA Final 미리보기 → 체크한 선박만 반영. 수신 방식(메일/포털)과 파일 형식은 §15 열린 질문 5번.</div>
      <ol style="padding-left:18px;line-height:1.9"><li>파일 선택(.xlsx/.csv) 또는 스케줄 텍스트 붙여넣기</li><li>Vessel / Voyage 기준 매칭 (매칭 실패 선박은 수동 선택)</li><li>미리보기: 선박별 ETA 선사 before/after, Δ(Pl. arrival 대비), 영향 차량 수</li><li>체크한 선박만 반영 → 해당 차량 eta_carrier 일괄 갱신, ETA Final은 Editor 확인 후 입력</li></ol>
      <table class="tbl"><thead><tr><th>Vessel</th><th>${tx('ETA 선사 (현재)')}</th><th>${tx('ETA 선사 (신규)')}</th><th class="num">${tx('영향 대수')}</th><th>${tx('반영')}</th></tr></thead><tbody>
      ${VOYAGES.slice(0,4).map(y=>`<tr><td>${y.vessel}</td><td class="mono muted">${y.eta_carrier||'—'}</td><td class="mono"><b>${y.eta_carrier? fmtD(addD(parseD(y.eta_carrier),1)) : y.pl}</b></td><td class="num">${y.n}</td><td><input type="checkbox" checked></td></tr>`).join('')}</tbody></table>`,
      `<button class="btn" onclick="closeModal()">${tx('취소')}</button><button class="btn primary" onclick="closeModal();describe('선사 스케줄 반영','체크한 선박의 차량 eta_carrier를 일괄 PATCH하고 Vehicle_History(출처: 수동/일괄)에 기록합니다.')">${tx('반영')}</button>`);
  }
};
