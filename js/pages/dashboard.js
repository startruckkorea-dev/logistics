'use strict';
/* ===== 대시보드 (D1~D6) ===== */
PAGES.dashboard = {
  title:'대시보드', sub:'차량 주문·재고 흐름 · 기준일 '+TODAY_S,
  render(root){
    const byStage = countBy(VEHICLES, v=>v.current_status);
    const year = BASE_YM.slice(0,4);

    // D1 카드 6종 (10/19 No.10~13: 한글 카드명 · Cancelled 카드 삭제 · In Production + Shipment scheduled → 확정 재고(Factory Stock) · 카드별 아이콘 · 10/26 No.13: 당월 입항 예정 카드 삭제 → 운송 중 카드 하단 문구)
    // 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중(하단: 당월 입항 예정 n대) → 재고(Bonded + OH) → 판매(YTD)
    const transit = VEHICLES.filter(v=>v.current_status==='In Transit');
    // 당월 입항 예정 (10/20): 당월 입항 선박(ATA → ETA 선사 → Pl. arrival)에 실린 In Transit + Shipment scheduled — 당월 도착 예정 표와 동일 (data.js arrivalSchedule)
    const sched = arrivalSchedule(BASE_YM); const curVoys = sched.voyByYm[BASE_YM]||[];
    const curMon = {m:Number(BASE_YM.slice(5)), mon:monEn(BASE_YM)};
    const stockVs = VEHICLES.filter(v=>v.current_status==='Bonded Stock'||v.current_status==='OH Stock');
    const soldYtd = VEHICLES.filter(v=>v.current_status==='Sold'&&v.sales_month.startsWith(year));
    const factoryStages = ['In Production','Shipment scheduled'];
    const cards = [
      // 3행(sub) 문구 (10/19 No.5): 확정 재고·재고 유지 · 당월 입항 예정·판매는 괄호 안 문구만 · 그 외 삭제
      {label:tx('수정 가능 주문'), icon:'changeable', n:byStage['Ordered(Changeable)']||0, color:STAGE_COLOR['Ordered(Changeable)'], sub:'', href:'#/logistics?stage=Ordered(Changeable)', to:'Logistics 목록 (Ordered(Changeable))'},
      {label:tx('확정 주문'), icon:'fixed', n:byStage['Ordered(Fixed)']||0, color:STAGE_COLOR['Ordered(Fixed)'], sub:'', href:'#/logistics?stage=Ordered(Fixed)', to:'Logistics 목록 (Ordered(Fixed))'},
      {label:tx('확정 재고 (Factory Stock)'), icon:'factory', n:factoryStages.reduce((a,s)=>a+(byStage[s]||0),0), color:STAGE_COLOR['In Production'], sub:`In Production ${num(byStage['In Production']||0)} · Shipment scheduled ${num(byStage['Shipment scheduled']||0)}`, href:'#/logistics?stage='+encodeURIComponent(factoryStages.join(',')), to:'Logistics 목록 (In Production + Shipment scheduled)'},
      {label:tx('운송 중'), icon:'transit', n:transit.length, color:STAGE_COLOR['In Transit'], sub:tx('당월 입항 예정({m}월) {n}대', {m:curMon.m, mon:curMon.mon, n:num(sched.total)}), href:'#/logistics?stage=In%20Transit', to:'Logistics 목록 (In Transit)'}, // 10/26 No.13: 하단 = 당월 입항 예정 대수 (당월 도착 예정 표와 동일 기준 · 월 표기는 'N월' 유지)
      {label:tx('재고 (보세 + 통관)'), icon:'stock', n:stockVs.length, color:STAGE_COLOR['Bonded Stock'], sub:`Bonded ${num(byStage['Bonded Stock']||0)} · OH ${num(byStage['OH Stock']||0)}`, href:'#/stock', to:'재고현황'},
      {label:tx('판매 ({y} YTD)', {y:year}), icon:'sold', n:soldYtd.length, color:STAGE_COLOR['Sold'], sub:tx('전월 {n}', {n:num(byMonth('sales_month')[ymAdd(BASE_YM,-1)]||0)}), href:'#/logistics?stage=Sold', to:'Logistics 목록 (Sold)'},
    ];
    const flow = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('차량 주문·재고 흐름')), noteEl('D1'),
        mk('span', {class:'desc'}, tx('6개 지표 · 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중 → 재고 → 판매 · 전체 {n} (Cancelled 제외)', {n:num(VEHICLES.length - (byStage['Cancelled']||0))}))),
      mk('div', {class:'flow'}, cards.map((c,i)=>mk('div', {class:'stage-box', style:`--c:${c.color}`, 'data-href':c.href, title:'클릭 → '+c.to},
        cardIcon(c.icon), mk('div', {class:'n num'}, num(c.n)), mk('div', {class:'l'}, c.label), c.sub? mk('div', {class:'s'}, c.sub) : null, i<cards.length-1? mk('span', {class:'arrow'}, '›') : null))),
      mk('div', {class:'muted small', style:'margin-top:8px'}, tx('카드 클릭 시 관련 목록으로 이동합니다.')));

    // D2 월별 추이: 당해 1월 ~ 익년 12월 24개월 중 당월 기준 이전 5개월~이후 6개월(12개월)만 표시, 나머지는 가로 스크롤 (10/19 No.14)
    const months = []; for(let i=0;i<24;i++) months.push(ymAdd(year+'-01', i));
    const baseIdx = months.indexOf(BASE_YM);
    const prod = byMonth('pm', v=>v.current_status!=='Cancelled');
    const arr = {}; VEHICLES.forEach(v=>{ if(v.current_status==='Cancelled') return; const m=expectedArrivalYm(v); if(m) arr[m]=(arr[m]||0)+1; });
    const sales = byMonth('sales_month');
    const recent6 = months.slice(baseIdx-5, baseIdx+1).map(m=>sales[m]||0); const avg6 = Math.round(recent6.reduce((a,b)=>a+b,0)/6);
    const salesVals = months.map((m,i)=> i<=baseIdx ? (sales[m]||0) : avg6);
    // 10/20 No.20 B안: 한 화면 8개월(당월-3 ~ 당월+4), 막대 폭 20 · 간격 3, 높이 220, 수치는 막대 안, Y축 고정 (가로 50% 배치는 No.7 레이아웃)
    const chart = barChartEl({months, baseIdx, visible:8, scrollTo:Math.max(0, baseIdx-3), width:800, height:220, barW:20, barGap:3, series:[
      {name:'Production (PM final)', color:'var(--s4)', values:months.map(m=>prod[m]||0)},
      {name:tx('Arrival (ATA / 예정)'), color:'var(--s1)', values:months.map(m=>arr[m]||0)},
      {name:tx('Sales (판매 / 계획)'), color:'var(--s3)', values:salesVals},
    ]});
    const trend = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('월별 생산 / 입항 / 판매 추이')), noteEl('D2'), mk('span', {class:'desc'}, tx('{a} ~ {b} (24개월) · 당월 포함 8개월 표시, 나머지는 가로 스크롤 · 기준월 {c} 강조, 이후 음영', {a:`${monEn(months[0])} ${months[0].slice(0,4)}`, b:`${monEn(months[23])} ${months[23].slice(0,4)}`, c:`${monEn(BASE_YM)} ${year}`}))),
      chart,
      mk('div', {class:'muted small', style:'margin-top:6px'}, tx('Sales 계획 = 최근 6개월 평균(당월 포함) {n}대. KUFRI에서 입력한 sales_plan이 있으면 그 값을 사용.', {n:avg6})));

    // D3 입항 예정 선박: 입항예정 = Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA, ATA 후 2일까지 표시
    const vy = VOYAGES.filter(y=>!y.eta_final || diffDays(TODAY, parseD(y.eta_final))<=2)
      .map(y=>({...y, cnt:VEHICLES.filter(v=>v.vessel===y.vessel && (v.current_status==='In Transit'||v.current_status==='Shipment scheduled')).length}));
    const arrCell = y=>{ const [d, tag] = y.eta_final? [y.eta_final,'ATA'] : y.eta_carrier? [y.eta_carrier,'ETA'] : [y.pl,'Pl.'];
      return mk('td', {class:'mono'}, tag==='ATA'? mk('b', null, d) : d, ' ', mk('span', {class:'pill '+(tag==='ATA'?'st-oh':tag==='ETA'?'st-transit':'neutral'), title: tag==='ATA'?'실제 입항일':tag==='ETA'?'ETA (EUKOR, 평택)':'Planned Arrival'}, tag)); };
    const ships = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('입항 예정 선박')), noteEl('D3'), mk('span', {class:'desc'}, tx('Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환 · ATA 후 2일까지 표시')), mk('span', {class:'spacer'}), mk('a', {href:'#/shipping'}, tx('선적·입항 →'))),
      mk('table', {class:'tbl clickable'},
        mk('thead', null, mk('tr', null, ['Vessel','단계','Shipping','입항 예정'].map(x=>mk('th', null, tx(x))), mk('th', {class:'num'}, tx('대수')))),
        mk('tbody', null, vy.map(y=>mk('tr', {'data-vessel':y.vessel},
          mk('td', null, mk('b', null, y.vessel), ' ', mk('span', {class:'muted small'}, y.carrier)),
          mk('td', null, stagePillEl(y.kind==='transit'?'In Transit':'Shipment scheduled')),
          mk('td', {class:'mono'}, y.shipping, y.kind==='scheduled'? [' ', mk('span', {class:'muted small'}, tx('(예정)'))] : null),
          arrCell(y),
          mk('td', {class:'num'}, mk('b', null, y.cnt)))))));

    // D4 차종별 파이프라인 (7단계 · Ordered(Dummy)·Rejected·Sold 제외) · 10/20 No.12: 단계 색 = Current Status 색(STAGE_COLOR, Ordered(Changeable)·Ordered(Fixed)는 동일 색)
    const pipeStages = STAGES.slice(2,9);
    const byVeh = VEHICLE_TYPES.map(t=>{ const vs=VEHICLES.filter(v=>v.vehicle===t && pipeStages.includes(v.current_status)); const c=countBy(vs,v=>v.current_status); return {t, total:vs.length, segs:pipeStages.map(s=>({name:s, color:STAGE_COLOR[s], value:c[s]||0}))}; });
    const maxVeh = Math.max(...byVeh.map(b=>b.total)); hbar._grand = byVeh.reduce((a,b)=>a+b.total,0);
    const pipe = `<div class="card"><div class="card-h"><h2>${tx('차종별 파이프라인')}</h2>${note('D4')}<span class="desc">${tx('7단계 (Sold·Cancelled 제외) · 합계 {n}', {n:num(hbar._grand)})}</span></div>
      <div class="hbars">${byVeh.map(b=>hbar(b.t, b.segs, b.total, maxVeh)).join('')}</div>
      <div class="legend">${pipeStages.map(s=>`<span><span class="sw" style="background:${STAGE_COLOR[s]}"></span>${s}</span>`).join('')}</div></div>`;

    // D7 당월 도착 예정 (10/20 No.16): 선적·입항 '월별 입항 예정' 피벗의 당월 블록 — 행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · Option) · 열: 당월 입항 선박(선적일 순) + Total · 값: 모델별 선박 선적 대수 · 표 높이는 옆 '입항 예정 선박' 카드에 맞추고 넘치면 세로 스크롤
    // 10/27: 선적·입항 월별 입항 표 디자인 그대로 적용 — Model 열 고정 · 그룹 행(구분·차종)에도 열별 합계 · 0은 공란 (.pivot.fixcol) · 10/27 #1: 월 머리글 행 삭제 → 머리글 2줄(선박 / Grand Total 행, 고정)
    const cellN = (n, tot)=>{ const td = n? mk('td', {class:'num'}, num(n)) : mk('td', {class:'num'}); if(tot) td.classList.add('tot'); return td; };
    const arrCells = by=> [...curVoys.map(y=>cellN(by[y.vessel]||0)), cellN(curVoys.reduce((a,y)=>a+(by[y.vessel]||0),0), true)];
    const sumBy = rows=>{ const by={}; rows.forEach(r=>Object.entries(r.by).forEach(([k,n])=>by[k]=(by[k]||0)+n)); return by; };
    const arrCols = 1 + curVoys.length + 1;
    const arrRows = [];
    sched.groups.forEach(g=>{ arrRows.push(mk('tr', {class:'g1'}, mk('td', null, g.gen), arrCells(sumBy(g.vehicles.flatMap(t=>t.rows)))));
      g.vehicles.forEach(t=>{ arrRows.push(mk('tr', {class:'g2'}, mk('td', null, t.vehicle), arrCells(sumBy(t.rows))));
        t.rows.forEach(r=>arrRows.push(mk('tr', null, mk('td', {class:'model'}, r.label), arrCells(r.by)))); }); });
    const arrCard = mk('div', {class:'card fillcol'}, // fillcol: 표 스크롤 영역 높이를 옆 '입항 예정 선박' 카드에 맞춤
      mk('div', {class:'card-h'}, mk('h2', null, tx('당월 도착 예정 ({m}월)', curMon)), noteEl('D7'), mk('span', {class:'desc'}, tx('구분 > 차종 > 모델 × 당월 입항 선박 · 합계 {n}대 · 선박 {v}척', {n:num(sched.total), v:curVoys.length})), mk('span', {class:'spacer'}), mk('a', {href:'#/shipping'}, tx('월별 입항 예정 →'))),
      mk('div', {class:'fill'}, mk('div', {class:'tbl-wrap'}, mk('table', {class:'tbl compact pivot fixcol'},
        mk('thead', null,
          mk('tr', null, mk('th', null, 'Model'), curVoys.map(y=>mk('th', {class:'num', title:`${y.carrier} · Shipping ${y.shipping}`}, y.vessel)), mk('th', {class:'num tot'}, 'Total')),
          mk('tr', {class:'total'}, mk('td', null, 'Grand Total'), arrCells(sched.grand))),
        mk('tbody', null, sched.total? arrRows : mk('tr', null, mk('td', {colspan:arrCols, class:'muted', style:'text-align:center'}, tx('당월 입항 예정 차량이 없습니다.'))))))));

    // (재고 연령 분포 D5는 2026-10-12 검토에서 삭제)
    const stock = stockVs;

    // D6 연식별 재고 (신규): 세로 누적 막대, 연식 최신순(왼쪽부터), 누적 = Tractor / Rigid(HDT+MDT) / Tipper / BB(Export+Domestic)
    const vGroup = v=> v.vehicle; // Vehicle 값 4종(Tractor · Rigid · Tipper · BB)과 동일
    const myCats = [...new Set(stock.map(v=>v.model_year))].sort((a,b)=>Number(b.slice(2))-Number(a.slice(2)));
    const groups = [{name:'Tractor', key:'Tractor', color:SERIES[0]}, {name:'Rigid (HDT + MDT)', key:'Rigid', color:SERIES[1]}, {name:'Tipper', key:'Tipper', color:SERIES[2]}, {name:'BB (Export + Domestic)', key:'BB', color:SERIES[3]}];
    const myChart = stackChartEl({cats:myCats, series:groups.map(g=>({name:g.name, color:g.color, values:myCats.map(my=>stock.filter(v=>v.model_year===my && vGroup(v)===g.key).length)}))});
    const myCard = mk('div', {class:'card'},
      mk('div', {class:'card-h'}, mk('h2', null, tx('연식별 재고')), noteEl('D6'), mk('span', {class:'desc'}, tx('Bonded + OH Stock {n}대 · 연식(MY) 최신순 · 누적 = Vehicle 4종', {n:num(stock.length)}))),
      mk('div', {style:'max-width:640px'}, myChart));

    // 레이아웃 (10/20 No.15·16 → 10/27 #2): 카드 → [입항 예정 선박 / 월별 생산·입항·판매 추이 | 당월 도착 예정(2행 높이, .dash-top)] → [차종별 파이프라인 | 연식별 재고]
    root.innerHTML = `<div class="grid2 dash-top"><div id="d3slot"></div><div id="d7slot"></div><div id="d2slot"></div></div><div class="grid2">${pipe}<div id="d6slot"></div></div>`;
    root.prepend(flow);
    el('d3slot').replaceWith(ships); el('d7slot').replaceWith(arrCard); el('d2slot').replaceWith(trend); el('d6slot').replaceWith(myCard);
    scrollChartTo(trend); // 화면에 붙은 뒤 당월-3개월이 왼쪽 끝에 오도록 스크롤
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
  stock: ['M2.5 20V10L12 4l9.5 6v10', 'M2 20h20', 'M5 12.5h7.5v5H5z', 'M12.5 14h3l2 2.2v1.3h-5', circ(7.5,18.6,1.1), circ(15,18.6,1.1)], // 창고 안 트럭 (재고) — 10/20 No.19 첨부 SVG
  sold: ['M2.5 8.5h11v8.5h-11z', 'M13.5 11h4.2l2.8 3.3V17h-7', circ(6.5,18.3,1.7), circ(17,18.3,1.7), 'M8 8.5V17', 'M8 8.5c-1.4-2.6-3.8-2.7-3.8-1.2 0 .9 1.6 1.2 3.8 1.2zM8 8.5c1.4-2.6 3.8-2.7 3.8-1.2 0 .9-1.6 1.2-3.8 1.2z'], // 리본 달린 트럭 (판매) — 10/20 No.19 첨부 SVG
};
function cardIcon(kind){
  const svg = mkSvg('svg', {class:'ic', viewBox:'0 0 24 24', 'aria-hidden':'true', fill:'none', stroke:'currentColor', 'stroke-width':'1.4', 'stroke-linecap':'round', 'stroke-linejoin':'round'});
  (CARD_ICON_PATHS[kind]||[]).forEach(d=>svg.append(mkSvg('path', {d})));
  return svg;
}
function byMonth(field, filter){ const m={}; VEHICLES.forEach(v=>{ if(filter&&!filter(v)) return; const k=(v[field]||'').slice(0,7); if(k) m[k]=(m[k]||0)+1; }); return m; }
