'use strict';
/* ===== 선적 · 입항 (S1~S2) ===== */
const SH = { edit:false, range:'rest', open:new Set() }; // 선박별 현황 편집 모드: '편집' 클릭 후에만 입력란 표시 (10/15 No.20) · range: 월별 입항 예정 기간 'rest' = 이번달~연말(기본) · 'year' = 올해 전체 (10/22) · open: 올해 전체에서 선박 열을 펼친 월
window.addEventListener('hashchange', ()=>{ SH.edit=false; SH.range='rest'; SH.open.clear(); });
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
    // 기간 (10/22): 'rest' = 이번달~연말, 'year' = 올해 1~12월 · 당월 이전 달은 입항 실적(ATA) · 선박 없는 달도 Total 열 유지(값 없으면 공란)
    const year = BASE_YM.slice(0,4); const range = { from: SH.range==='year'? year+'-01' : BASE_YM, to: year+'-12' };
    const sched = arrivalSchedule(null, range); const {yms, voyByYm} = sched; // 10/20: 집계·정렬은 data.js arrivalSchedule() 공용 (대시보드 당월 도착 예정과 동일 규칙) · 모델 행 = Vehicle · Model · Type · Axle · Cab · Option
    const kOf = y=> y.key||y.vessel; // 열 key: 항차 = 선박명, 입항 실적 = 'YYYY-MM|선박명'
    const cur = k=> (SH.range==='year' && k===BASE_YM)? ' cur' : ''; // 당월 열 강조는 올해 전체 보기에서만 (10/22)
    const shown = k=> (SH.range!=='year' || k===BASE_YM || SH.open.has(k))? voyByYm[k] : []; // 올해 전체: 당월 외 월은 기본 Total만, 머리글 클릭으로 선박 열 펼침 (10/22)
    const togglable = k=> SH.range==='year' && k!==BASE_YM && voyByYm[k].length>0;
    // 수량 셀 클릭 → Logistics 열 필터 링크 (10/22): 선박(쉼표 구분) + 모델 6속성 + Current Status + 실적 열은 ATA 월. 0 셀·Grand Total·머리글 합계 행은 링크 없음
    const cellHref = (voys, attrs)=>{ if(!voys.length || !attrs) return null; const arrived = !!voys[0].arrived;
      const q = { vessel: [...new Set(voys.map(y=>y.vessel))].join(',') }; Object.entries(attrs).forEach(([k,v])=>q[k] = v==null? '' : v); // attrs: 모델 행 = 6속성 · 그룹 행 = gen(+vehicle)
      q.current_status = arrived? 'Bonded Stock,OH Stock,Sold' : 'In Transit,Shipment scheduled';
      if(arrived) q.ata = voys[0].key.slice(0,7);
      return '#/logistics?' + Object.entries(q).map(([k,v])=>k+'='+encodeURIComponent(v==null? '' : String(v))).join('&'); };
    const cellN = (n, href)=> n? mk('td', {class:'num'+(href?' lnk':''), 'data-href':href||null, title: href? tx('클릭 → Logistics 목록') : null}, num(n)) : mk('td', {class:'num'}); // 0은 공란 (10/22)
    const sumRow = by=> ({ perV: yms.flatMap(k=>voyByYm[k].map(y=>by[kOf(y)]||0)), perM: yms.map(k=>voyByYm[k].reduce((a,y)=>a+(by[kOf(y)]||0),0)) });
    // row = {by, attrs} · noLink = 머리글 합계 행 · 당월 Total 셀에 'cur' (당월 열 강조)
    const valueCells = (row, noLink)=>{ const by=row.by, s=sumRow(by); const cells=[]; const link = voys=> noLink? null : cellHref(voys, row.attrs);
      yms.forEach((k,mi)=>{ shown(k).forEach(y=>cells.push(cellN(by[kOf(y)]||0, link([y])))); const t=cellN(s.perM[mi], link(voyByYm[k])); t.classList.add('tot'); if(cur(k)) t.classList.add('cur'); cells.push(t); });
      const g=mk('td', {class:'num gt'}, num(s.perM.reduce((a,b)=>a+b,0))); cells.push(g); return cells; };
    const nCols = 1 + yms.reduce((a,k)=>a+shown(k).length,0) + yms.length + 1;
    const rangeBtn = (r, label)=> mk('button', {class:'btn sm'+(SH.range===r?' primary':''), onclick:()=>{ SH.range=r; SH.open.clear(); PAGES.shipping.render(root); }}, label);
    // 월 Total 머리글: 올해 전체에서 당월 외 월은 클릭으로 선박 열 펼침/접기 (▸/▾)
    const totTh = k=>{ const open = shown(k).length>0, tg = togglable(k);
      return mk('th', {class:'num tot'+cur(k)+(tg?' tg':''), rowspan:2, title: !voyByYm[k].length? tx('해당 월 입항 선박 없음') : tg? (open? tx('클릭 → 선박 열 접기') : tx('클릭 → 선박 열 펼치기')) : null,
        onclick: tg? ()=>{ if(SH.open.has(k)) SH.open.delete(k); else SH.open.add(k); PAGES.shipping.render(root); } : null}, ymLabel(k)+' Total'+(tg? (open?' ▾':' ▸') : '')); };
    const bodyRows = [];
    // 그룹 행(구분·차종)에도 열별 합계와 링크 (10/22): 하위 모델 행의 by 합산 · 링크 필터는 gen(구분) / gen+vehicle(차종)
    const sumBy = rows=>{ const by={}; rows.forEach(r=>Object.entries(r.by).forEach(([k,n])=>by[k]=(by[k]||0)+n)); return by; };
    sched.groups.forEach(g=>{ bodyRows.push(mk('tr', {class:'g1'}, mk('td', null, g.gen), valueCells({by:sumBy(g.vehicles.flatMap(t=>t.rows)), attrs:{gen:g.gen}})));
      g.vehicles.forEach(t=>{ bodyRows.push(mk('tr', {class:'g2'}, mk('td', null, t.vehicle), valueCells({by:sumBy(t.rows), attrs:{gen:g.gen, vehicle:t.vehicle}})));
        t.rows.forEach(r=>bodyRows.push(mk('tr', null, mk('td', {class:'model'}, r.label), valueCells(r)))); }); });
    const monthly = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('월별 입항 예정·실적 (Arrival Schedule)')), mk('span', {class:'desc'}, tx('행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · Option) · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)') + ' · ' + tx('당월 이전 달은 입항 실적(ATA 기준, Bonded·OH·Sold)')),
        mk('span', {class:'spacer'}), mk('div', {class:'btn-group'}, rangeBtn('rest', tx('이번달~연말 ({a}~{b})', {a:ymLabel(BASE_YM), b:ymLabel(range.to)})), rangeBtn('year', tx('올해 전체 ({y})', {y:year})))),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact pivot fixcol'},
        mk('thead', null,
          mk('tr', null, mk('th', {rowspan:2}, 'Model'), yms.flatMap(k=> shown(k).length? [mk('th', {class:'ym'+cur(k), colspan:shown(k).length}, ymLabel(k)), totTh(k)] : [totTh(k)]), mk('th', {class:'num gt', rowspan:2}, 'Grand Total')),
          mk('tr', null, yms.flatMap(k=>shown(k).map(y=>mk('th', {class:'num'+cur(k), title: y.arrived? tx('입항 실적 (ATA 기준)') : `${y.carrier} · Shipping ${y.shipping}`}, y.vessel)))),
          mk('tr', {class:'total'}, mk('td', null, 'Grand Total'), valueCells({by:sched.grand}, true))), // 합계 행은 머리글 안 3번째 줄 — 세로 스크롤 시 고정 (10/22)
        mk('tbody', null, bodyRows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, tx('선박의 입항 월은 ATA → ETA 선사 → Pl. arrival(AFAB) 순으로 결정. 수량 셀·월 Total 클릭 → 해당 선박·모델 Logistics 목록(같은 건수). Grand Total은 표시 전용.') + (SH.range==='year'? ' '+tx('올해 전체에서 당월 외 월은 Total만 표시 — 월 Total 머리글(▸) 클릭으로 선박 열 펼침.') : '')));

    // 선박별 현황: B/L · Shipping · Pl. arrival · ETA 선사 · ATA · TSC Arrival Date · 대수
    const dash = ()=>mk('span', {class:'muted'}, '—');
    // 선박 단위 입력(B/L No · ETA From EUKOR/PIRT · ATA · TSC Arrival Date) → VOYAGES + 해당 선박 차량(Vehicles) 필드에 반영 + Vehicle_History 기록(Store, 10/26).
    // TSC Arrival Date 입력 시 해당 선박 In Transit 차량 → Bonded Stock (10/26 No.8 · 삭제 시에는 되돌리지 않음)
    const applyToVehicles = (y, voyKey, vehKey, label, val)=>{
      Store.voyages.update(y.id, {[voyKey]: val});
      const r = Store.voyages.applyToVehicles(y.vessel, vehKey, val, state.user);
      const moved = (vehKey==='tsc_arrival_date' && val) ? Store.voyages.bondedByTsc(y.vessel, state.user) : 0;
      toast(`${label} 입력 · ${y.vessel}`, `${val||'(삭제)'} → 해당 선박 차량 ${num(r.n)}대의 ${vehKey}에 반영(차량 마스터) · Vehicle_History ${num(r.changed)}건 기록(출처: 수동)${moved? ` · In Transit → Bonded Stock 전환 ${num(moved)}대 (출처: 규칙)` : ''}`);
      PAGES.shipping.render(root); // 입력 직후 다시 그려 KPI · 월별 입항 예정 · 선박별 현황 단계·대수를 맞춤 (편집 모드 SH.edit 유지)
    };
    const edit = SH.edit && isEditor(); // 편집 모드에서만 입력란, 그 외에는 값 표시
    const vIn = (y, voyKey, vehKey, label, type, ph, empty)=> edit
      ? mk('input', {type, class:'tsc-in', value:y[voyKey]||'', placeholder:ph||'', title:`${label} 입력 → 차량 마스터 반영`, onclick:e=>e.stopPropagation(), onchange:e=>applyToVehicles(y, voyKey, vehKey, label, e.target.value.trim())})
      : mk('span', null, y[voyKey] || empty);
    // 10/26: '단계' 열 분리(Vessel 다음) = 그 선박 차량의 Current Status(복수면 단계별 대수 병기) · '대수' = 그 선박에 실린 차량 전체(TSC 입력 후 Bonded Stock 포함) — 단계와 대수가 같은 집합
    const stageCell = vs=>{ const by = countBy(vs, v=>v.current_status); const sts = Object.keys(by).sort((a,b)=>STAGES.indexOf(a)-STAGES.indexOf(b));
      return mk('td', null, sts.length? sts.map(s=>mk('span', {class:'pill '+(STAGE_CLASS[s]||'neutral'), style:'margin-right:4px'}, sts.length>1? `${s} ${num(by[s])}` : s)) : mk('span', {class:'muted'}, '—')); };
    const rows = VOYAGES.map(y=>{ const vs=VEHICLES.filter(v=>v.vessel===y.vessel); // 10/19: ETA 불일치 표시 삭제
      return mk('tr', {'data-vessel':y.vessel},
        mk('td', null, mk('b', null, y.vessel), mk('div', {class:'muted small'}, y.carrier)),
        stageCell(vs),
        mk('td', {class:'num'}, mk('b', null, vs.length)),
        mk('td', {class:'mono'}, vIn(y, 'bl', 'bl_no', 'B/L No', 'text', tx('미확정'), mk('span', {class:'muted'}, tx('미확정')))),
        mk('td', {class:'mono'}, y.shipping, y.kind==='scheduled'? mk('div', {class:'muted small'}, tx('예정')) : null),
        mk('td', {class:'mono'}, y.pl),
        mk('td', {class:'mono'}, vIn(y, 'eta_carrier', 'eta_from_eukor_pirt', 'ETA From EUKOR/PIRT', 'date', '', dash())),
        mk('td', {class:'mono'}, vIn(y, 'eta_final', 'ata', 'ATA', 'date', '', mk('span', {class:'muted'}, tx('미입력')))),
        mk('td', {class:'mono'}, vIn(y, 'tsc', 'tsc_arrival_date', 'TSC Arrival Date', 'date', '', mk('span', {class:'muted'}, tx('미입력'))))); }); // 10/26 No.9: B/L·ETA·ATA와 같은 경로로 차량 마스터 반영
    const vessels = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('선박별 현황')), noteEl('S2'), mk('span', {class:'desc'}, tx('ATA = 실제 입항일(구 ETA Final) · TSC Arrival Date 입력 시 차량 마스터 반영 · 해당 선박 In Transit → Bonded Stock 전환')), mk('span', {class:'spacer'}),
        mk('button', {class:'btn editor-only '+(edit?'primary':''), title: edit? '편집을 종료합니다 (입력값은 입력 즉시 저장됨)' : 'B/L No · ETA 선사 · ATA · TSC Arrival Date 입력란을 엽니다', onclick:()=>{ SH.edit=!SH.edit; PAGES.shipping.render(root); }}, edit? tx('편집 종료') : tx('편집')),
        mk('button', {class:'btn primary editor-only', id:'btnSched'}, tx('선사 스케줄 일괄 업데이트')), mk('button', {class:'btn', onclick:()=>describe('엑셀 내보내기','선박별 현황 표를 .xlsx로 내보냅니다.')}, tx('엑셀'))),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact'+(edit? '' : ' clickable')}, // 편집 모드에서는 행 클릭 이동 없음 (10/26)
        mk('thead', null, mk('tr', null, ['Vessel','단계'].map(x=>mk('th', null, tx(x))), mk('th', {class:'num'}, tx('대수')), ['B/L No','Shipping','Planned Arrival','ETA 선사 (EUKOR/MOL)','ATA','TSC 입고일 (TSC Arrival Date)'].map(x=>mk('th', null, tx(x))))),
        mk('tbody', null, rows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, tx('행 클릭 → 해당 선박의 차량 Logistics 목록. ATA 입력은 Logistics 그리드/상세 또는 아래 일괄 업데이트에서.')));

    root.innerHTML = kpi;
    root.append(vessels, monthly); // 10/19 No.8: 선박별 현황을 월별 입항 예정 위로
    // 편집 모드에서는 행 클릭으로 이동하지 않음 (10/26). 대시보드가 #app에 위임한 tr[data-vessel] 클릭 핸들러까지 막아야 하므로 전파를 끊는다
    qa('tr[data-vessel]', root).forEach(tr=>tr.onclick = edit? e=>e.stopPropagation() : ()=>{ location.hash='#/logistics?q='+encodeURIComponent(tr.dataset.vessel); });
    qa('td.lnk[data-href]', monthly).forEach(td=>td.onclick=()=>location.hash=td.dataset.href); // 월별 입항 수량 셀 → Logistics (10/22)
    const b=el('btnSched'); if(b) b.onclick = ()=>openModal(tx('선사 스케줄 일괄 업데이트'), `<div class="callout">선사(EUKOR/MOL) 스케줄 파일 또는 붙여넣기 → Vessel명 매칭 → ETA 선사·ETA Final 미리보기 → 체크한 선박만 반영. 수신 방식(메일/포털)과 파일 형식은 §15 열린 질문 5번.</div>
      <ol style="padding-left:18px;line-height:1.9"><li>파일 선택(.xlsx/.csv) 또는 스케줄 텍스트 붙여넣기</li><li>Vessel / Voyage 기준 매칭 (매칭 실패 선박은 수동 선택)</li><li>미리보기: 선박별 ETA 선사 before/after, Δ(Pl. arrival 대비), 영향 차량 수</li><li>체크한 선박만 반영 → 해당 차량 eta_carrier 일괄 갱신, ETA Final은 Editor 확인 후 입력</li></ol>
      <table class="tbl"><thead><tr><th>Vessel</th><th>${tx('ETA 선사 (현재)')}</th><th>${tx('ETA 선사 (신규)')}</th><th class="num">${tx('영향 대수')}</th><th>${tx('반영')}</th></tr></thead><tbody>
      ${VOYAGES.slice(0,4).map(y=>`<tr><td>${y.vessel}</td><td class="mono muted">${y.eta_carrier||'—'}</td><td class="mono"><b>${y.eta_carrier? fmtD(addD(parseD(y.eta_carrier),1)) : y.pl}</b></td><td class="num">${y.n}</td><td><input type="checkbox" checked></td></tr>`).join('')}</tbody></table>`,
      `<button class="btn" onclick="closeModal()">${tx('취소')}</button><button class="btn primary" onclick="closeModal();describe('선사 스케줄 반영','체크한 선박의 차량 eta_carrier를 일괄 PATCH하고 Vehicle_History(출처: 수동/일괄)에 기록합니다.')">${tx('반영')}</button>`);
  }
};
