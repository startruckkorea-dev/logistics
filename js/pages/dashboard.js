'use strict';
/* ===== 대시보드 (D1~D6) ===== */
PAGES.dashboard = {
  title:'대시보드', sub:'차량 주문·재고 흐름 · 기준일 '+TODAY_S,
  render(root){
    const byStage = countBy(VEHICLES, v=>v.current_status);
    const year = BASE_YM.slice(0,4);

    // D1 카드 7종 (10/19 No.10~13: 한글 카드명 · Cancelled 카드 삭제 · In Production + Shipment scheduled → 확정 재고(Factory Stock) · 카드별 아이콘)
    // 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중 → 당월 입항 예정 → 재고(Bonded + OH) → 판매(YTD)
    const transit = VEHICLES.filter(v=>v.current_status==='In Transit');
    const moving = VEHICLES.filter(v=>v.current_status==='In Transit'||v.current_status==='Shipment scheduled');
    const arrival = moving.filter(v=>expectedArrivalYm(v)===BASE_YM);
    const stockVs = VEHICLES.filter(v=>v.current_status==='Bonded Stock'||v.current_status==='OH Stock');
    const soldYtd = VEHICLES.filter(v=>v.current_status==='Sold'&&v.sales_month.startsWith(year));
    const factoryStages = ['In Production','Shipment scheduled'];
    const cards = [
      // 3행(sub) 문구 (10/19 No.5): 확정 재고·재고 유지 · 당월 입항 예정·판매는 괄호 안 문구만 · 그 외 삭제
      {label:'수정 가능 주문', icon:'changeable', n:byStage['Ordered(Changeable)']||0, color:STAGE_COLOR['Ordered(Changeable)'], sub:'', href:'#/logistics?stage=Ordered(Changeable)', to:'Logistics 목록 (Ordered(Changeable))'},
      {label:'확정 주문', icon:'fixed', n:byStage['Ordered(Fixed)']||0, color:STAGE_COLOR['Ordered(Fixed)'], sub:'', href:'#/logistics?stage=Ordered(Fixed)', to:'Logistics 목록 (Ordered(Fixed))'},
      {label:'확정 재고 (Factory Stock)', icon:'factory', n:factoryStages.reduce((a,s)=>a+(byStage[s]||0),0), color:STAGE_COLOR['In Production'], sub:`In Production ${num(byStage['In Production']||0)} · Shipment scheduled ${num(byStage['Shipment scheduled']||0)}`, href:'#/logistics?stage='+encodeURIComponent(factoryStages.join(',')), to:'Logistics 목록 (In Production + Shipment scheduled)'},
      {label:'운송 중', icon:'transit', n:transit.length, color:STAGE_COLOR['In Transit'], sub:'', href:'#/logistics?stage=In%20Transit', to:'Logistics 목록 (In Transit)'},
      {label:`당월 입항 예정 (${BASE_YM.slice(5)}월)`, icon:'arrival', n:arrival.length, color:'var(--st-sched)', sub:`선박 ${new Set(arrival.map(v=>v.vessel)).size}척`, href:'#/shipping', to:'선적·입항'},
      {label:'재고 (보세 + 통관)', icon:'stock', n:stockVs.length, color:STAGE_COLOR['Bonded Stock'], sub:`Bonded ${num(byStage['Bonded Stock']||0)} · OH ${num(byStage['OH Stock']||0)}`, href:'#/stock', to:'재고현황'},
      {label:`판매 (${year} YTD)`, icon:'sold', n:soldYtd.length, color:STAGE_COLOR['Sold'], sub:`전월 ${num(byMonth('sales_month')[ymAdd(BASE_YM,-1)]||0)}`, href:'#/logistics?stage=Sold', to:'Logistics 목록 (Sold)'},
    ];
    const flow = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '차량 주문·재고 흐름'), noteEl('D1'),
        mk('span', {class:'desc'}, `7개 지표 · 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중 → 당월 입항 예정 → 재고 → 판매 · 전체 ${num(VEHICLES.length - (byStage['Cancelled']||0))} (Cancelled 제외)`)),
      mk('div', {class:'flow'}, cards.map((c,i)=>mk('div', {class:'stage-box', style:`--c:${c.color}`, 'data-href':c.href, title:'클릭 → '+c.to},
        cardIcon(c.icon), mk('div', {class:'n num'}, num(c.n)), mk('div', {class:'l'}, c.label), c.sub? mk('div', {class:'s'}, c.sub) : null, i<cards.length-1? mk('span', {class:'arrow'}, '›') : null))),
      mk('div', {class:'muted small', style:'margin-top:8px'}, '카드 클릭 시 관련 목록으로 이동합니다.'));

    // D2 월별 추이: 당해 1월 ~ 익년 12월 24개월 중 당월 기준 이전 5개월~이후 6개월(12개월)만 표시, 나머지는 가로 스크롤 (10/19 No.14)
    const months = []; for(let i=0;i<24;i++) months.push(ymAdd(year+'-01', i));
    const baseIdx = months.indexOf(BASE_YM);
    const prod = byMonth('pm', v=>v.current_status!=='Cancelled');
    const arr = {}; VEHICLES.forEach(v=>{ if(v.current_status==='Cancelled') return; const m=expectedArrivalYm(v); if(m) arr[m]=(arr[m]||0)+1; });
    const sales = byMonth('sales_month');
    const recent6 = months.slice(baseIdx-5, baseIdx+1).map(m=>sales[m]||0); const avg6 = Math.round(recent6.reduce((a,b)=>a+b,0)/6);
    const salesVals = months.map((m,i)=> i<=baseIdx ? (sales[m]||0) : avg6);
    // 10/19 No.6: 한 화면 6개월(당월-2 ~ 당월+3), 영역 축소(가로 50% 배치 · 세로 약 70%), 월 간격 축소(기준 폭 800)
    const chart = barChartEl({months, baseIdx, visible:6, scrollTo:Math.max(0, baseIdx-2), width:800, height:280, series:[
      {name:'Production (PM final)', color:'var(--s4)', values:months.map(m=>prod[m]||0)},
      {name:'Arrival (ATA / 예정)', color:'var(--s1)', values:months.map(m=>arr[m]||0)},
      {name:'Sales (판매 / 계획)', color:'var(--s3)', values:salesVals},
    ]});
    const trend = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, '월별 생산 / 입항 / 판매 추이'), noteEl('D2'), mk('span', {class:'desc'}, `${monEn(months[0])} ${months[0].slice(0,4)} ~ ${monEn(months[23])} ${months[23].slice(0,4)} (24개월) · 당월 포함 6개월 표시, 나머지는 가로 스크롤 · 기준월 ${monEn(BASE_YM)} ${year} 강조, 이후 음영`)),
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

    // 레이아웃 (10/19 No.7): 카드 → [입항 예정 선박 | 연식별 재고] → [월별 생산·입항·판매 추이 | 차종별 파이프라인]
    root.innerHTML = `<div class="grid2"><div id="d3slot"></div><div id="d6slot"></div></div><div class="grid2"><div id="d2slot"></div>${pipe}</div>`;
    root.prepend(flow);
    el('d3slot').replaceWith(ships); el('d6slot').replaceWith(myCard); el('d2slot').replaceWith(trend);
    scrollChartTo(trend); // 화면에 붙은 뒤 당월-2개월이 왼쪽 끝에 오도록 스크롤
    root.addEventListener('click', e=>{
      const hb=e.target.closest('[data-href]'); if(hb){ location.hash=hb.dataset.href; return; }
      const sb=e.target.closest('[data-stage]'); if(sb){ location.hash='#/logistics?stage='+encodeURIComponent(sb.dataset.stage); return; }
      const cb=e.target.closest('[data-cls]'); if(cb){ location.hash='#/logistics?cls='+encodeURIComponent(cb.dataset.cls); return; }
      const vr=e.target.closest('tr[data-vessel]'); if(vr){ location.hash='#/logistics?q='+encodeURIComponent(vr.dataset.vessel); }
    });
  }
};
// 카드 아이콘 (10/19 No.13 · No.3): 인라인 SVG(선 아이콘, 복잡도 통일) · 색은 카드 색(--c)
const circ = (cx,cy,r)=>`M${cx-r} ${cy}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0`;
const CARD_ICON_PATHS = {
  changeable: ['M5 3h8l4 4v4', 'M5 3v18h6', 'M13 3v4h4', 'M8 10h6M8 13h4', 'M13 21l1-3 6.5-6.5 2 2L16 20z'],            // 주문서 + 연필 (수정 가능 주문)
  fixed: ['M5 3h8l4 4v5', 'M5 3v18h7', 'M13 3v4h4', 'M8 10h6M8 13h4', circ(17,17,4), 'M15 17l1.5 1.5 3-3'],              // 주문서 + 확인 표시 (확정 주문)
  factory: ['M3 21V11l5 3v-3l5 3v-3l5 3v7H3z', 'M16 11V5h3v10', 'M7 17h2M11 17h2M15 17h2'],                              // 공장 (확정 재고, 현행 유지)
  transit: ['M3 15l2 5h14l2-5z', 'M6 15v-4h12v4', 'M9 11V8h6v3', 'M12 5v3', 'M2 23c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0'], // 선박 (운송 중, 현행 유지)
  arrival: ['M12 1.5a3.5 3.5 0 0 1 3.5 3.5c0 2.5-3.5 6.5-3.5 6.5S8.5 7.5 8.5 5A3.5 3.5 0 0 1 12 1.5z', circ(12,5,1), 'M3 17l2 4h14l2-4z', 'M6 17v-3h12v3'], // 도착 핀 + 선박 (당월 입항 예정)
  stock: ['M2 21V9l10-6 10 6v12', 'M2 21h20', 'M6 21v-9h12v9', 'M8 15h5v4H8z', 'M13 16.5h2.2l1 1V19H13z', circ(9.5,19.5,1), circ(14.8,19.5,1)], // 창고 안 트럭 (재고)
  sold: ['M2 9h9v7H2z', 'M11 11h3l2 2.5V16h-5z', circ(5,17.5,1.5), circ(13.5,17.5,1.5), circ(20,7,2), 'M20 9v6', 'M20 15l-2.5 5M20 15l2.5 5', 'M20 11l-3.5 2'], // 트럭을 고객에게 인도 (판매)
};
function cardIcon(kind){
  const svg = mkSvg('svg', {class:'ic', viewBox:'0 0 24 24', 'aria-hidden':'true', fill:'none', stroke:'currentColor', 'stroke-width':'1.4', 'stroke-linecap':'round', 'stroke-linejoin':'round'});
  (CARD_ICON_PATHS[kind]||[]).forEach(d=>svg.append(mkSvg('path', {d})));
  return svg;
}
function byMonth(field, filter){ const m={}; VEHICLES.forEach(v=>{ if(filter&&!filter(v)) return; const k=(v[field]||'').slice(0,7); if(k) m[k]=(m[k]||0)+1; }); return m; }
