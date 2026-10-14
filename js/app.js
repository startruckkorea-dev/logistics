'use strict';
/* ===== 앱 셸: 메뉴 바(G1) · 제목 줄(G2) · 역할(G3) · 해시 라우터 ===== */
const MENU = [
  ['dashboard','대시보드'], ['logistics','Logistics 차량 마스터'], ['shipping','선적 · 입항'], ['stock','재고현황'], ['afab','AFAB 업로드'], ['kufri','KUFRI 생산판매계획'], ['settings','마스터 · 설정'],
];
function parseHash(){ const h=(location.hash||'#/dashboard').slice(2); const [path, qs]=h.split('?'); return {page: path||'dashboard', params:new URLSearchParams(qs||'')}; }
function renderTop(){
  const {page} = parseHash();
  el('nav').innerHTML = MENU.map(m=>`<a href="#/${m[0]}" class="${page===m[0]?'active':''}">${m[1]}</a>`).join('');
}
function route(){
  const {page, params} = parseHash();
  const p = PAGES[page] || PAGES.dashboard;
  renderTop(); closeDrawer(); closeModal();
  el('pageTitle').textContent = p.title; el('pageSub').textContent = p.sub||'';
  const root = el('app'); root.innerHTML=''; p.render(root, params);
  window.scrollTo(0,0);
}
function globalSearch(text){
  const t = text.trim().toLowerCase(); if(!t) return;
  const hits = VEHICLES.filter(v=>[v.commission_no,v.vin_no,v.bl_no].some(x=>x&&String(x).toLowerCase()===t));
  const partial = hits.length? hits : VEHICLES.filter(v=>[v.commission_no,v.vin_no,v.bl_no].some(x=>x&&String(x).toLowerCase().includes(t)));
  if(partial.length===1){ openVehicle(partial[0].commission_no); toast('1건 일치 → 상세 즉시 표시', partial[0].commission_no); }
  else if(partial.length===0){ toast('검색 결과 없음', `Comm/VIN/B/L "${text}" 과 일치하는 차량이 없습니다.`); }
  else { location.hash = '#/logistics?q='+encodeURIComponent(text); toast(`${num(partial.length)}건 일치 → Logistics 목록`, '검색어 필터 적용'); }
}
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', ()=>{
  el('roleSel').onchange = e=>{ state.role=e.target.value; state.user = state.role==='Editor'?'정물류':'박대표'; document.body.classList.toggle('viewer', state.role!=='Editor'); el('userName').textContent=state.user; route(); toast(`역할 전환: ${state.role}`, state.role==='Editor'?'입력·반영·확정 버튼이 표시됩니다.':'Viewer에게는 입력·반영·확정 버튼이 보이지 않습니다.'); };
  el('notesChk').onchange = e=>{ state.notes=e.target.checked; document.body.classList.toggle('notes', state.notes); };
  el('gsearch').addEventListener('keydown', e=>{ if(e.key==='Enter') globalSearch(e.target.value); });
  el('gsearchBtn').onclick = ()=>globalSearch(el('gsearch').value);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeDrawer(); closeModal(); } });
  el('drawer-bg').onclick = closeDrawer; el('modal-bg').addEventListener('click', e=>{ if(e.target===el('modal-bg')) closeModal(); });
  route();
});
