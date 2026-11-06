'use strict';
/* ===== KUFRI 생산판매계획 (P1~P4) ===== */
const KF = { year:'2026', vehicle:'', edit:false, collapsed:new Set(), plans:{} };
const KUFRI_START = '2026-01';

// 모델 1개(또는 전체)의 월별 행 계산 — 문서 §10 규칙
function kufriRows(vs, months){
  const prod = months.map(m=>{ if(ymDiff(m,'2028-01')>=0){ const k='prod|'+vs._key+'|'+m; const dflt=Math.round(vs.filter(v=>v.current_status!=='Cancelled'&&v.pm==='2026-'+m.slice(5)).length*0.9); return {v: KF.plans[k] ?? dflt, type:'plan', key:k}; }
    const n = vs.filter(v=>v.current_status!=='Cancelled' && v.pm===m).length; return {v:n, type: ymDiff(m,BASE_YM)<=0?'actual':'confirmed'}; });
  const arrival = months.map(m=>{ if(ymDiff(m,BASE_YM)<=0) return {v: vs.filter(v=>v.current_status!=='Cancelled'&&v.ata&&v.ata.slice(0,7)===m).length, type:'actual'};
    return {v: vs.filter(v=>v.current_status!=='Cancelled'&&!v.sales_month&&expectedArrivalYm(v)===m&&(!v.ata||v.ata.slice(0,7)===m)).length, type:'confirmed'}; });
  const salesAct = m=>vs.filter(v=>v.sales_month===m).length;
  const recent6 = []; for(let i=5;i>=0;i--) recent6.push(salesAct(ymAdd(BASE_YM,-i)));
  const avg6 = Math.round(recent6.reduce((a,b)=>a+b,0)/6);
  const sales = months.map(m=>{ if(ymDiff(m,BASE_YM)<=0) return {v:salesAct(m), type:'actual'}; const k='sales|'+vs._key+'|'+m; return {v: KF.plans[k] ?? avg6, type:'plan', key:k}; });
  // OH Stock(월말) = 전월 + Arrival − Sales ; 시작값 = 2025-12 말 재고
  const start = closingStock(ymAdd(KUFRI_START,-1)).filter(x=>vs.includes(x.v)).length;
  let prev=start; const oh = months.map((m,i)=>{ prev = prev + arrival[i].v - sales[i].v; return {v:prev, type: ymDiff(m,BASE_YM)<=0?'actual':'plan'}; });
  // In Transit(월말) = PM 도래 & 입항 미도래
  const transit = months.map(m=>({v: vs.filter(v=>v.current_status!=='Cancelled' && v.pm && ymDiff(v.pm,m)<=0 && (expectedArrivalYm(v)? ymDiff(expectedArrivalYm(v),m)>0 : false)).length, type: ymDiff(m,BASE_YM)<=0?'actual':'confirmed'}));
  // 재고월수 = (OH + In Transit) ÷ 당월 포함 최근 3개월 평균 Sales
  const ratio = months.map((m,i)=>{ const s=[sales[i].v, (sales[i-1]||{v:salesAct(ymAdd(m,-1))}).v, (sales[i-2]||{v:salesAct(ymAdd(m,-2))}).v]; const avg=s.reduce((a,b)=>a+b,0)/3; return {v: avg? (oh[i].v+transit[i].v)/avg : null}; });
  return {prod, arrival, sales, oh, transit, ratio, avg6};
}
PAGES.kufri = {
  title:'KUFRI 생산판매계획', sub:'모델 × 월 매트릭스 · 실적 월 자동 집계 · 미래 월 계획 입력',
  render(root){
    root.innerHTML = `<div class="card"><div class="card-h">
      <label class="small muted">${tx('연도')} <select id="kfYear">${['2026','2027','2028'].map(y=>`<option ${KF.year===y?'selected':''}>${y}</option>`).join('')}</select></label>
      <label class="small muted">${tx('차종')} <select id="kfVeh"><option value="">${tx('전체')}</option>${VEHICLE_TYPES.map(t=>`<option ${KF.vehicle===t?'selected':''}>${t}</option>`).join('')}</select></label>
      <label class="toggle editor-only"><input type="checkbox" id="kfEdit" ${KF.edit?'checked':''}> ${tx('판매계획 입력 모드')}</label>${note('P1')}
      <span class="spacer"></span>
      <span class="lg"><span class="sw" style="background:#fff"></span>${tx('실적(≤기준월)')}</span><span class="lg"><span class="sw" style="background:#eef5fd;border-color:#b9d3f5"></span>${tx('확정(AFAB 오더·잠금)')}</span><span class="lg"><span class="sw" style="background:#eef9f1;border-color:#b7e0c3"></span>${tx('계획(입력)')}</span><span class="lg"><span class="sw" style="background:#fff4e0;border-color:#f3d9a8"></span>${tx('기준월')}</span>
      <div class="btn-group">${note('P4')}<button class="btn primary editor-only" onclick="describe('계획 확정','현재 sales_plan/prod_plan을 KUFRI_Plan에 버전(v2026-10b)으로 저장하고 confirmed_by/at을 기록합니다. 이전 버전은 조회만 가능.')">${tx('계획 확정')}</button><button class="btn editor-only" disabled title="2차 범위">${tx('시나리오 복제 (2차)')}</button><button class="btn" onclick="describe('Kufri Excel 내보내기','기존 Kufri 엑셀 레이아웃(모델 × 월, Production/Arrival/Sales/OH/In Transit)을 재현한 .xlsx 생성')">Kufri Excel</button></div></div>
      <div class="kufri-wrap" id="kfWrap"></div>
      <div class="muted small" style="margin-top:8px">Production: 실적 = PM(final) 해당 월 차량 수(Cancelled 제외), 미래 = AFAB 확정 오더 수(잠금), 2028 이후 = prod_plan 입력 · Arrival: ETA Final → Pl.arrival → PM+리드타임 · Sales 계획 초기값 = 최근 6개월 평균(당월 포함) · OH Stock(월말) = 전월 + Arrival − Sales(보세+통관) · In Transit(월말) = PM 도래 & 입항 미도래 · 재고월수 = (OH + In Transit) ÷ 당월 포함 최근 3개월 평균 Sales → 정상 ≤2.0 / 주의 ≤3.0 / 위험 (제안값)</div></div>`;
    el('kfYear').onchange=e=>{ KF.year=e.target.value; drawKufri(); }; el('kfVeh').onchange=e=>{ KF.vehicle=e.target.value; drawKufri(); };
    const ed=el('kfEdit'); if(ed) ed.onchange=e=>{ KF.edit=e.target.checked; drawKufri(); };
    drawKufri();
  }
};
function drawKufri(){
  const months=[]; for(let i=0;i<12;i++) months.push(KF.year+'-'+pad2(i+1));
  const base = vs=>VEHICLES.filter(v=>v.current_status!=='Cancelled' && (!KF.vehicle||v.vehicle===KF.vehicle));
  const all = base(); all._key='ALL';
  const keys = [...new Set(all.map(v=>v.model_key))].sort();
  const ratioCls = r=> r==null?'': r<=2?'ratio-ok': r<=3?'ratio-warn':'ratio-danger';
  const ratioTxt = r=> r==null?'—': r.toFixed(1)+(r<=2?tx(' 정상'): r<=3?tx(' 주의'):tx(' 위험'));
  const cell = (c,m,rowKey)=>{ const isBase=m===BASE_YM; if(c.type==='plan' && KF.edit && c.key) return `<td class="plan ${isBase?'base':''}"><input value="${c.v}" data-plan="${c.key}"></td>`; return `<td class="${c.type} ${isBase?'base':''}">${c.v==null?'—':num(c.v)}</td>`; };
  const block = (label, vs, isTotal)=>{
    const r = kufriRows(vs, months); const sum = arr=>arr.reduce((a,c)=>a+(c.v||0),0);
    const row = (lbl, arr, main, extra)=>`<tr class="${isTotal?'total':''}"><td class="rowlbl ${main?'main':''}">${lbl}</td>${arr.map((c,i)=>cell(c,months[i])).join('')}<td class="num">${extra!=null?extra:num(sum(arr))}</td></tr>`;
    const fixed = months.map((m,i)=>({v: r.prod[i].v + (r.prod[i+1]? r.prod[i+1].v : 0), type: ymDiff(m,BASE_YM)<=0?'actual':'confirmed'}));
    return (isTotal?'':`<tr class="grp" data-key="${esc(vs._key)}"><td colspan="${months.length+2}">${KF.collapsed.has(vs._key)?'▸':'▾'} ${esc(label)} <span class="muted small" style="font-weight:500">${tx('{n}대 · 리드타임 {lt}개월', {n:num(vs.length), lt:vs[0]?vs[0].lead_time:3})}</span></td></tr>`) +
      (KF.collapsed.has(vs._key)?'' : row('Production', r.prod, true) + row('Arrival', r.arrival) + row('Sales', r.sales) + row(tx('OH Stock (월말)'), r.oh, false, '') + row(tx('In Transit (월말)'), r.transit, false, '') +
      `<tr class="${isTotal?'total':''}"><td class="rowlbl">${tx('재고월수')}</td>${r.ratio.map((c,i)=>`<td class="${ratioCls(c.v)} ${months[i]===BASE_YM?'base':''}">${ratioTxt(c.v)}</td>`).join('')}<td></td></tr>` +
      (isTotal? `<tr class="total"><td class="rowlbl main">${tx('Fixed Order (당월+익월 Production)')}</td>${fixed.map((c,i)=>cell(c,months[i])).join('')}<td></td></tr>`:''));
  };
  let h = `<table class="kufri"><thead><tr><th>${tx('모델 (Vehicle | Model | Type | Axle | Cab)')} ${note('P2')}</th>${months.map(m=>`<th class="${m===BASE_YM?'base':''}">${m}</th>`).join('')}<th>${tx('합계')}</th></tr></thead><tbody>`;
  h += `<tr class="grp"><td colspan="${months.length+2}">${tx('전체 합계')} ${note('P3')} <span class="muted small" style="font-weight:500">${KF.vehicle||tx('전 차종')} · ${tx('{n}대', {n:num(all.length)})}</span></td></tr>` + block('전체', all, true);
  keys.forEach(k=>{ const vs = all.filter(v=>v.model_key===k); vs._key=k; h += block(k.replace(/\|/g,' | '), vs, false); }); // 11/6: 그룹 제목 = 묶음 키(model_key) 그대로 → Vehicle | Model | Type | Axle | Cab
  h += '</tbody></table>';
  const w = el('kfWrap'); w.innerHTML = h;
  qa('tr.grp[data-key]', w).forEach(tr=>tr.onclick=()=>{ const k=tr.dataset.key; if(KF.collapsed.has(k)) KF.collapsed.delete(k); else KF.collapsed.add(k); drawKufri(); });
  qa('input[data-plan]', w).forEach(i=>i.onchange=()=>{ KF.plans[i.dataset.plan]=Number(i.value)||0; drawKufri(); toast('판매계획 수정(목업)', i.dataset.plan.replace('sales|','').replace('|',' · ')+' → '+i.value+'대 · OH Stock·재고월수 재계산됨 (저장은 "계획 확정")'); });
}
