'use strict';
/* ===== 재고현황 — Closing Stock Status 리포트 (K1~K2) ===== */
const MY_COLORS = {'MY24':'var(--s7)','MY25':'var(--s1)','MY26':'var(--s3)','MY27':'var(--s4)','기타':'#9aa5b1'};
const MY_KEYS = ['MY24','MY25','MY26','MY27'];
PAGES.stock = {
  title:'재고현황', sub:'Closing Stock Status · 월말 마감 재고 (입고일 = ETA Final Arrival)',
  render(root, params){
    const opts = []; for(let i=5;i>=1;i--) opts.push(ymAdd(BASE_YM,-i)); // 최근 5개월 월말 마감
    let sel = params.get('m') || 'current';
    let view = params.get('view')==='pipe' ? 'pipe' : 'stock'; // 10/27 #15: 'stock' = Bonded + OH Stock(현행) · 'pipe' = Ordered(Fixed) ~ OH Stock 확장 뷰 (현재 기준만 — 과거 시점의 주문 단계는 복원 불가라 월말 마감 없음)
    const PIPE_STAGES = STAGES.slice(3,9); // Ordered(Fixed) ~ OH Stock
    const draw = ()=>{
      if(view==='pipe') sel = 'current';
      const items = closingStock(sel, view); const list = items.map(x=>x.v);
      const label = view==='pipe' ? tx('현재 ({d}, 상태 Ordered(Fixed) ~ OH Stock 기준)', {d:TODAY_S}) : sel==='current' ? tx('현재 ({d}, 상태 Bonded Stock·OH Stock 기준)', {d:TODAY_S}) : tx('{m} 월말 마감 ({d})', {m:sel, d:fmtD(monthEnd(sel))});
      const myOf = v=> MY_KEYS.includes(v.model_year)? v.model_year : '기타';
      const myCnt = countBy(list, myOf); const total=list.length;
      const bonded = items.filter(x=>!x.cleared).length, cleared = items.filter(x=>x.cleared).length;
      const stageTxt = PIPE_STAGES.map(s=>`${s} ${num(list.filter(v=>v.current_status===s).length)}`).join(' · '); // 확장 뷰 Total 카드 하단 = 단계별 대수 (10/27 #15)
      const totalCard = view==='pipe'
        ? `<div class="card kpi"><span class="label">${tx('Total (Ordered(Fixed) ~ OH Stock)')} ${note('K1')}</span><span class="value num">${num(total)}</span><span class="foot">${esc(stageTxt)}</span></div>`
        : `<div class="card kpi"><span class="label">Total Stock ${note('K1')}</span><span class="value num">${num(total)}</span><span class="foot">${tx('보세(Bonded) {b} · 통관(OH) {c} · 보세/통관 = Customs Clearance DATE ≤ 월말', {b:num(bonded), c:num(cleared)})}</span></div>`;
      const cards = `<div class="grid4" style="grid-template-columns:1.3fr repeat(4,1fr)">
        ${totalCard}
        ${MY_KEYS.map(k=>`<div class="card kpi"><span class="label"><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${MY_COLORS[k]};margin-right:5px"></span>${k}</span><span class="value num">${num(myCnt[k]||0)}</span><span class="foot">${pct(myCnt[k]||0,total)}</span></div>`).join('')}
      </div>`;
      const legend = `<div class="my-legend">${tx('연식(MY) 범례')}: ${[...MY_KEYS,'기타'].map(k=>`<span><span class="sw" style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${MY_COLORS[k]};vertical-align:middle;margin-right:4px"></span>${tx(k)}${k==='기타'?tx(' (MY23 이하·판독 불가)'):''}</span>`).join('')} <span class="muted">${tx('· MY = VIN 10번째 자리 (M=21 … T=26 V=27 W=28)')}</span></div>`;
      const segsOf = vs=>{ const c=countBy(vs,myOf); return [...MY_KEYS,'기타'].map(k=>({name:tx(k),color:MY_COLORS[k],value:c[k]||0})); };
      // By Vehicle
      const byVeh = VEHICLE_TYPES.map(t=>({t, vs:list.filter(v=>v.vehicle===t)})).filter(x=>x.vs.length);
      const maxV = Math.max(1,...byVeh.map(x=>x.vs.length)); hbar._grand=total;
      const byVehicle = `<div class="card"><div class="section-h" style="margin-top:0">By Vehicle ${note('K2')}<span class="sub">${tx('차종별 · 막대 길이 = 대수 · 우측 대수·비율')}</span></div><div class="hbars">${byVeh.map(x=>hbar(x.t, segsOf(x.vs), x.vs.length, maxV)).join('')}</div></div>`;
      // By Model (차종 섹션 안 모델별)
      const modelName = v=>[v.gen,v.model,v.axle,v.cab,v.option].filter(Boolean).join(' · ');
      const byModel = `<div class="card"><div class="section-h" style="margin-top:0">By Model<span class="sub">${tx('차종 섹션 안 모델별 · 모델명 = Gen · Model · Type · Cab · Option')}</span></div>
        ${byVeh.map(x=>{ const groups = Object.values(x.vs.reduce((a,v)=>{ const k=modelName(v); (a[k]=a[k]||{k,vs:[]}).vs.push(v); return a; },{})).sort((a,b)=>b.vs.length-a.vs.length);
          return `<div class="section-h">${x.t}<span class="sub">${tx('{n}대', {n:num(x.vs.length)})} · ${pct(x.vs.length,total)}</span></div><div class="hbars">${groups.map(g=>hbar(g.k, segsOf(g.vs), g.vs.length, maxV, 'model')).join('')}</div>`; }).join('')}</div>`;
      el('stockBody').innerHTML = `<div class="muted small" style="margin:-4px 0 10px">${label} · ${view==='pipe'? tx('확장 뷰는 현재 기준만 지원 (월말 마감 없음)') : tx('월말 마감 판정 = Cancelled 제외 · 입고일(ETA Final Arrival) ≤ 월 말일 · Sales Month 공란 또는 해당 월 이후(미판매)')}</div>` + cards + legend + byVehicle + byModel;
      // 10/27 #15: 탭 강조 · 확장 뷰에서는 기준월 select를 '현재'로 고정
      qa('#stockTabs .tab').forEach(t=>t.classList.toggle('active', t.dataset.view===view));
      const s = el('stockSel'); s.value = sel; s.disabled = view==='pipe'; s.title = view==='pipe'? tx('확장 뷰는 현재 기준만 지원 (월말 마감 없음)') : '';
    };
    root.innerHTML = `<div class="card"><div class="tabs" id="stockTabs"></div><div class="card-h"><h2>${tx('기준월')}</h2>
      <select id="stockSel">${opts.map(m=>`<option value="${m}" ${sel===m?'selected':''}>${tx('{m} 월말 마감', {m})}</option>`).join('')}<option value="current" ${sel==='current'?'selected':''}>${tx('현재 ({d})', {d:TODAY_S})}</option></select>
      <span class="spacer"></span><div class="btn-group"><button class="btn" id="stockHtml">${tx('리포트 HTML')}</button><button class="btn" id="stockXlsx">Excel</button></div></div>
      <div id="stockBody"></div></div>`;
    // 10/27 #15: 상단 탭 2개 (Logistics 탭과 같은 모양, css #stockTabs) · 내보내기 설명에 현재 뷰 표기
    const VIEWS = [['stock','Bonded + OH Stock'], ['pipe','Ordered(Fixed) ~ OH Stock']];
    const viewLabel = ()=> VIEWS.find(x=>x[0]===view)[1];
    el('stockTabs').append(...VIEWS.map(([k,l])=>mk('span', {class:'tab', 'data-view':k, onclick:()=>{ if(view===k) return; view=k; draw(); }}, tx(l))));
    el('stockHtml').onclick = ()=>describe('마감 리포트 HTML 내보내기', `기존 월간 Closing Stock Status HTML 리포트와 동일 구성으로 단일 HTML 파일을 생성해 다운로드 + /Exports/ 저장합니다. (현재 뷰: ${viewLabel()})`);
    el('stockXlsx').onclick = ()=>describe('Excel 내보내기', `요약·By Vehicle·By Model 시트 3개로 .xlsx 생성(SheetJS) (현재 뷰: ${viewLabel()})`);
    el('stockSel').onchange = e=>{ sel=e.target.value; draw(); };
    draw();
  }
};
