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
      <div class="card kpi"><span class="label">${tx('당월 입항 예정 ({m})', {m:m0})}</span><span class="value num">${num(arrM0)}</span><span class="foot">${tx('ATA → ETA 선사 → Pl. arrival 순')}</span></div>
      <div class="card kpi"><span class="label">${tx('익월 입항 예정 ({m})', {m:m1})}</span><span class="value num">${num(arrM1)}</span><span class="foot">${tx('Shipment scheduled 포함')}</span></div>
    </div>`;

    // 월별 입항 예정: 엑셀 'Arrival Schedule' 피벗 구조 (행: 구분 > 차종 > 모델 / 열: 월 > 선박, 월 Total, Grand Total / 값: 선박별 선적 대수)
    // 기간 (10/22): 'rest' = 이번달~연말, 'year' = 올해 1~12월 · 당월 이전 달은 입항 실적(ATA) · 선박 없는 달도 Total 열 유지(값 없으면 공란)
    const year = BASE_YM.slice(0,4); const range = { from: SH.range==='year'? year+'-01' : BASE_YM, to: year+'-12' };
    const sched = arrivalSchedule(null, range, {unassigned:true}); const {yms, voyByYm} = sched; // 10/27 #14: 미배정 열(Vessel 없이 ETA From TDD만 있는 오더)은 선적·입항 표에서만 // 10/20: 집계·정렬은 data.js arrivalSchedule() 공용 (대시보드 당월 도착 예정과 동일 규칙) · 모델 행 = Vehicle · Model · Type · Axle · Cab · 비표준 옵션(11/4)
    const kOf = y=> y.key||y.vessel; // 열 key: 항차 = 선박명, 입항 실적 = 'YYYY-MM|선박명'
    const cur = k=> (SH.range==='year' && k===BASE_YM)? ' cur' : ''; // 당월 열 강조는 올해 전체 보기에서만 (10/22)
    const shown = k=> (SH.range!=='year' || k===BASE_YM || SH.open.has(k))? voyByYm[k] : []; // 올해 전체: 당월 외 월은 기본 Total만, 머리글 클릭으로 선박 열 펼침 (10/22)
    const togglable = k=> SH.range==='year' && k!==BASE_YM && voyByYm[k].length>0;
    // 수량 셀 클릭 → Logistics 열 필터 링크 (10/22): 선박(쉼표 구분) + Current Status + 실적 열은 ATA 월. 10/27: 링크는 Grand Total 행(선박·월 Total 셀)에만, 모델·그룹 행은 표시 전용 · 0 셀·Grand Total 열은 링크 없음
    // 10/27 #14: 미배정 열 셀 → Vessel 빈 값 + 선적 전 3단계 + 해당 월 ETA From TDD 필터 · 월 Total은 선박분만 연결(미배정 제외, 열 필터는 AND라 OR 조합 불가)
    const cellHref = voys=>{ if(voys.length===1 && voys[0].unassigned) return '#/logistics?vessel=&current_status=' + encodeURIComponent('Ordered(Changeable),Ordered(Fixed),In Production') + '&eta_from_tdd=' + voys[0].key.slice(0,7);
      voys = voys.filter(y=>!y.unassigned); if(!voys.length) return null; const arrived = !!voys[0].arrived;
      const q = { vessel: [...new Set(voys.map(y=>y.vessel))].join(',') };
      q.current_status = arrived? 'Bonded Stock,OH Stock,Sold' : 'In Transit,Shipment scheduled';
      if(arrived) q.ata = voys[0].key.slice(0,7);
      return '#/logistics?' + Object.entries(q).map(([k,v])=>k+'='+encodeURIComponent(v==null? '' : String(v))).join('&'); };
    const cellN = (n, href, title)=> n? mk('td', {class:'num'+(href?' lnk':''), 'data-href':href||null, title: href? (title||tx('클릭 → Logistics 목록')) : null}, num(n)) : mk('td', {class:'num'}); // 0은 공란 (10/22) · title: 미배정 포함 월 Total용 (10/27 #14)
    const sumRow = by=> ({ perV: yms.flatMap(k=>voyByYm[k].map(y=>by[kOf(y)]||0)), perM: yms.map(k=>voyByYm[k].reduce((a,y)=>a+(by[kOf(y)]||0),0)) });
    // row = {by} · linked = Grand Total 행만 true · 당월 Total 셀에 'cur' (당월 열 강조)
    const valueCells = (row, linked)=>{ const by=row.by, s=sumRow(by); const cells=[]; const link = voys=> linked? cellHref(voys) : null;
      yms.forEach((k,mi)=>{ shown(k).forEach(y=>cells.push(cellN(by[kOf(y)]||0, link([y])))); const t=cellN(s.perM[mi], link(voyByYm[k]), voyByYm[k].some(y=>y.unassigned)? tx('클릭 → Logistics 목록 (미배정 제외)') : null); t.classList.add('tot'); if(cur(k)) t.classList.add('cur'); cells.push(t); });
      const g=mk('td', {class:'num gt'}, num(s.perM.reduce((a,b)=>a+b,0))); cells.push(g); return cells; };
    const nCols = 1 + yms.reduce((a,k)=>a+shown(k).length,0) + yms.length + 1;
    const rangeBtn = (r, label)=> mk('button', {class:'btn sm'+(SH.range===r?' primary':''), onclick:()=>{ SH.range=r; SH.open.clear(); PAGES.shipping.render(root); }}, label);
    // 월 Total 머리글: 올해 전체에서 당월 외 월은 클릭으로 선박 열 펼침/접기 (▸/▾)
    const totTh = k=>{ const open = shown(k).length>0, tg = togglable(k);
      return mk('th', {class:'num tot'+cur(k)+(tg?' tg':''), rowspan:2, title: !voyByYm[k].length? tx('해당 월 입항 선박 없음') : tg? (open? tx('클릭 → 선박 열 접기') : tx('클릭 → 선박 열 펼치기')) : null,
        onclick: tg? ()=>{ if(SH.open.has(k)) SH.open.delete(k); else SH.open.add(k); // 10/29 #6: 다시 그린 뒤 세로(창)·가로(표) 스크롤 위치 복원
          const y = window.scrollY, wrap = root.querySelector('.pivot') ? root.querySelector('.pivot').closest('.tbl-wrap') : null, x = wrap? wrap.scrollLeft : 0;
          PAGES.shipping.render(root); window.scrollTo(0, y);
          const wrap2 = root.querySelector('.pivot') ? root.querySelector('.pivot').closest('.tbl-wrap') : null; if(wrap2) wrap2.scrollLeft = x; } : null}, ymLabel(k)+' Total'+(tg? (open?' ▾':' ▸') : '')); };
    const bodyRows = [];
    // 그룹 행(구분·차종)에도 열별 합계 (10/22): 하위 모델 행의 by 합산 · 10/27: 모델·그룹 행 링크 해제
    const sumBy = rows=>{ const by={}; rows.forEach(r=>Object.entries(r.by).forEach(([k,n])=>by[k]=(by[k]||0)+n)); return by; };
    sched.groups.forEach(g=>{ bodyRows.push(mk('tr', {class:'g1'}, mk('td', null, g.gen), valueCells({by:sumBy(g.vehicles.flatMap(t=>t.rows))}, false)));
      g.vehicles.forEach(t=>{ bodyRows.push(mk('tr', {class:'g2'}, mk('td', null, t.vehicle), valueCells({by:sumBy(t.rows)}, false)));
        t.rows.forEach(r=>bodyRows.push(mk('tr', null, mk('td', {class:'model'}, r.label), valueCells(r, false)))); }); });
    const monthly = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('월별 입항 예정·실적 (Arrival Schedule)')), mk('span', {class:'desc'}, tx('행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · 비표준 옵션) · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)') + ' · ' + tx('당월 이전 달은 입항 실적(ATA 기준, Bonded·OH·Sold)') + ' · ' + tx('미배정 = Vessel 없이 ETA From TDD만 있는 오더 (ETA From TDD 월)')),
        mk('span', {class:'spacer'}), mk('div', {class:'btn-group'}, rangeBtn('rest', tx('이번달~연말 ({a}~{b})', {a:ymLabel(BASE_YM), b:ymLabel(range.to)})), rangeBtn('year', tx('올해 전체 ({y})', {y:year})))),
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact pivot fixcol'},
        mk('thead', null,
          mk('tr', null, mk('th', {rowspan:2}, 'Model'), yms.flatMap(k=> shown(k).length? [mk('th', {class:'ym'+cur(k), colspan:shown(k).length}, ymLabel(k)), totTh(k)] : [totTh(k)]), mk('th', {class:'num gt', rowspan:2}, 'Grand Total')),
          mk('tr', null, yms.flatMap(k=>shown(k).map(y=> y.unassigned? mk('th', {class:'num unas'+cur(k), title:tx('Vessel 미배정 · ETA From TDD 월 기준 (Ordered(Changeable) · Ordered(Fixed) · In Production) · Pl. Arrival·Shipping·Vessel 반영 시 선박 열로 이동')}, tx('미배정')) : mk('th', {class:'num'+cur(k), title: y.arrived? tx('입항 실적 (ATA 기준)') : `${y.carrier} · Shipping ${y.shipping}`}, y.vessel)))), // 10/27 #14: 미배정 열은 달의 마지막
          mk('tr', {class:'total'}, mk('td', null, 'Grand Total'), valueCells({by:sched.grand}, true))), // 합계 행은 머리글 안 3번째 줄 — 세로 스크롤 시 고정 (10/22) · 링크는 이 행에만 (10/27)
        mk('tbody', null, bodyRows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, tx('선박의 입항 월은 ATA → ETA 선사 → Pl. arrival(AFAB) 순으로 결정. Grand Total 행의 수량 셀·월 Total 클릭 → 해당 선박 Logistics 목록(같은 건수). 모델 행과 Grand Total 열은 표시 전용.') + ' ' + tx('미배정 셀 클릭 → 해당 월 ETA From TDD · Vessel 빈 값 목록, 미배정이 있는 달의 월 Total 링크는 선박분만.') + (SH.range==='year'? ' '+tx('올해 전체에서 당월 외 월은 Total만 표시 — 월 Total 머리글(▸) 클릭으로 선박 열 펼침.') : '')));

    // 선박별 현황: B/L · Shipping · Pl. arrival · ETA 선사 · ATA · TSC Arrival Date · 대수 · 총중량(11/3 #9: 대수 옆 Key-in, 선박 단위 VOYAGES.gw에만 저장)
    const dash = ()=>mk('span', {class:'muted'}, '—');
    // 선박 단위 입력(B/L No · ETA From EUKOR/PIRT · ATA) → VOYAGES + 해당 선박 차량(Vehicles) 필드에 반영 + Vehicle_History 기록(Store, 10/26).
    // TSC Arrival Date는 10/27부터 별도 경로(tscCell): 입력 = 예정(선박에만 저장) → 배지 클릭으로 확정 시 차량 마스터 반영 + In Transit → Bonded Stock (삭제 시에는 되돌리지 않음)
    const applyToVehicles = (y, voyKey, vehKey, label, val)=>{
      // 11/6: ATA = 실제 입항일 → 기준일 이후 날짜는 저장하지 않고 안내만, 입력란은 저장된 값으로 되돌림
      if(voyKey==='eta_final' && val && val>TODAY_S){
        toast(`ATA 입력 불가 · ${y.vessel}`, `ATA는 실제 입항일이므로 기준일(${TODAY_S}) 이후 날짜는 입력할 수 없습니다. 입항 예정일은 ETA 선사에 입력하세요.`);
        PAGES.shipping.render(root); return;
      }
      Store.voyages.update(y.id, {[voyKey]: val});
      const r = Store.voyages.applyToVehicles(y.vessel, vehKey, val, state.user);
      toast(`${label} 입력 · ${y.vessel}`, `${val||'(삭제)'} → 해당 선박 차량 ${num(r.n)}대의 ${vehKey}에 반영(차량 마스터) · Vehicle_History ${num(r.changed)}건 기록(출처: 수동)`);
      PAGES.shipping.render(root); // 입력 직후 다시 그려 KPI · 월별 입항 예정 · 선박별 현황 단계·대수를 맞춤 (편집 모드 SH.edit 유지)
    };
    const edit = SH.edit && isEditor(); // 편집 모드에서만 입력란, 그 외에는 값 표시
    const vIn = (y, voyKey, vehKey, label, type, ph, empty)=> edit
      ? mk('input', {type, class:'tsc-in', value:y[voyKey]||'', placeholder:ph||'', title:`${label} 입력 → 차량 마스터 반영`, onclick:e=>e.stopPropagation(), onchange:e=>applyToVehicles(y, voyKey, vehKey, label, e.target.value.trim())})
      : mk('span', null, y[voyKey] || empty);
    // TSC 입고일 셀 (10/27): 날짜 + 배지('예정' = 선박에만 저장 · '확정' = 차량 마스터 반영됨). 편집 모드에서 '예정' 배지 클릭 → 확정 모달
    const tscBadge = y=>{
      if(y.tsc_status==='confirmed') return mk('span', {class:'pill ok', style:'margin-left:6px'}, tx('확정'));
      if(y.tsc_status!=='scheduled') return null;
      return edit ? mk('span', {class:'pill warn', style:'margin-left:6px;cursor:pointer', title:tx('클릭 → TSC 입고일 확정'), onclick:e=>{ e.stopPropagation(); openTscConfirm(y); }}, tx('예정'))
                  : mk('span', {class:'pill warn', style:'margin-left:6px'}, tx('예정'));
    };
    const onTscChange = (y, val)=>{
      if(y.tsc_status!=='confirmed'){ // 예정 저장(또는 공란이면 예정 해제) — 차량 마스터 미반영
        Store.voyages.scheduleTsc(y.id, val);
        toast(`TSC 입고일 ${val? '예정 저장' : '예정 해제'} · ${y.vessel}`, val? `${val} · 선박별 현황에만 저장(차량 마스터 미반영) · '예정' 배지 클릭으로 확정` : '예정 날짜를 지웠습니다. 차량 마스터는 변경 없음');
      } else if(val){ // 확정 후 날짜 정정 → 차량 마스터 재반영(이력 기록). 단계는 이미 Bonded Stock이라 전환 0대
        const r = Store.voyages.confirmTsc(y.id, val, state.user);
        toast(`TSC 입고일 정정 · ${y.vessel}`, `${val} → 해당 선박 차량 ${num(r.n)}대의 tsc_arrival_date 재반영 · Vehicle_History ${num(r.changed)}건 기록(출처: 수동)`);
      } else { // 확정 날짜 삭제 → 선박·차량 날짜 모두 삭제, 단계는 되돌리지 않음(기존 규칙)
        Store.voyages.update(y.id, {tsc:'', tsc_status:''});
        const r = Store.voyages.applyToVehicles(y.vessel, 'tsc_arrival_date', '', state.user);
        toast(`TSC 입고일 삭제 · ${y.vessel}`, `해당 선박 차량 ${num(r.n)}대의 tsc_arrival_date 삭제 · Vehicle_History ${num(r.changed)}건 기록(출처: 수동) · 단계는 되돌리지 않음`);
      }
      PAGES.shipping.render(root);
    };
    const tscCell = y=> mk('td', {class:'mono'},
      edit ? mk('input', {type:'date', class:'tsc-in', value:y.tsc||'', title:'TSC 입고일 입력 → 예정 저장(선박 단위) · 배지 클릭으로 확정', onclick:e=>e.stopPropagation(), onchange:e=>onTscChange(y, e.target.value.trim())})
           : mk('span', null, y.tsc || mk('span', {class:'muted'}, tx('미입력'))));
    const tscStatusCell = y=> mk('td', {class:'tscst'}, tscBadge(y)); // 10/27: 예정/확정 배지는 TSC 입고일 바로 옆 독립 열(왼쪽 여백 축소)
    // 11/3 #9: 총중량(kg) Key-in — 편집 모드에서 숫자 입력, 입력 즉시 선박(VOYAGES.gw)에 저장 · 차량 마스터 미반영 · 그 외에는 값 표시
    const hasGw = y=> y.gw!=='' && y.gw!=null;
    const gwCell = y=> mk('td', {class:'num gw'}, edit // gw: 열 간격(균등 배분)은 유지하고 값만 왼쪽 고정 폭 상자 안에서 오른쪽 정렬 (11/4)
      ? mk('input', {type:'number', min:0, step:1, class:'tsc-in', style:'width:110px', value: hasGw(y)? y.gw : '', placeholder:'kg', title:'총중량(kg) 입력 → 선박별 현황에 저장', onclick:e=>e.stopPropagation(), onchange:e=>{
          const val = e.target.value.trim(); Store.voyages.update(y.id, {gw: val===''? '' : Number(val)});
          toast(`총중량 입력 · ${y.vessel}`, val? `${num(Number(val))} kg · 선박별 현황에만 저장(차량 마스터 미반영)` : '총중량을 지웠습니다.'); }})
      : (hasGw(y)? mk('span', {class:'gw-v'}, num(y.gw)) : mk('span', {class:'gw-v muted'}, tx('미입력'))));
    // 확정 모달 (10/27): 기존 날짜 유지 / 새 날짜 입력 중 선택 → Store.voyages.confirmTsc → 차량 마스터 반영 + Bonded Stock 전환
    const openTscConfirm = y=>{
      const vs = VEHICLES.filter(v=>v.vessel===y.vessel), transit = vs.filter(v=>v.current_status==='In Transit').length;
      const dateIn = mk('input', {type:'date', class:'tsc-in', value:y.tsc||'', disabled:true});
      const rKeep = mk('input', {type:'radio', name:'tscMode', value:'keep', checked:true, onchange:()=>{ dateIn.disabled = true; }});
      const rNew = mk('input', {type:'radio', name:'tscMode', value:'new', onchange:()=>{ dateIn.disabled = false; dateIn.focus(); }});
      // 선택 표 (10/27): 한 줄에 [구분 | 날짜 | 선택(라디오, 오른쪽)] · 행 클릭으로도 선택
      const pickRow = (r, label, dateCell)=> mk('tr', {style:'cursor:pointer', onclick:e=>{ if(e.target!==dateIn){ r.checked = true; r.dispatchEvent(new Event('change')); } }},
        mk('td', {style:'white-space:nowrap'}, label), mk('td', {class:'mono', style:'width:170px'}, dateCell), mk('td', {style:'width:60px;text-align:center'}, r));
      const body = mk('div', null,
        mk('div', {class:'callout'}, tx('TSC 입고일은 예정으로 저장되며, 확정 시 해당 선박 차량 {n}대의 TSC Arrival Date에 반영되고 In Transit {m}대가 Bonded Stock으로 전환됩니다.', {n:num(vs.length), m:num(transit)})),
        mk('div', {class:'tbl-wrap', style:'max-width:560px'}, mk('table', {class:'tbl compact'},
          mk('thead', null, mk('tr', null, mk('th', null, tx('구분')), mk('th', null, tx('날짜')), mk('th', {style:'text-align:center'}, tx('선택')))),
          mk('tbody', null,
            pickRow(rKeep, tx('기존 날짜로 확정'), y.tsc),
            pickRow(rNew, tx('새 날짜 입력 후 확정'), dateIn)))));
      openModal(tx('TSC 입고일 확정 — {v}', {v:y.vessel}), '', ' ');
      el('modal-body').replaceChildren(body);
      el('modal-foot').replaceChildren(
        mk('button', {class:'btn', onclick:closeModal}, tx('취소')),
        mk('button', {class:'btn primary', onclick:()=>{
          const date = rKeep.checked? y.tsc : dateIn.value.trim();
          if(!date){ toast('날짜를 입력하세요.'); return; }
          const r = Store.voyages.confirmTsc(y.id, date, state.user); closeModal();
          toast(`TSC 입고일 확정 · ${r.vessel}`, `${r.date} → 해당 선박 차량 ${num(r.n)}대의 tsc_arrival_date 반영(차량 마스터) · Vehicle_History ${num(r.changed)}건 기록(출처: 수동) · In Transit → Bonded Stock 전환 ${num(r.moved)}대 (출처: 규칙)`);
          PAGES.shipping.render(root); }}, tx('확정')));
    };
    // 10/26: '단계' 열 분리(Vessel 다음) = 그 선박 차량의 Current Status(복수면 단계별 대수 병기) · '대수' = 그 선박에 실린 차량 전체(TSC 입력 후 Bonded Stock 포함) — 단계와 대수가 같은 집합
    const stageCell = vs=>{ const by = countBy(vs, v=>v.current_status); const sts = Object.keys(by).sort((a,b)=>STAGES.indexOf(a)-STAGES.indexOf(b));
      return mk('td', null, sts.length? sts.map(s=>mk('span', {class:'pill '+(STAGE_CLASS[s]||'neutral'), style:'margin-right:4px'}, sts.length>1? `${s} ${num(by[s])}` : s)) : mk('span', {class:'muted'}, '—')); };
    const rows = VOYAGES.map(y=>{ const vs=VEHICLES.filter(v=>v.vessel===y.vessel); // 10/19: ETA 불일치 표시 삭제
      return mk('tr', {'data-vessel':y.vessel},
        mk('td', null, mk('b', null, y.vessel), mk('div', {class:'muted small'}, y.carrier)),
        stageCell(vs),
        mk('td', {class:'num'}, mk('b', null, vs.length)),
        gwCell(y), // 11/3 #9: 총중량(Key-in)
        mk('td', {class:'mono'}, vIn(y, 'bl', 'bl_no', 'B/L No', 'text', tx('미확정'), mk('span', {class:'muted'}, tx('미확정')))),
        mk('td', {class:'mono'}, y.shipping, y.kind==='scheduled'? mk('div', {class:'muted small'}, tx('예정')) : null),
        mk('td', {class:'mono'}, y.pl),
        mk('td', {class:'mono'}, vIn(y, 'eta_carrier', 'eta_from_eukor_pirt', 'ETA From EUKOR/PIRT', 'date', '', dash())),
        mk('td', {class:'mono'}, vIn(y, 'eta_final', 'ata', 'ATA', 'date', '', mk('span', {class:'muted'}, tx('미입력')))),
        tscCell(y), tscStatusCell(y)); }); // 10/26 No.9 → 10/27: TSC는 예정/확정 2단계(tscCell + 배지 열)
    const vessels = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('선박별 현황')), noteEl('S2'), mk('span', {class:'desc'}, tx('ATA = 실제 입항일(구 ETA Final) · TSC 입고일 입력 = 예정 저장(선박 단위) · 확정 시 차량 마스터 반영 · 해당 선박 In Transit → Bonded Stock 전환')), mk('span', {class:'spacer'}),
        mk('button', {class:'btn editor-only '+(edit?'primary':''), title: edit? '편집을 종료합니다 (입력값은 입력 즉시 저장됨)' : 'B/L No · ETA 선사 · ATA · TSC 입고일(예정) 입력란을 엽니다', onclick:()=>{ SH.edit=!SH.edit; PAGES.shipping.render(root); }}, edit? tx('편집 종료') : tx('편집'))), // 10/27: '선사 스케줄 일괄 업데이트'·'엑셀' 버튼 삭제
      mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact even'+(edit? '' : ' clickable')}, // 편집 모드에서는 행 클릭 이동 없음 (10/26) · even: 열 너비 = 열 최대 내용 폭 + 남는 폭 균등 배분 (evenCols, 10/27)
        mk('thead', null, mk('tr', null, ['Vessel','단계'].map(x=>mk('th', null, tx(x))), mk('th', {class:'num'}, tx('대수')), mk('th', {class:'num'}, tx('총중량 (kg)')), ['B/L No','Shipping','Planned Arrival','ETA 선사 (EUKOR/MOL)','ATA','TSC 입고일 (TSC Arrival Date)'].map(x=>mk('th', null, tx(x))), mk('th', {class:'tscst'}, ''))),
        mk('tbody', null, rows))),
      mk('div', {class:'muted small', style:'margin-top:6px'}, tx('행 클릭 → 해당 선박의 차량 Logistics 목록. ATA 입력은 편집 모드에서 (기준일 이후 날짜 불가).')));

    root.innerHTML = kpi;
    root.append(vessels, monthly); // 10/19 No.8: 선박별 현황을 월별 입항 예정 위로
    evenCols(q('table.tbl.even', vessels)); // 10/27: 열 너비 = 각 열 최대 내용 폭 + 남는 폭 균등 배분 (화면에 붙은 뒤 측정)
    // 편집 모드에서는 행 클릭으로 이동하지 않음 (10/26). 대시보드가 #app에 위임한 tr[data-vessel] 클릭 핸들러까지 막아야 하므로 전파를 끊는다
    qa('tr[data-vessel]', root).forEach(tr=>tr.onclick = edit? e=>e.stopPropagation() : ()=>{ location.hash='#/logistics?q='+encodeURIComponent(tr.dataset.vessel); });
    qa('td.lnk[data-href]', monthly).forEach(td=>td.onclick=()=>location.hash=td.dataset.href); // 월별 입항 Grand Total 행 수량 셀 → Logistics (10/22 · 10/27 범위 축소)
  }
};
// 선박별 현황 열 너비 (10/27): 표를 내용 폭(auto)으로 한 번 그려 열별 최대 내용 폭을 재고, 카드 남는 폭을 모든 열에 같은 크기로 더해 열 간격을 균등하게 맞춘다 (table-layout:fixed + th width)
function evenCols(tbl){
  if(!tbl || !tbl.isConnected) return;
  const wrap = tbl.parentElement; const ths = qa('thead th', tbl);
  tbl.style.tableLayout='auto'; tbl.style.width='auto'; ths.forEach(th=>{ th.style.width=''; });
  const ws = ths.map(th=>th.getBoundingClientRect().width); const total = ws.reduce((a,b)=>a+b, 0);
  if(!total) return; // 아직 화면에 없으면(폭 0) 기본 레이아웃 유지
  const extra = Math.max(0, (wrap.clientWidth - total) / ths.length);
  ths.forEach((th,i)=>{ th.style.width = (ws[i]+extra)+'px'; });
  tbl.style.tableLayout='fixed'; tbl.style.width='100%';
}
