'use strict';
/* ===== 재고현황 — Closing Stock Status 리포트 (K1~K2) ===== */
const MY_COLORS = {'MY24':'var(--s7)','MY25':'var(--s1)','MY26':'var(--s3)','MY27':'var(--s4)','기타':'#9aa5b1'};
const MY_KEYS = ['MY24','MY25','MY26','MY27'];
PAGES.stock = {
  title:'재고현황', sub:'Closing Stock Status · 월말 마감 재고 (입고일 = ETA Final Arrival)',
  render(root, params){
    const opts = []; for(let i=5;i>=1;i--) opts.push(ymAdd(BASE_YM,-i)); // 최근 5개월 월말 마감
    let sel = params.get('m') || 'current';
    const draw = ()=>{
      const items = closingStock(sel); const list = items.map(x=>x.v);
      const label = sel==='current' ? `현재 (${TODAY_S}, 상태 Bonded Stock·OH Stock 기준)` : `${sel} 월말 마감 (${fmtD(monthEnd(sel))})`;
      const myOf = v=> MY_KEYS.includes(v.model_year)? v.model_year : '기타';
      const myCnt = countBy(list, myOf); const total=list.length;
      const bonded = items.filter(x=>!x.cleared).length, cleared = items.filter(x=>x.cleared).length;
      const cards = `<div class="grid4" style="grid-template-columns:1.3fr repeat(4,1fr)">
        <div class="card kpi"><span class="label">Total Stock ${note('K1')}</span><span class="value num">${num(total)}</span><span class="foot">보세(Bonded) ${num(bonded)} · 통관(OH) ${num(cleared)} · 보세/통관 = Customs Clearance DATE ≤ 월말</span></div>
        ${MY_KEYS.map(k=>`<div class="card kpi"><span class="label"><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${MY_COLORS[k]};margin-right:5px"></span>${k}</span><span class="value num">${num(myCnt[k]||0)}</span><span class="foot">${pct(myCnt[k]||0,total)}</span></div>`).join('')}
      </div>`;
      const legend = `<div class="my-legend">연식(MY) 범례: ${[...MY_KEYS,'기타'].map(k=>`<span><span class="sw" style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${MY_COLORS[k]};vertical-align:middle;margin-right:4px"></span>${k}${k==='기타'?' (MY23 이하·판독 불가)':''}</span>`).join('')} <span class="muted">· MY = VIN 10번째 자리 (M=21 … T=26 V=27 W=28)</span></div>`;
      const segsOf = vs=>{ const c=countBy(vs,myOf); return [...MY_KEYS,'기타'].map(k=>({name:k,color:MY_COLORS[k],value:c[k]||0})); };
      // By Vehicle
      const byVeh = VEHICLE_TYPES.map(t=>({t, vs:list.filter(v=>v.vehicle===t)})).filter(x=>x.vs.length);
      const maxV = Math.max(1,...byVeh.map(x=>x.vs.length)); hbar._grand=total;
      const byVehicle = `<div class="card"><div class="section-h" style="margin-top:0">By Vehicle ${note('K2')}<span class="sub">차종별 · 막대 길이 = 대수 · 우측 대수·비율</span></div><div class="hbars">${byVeh.map(x=>hbar(x.t, segsOf(x.vs), x.vs.length, maxV)).join('')}</div></div>`;
      // By Model (차종 섹션 안 모델별)
      const modelName = v=>[v.gen,v.model,v.axle,v.cab,v.option].filter(Boolean).join(' · ');
      const byModel = `<div class="card"><div class="section-h" style="margin-top:0">By Model<span class="sub">차종 섹션 안 모델별 · 모델명 = Gen · Model · Type · Cab · Option</span></div>
        ${byVeh.map(x=>{ const groups = Object.values(x.vs.reduce((a,v)=>{ const k=modelName(v); (a[k]=a[k]||{k,vs:[]}).vs.push(v); return a; },{})).sort((a,b)=>b.vs.length-a.vs.length);
          return `<div class="section-h">${x.t}<span class="sub">${num(x.vs.length)}대 · ${pct(x.vs.length,total)}</span></div><div class="hbars">${groups.map(g=>hbar(g.k, segsOf(g.vs), g.vs.length, maxV, 'model')).join('')}</div>`; }).join('')}</div>`;
      el('stockBody').innerHTML = `<div class="muted small" style="margin:-4px 0 10px">${label} · 월말 마감 판정 = Cancelled 제외 · 입고일(ETA Final Arrival) ≤ 월 말일 · Sales Month 공란 또는 해당 월 이후(미판매)</div>` + cards + legend + byVehicle + byModel;
    };
    root.innerHTML = `<div class="card"><div class="card-h"><h2>기준월</h2>
      <select id="stockSel">${opts.map(m=>`<option value="${m}" ${sel===m?'selected':''}>${m} 월말 마감</option>`).join('')}<option value="current" ${sel==='current'?'selected':''}>현재 (${TODAY_S})</option></select>
      <span class="spacer"></span><div class="btn-group"><button class="btn" onclick="describe('마감 리포트 HTML 내보내기','기존 월간 Closing Stock Status HTML 리포트와 동일 구성으로 단일 HTML 파일을 생성해 다운로드 + /Exports/ 저장합니다.')">리포트 HTML</button><button class="btn" onclick="describe('Excel 내보내기','요약·By Vehicle·By Model 시트 3개로 .xlsx 생성(SheetJS)')">Excel</button></div></div>
      <div id="stockBody"></div></div>`;
    el('stockSel').onchange = e=>{ sel=e.target.value; draw(); };
    draw();
  }
};
