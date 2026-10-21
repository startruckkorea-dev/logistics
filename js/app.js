'use strict';
/* ===== 앱 셸: 메뉴 바(G1) · 역할(G3) · 해시 라우터 ===== */
const MENU = [
  ['dashboard','대시보드'], ['logistics','Logistics 차량 마스터'], ['shipping','선적 · 입항'], ['stock','재고현황'], ['afab','AFAB 업로드'], ['kufri','KUFRI 생산판매계획'], ['settings','마스터 · 설정'],
];
function parseHash(){ const h=(location.hash||'#/dashboard').slice(2); const [path, qs]=h.split('?'); return {page: path||'dashboard', params:new URLSearchParams(qs||'')}; }
function renderTop(){
  const {page} = parseHash();
  el('nav').innerHTML = MENU.map(m=>`<a href="#/${m[0]}" class="${page===m[0]?'active':''}">${tx(m[1])}</a>`).join('');
}
function route(){
  const {page, params} = parseHash();
  const p = PAGES[page] || PAGES.dashboard;
  renderTop(); closeDrawer(); closeModal();
  const root = el('app'); root.innerHTML=''; p.render(root, params);
  window.scrollTo(0,0);
}
window.addEventListener('hashchange', route);
// ---- 언어 토글 (한/EN): 사전·tx()는 common.js. 전환 시 현재 화면을 다시 그린다 (열린 Drawer·Modal은 닫힘) ----
function renderAfabLast(){ // 상단 'AFAB 최근 반영' 표시: AFAB_Uploads 최신 행 기준
  const d = el('afabLast'), u = AFAB_UPLOADS[0]; if(!d||!u) return;
  d.replaceChildren(tx('AFAB 최근 반영')+' ', mk('b', null, u.upload_at), ' · '+tx('{rows}행 · 변경 {n}', {rows:num(u.rows), n:num(u.changed_count)}));
}
function setLang(lang){
  if(lang===state.lang) return;
  if(typeof EDIT!=='undefined' && EDIT.on && pendingCount()>0){ toast(tx('언어 전환 불가'), tx("저장 대기 중인 편집 내용이 있습니다. '편집 종료'로 저장한 뒤 전환하세요.")); return; } // 차량 마스터 편집 중 저장 대기 값이 있으면 전환하지 않음
  state.lang = lang; document.documentElement.lang = lang;
  qa('#langbox button').forEach(b=>b.classList.toggle('active', b.dataset.lang===lang));
  document.title = tx('STK Logistics Hub — 화면 목업 v0.1'); el('logoTag').textContent = tx('목업 v0.1');
  renderAfabLast(); route();
}
window.addEventListener('DOMContentLoaded', ()=>{
  renderAfabLast(); qa('#langbox button').forEach(b=>b.onclick=()=>setLang(b.dataset.lang));
  el('userName').textContent = state.user; // 초기 사용자명: USERS 기준 (common.js state)
  el('roleSel').onchange = e=>{ state.role=e.target.value; const u = USERS.find(x=>x.role===state.role); if(u) state.user = u.name; document.body.classList.toggle('viewer', state.role!=='Editor'); el('userName').textContent=state.user; route(); toast(`역할 전환: ${state.role}`, state.role==='Editor'?'입력·반영·확정 버튼이 표시됩니다.':'Viewer에게는 입력·반영·확정 버튼이 보이지 않습니다.'); };
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeDrawer(); closeModal(); } });
  el('drawer-bg').onclick = closeDrawer; el('modal-bg').addEventListener('click', e=>{ if(e.target===el('modal-bg')) closeModal(); });
  route();
});
