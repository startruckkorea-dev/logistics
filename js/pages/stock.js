'use strict';
/* ===== 재고현황 — Closing Stock Status 리포트 (K1~K2) · 연식 키·색은 common.js MY_KEYS/MY_COLORS (10/29: MY28 추가, 대시보드와 공용) ===== */
PAGES.stock = {
  title:'재고현황', sub:'Closing Stock Status · 월말 마감 재고 (입고일 = ETA Final Arrival)',
  render(root, params){
    const opts = []; for(let i=5;i>=1;i--) opts.push(ymAdd(BASE_YM,-i)); // 최근 5개월 월말 마감
    let sel = params.get('m') || 'current';
    let view = params.get('view')==='pipe' ? 'pipe' : 'stock'; // 10/27 #15: 'stock' = TSC 재고(Bonded + OH Stock, 현행) · 'pipe' = 현재 및 미래 재고현황(Ordered(Fixed) ~ OH Stock, 현재 기준만 — 과거 시점의 주문 단계는 복원 불가라 월말 마감 없음) · 탭명 10/29 #7
    const PIPE_STAGES = STAGES.slice(3,9); // Ordered(Fixed) ~ OH Stock
    // 10/29 #9·#10: 현재 및 미래 재고현황 5구역 — In Production + Shipment scheduled = Factory Stock(대시보드 확정 재고와 동일) · loc = 장소 띠(공장 = 구역 1·2, 바다 = 3, 아산 센터 = 4·5)
    const ZONES = [
      {name:'Ordered(Fixed)', stages:['Ordered(Fixed)'], color:STAGE_COLOR['Ordered(Fixed)']},
      {name:'Factory Stock', stages:['In Production','Shipment scheduled'], color:STAGE_COLOR['In Production']},
      {name:'In Transit', stages:['In Transit'], color:STAGE_COLOR['In Transit']},
      {name:'Bonded Stock', stages:['Bonded Stock'], color:STAGE_COLOR['Bonded Stock']},
      {name:'OH Stock', stages:['OH Stock'], color:STAGE_COLOR['OH Stock']},
    ];
    const LOC_ZONES = [['factory',0,1],['sea',2,2],['center',3,4]]; // [장소 key, 첫 구역 index, 끝 구역 index]
    const PORTS = [{key:'antwerp', before:2}, {key:'pyeongtaek', before:3}]; // 항구 세로선 = before 구역의 왼쪽 경계 (Antwerp = Factory Stock|In Transit · 평택 = In Transit|Bonded Stock)
    const locOfStatus = s => s==='In Transit' ? 'sea' : (s==='Bonded Stock'||s==='OH Stock') ? 'center' : 'factory';
    const stageTip = s => `${s} (${tx(LOC_DEFS[locOfStatus(s)].name)})`;
    const zoneVs = (vs, z) => vs.filter(v=>z.stages.includes(v.current_status));

    // ---- A2 여정 지도 (10/29 #8·#9): 항로선 위 5구역 원(면적 = 대수) + 장소 띠 3구역 + 항구 알약 라벨·세로 점선 · 10/29 #3: 연식 구분 없음(원 아래 연식 막대·연식별 수량 삭제, 높이 축소) ----
    const cfsJourney = list=>{
      const total=list.length, zn = z=>zoneVs(list,z).length;
      const W=Math.max(900, (el('stockBody')?.clientWidth||1200)-32), H=258, yr=180, portY=14, bandY=32, bandH=50, gw=W/ZONES.length; const xs = ZONES.map((z,i)=>gw*i+gw/2); const bx = i=>xs[i]-gw/2; // W = 카드 실제 폭(패딩 16px×2 제외, 최소 900)으로 1:1 렌더 → 글자 크기가 다른 차트와 동일 px · bx = 구역 i의 왼쪽 경계
      const svg = mkSvg('svg', {class:'chart', viewBox:`0 0 ${W} ${H}`, role:'img', style:`max-width:${W}px`});
      LOC_ZONES.forEach(([k,i0,i1])=>{ const zs=ZONES.slice(i0,i1+1), n=zs.reduce((a,z)=>a+zn(z),0); svgLocBand(svg, LOC_DEFS[k], n, bx(i0)+6, bx(i1)+gw-6, bandY, bandH, locTip(LOC_DEFS[k], zs.map(z=>z.name).join(' · '), n)); });
      // 항로선: 공장~Antwerp 실선 · 바다 구간(Antwerp~평택) 파선 · 평택 이후 실선 + 화살표
      svg.append(mkSvg('path', {class:'route', d:`M40 ${yr}H${bx(2)}`}), mkSvg('path', {class:'route sea', d:`M${bx(2)} ${yr}H${bx(3)}`}), mkSvg('path', {class:'route', d:`M${bx(3)} ${yr}H${W-40}`}), mkSvg('path', {class:'route', d:`M${W-48} ${yr-6}l8 6-8 6`}));
      svgPorts(svg, PORTS.map(p=>({name:PORT_DEFS[p.key], x:bx(p.before)})), portY, yr+40);
      const maxN = Math.max(1, ...ZONES.map(zn));
      ZONES.forEach((z,i)=>{ const vs=zoneVs(list,z), n=vs.length, r=Math.max(9, Math.sqrt(n/maxN)*44), x=xs[i];
        const tip = [z.name, z.stages.length>1 ? z.stages.map(s=>`${s} ${num(vs.filter(v=>v.current_status===s).length)}`).join(' · ') : null, tx('{v}대',{v:num(n)}), pct(n,total)].filter(Boolean).join(' · ');
        svg.append(mkSvg('circle', {cx:x, cy:yr, r, fill:z.color, stroke:'#fff', 'stroke-width':2, 'data-tip':tip}));
        svg.append(r>=15 ? mkSvg('text', {class:'w', x, y:yr+4, 'text-anchor':'middle', style:'font-size:12.5px;pointer-events:none'}, num(n)) : mkSvg('text', {class:'t', x, y:yr-r-6, 'text-anchor':'middle'}, num(n)));
        svg.append(mkSvg('text', {class:'sl', x, y:yr+66, 'text-anchor':'middle'}, z.name));
      });
      return mk('div', {class:'card cfs1'}, mk('div', {class:'card-h'}, mk('h2', null, tx('여정 지도')), noteEl('K1'), mk('span', {class:'desc'}, tx('Ordered(Fixed) ~ OH Stock {n}대 · 원 면적 = 대수 · Factory Stock = In Production + Shipment scheduled', {n:num(total)}))), svg); // 연식 범례는 모델별 구역 현황 위(페이지 범례, 10/29 #3)
    };

    // ---- A3 모델별 구역 현황 (10/29 #10): 행 = 구분 > 차종 > 모델 · 열 = 5구역 균등 · 셀 = 연식 누적 가로 막대(길이 = 대수) + 대수 · 열 위 장소 띠 + 항구 세로선 ----
    const cfsMatrix = list=>{
      const rows = []; modelGroups(list).forEach(g=>{ rows.push({cls:'g1', label:g.gen, vs:g.vehicles.flatMap(t=>t.rows.flatMap(r=>r.vs))});
        g.vehicles.forEach(t=>{ rows.push({cls:'g2', label:t.vehicle, vs:t.rows.flatMap(r=>r.vs)}); t.rows.forEach(r=>rows.push({cls:'m', label:r.label, vs:r.vs})); }); });
      const maxOf = cls => Math.max(1, ...rows.filter(r=>cls.includes(r.cls)).flatMap(r=>ZONES.map(z=>zoneVs(r.vs,z).length)));
      const maxM = maxOf(['m']), maxG = maxOf(['g1','g2']); // 막대 길이 기준: 모델 행끼리 · 그룹 행끼리
      // 항구 세로선 left: 첫 열 300px + 간격 10px · 구역 i의 왼쪽 경계 중앙 = 305px + 10px*i + (100% - 350px) * i/5
      const ports = PORTS.map(p=>({name:PORT_DEFS[p.key], left:`calc(${305+10*p.before}px + (100% - 350px) * ${(p.before/ZONES.length).toFixed(2)})`}));
      const band = mk('div', {class:'r band', style:'border:0;padding:0 0 4px'}, mk('div'), LOC_ZONES.map(([k,i0,i1])=>{ const zs=ZONES.slice(i0,i1+1), n=zs.reduce((a,z)=>a+zoneVs(list,z).length,0); const b = locBandEl(LOC_DEFS[k], n, locTip(LOC_DEFS[k], zs.map(z=>z.name).join(' · '), n)); b.style.gridColumn = `span ${i1-i0+1}`; return b; }));
      const head = mk('div', {class:'hd'}, mk('div'), ZONES.map(z=>mk('div', {class:'z', style:`--c:${z.color}`}, z.name)));
      const body = rows.map(r=>mk('div', {class:'r '+r.cls}, mk('div', {class:'lbl', title:r.label}, r.label), ZONES.map(z=>{ const vs=zoneVs(r.vs,z), n=vs.length, cell=mk('div', {class:'cell'});
        if(n){ const m = miniStackEl(`${r.label} · ${z.name}`, vs); m.style.width = (n/(r.cls==='m'?maxM:maxG)*80).toFixed(1)+'%'; cell.append(m, mk('span', {class:'n num'}, num(n))); } return cell; })));
      const wrap = mk('div', {class:'cfs3'}, portsRowEl(ports), mk('div', {class:'cfs3body'}, band, head, body, vlinesEl(ports)));
      return mk('div', {class:'card'}, mk('div', {class:'card-h'}, mk('h2', null, tx('모델별 구역 현황')), mk('span', {class:'desc'}, tx('행 = 구분 > 차종 > 모델(Vehicle Model Type Axle Cab 비표준 옵션) · 열 = 5구역 균등 · 막대 = 연식 누적, 길이 = 대수(모델 행끼리 · 그룹 행끼리 같은 기준)'))), wrap);
    };

    // ---- B2 상태 × 연식 히트맵 (10/29 #8, 6상태 그대로): 선적·입항 표와 같은 뼈대(.pivot.fixcol) · 머리글 3줄(장소 / 상태 / 연식 + Total) + Grand Total 행 · 모델 행 셀 = 상태 색 농도 ----
    const cfsHeat = list=>{
      const colsOf = {}; PIPE_STAGES.forEach(s=>{ colsOf[s] = [...MY_KEYS, '기타'].filter(k=>list.some(v=>v.current_status===s && myOf(v)===k)); }); const per = s=>colsOf[s].length+1; // 10/29 #4: 상태별로 대수 있는 연식만 열로(Total 열은 항상) · 열 순서 MY24→MY28→기타 고정
      const keyOf = v => v.current_status+'|'+myOf(v), rowCounts = r => countBy(r.vs, keyOf);
      const groups = modelGroups(list), allRows = groups.flatMap(g=>g.vehicles.flatMap(t=>t.rows));
      const maxCell = Math.max(1, ...allRows.flatMap(r=>Object.values(rowCounts(r))));
      const locCols = [['factory', PIPE_STAGES.slice(0,3)], ['sea', ['In Transit']], ['center', ['Bonded Stock','OH Stock']]];
      const th = (txt, attrs) => mk('th', attrs, txt);
      const head1 = mk('tr', null, th('Model', {rowspan:3}), locCols.map(([k, sts])=>{ const n=list.filter(v=>sts.includes(v.current_status)).length; return mk('th', {class:'loc', colspan:sts.reduce((a,s)=>a+per(s),0), 'data-tip':locTip(LOC_DEFS[k], sts.join(' · '), n)}, mk('span', {class:'lh'}, picIconEl(LOC_DEFS[k].icon), mk('span', null, tx(LOC_DEFS[k].name)), mk('b', {class:'num'}, num(n)))); }), th('Grand Total', {class:'num gt', rowspan:3}));
      const head2 = mk('tr', null, PIPE_STAGES.map(s=>mk('th', {class:'st', colspan:per(s)}, stagePillEl(s))));
      const head3 = mk('tr', null, PIPE_STAGES.flatMap(s=>[...colsOf[s].map(k=>th(tx(k), {class:'num my'})), th('Total', {class:'num tot'})]));
      const cells = (by, label, heat)=>{ const out=[]; let grand=0; // 0은 공란 · heat = 모델 행만 상태 색 농도(대수/최대) · Total·Grand Total 음영 없음
        PIPE_STAGES.forEach(s=>{ let st=0; colsOf[s].forEach(k=>{ const v=by[s+'|'+k]||0; st+=v; const td = mk('td', {class:'num', 'data-tip': v ? `${label} · ${stageTip(s)} · ${tx(k)} · ${tx('{v}대',{v})}` : null}, v ? num(v) : ''); if(heat && v) td.style.background = rgbaOf(STAGE_COLOR[s], 0.08+0.5*Math.min(1, v/maxCell)); out.push(td); });
          out.push(mk('td', {class:'num tot'}, st ? num(st) : '')); grand+=st; });
        out.push(mk('td', {class:'num gt'}, num(grand))); return out; };
      const sumBy = rows => { const by={}; rows.forEach(r=>Object.entries(rowCounts(r)).forEach(([k,n])=>by[k]=(by[k]||0)+n)); return by; };
      const grandRow = mk('tr', {class:'total'}, mk('td', null, 'Grand Total'), cells(countBy(list, keyOf), 'Grand Total', false));
      const body = [];
      groups.forEach(g=>{ body.push(mk('tr', {class:'g1'}, mk('td', null, g.gen), cells(sumBy(g.vehicles.flatMap(t=>t.rows)), g.gen, false)));
        g.vehicles.forEach(t=>{ body.push(mk('tr', {class:'g2'}, mk('td', null, t.vehicle), cells(sumBy(t.rows), g.gen+' '+t.vehicle, false)));
          t.rows.forEach(r=>body.push(mk('tr', null, mk('td', {class:'model', title:r.label}, r.label), cells(rowCounts(r), r.label, true)))); }); });
      const table = mk('table', {class:'tbl compact pivot fixcol'}, mk('thead', null, head1, head2, head3, grandRow), mk('tbody', null, body));
      return mk('div', {class:'card cfs2'}, mk('div', {class:'card-h'}, mk('h2', null, tx('상태 × 연식 히트맵')), mk('span', {class:'desc'}, tx('행 = 구분 > 차종 > 모델 · 열 = 장소 > Current Status > 연식 + Total · 셀 색 농도 = 대수(상태 색) · 0은 공란 · 대수 0인 연식 열은 숨김'))), mk('div', {class:'tbl-wrap'}, table));
    };

    const draw = ()=>{
      if(view==='pipe') sel = 'current';
      const items = closingStock(sel, view); const list = items.map(x=>x.v);
      const label = view==='pipe' ? tx('현재 ({d}, 상태 Ordered(Fixed) ~ OH Stock 기준)', {d:TODAY_S}) : sel==='current' ? tx('현재 ({d}, 상태 Bonded Stock·OH Stock 기준)', {d:TODAY_S}) : tx('{m} 월말 마감 ({d})', {m:sel, d:fmtD(monthEnd(sel))});
      const myCnt = countBy(list, myOf); const total=list.length;
      const bonded = items.filter(x=>!x.cleared).length, cleared = items.filter(x=>x.cleared).length;
      // TSC 재고 탭 요약 카드: Total Stock + 연식(MY24~28) 대수·비율 — 현재 및 미래 탭에서는 여정 지도가 대체 (10/29 #8)
      const cards = `<div class="grid4" style="grid-template-columns:1.3fr repeat(${MY_KEYS.length},1fr)">
        <div class="card kpi"><span class="label">Total Stock ${note('K1')}</span><span class="value num">${num(total)}</span><span class="foot">${tx('보세(Bonded) {b} · 통관(OH) {c} · 보세/통관 = Customs Clearance DATE ≤ 월말', {b:num(bonded), c:num(cleared)})}</span></div>
        ${MY_KEYS.map(k=>`<div class="card kpi"><span class="label"><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${MY_COLORS[k]};margin-right:5px"></span>${k}</span><span class="value num">${num(myCnt[k]||0)}</span><span class="foot">${pct(myCnt[k]||0,total)}</span></div>`).join('')}
      </div>`;
      const legend = `<div class="my-legend">${tx('연식(MY) 범례')}: ${[...MY_KEYS,'기타'].map(k=>`<span><span class="sw" style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${MY_COLORS[k]};vertical-align:middle;margin-right:4px"></span>${tx(k)}${k==='기타'?tx(' (MY23 이하·판독 불가)'):''}</span>`).join('')} <span class="muted">${tx('· MY = VIN 10번째 자리 (M=21 … T=26 V=27 W=28)')}</span></div>`;
      const segsOf = vs=>{ const c=countBy(vs,myOf); return [...MY_KEYS,'기타'].map(k=>({name:tx(k),color:MY_COLORS[k],value:c[k]||0})); };
      // By Vehicle
      const byVeh = VEHICLE_TYPES.map(t=>({t, vs:list.filter(v=>v.vehicle===t)})).filter(x=>x.vs.length);
      const maxV = Math.max(1,...byVeh.map(x=>x.vs.length)); hbar._grand=total;
      const byVehicle = `<div class="card"><div class="section-h" style="margin-top:0">By Vehicle ${note('K2')}<span class="sub">${tx('차종별 · 막대 길이 = 대수 · 우측 대수·비율')}</span></div><div class="hbars">${byVeh.map(x=>hbar(x.t, segsOf(x.vs), x.vs.length, maxV)).join('')}</div></div>`;
      // By Model (차종 섹션 안 모델별)
      const modelName = v=>[v.series,v.model,v.axle,v.cab,modelOptTag(v)].filter(Boolean).join(' · '); // 11/4: Option 대신 비표준 옵션만 · 11/6: Gen 삭제 · Model(series) 추가 → Model · Type · Axle · Cab
      const byModel = `<div class="card"><div class="section-h" style="margin-top:0">By Model<span class="sub">${tx('차종 섹션 안 모델별 · 모델명 = Model · Type · Axle · Cab · 비표준 옵션')}</span></div>
        ${byVeh.map(x=>{ const groups = Object.values(x.vs.reduce((a,v)=>{ const k=modelName(v); (a[k]=a[k]||{k,vs:[]}).vs.push(v); return a; },{})).sort((a,b)=>b.vs.length-a.vs.length);
          return `<div class="section-h">${x.t}<span class="sub">${tx('{n}대', {n:num(x.vs.length)})} · ${pct(x.vs.length,total)}</span></div><div class="hbars">${groups.map(g=>hbar(g.k, segsOf(g.vs), g.vs.length, maxV, 'model')).join('')}</div>`; }).join('')}</div>`;
      // 10/29 #8: 현재 및 미래 탭 = 기준 문구 → 여정 지도 → 연식 범례 → 모델별 구역 현황 → 히트맵(cfsSlot·cfsSlot2에 DOM으로 삽입) → By Vehicle → By Model (10/29 #3: 여정 지도에 연식 구분이 없어져 범례를 모델별 구역 현황 바로 위로)
      el('stockBody').innerHTML = `<div class="muted small" style="margin:-4px 0 10px">${label} · ${view==='pipe'? tx('확장 뷰는 현재 기준만 지원 (월말 마감 없음)') : tx('월말 마감 판정 = Cancelled 제외 · 입고일(ETA Final Arrival) ≤ 월 말일 · Sales Month 공란 또는 해당 월 이후(미판매)')}</div>` + (view==='pipe' ? '<div id="cfsSlot"></div>' + legend + '<div id="cfsSlot2"></div>' : cards + legend) + byVehicle + byModel;
      if(view==='pipe'){ el('cfsSlot').replaceWith(cfsJourney(list)); el('cfsSlot2').replaceWith(cfsMatrix(list), cfsHeat(list)); }
      // 10/27 #15: 탭 강조 · 확장 뷰에서는 기준월 select를 '현재'로 고정
      qa('#stockTabs .tab').forEach(t=>t.classList.toggle('active', t.dataset.view===view));
      const s = el('stockSel'); s.value = sel; s.disabled = view==='pipe'; s.title = view==='pipe'? tx('확장 뷰는 현재 기준만 지원 (월말 마감 없음)') : '';
    };
    root.innerHTML = `<div class="card"><div class="tabs" id="stockTabs"></div><div class="card-h"><h2>${tx('기준월')}</h2>
      <select id="stockSel">${opts.map(m=>`<option value="${m}" ${sel===m?'selected':''}>${tx('{m} 월말 마감', {m})}</option>`).join('')}<option value="current" ${sel==='current'?'selected':''}>${tx('현재 ({d})', {d:TODAY_S})}</option></select>
      <span class="spacer"></span><div class="btn-group"><button class="btn" id="stockHtml">${tx('리포트 HTML')}</button><button class="btn" id="stockXlsx">Excel</button></div></div>
      <div id="stockBody"></div></div>`;
    // 10/27 #15: 상단 탭 2개 (Logistics 탭과 같은 모양, css #stockTabs) · 내보내기 설명에 현재 뷰 표기 · 10/29 #7: 탭명 한글(EN 모드는 I18N: Overall OH Stock(TSC) / Current & Future Stock Status)
    const VIEWS = [['stock','TSC 재고'], ['pipe','현재 및 미래 재고현황']];
    const viewLabel = ()=> tx(VIEWS.find(x=>x[0]===view)[1]);
    el('stockTabs').append(...VIEWS.map(([k,l])=>mk('span', {class:'tab', 'data-view':k, onclick:()=>{ if(view===k) return; view=k; draw(); }}, tx(l))));
    el('stockHtml').onclick = ()=>describe('마감 리포트 HTML 내보내기', `기존 월간 Closing Stock Status HTML 리포트와 동일 구성으로 단일 HTML 파일을 생성해 다운로드 + /Exports/ 저장합니다. (현재 뷰: ${viewLabel()})`);
    el('stockXlsx').onclick = ()=>describe('Excel 내보내기', `요약·By Vehicle·By Model 시트 3개로 .xlsx 생성(SheetJS) (현재 뷰: ${viewLabel()})`);
    el('stockSel').onchange = e=>{ sel=e.target.value; draw(); };
    draw();
  }
};
