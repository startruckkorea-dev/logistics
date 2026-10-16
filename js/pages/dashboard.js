'use strict';
/* ===== 대시보드 (D1~D6) ===== */
PAGES.dashboard = {
  title:'대시보드', sub:'차량 주문·재고 흐름 · 기준일 '+TODAY_S,
  render(root){
    const byStage = countBy(VEHICLES, v=>v.current_status);
    const year = BASE_YM.slice(0,4);

    // D1 카드 8종: Ordered(Changeable) → Ordered(Fixed) → In Production → Shipment scheduled → In Transit → Arrival(당월 도착 예정) → Stock(Bonded + OH) → Sold(YTD)
    const transit = VEHICLES.filter(v=>v.current_status==='In Transit');
    const moving = VEHICLES.filter(v=>v.current_status==='In Transit'||v.current_status==='Shipment scheduled');
    const arrival = moving.filter(v=>expectedArrivalYm(v)===BASE_YM);
    const stockVs = VEHICLES.filter(v=>v.current_status==='Bonded Stock'||v.current_status==='OH Stock');
    const soldYtd = VEHICLES.filter(v=>v.current_status==='Sold'&&v.sales_month.startsWith(year));
    const cards = [
      {label:'Ordered(Changeable)', n:byStage['Ordered(Changeable)']||0, color:STAGE_COLOR['Ordered(Changeable)'], sub:`PM ≥ ${ymAdd(BASE_YM,2)} · 신규 ${VEHICLES.filter(v=>v.current_status==='Ordered(Changeable)'&&!v.vin_no).length}`, href:'#/logistics?stage=Ordered(Changeable)', to:'Logistics 목록 (Ordered(Changeable))'},
      {label:'Ordered(Fixed)', n:byStage['Ordered(Fixed)']||0, color:STAGE_COLOR['Ordered(Fixed)'], sub:`PM ${ymAdd(BASE_YM,1)} · 신규 ${VEHICLES.filter(v=>v.current_status==='Ordered(Fixed)'&&!v.vin_no).length}`, href:'#/logistics?stage=Ordered(Fixed)', to:'Logistics 목록 (Ordered(Fixed))'},
      {label:'In Production', n:byStage['In Production']||0, color:STAGE_COLOR['In Production'], sub:`생산월 경과 ${VEHICLES.filter(v=>v.current_status==='In Production'&&v.pm<BASE_YM).length} 포함`, href:'#/logistics?stage=In%20Production', to:'Logistics 목록 (In Production)'},
      {label:'Shipment scheduled', n:byStage['Shipment scheduled']||0, color:STAGE_COLOR['Shipment scheduled'], sub:`선박 ${new Set(VEHICLES.filter(v=>v.current_status==='Shipment scheduled').map(v=>v.vessel)).size}척 배정`, href:'#/logistics?stage=Shipment%20scheduled', to:'Logistics 목록 (Shipment scheduled)'},
      {label:'In Transit', n:transit.length, color:STAGE_COLOR['In Transit'], sub:`Shipped / Invoiced · ${new Set(transit.map(v=>v.vessel)).size}척`, href:'#/logistics?stage=In%20Transit', to:'Logistics 목록 (In Transit)'},
      {label:`Arrival (${BASE_YM.slice(5)}월 도착 예정)`, n:arrival.length, color:'var(--st-sched)', sub:`ATA → ETA → Pl. arrival 기준 · 선박 ${new Set(arrival.map(v=>v.vessel)).size}척`, href:'#/shipping', to:'선적·입항'},
      {label:'Stock (Bonded + OH)', n:stockVs.length, color:STAGE_COLOR['Bonded Stock'], sub:`Bonded ${num(byStage['Bonded Stock']||0)} · OH ${num(byStage['OH Stock']||0)}`, href:'#/stock', to:'재고현황'},
      {label:`Sold (${year} YTD)`, n:soldYtd.length, color:STAGE_COLOR['Sold'], sub:`전월 ${num(byMonth('sales_month')[ymAdd(BASE_YM,-1)]||0)} · 누적 ${num(byStage['Sold']||0)}`, href:'#/logistics?stage=Sold', to:'Logistics 목록 (Sold)'},
    ];
    const flow = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '차량 주문·재고 흐름'), noteEl('D1'),
        mk('span', {class:'desc'}, `8개 지표 · Ordered(Changeable) → Ordered(Fixed) → In Production → Shipment scheduled → In Transit → Arrival → Stock → Sold · 전체 ${num(VEHICLES.length - (byStage['Cancelled']||0))} (+ Cancelled ${byStage['Cancelled']||0})`), mk('span', {class:'spacer'}),
        mk('span', {class:'stage-box cancel', style:'padding:4px 10px;display:inline-flex;gap:8px;align-items:center', 'data-stage':'Cancelled'}, mk('span', {class:'n num', style:'font-size:16px'}, byStage['Cancelled']||0), mk('span', {class:'l', style:'margin:0'}, 'Cancelled'))),
      mk('div', {class:'flow'}, cards.map((c,i)=>mk('div', {class:'stage-box', style:`--c:${c.color}`, 'data-href':c.href, title:'클릭 → '+c.to},
        mk('div', {class:'n num'}, num(c.n)), mk('div', {class:'l'}, c.label), mk('div', {class:'s'}, c.sub), i<cards.length-1? mk('span', {class:'arrow'}, '›') : null))),
      mk('div', {class:'muted small', style:'margin-top:8px'}, '카드 클릭 시 관련 목록으로 이동합니다.'));

    // D2 월별 추이: 당해 1월 ~ 익년 12월 24개월 한 행
    const months = []; for(let i=0;i<24;i++) months.push(ymAdd(year+'-01', i));
    const baseIdx = months.indexOf(BASE_YM);
    const prod = byMonth('pm', v=>v.current_status!=='Cancelled');
    const arr = {}; VEHICLES.forEach(v=>{ if(v.current_status==='Cancelled') return; const m=expectedArrivalYm(v); if(m) arr[m]=(arr[m]||0)+1; });
    const sales = byMonth('sales_month');
    const recent6 = months.slice(baseIdx-5, baseIdx+1).map(m=>sales[m]||0); const avg6 = Math.round(recent6.reduce((a,b)=>a+b,0)/6);
    const salesVals = months.map((m,i)=> i<=baseIdx ? (sales[m]||0) : avg6);
    const chart = barChartEl({months, baseIdx, series:[
      {name:'Production (PM final)', color:'var(--s4)', values:months.map(m=>prod[m]||0)},
      {name:'Arrival (ATA / 예정)', color:'var(--s1)', values:months.map(m=>arr[m]||0)},
      {name:'Sales (판매 / 계획)', color:'var(--s3)', values:salesVals},
    ]});
    const trend = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '월별 생산 / 입항 / 판매 추이'), noteEl('D2'), mk('span', {class:'desc'}, `${monEn(months[0])} ${months[0].slice(0,4)} ~ ${monEn(months[23])} ${months[23].slice(0,4)} (24개월) · 기준월 ${monEn(BASE_YM)} ${year} 강조, 이후 음영`)),
      chart,
      mk('div', {class:'muted small', style:'margin-top:6px'}, `Sales 계획 = 최근 6개월 평균(당월 포함) ${avg6}대. KUFRI에서 입력한 sales_plan이 있으면 그 값을 사용.`));

    // D3 입항 예정 선박: 입항예정 = Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA, ATA 후 2일까지 표시
    const vy = VOYAGES.filter(y=>!y.eta_final || diffDays(TODAY, parseD(y.eta_final))<=2)
      .map(y=>({...y, cnt:VEHICLES.filter(v=>v.vessel===y.vessel && (v.current_status==='In Transit'||v.current_status==='Shipment scheduled')).length}));
    const arrCell = y=>{ const [d, tag] = y.eta_final? [y.eta_final,'ATA'] : y.eta_carrier? [y.eta_carrier,'ETA'] : [y.pl,'Pl.'];
      return mk('td', {class:'mono'}, tag==='ATA'? mk('b', null, d) : d, ' ', mk('span', {class:'pill '+(tag==='ATA'?'st-oh':tag==='ETA'?'st-transit':'neutral'), title: tag==='ATA'?'실제 입항일':tag==='ETA'?'ETA (EUKOR, 평택)':'Planned Arrival'}, tag)); };
    const ships = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '입항 예정 선박'), noteEl('D3'), mk('span', {class:'desc'}, 'Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환 · ATA 후 2일까지 표시'), mk('span', {class:'spacer'}), mk('a', {href:'#/shipping'}, '선적·입항 →')),
      mk('table', {class:'tbl clickable'},
        mk('thead', null, mk('tr', null, ['Vessel','단계','Shipping','입항 예정'].map(t=>mk('th', null, t)), mk('th', {class:'num'}, '대수'))),
        mk('tbody', null, vy.map(y=>mk('tr', {'data-vessel':y.vessel},
          mk('td', null, mk('b', null, y.vessel), ' ', mk('span', {class:'muted small'}, y.carrier)),
          mk('td', null, stagePillEl(y.kind==='transit'?'In Transit':'Shipment scheduled')),
          mk('td', {class:'mono'}, y.shipping, y.kind==='scheduled'? [' ', mk('span', {class:'muted small'}, '(예정)')] : null),
          arrCell(y),
          mk('td', {class:'num'}, mk('b', null, y.cnt)))))));

    // D4 차종별 파이프라인 (7단계 · Ordered(Dummy)·Rejected·Sold 제외)
    const pipeStages = STAGES.slice(2,9);
    const byVeh = VEHICLE_TYPES.map(t=>{ const vs=VEHICLES.filter(v=>v.vehicle===t && pipeStages.includes(v.current_status)); const c=countBy(vs,v=>v.current_status); return {t, total:vs.length, segs:pipeStages.map((s,i)=>({name:s, color:SERIES[i], value:c[s]||0}))}; });
    const maxVeh = Math.max(...byVeh.map(b=>b.total)); hbar._grand = byVeh.reduce((a,b)=>a+b.total,0);
    const pipe = `<div class="card"><div class="card-h"><h2>차종별 파이프라인</h2>${note('D4')}<span class="desc">7단계 (Sold·Cancelled 제외) · 합계 ${num(hbar._grand)}</span></div>
      <div class="hbars">${byVeh.map(b=>hbar(b.t, b.segs, b.total, maxVeh)).join('')}</div>
      <div class="legend">${pipeStages.map((s,i)=>`<span><span class="sw" style="background:${SERIES[i]}"></span>${s}</span>`).join('')}</div></div>`;

    // (재고 연령 분포 D5는 2026-10-12 검토에서 삭제)
    const stock = stockVs;

    // D6 연식별 재고 (신규): 세로 누적 막대, 연식 최신순(왼쪽부터), 누적 = Tractor / Rigid(HDT+MDT) / Tipper / BB(Export+Domestic)
    const vGroup = v=> v.vehicle; // Vehicle 값 4종(Tractor · Rigid · Tipper · BB)과 동일
    const myCats = [...new Set(stock.map(v=>v.model_year))].sort((a,b)=>Number(b.slice(2))-Number(a.slice(2)));
    const groups = [{name:'Tractor', key:'Tractor', color:SERIES[0]}, {name:'Rigid (HDT + MDT)', key:'Rigid', color:SERIES[1]}, {name:'Tipper', key:'Tipper', color:SERIES[2]}, {name:'BB (Export + Domestic)', key:'BB', color:SERIES[3]}];
    const myChart = stackChartEl({cats:myCats, series:groups.map(g=>({name:g.name, color:g.color, values:myCats.map(my=>stock.filter(v=>v.model_year===my && vGroup(v)===g.key).length)}))});
    const myCard = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '연식별 재고'), noteEl('D6'), mk('span', {class:'desc'}, `Bonded + OH Stock ${num(stock.length)}대 · 연식(MY) 최신순 · 누적 = Vehicle 4종`)),
      mk('div', {style:'max-width:640px'}, myChart));

    root.innerHTML = `<div class="grid2"><div id="d3slot"></div>${pipe}</div>`;
    root.prepend(flow, trend);
    el('d3slot').replaceWith(ships);
    root.append(myCard);
    root.addEventListener('click', e=>{
      const hb=e.target.closest('[data-href]'); if(hb){ location.hash=hb.dataset.href; return; }
      const sb=e.target.closest('[data-stage]'); if(sb){ location.hash='#/logistics?stage='+encodeURIComponent(sb.dataset.stage); return; }
      const cb=e.target.closest('[data-cls]'); if(cb){ location.hash='#/logistics?cls='+encodeURIComponent(cb.dataset.cls); return; }
      const vr=e.target.closest('tr[data-vessel]'); if(vr){ location.hash='#/logistics?q='+encodeURIComponent(vr.dataset.vessel); }
    });
  }
};
function byMonth(field, filter){ const m={}; VEHICLES.forEach(v=>{ if(filter&&!filter(v)) return; const k=(v[field]||'').slice(0,7); if(k) m[k]=(m[k]||0)+1; }); return m; }
