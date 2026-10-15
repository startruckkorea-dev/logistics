'use strict';
/* =====================================================================
   STK Logistics Hub 목업 — 하드코딩 샘플 데이터
   시드 고정 생성기로 2,061대를 만들어 단계별 건수를 문서 §7 샘플 검증 수치와 맞춘다.
   Ordered 454 · In Production 162 · Shipment scheduled 14 · In Transit 66
   · Bonded Stock 186 · OH Stock 91 · Sold 1,054 · Cancelled 34 = 2,061
   ===================================================================== */

// ---- 기준일 (문서 작성 기준일 2026-10-07로 고정) ----
const TODAY = new Date(2026, 9, 7);
const TODAY_S = '2026-10-07';
const BASE_YM = '2026-10';

// ---- 유틸 ----
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mulberry32(20261007);
const rndX = mulberry32(20261013); // 신규 열(Exception Case·Ref Commission No) 전용 — 기존 가짜값의 난수 순서를 바꾸지 않기 위해 분리
const ri = (a,b)=>a+Math.floor(rnd()*(b-a+1));
const pick = arr=>arr[Math.floor(rnd()*arr.length)];
const pad2 = n=>String(n).padStart(2,'0');
function fmtD(d){ return d? `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`:''; }
function ymOf(d){ return d? `${d.getFullYear()}-${pad2(d.getMonth()+1)}`:''; }
function addD(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function parseD(s){ if(!s) return null; const p=s.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]||1); }
function diffDays(a,b){ return Math.round((a-b)/86400000); }
function ymAdd(ym,n){ const [y,m]=ym.split('-').map(Number); return ymOf(new Date(y,m-1+n,1)); }
function ymDiff(a,b){ const [ay,am]=a.split('-').map(Number); const [by,bm]=b.split('-').map(Number); return (ay-by)*12+(am-bm); }
function monthEnd(ym){ const [y,m]=ym.split('-').map(Number); return new Date(y,m,0); }
function randDate(a,b){ const da=parseD(a), db=parseD(b); return addD(da, ri(0, diffDays(db,da))); }
function randDateInMonth(ym){ const e=monthEnd(ym); return new Date(e.getFullYear(), e.getMonth(), ri(1,e.getDate())); }

// ---- Model_Master (baumuster 접두 8자리 + type_desc → 모델 속성) ----
const MODEL_MASTER = [
  {prefix:'96340312', code2:'7AA', suffix:'LSDNA6x2', type_desc:'2863 LSDNA6x2 F 16', vehicle:'Tractor',   gen:'MP5',     model:'2863LS',     axle:'6x2', cab:'S5F', option:'ProCabin', lead:3, w:300, active:true},
  {prefix:'96340313', code2:'7AB', suffix:'LSDNA6x2', type_desc:'2863 LSDNA6x2 F 16', vehicle:'Tractor',   gen:'MP5',     model:'2863LS',     axle:'6x2', cab:'G5F', option:'ProCabin', lead:3, w:180, active:true},
  {prefix:'96340210', code2:'6AA', suffix:'LSDNA6x2', type_desc:'2653 LSDNA6x2 F 16', vehicle:'Tractor',   gen:'MP5',     model:'2653LS',     axle:'6x2', cab:'S5F', option:'',         lead:3, w:200, active:true},
  {prefix:'96340211', code2:'6AB', suffix:'LSDNA6x2', type_desc:'2653 LSDNA6x2 F 16', vehicle:'Tractor',   gen:'MP5',     model:'2653LS',     axle:'6x2', cab:'G5F', option:'CTT',      lead:3, w:100, active:true},
  {prefix:'96340110', code2:'5AA', suffix:'LSDNA4x2', type_desc:'1853 LSDNA4x2 F 16', vehicle:'Tractor',   gen:'MP5',     model:'1853LS',     axle:'4x2', cab:'S5F', option:'',         lead:2, w:150, active:true},
  {prefix:'96340410', code2:'6AC', suffix:'LSDNA6x2', type_desc:'2663 LSDNA6x2 F 16', vehicle:'Tractor',   gen:'MP5',     model:'2663LS',     axle:'6x2', cab:'S5F', option:'6900WB',   lead:3, w:174, active:true},
  {prefix:'99040010', code2:'9EA', suffix:'LS 6x2',   type_desc:'eActros 600 LS 6x2',  vehicle:'Tractor',   gen:'eActros', model:'eActros600', axle:'6x2', cab:'S5F', option:'',         lead:4, w:20,  active:true},
  {prefix:'96302110', code2:'3AA', suffix:'L 4x2',    type_desc:'2135 L 4x2 F 16',     vehicle:'Heavy-MDT', gen:'MP5',     model:'2135L',      axle:'4x2', cab:'C3H', option:'',         lead:2, w:150, active:true},
  {prefix:'96302111', code2:'3AB', suffix:'L 4x2',    type_desc:'2135 L 4x2 F 16',     vehicle:'Heavy-MDT', gen:'MP5',     model:'2135L',      axle:'4x2', cab:'M',   option:'',         lead:2, w:80,  active:true},
  {prefix:'96302210', code2:'3BA', suffix:'L 6x2',    type_desc:'2540 L 6x2 F 16',     vehicle:'Heavy-MDT', gen:'MP5',     model:'2540L',      axle:'6x2', cab:'C3H', option:'',         lead:3, w:60,  active:true},
  {prefix:'96302310', code2:'3BB', suffix:'L 6x2',    type_desc:'2545 L 6x2 F 16',     vehicle:'Heavy-MDT', gen:'MP5',     model:'2545L',      axle:'6x2', cab:'C3M', option:'',         lead:3, w:57,  active:true},
  {prefix:'96303110', code2:'4AA', suffix:'L 6x2',    type_desc:'3253 L 6x2 F 16',     vehicle:'HDT-Rigid', gen:'MP5',     model:'3253L',      axle:'6x2', cab:'B5F', option:'',         lead:4, w:100, active:true},
  {prefix:'96303210', code2:'4BA', suffix:'L 8x4',    type_desc:'4153 L 8x4 F 16',     vehicle:'HDT-Rigid', gen:'MP5',     model:'4153L',      axle:'8x4', cab:'B5F', option:'',         lead:5, w:80,  active:true},
  {prefix:'96303310', code2:'4AB', suffix:'L 6x2',    type_desc:'2553 L 6x2 F 16',     vehicle:'HDT-Rigid', gen:'MP5',     model:'2553L',      axle:'6x2', cab:'C3M', option:'',         lead:4, w:60,  active:true},
  {prefix:'96303410', code2:'4AC', suffix:'L 6x2',    type_desc:'3263 L 6x2 F 16',     vehicle:'HDT-Rigid', gen:'MP5',     model:'3263L',      axle:'6x2', cab:'S5F', option:'',         lead:4, w:64,  active:true},
  {prefix:'96304110', code2:'5KA', suffix:'K 8x4',    type_desc:'4148 K 8x4 F 16',     vehicle:'Tipper',    gen:'MP5',     model:'4148K',      axle:'8x4', cab:'M',   option:'',         lead:4, w:100, active:true},
  {prefix:'96304210', code2:'5KB', suffix:'K 6x4',    type_desc:'3348 K 6x4 F 16',     vehicle:'Tipper',    gen:'MP5',     model:'3348K',      axle:'6x4', cab:'M',   option:'',         lead:4, w:50,  active:true},
  {prefix:'96304310', code2:'5KC', suffix:'K 8x4',    type_desc:'4153 K 8x4 F 16',     vehicle:'Tipper',    gen:'MP5',     model:'4153K',      axle:'8x4', cab:'B5F', option:'',         lead:5, w:35,  active:true},
  {prefix:'96305110', code2:'8BA', suffix:'8x4',      type_desc:'4440 8x4 F 16',       vehicle:'Rigid(BB)', gen:'MP5',     model:'4440',       axle:'8x4', cab:'C3H', option:'Export',   lead:5, w:60,  active:true},
  {prefix:'96305111', code2:'8BB', suffix:'8x4',      type_desc:'4440 8x4 F 16',       vehicle:'Rigid(BB)', gen:'MP5',     model:'4440',       axle:'8x4', cab:'L',   option:'Domestic', lead:5, w:41,  active:true},
  {prefix:'96340510', code2:'7AC', suffix:'LSDNA6x2', type_desc:'2863 LSDNA6x2 F 17',  vehicle:'Tractor',   gen:'MP5',     model:'2863LS',     axle:'6x2', cab:'S5F', option:'ProCabin', lead:3, w:0,   active:false},
];
const VEHICLE_TYPES = ['Tractor','Heavy-MDT','HDT-Rigid','Tipper','Rigid(BB)'];
const COLORS = ['9147','7350','3589','5361','9040','1636','9134','7755'];
const COLOR_NAMES = {'9147':'Arctic White','7350':'Silver Grey','3589':'Jupiter Red','5361':'Steel Blue','9040':'Obsidian Black','1636':'Sun Yellow','9134':'Alpine White','7755':'Tenorite Grey'};
const SAP_CODES = ['ZCBC','ZSHP','ZVIB','ZPDY','ZIVB','ZGOR'];

// ---- 선박(항차): 운송중 6척 + 선적 예정 2척 ----
const VOYAGES = [
  {id:'V1', vessel:'Glovis Sunrise',  carrier:'EUKOR', bl:'EUKOHAM2609021', shipping:'2026-08-28', pl:'2026-10-12', eta_carrier:'2026-10-14', eta_final:'2026-10-15', kind:'transit',   n:12},
  {id:'V2', vessel:'Morning Cecilie', carrier:'EUKOR', bl:'EUKOBRV2609077', shipping:'2026-09-05', pl:'2026-10-20', eta_carrier:'2026-10-20', eta_final:'2026-10-22', kind:'transit',   n:14},
  {id:'V3', vessel:'Hoegh Trapper',   carrier:'MOL',   bl:'MOLUBRV2609112', shipping:'2026-09-14', pl:'2026-10-29', eta_carrier:'2026-11-02', eta_final:'2026-11-03', kind:'transit',   n:11},
  {id:'V4', vessel:'MOL Emissary',    carrier:'MOL',   bl:'MOLUHAM2609140', shipping:'2026-09-22', pl:'2026-11-06', eta_carrier:'2026-11-05', eta_final:'2026-11-07', kind:'transit',   n:10},
  {id:'V5', vessel:'Glovis Cardinal', carrier:'EUKOR', bl:'EUKOHAM2609188', shipping:'2026-09-30', pl:'2026-11-15', eta_carrier:'2026-11-25', eta_final:'2026-11-26', kind:'transit',   n:5},
  {id:'V6', vessel:'Eukor Pioneer',   carrier:'EUKOR', bl:'EUKOBRV2610003', shipping:'2026-10-04', pl:'2026-11-20', eta_carrier:'',           eta_final:'',           kind:'transit',   n:14},
  {id:'V7', vessel:'Morning Lady',    carrier:'EUKOR', bl:'',               shipping:'2026-10-18', pl:'2026-12-03', eta_carrier:'',           eta_final:'',           kind:'scheduled', n:8},
  {id:'V8', vessel:'Hoegh Tracer',    carrier:'MOL',   bl:'',               shipping:'2026-10-30', pl:'2026-12-14', eta_carrier:'',           eta_final:'',           kind:'scheduled', n:6},
];
const VESSEL_PAST = ['Morning Christina','Glovis Symphony','Hoegh Target','MOL Endurance','Eukor Grace','Grand Pioneer','Hyundai Glory','Morning Laura','Glovis Passion','Hoegh Berlin'];

const MY_LETTER = {2021:'M',2022:'N',2023:'P',2024:'R',2025:'S',2026:'T',2027:'V',2028:'W'};
const MY_FROM_LETTER = {M:21,N:22,P:23,R:24,S:25,T:26,V:27,W:28};
function myLetterFromPm(pm){ // VIN 익명화 대체: 3월 생산부터 다음 연식
  const [y,m]=pm.split('-').map(Number); const yy = m>=3? y+1 : y; return MY_LETTER[yy]||'T';
}

// ---- 차량 1대 생성 ----
function makeVehicle(p, m){
  const s=p.stage;
  const v={ current_status:s, status_override:'', status_reason:'', vehicle:m.vehicle, gen:m.gen, model:m.model, axle:m.axle, cab:m.cab, option:m.option,
    baumuster:m.prefix+' '+m.suffix, model_in_afab:m.type_desc, lead_time:m.lead, color_code:pick(COLORS), sub_cat: m.vehicle==='Tipper'?'KIP':(m.vehicle==='Tractor'?'SZM':'LKW'),
    vessel:'', bl_no:'', invoice_no:'', import_license:'', sap_code:'', b1_factory_order:'', sap_b1_flag:'', fleet_co:'', option_remarks:'', tires:'', order_note:'', tm_memo:'' };
  let orderD=null, pm='', tdd=null, prodDone=null, exf=null, ship=null, inv=null, pl=null, etaC=null, etaF=null, cust=null, saleD=null, chg=null;
  const seaChain=()=>{ ship=addD(etaF,-ri(40,60)); pl=addD(etaF,-ri(0,6)); etaC=addD(pl,ri(-2,3)); inv=addD(ship,2); exf=addD(ship,-ri(5,15)); prodDone=addD(exf,-ri(1,4)); tdd=addD(prodDone,-ri(1,8)); pm=ymOf(tdd); orderD=addD(tdd,-ri(100,240)); v.vessel=pick(VESSEL_PAST); v.bl_no=(rnd()<0.5?'EUKO':'MOLU')+pick(['HAM','BRV'])+ymOf(ship).slice(2,4)+ymOf(ship).slice(5,7)+String(ri(100,999)); };
  if(s==='Sold'){ saleD=randDate('2025-01-01','2026-09-30'); etaF=addD(saleD,-ri(5,200)); cust=addD(etaF,ri(3,40)); if(cust>saleD) cust=addD(saleD,-1); seaChain(); }
  else if(s==='OH Stock'){ const d= rnd()<0.6? ri(10,180): rnd()<0.7? ri(181,420): ri(421,760); etaF=addD(TODAY,-d); cust=addD(etaF,ri(5,60)); if(cust>TODAY) cust=addD(TODAY,-ri(0,3)); seaChain(); }
  else if(s==='Bonded Stock'){ const d= p.k<4? ri(800,950): p.k<10? ri(521,700): p.k<25? ri(366,520): p.k<70? ri(91,365): ri(1,90); etaF=addD(TODAY,-d); seaChain(); }
  else if(s==='In Transit'||s==='Shipment scheduled'){ const vy=p.voy; ship=parseD(vy.shipping); pl=parseD(vy.pl); etaC=parseD(vy.eta_carrier); etaF=parseD(vy.eta_final); v.vessel=vy.vessel; v.bl_no=vy.bl; exf= ship<=TODAY? addD(ship,-ri(5,15)) : addD(TODAY,-ri(1,12)); inv= s==='In Transit'? addD(ship,2):null; prodDone=addD(exf,-ri(1,4)); tdd=addD(prodDone,-ri(1,8)); pm=ymOf(tdd); orderD=addD(tdd,-ri(100,240)); }
  else if(s==='In Production'){ pm = p.past? pick(['2026-06','2026-07','2026-08','2026-09']) : '2026-10'; tdd=randDateInMonth(pm); if(p.past){ prodDone = rnd()<0.7? addD(tdd,ri(0,6)):null; exf = prodDone&&rnd()<0.6? addD(prodDone,ri(1,10)):null; } if(rnd()<0.5) pl=addD(tdd,ri(45,70)); orderD=addD(tdd,-ri(100,240)); if(p.past && p.k<12) v._noafab=true; }
  else if(s==='Ordered'){
    if(p.pm) pm=p.pm; else { const k=p.k; pm = k<70?'2026-12': k<130?'2027-01': k<200?'2027-02': k<260?'2027-03': k<315?'2027-04': k<365?'2027-05':'2027-06'; }
    if(ymDiff(pm,'2027-01')<=0){ tdd=randDateInMonth(pm); if(rnd()<0.4) pl=addD(tdd,ri(45,70)); }
    const isNew = ymDiff(pm,'2027-01')>=0 && rnd()<0.95; orderD = isNew? parseD(pick(['2026-09-19','2026-09-28'])) : addD(TODAY,-ri(5,200)); v._new=isNew;
    if(pm==='2026-11') chg=addD(parseD(pm+'-01'),-ri(40,60));
    else if(pm==='2026-12') chg=parseD(pick(['2026-10-27','2026-10-29','2026-10-30']));
    else if(pm==='2027-01') chg = (p.k-70)<21 ? parseD(pick(['2026-11-05','2026-11-06'])) : parseD('2026-11-18');
    else chg=addD(parseD(pm+'-01'),-75);
    if(!p.pm && p.k<8) v._noafab=true;
  }
  else if(s==='Cancelled'){ pm=ymAdd('2025-06', ri(0,18)); tdd=ymDiff(pm,BASE_YM)<=0? randDateInMonth(pm):null; orderD=addD(parseD(pm+'-01'),-ri(100,240)); v.status_override='Cancelled'; v.status_reason=pick(['고객 주문 취소','사양 변경으로 재발주','AFAB 목록 제외 → Cancelled 확정']); }
  if(!chg) chg=addD(orderD, ri(45,90));
  // 날짜 문자열
  v.order_date=fmtD(orderD); v.changeability_date=fmtD(chg); v.pm=pm;
  v.original_pm = (s==='Ordered'||s==='In Production') && rnd()<0.12 ? ymAdd(pm,-1) : pm;
  v.tdd_calc=fmtD(tdd); v.production_done=fmtD(prodDone); v.dispatch=fmtD(exf); v.shipping=fmtD(ship); v.invoice=fmtD(inv);
  v.invoice_no = inv? '90'+String(ri(10000000,99999999)) : '';
  v.planned_arrival=fmtD(pl); v.eta_from_eukor_pirt=fmtD(etaC); v.ata=fmtD(etaF); v.customs_clearance_date=fmtD(cust); v.sales_month=ymOf(saleD);
  v.import_license = cust? ymOf(cust).replace('-','').slice(2)+'-'+String(ri(100000,999999))+'M' : '';
  v.afab_editable = (s==='Ordered'||s==='In Production') ? (chg>TODAY?'J':'N') : (s==='Cancelled'?'B':'N');
  v.in_afab_today = !v._noafab && ['Ordered','In Production','Shipment scheduled','In Transit'].includes(s);
  // VIN/Engine (신규 2027 오더는 VIN 미부여)
  const myL = myLetterFromPm(pm);
  v.vin_no = v._new ? '' : `WDB${m.prefix.slice(0,5)}${ri(0,9)}${myL}L${String(ri(100000,999999))}`;
  v.engine_no = v.vin_no? '47191'+String(ri(100000000,999999999)) : '';
  v.vehicle_value_eur = ri(95,165)*1000+ri(0,999); v.order_value_eur = Math.round(v.vehicle_value_eur*1.19);
  // SAP·플래그
  if(ship && ship<=TODAY) { v.sap_code = s==='Sold'?'ZPDY': s==='OH Stock'?'ZCBC': s==='Bonded Stock'?'ZVIB':'ZSHP'; v.b1_factory_order='B1-'+String(ri(10000,99999)); }
  if(s==='OH Stock'||s==='Sold') v.sap_b1_flag='O';
  if(rnd()<0.1) v.fleet_co='O';
  // 메모
  if(rnd()<0.25) v.option_remarks=pick(['Retarder','Hydraulic kit','Retarder, PTO','Roof spoiler','Alcoa wheels']);
  if(rnd()<0.2) v.tires=pick(['Michelin 315/80R22.5','Continental 315/70R22.5','Hankook 385/65R22.5']);
  if(rnd()<0.08) v.order_note=pick(['Jan. 2027 오더 업데이트 (9/19)','고객 요청 생산월 연기','색상 변경 요청 접수','딜러 선판매 예약']);
  if(rnd()<0.3) v.tm_memo=pick(['AN / 2.846','AR / 3.077 / 스탠다드','Single reduction / 프리미엄','10t / 엔트리','AN / (주)대한물류','9t / 한진택배 납품']);
  // 파생
  const arrived = etaF && etaF<=TODAY;
  const refD = saleD || TODAY;
  v.days_in_stock = arrived ? Math.max(0, diffDays(refD, etaF)) : 0;
  v.stock_level = !arrived ? 'Intransit' : v.days_in_stock<60?'<2 months': v.days_in_stock<183?'<6 months': v.days_in_stock<365?'<1 year': v.days_in_stock<730?'<2 years':'>2 years';
  v.stock_age_optimus = !arrived ? 'Not shipped' : v.days_in_stock>365?'Age>1Year': v.days_in_stock>183?'Age6-12months':'Age<6months';
  v.model_year = v.vin_no ? 'MY'+MY_FROM_LETTER[v.vin_no[9]] : 'MY'+MY_FROM_LETTER[myL];
  v.model_classification = [v.gen,v.model,v.axle,v.cab,v.option].filter(Boolean).join(' ');
  v.dms_model_name = [v.vehicle,v.model,v.axle,v.cab].join(' ');
  v.model_key = [v.vehicle,v.model,v.axle,v.cab].join('|');
  v.eta_month = etaF? ymOf(etaF):''; v.tdd_month = tdd? ymOf(tdd):''; v.shipping_month = ship? ymOf(ship):'';
  const noShip = !v.vessel && !v.shipping;
  v.order_class = (s==='Ordered'||s==='In Production') && noShip ? (ymDiff(pm,BASE_YM)===0||ymDiff(pm,BASE_YM)===1 ? 'Fixed order' : ymDiff(pm,BASE_YM)>=2 ? 'Order (Changeable)' : '—') : '—';
  v.changeability_dday = (s==='Ordered' && v.afab_editable==='J') ? diffDays(chg, TODAY) : null;
  v.eta_delta = (etaF && pl) ? diffDays(etaF, pl) : null;
  v.eta_mismatch = (pl && etaC) ? Math.abs(diffDays(pl, etaC))>7 : false;
  // ---- 신규 열 (data-dictionary v2_1_2) ----
  v.bm = m.prefix+'-'+m.code2;                                   // BM = Baumuster Code1 - Baumuster Code2 (예 96302210-7AA)
  v.series = m.gen==='eActros' ? 'eActros' : (m.vehicle==='Tipper'||m.vehicle==='Rigid(BB)') ? 'Arocs' : 'Actros'; // 값 형식 Actros/Arocs/eActros (가짜값: 차종 기준)
  v.spec = [v.vehicle, v.series, v.model, v.axle, v.cab].join(' '); // Vehicle + Series + Model + Axle + Cab
  v.eta_from_tdd = tdd ? fmtD(addD(tdd,75)) : '';                 // TDD Calc + 75일
  v.color_name = COLOR_NAMES[v.color_code]||'';                   // 색상 코드 → 이름
  v.ref_commission_no = '';                                       // genVehicles에서 Commission No 부여 후 일부 채움
  // ---- 단계 분리: Ordered → Ordered(Dummy) 약 3% / Rejected 약 2% (가짜값) / 나머지는 Order 분류 규칙으로 Ordered(Fixed) · Ordered(Changeable) ----
  if(s==='Ordered'){ const x=rndX(); v.current_status = x<0.03 ? 'Ordered(Dummy)' : x<0.05 ? 'Rejected' : (v.order_class==='Fixed order' ? 'Ordered(Fixed)' : 'Ordered(Changeable)'); }
  v._sort = orderD ? orderD.getTime() : 0;
  delete v._noafab; delete v._new;
  return v;
}

function genVehicles(){
  const pool=[]; MODEL_MASTER.forEach((m,mi)=>{ for(let k=0;k<m.w;k++) pool.push(mi); });
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const plan=[]; const push=(stage,n,extra)=>{ for(let k=0;k<n;k++) plan.push(Object.assign({stage,k},extra||{})); };
  push('Sold',1054); push('OH Stock',91); push('Bonded Stock',186);
  VOYAGES.forEach(vy=>push(vy.kind==='transit'?'In Transit':'Shipment scheduled', vy.n, {voy:vy}));
  push('In Production',80,{past:true}); push('In Production',82,{past:false});
  push('Ordered',47,{pm:'2026-11'}); push('Ordered',407,{pm:null});
  push('Cancelled',34);
  const list = plan.map((p,i)=>makeVehicle(p, MODEL_MASTER[pool[i]]));
  list.sort((a,b)=>a._sort-b._sort);
  list.forEach((v,i)=>{ v.commission_no = '0'+String(71000000+i*3+ri(0,2)); v.modified = fmtD(addD(TODAY,-ri(0,30))); v.modified_by = pick(['정물류','김백업','AFAB 업로드']); });
  list.forEach(v=>{ if(rndX()<0.03) v.ref_commission_no = list[Math.floor(rndX()*list.length)].commission_no; }); // Ref Commission No: 약 3%에 다른 차량의 Comm No (규칙 없음 → 가짜값)
  return list;
}
const VEHICLES = genVehicles();
const VEHICLE_BY_COMM = Object.fromEntries(VEHICLES.map(v=>[v.commission_no, v]));

// ---- 사용자 ----
const USERS = [
  {name:'정물류', upn:'logi.jung@stk.co.kr', group:'STK-Logistics-Editors', role:'Editor', admin:true,  dept:'Ordering & Logistics'},
  {name:'김백업', upn:'backup.kim@stk.co.kr', group:'STK-Logistics-Editors', role:'Editor', admin:false, dept:'Ordering & Logistics'},
  {name:'박대표', upn:'ceo.park@stk.co.kr',   group:'STK-Logistics-Viewers', role:'Viewer', admin:false, dept:'경영진'},
  {name:'이기획', upn:'plan.lee@stk.co.kr',   group:'STK-Logistics-Viewers', role:'Viewer', admin:false, dept:'영업기획'},
  {name:'최영업', upn:'sales.choi@stk.co.kr', group:'STK-Logistics-Viewers', role:'Viewer', admin:false, dept:'영업'},
];

// ---- Vehicle_History (샘플) ----
const VEHICLE_HISTORY = (function(){
  const h=[]; const fields=['ata','vessel','pm','customs_clearance_date','eta_from_eukor_pirt','sales_month','bl_no'];
  const cand = VEHICLES.filter(v=>['In Transit','Bonded Stock','OH Stock','Shipment scheduled','In Production'].includes(v.current_status));
  for(let i=0;i<60;i++){ const v=pick(cand); const n=ri(1,3);
    for(let j=0;j<n;j++){ const f=pick(fields); const cur=v[f]||''; let old=cur;
      if(f==='ata'||f==='customs_clearance_date'||f==='eta_from_eukor_pirt'){ old = cur? fmtD(addD(parseD(cur),-ri(1,9))) : ''; }
      else if(f==='pm'||f==='sales_month'){ old = cur? ymAdd(cur,-1):''; }
      else if(f==='vessel'){ old = pick(VESSEL_PAST); } else if(f==='bl_no'){ old=''; }
      const src = ['vessel','pm','bl_no'].includes(f)? 'AFAB 업로드' : (f==='sales_month'? '규칙' : '수동');
      h.push({commission_no:v.commission_no, field:f, old_value:old, new_value:cur, changed_by: src==='AFAB 업로드'?'정물류 (업로드)':pick(['정물류','김백업']), changed_at: fmtD(addD(TODAY,-ri(0,60)))+' '+pad2(ri(8,18))+':'+pad2(ri(0,59)), source:src});
    } }
  // 10/07 업로드 실제 변경 1건 (Vessel)
  const t=VEHICLES.find(v=>v.vessel==='Eukor Pioneer');
  if(t) h.push({commission_no:t.commission_no, field:'vessel', old_value:'Morning Lady', new_value:'Eukor Pioneer', changed_by:'정물류 (업로드)', changed_at:'2026-10-07 08:42', source:'AFAB 업로드'});
  h.sort((a,b)=> a.changed_at<b.changed_at?1:-1);
  return h;
})();

// ---- AFAB_Uploads (반영 이력) ----
const AFAB_UPLOADS = [
  {upload_at:'2026-10-07 08:42', user:'정물류', file_name:'SDISP_2026-10-07.xlsx', rows:677, new_count:0, changed_count:1, removed_count:0, status:'반영 완료', error_log:''},
  {upload_at:'2026-10-06 08:35', user:'정물류', file_name:'SDISP_2026-10-06.xlsx', rows:677, new_count:0, changed_count:3, removed_count:0, status:'반영 완료', error_log:''},
  {upload_at:'2026-10-02 09:10', user:'김백업', file_name:'SDISP_2026-10-02.xlsx', rows:676, new_count:2, changed_count:5, removed_count:1, status:'반영 완료 (제외 1건 보류)', error_log:''},
  {upload_at:'2026-09-30 08:50', user:'정물류', file_name:'SDISP_2026-09-30.xlsx', rows:674, new_count:0, changed_count:0, removed_count:0, status:'검증 실패', error_log:'헤더 불일치: 열 N "LT-Quote" 누락 (31열)'},
  {upload_at:'2026-09-28 08:40', user:'정물류', file_name:'SDISP_2026-09-28.xlsx', rows:674, new_count:181, changed_count:4, removed_count:0, status:'반영 완료', error_log:''},
  {upload_at:'2026-09-19 08:38', user:'정물류', file_name:'SDISP_2026-09-19.xlsx', rows:493, new_count:186, changed_count:2, removed_count:0, status:'반영 완료', error_log:''},
];

// ---- AFAB 매핑 (§6, 32열) ----
const AFAB_MAP = [
  ['A','Auftragsnummer','commission_no','키','✓'],['B','Baumuster','baumuster(접두 8자리) → Model_Master','매핑','✓'],['C','Fahrzeug-Ident-Nr. (FIN)','vin','텍스트','✓'],
  ['D','Einsatzland','—','공란','✗'],['E','Vehicle-Ident-Nr. (VIN)','— (FIN 사용)','공란','✗'],['F','Motor-Nr.','engine_no','텍스트','✓'],['G','Ä','afab_editable','J/N/B','✓'],
  ['H','WB','wb_flag','W','△'],['I','RT/ST','rt_st','코드','△'],['J','Fahrzeugtyp','type_desc','텍스트','✓'],['K','Bestelldatum','order_date','날짜','✓'],
  ['L','Änderbarkeitsdatum','changeability_date','날짜 → D-day 알림','✓'],['M','GLT-Gew.','glt_gew','날짜(희소)','△'],['N','LT-Quote','pm_final (월). 변경 시 original_pm 보존','날짜→월','✓'],
  ['O','GLT-Err.','tdd_cal','날짜','✓'],['P','GLT-Ist','production_done','날짜','✓'],['Q','Versand','exfactory_date (공장 출고)','날짜','✓'],['R','Abgangsdatum','shipping_date','날짜','✓'],
  ['S','Rg.-Datum','invoice_date','날짜','✓'],['T','Rg.-Nr.','invoice_no','텍스트','✓'],['U','Gepl. Ankunftsdatum','pl_arrival_afab','날짜','✓'],['V','Schiffsname','vessel','텍스트','✓'],
  ['W','Lack 1','color','코드','✓'],['X','Lackzus. 1','—','공란','✗'],['Y','Lack 2','color2','코드','△'],['Z','Lackzus. 2','color2_add','코드','△'],['AA','Lack 3','color3','코드','△'],['AB','Lackzus. 3','color3_add','코드','△'],
  ['AC','Subkat.','sub_cat','코드','✓'],['AD','Fahrzeugwert','vehicle_value_eur','독일식→숫자','✓'],['AE','Auftragswert mit Steuer','order_value_eur','독일식→숫자','✓'],['AF','GLT-BAT-Soll-AO','glt_bat_soll','날짜','△'],
];

// ---- AFAB 변경점 (샘플, 시연 파일 SDISP_2026-10-07.xlsx 기준) — AFAB 업로드 화면 3단계에서 참조 ----
const CHANGES = (function(){
  const vs = VEHICLES.filter(v=>v.in_afab_today);
  const changed = [
    {v:vs.find(v=>v.vessel==='Eukor Pioneer'), f:'vessel', old:'Morning Lady', impact:'단계 유지(In Transit) · 선박별 현황 이동'},
    {v:vs.find(v=>v.current_status==='Ordered(Changeable)'&&v.pm==='2027-02'), f:'pm', old:'2027-02', nw:'2027-03', impact:'original_pm 보존 · KUFRI Production 2027-02 → 2027-03 이동 · Order 분류 유지'},
    {v:vs.find(v=>v.current_status==='In Production'&&v.pm==='2026-10'), f:'planned_arrival', old:'', nw:'2026-12-05', impact:'입항 예정월 2027-01 → 2026-12 (ETA Final 미입력 시)'},
    {v:vs.find(v=>v.current_status==='In Transit'&&v.vessel==='Glovis Sunrise'), f:'invoice', old:'', impact:'In Transit (Invoiced) 표기'},
    {v:vs.find(v=>v.current_status==='Ordered(Changeable)'&&v.pm==='2026-12'), f:'changeability_date', old:'2026-10-20', impact:'D-day 알림 재계산'},
  ].filter(c=>c.v).map(c=>({comm:c.v.commission_no, model:c.v.model_classification, field:c.f, old:c.old, nw:c.nw||c.v[c.f], impact:c.impact}));
  const added = [
    {comm:'071006201', baumuster:'96340312', type:'2863 LSDNA6x2 F 16', pm:'2027-07', mapped:true},
    {comm:'071006204', baumuster:'96340312', type:'2863 LSDNA6x2 F 16', pm:'2027-07', mapped:true},
    {comm:'071006207', baumuster:'96340610', type:'2863 LSDNRA6x2 F 16', pm:'2027-07', mapped:false},
  ];
  const removed = VEHICLES.filter(v=>['Ordered(Changeable)','Ordered(Fixed)','In Production'].includes(v.current_status)&&!v.in_afab_today).slice(0,2).map(v=>({comm:v.commission_no, model:v.model_classification, stage:v.current_status, pm:v.pm}));
  return {changed, added, removed, unchanged: AFAB_UPLOADS[0].rows-changed.length-added.length};
})();

// ---- Settings (기준값) ----
const SETTINGS = [
  {key:'stock_level_days', value:'60 / 183 / 365 / 730', desc:'Stock level 구간(일): <2 months / <6 months / <1 year / <2 years / >2 years'},
  {key:'optimus_age_days', value:'183 / 365', desc:'OPTIMUS 재고 연령 구간(일)'},
  {key:'stock_months_normal', value:'≤ 2.0', desc:'재고월수 판정 — 정상 (제안값, 확정 필요)'},
  {key:'stock_months_warn', value:'≤ 3.0', desc:'재고월수 판정 — 주의 (제안값, 확정 필요). 초과 시 위험'},
  {key:'alert_dday', value:'7 / 30', desc:'Changeability D-day 알림 기준(일)'},
  {key:'bonded_overdue_days', value:'90', desc:'보세 경과 알림(일)'},
  {key:'stock_overdue_days', value:'365', desc:'재고 장기 알림(일)'},
  {key:'eta_mismatch_days', value:'7', desc:'선사 ETA 불일치 허용(일)'},
  {key:'default_lead_time', value:'3', desc:'기본 리드타임(개월) — 모델별 실적 중앙값으로 자동 제안'},
  {key:'poll_interval_sec', value:'60', desc:'변경분 조회 주기(초)'},
];

// ---- Audit_Log (샘플) ----
const AUDIT_LOG = [
  {at:'2026-10-07 08:42', user:'정물류', action:'AFAB 업로드 반영', target:'SDISP_2026-10-07.xlsx', detail:'677행 · 변경 1건 반영'},
  {at:'2026-10-07 08:41', user:'정물류', action:'AFAB 파일 업로드', target:'/AFAB_Raw/2026/10/SDISP_2026-10-07.xlsx', detail:'검증 통과'},
  {at:'2026-10-06 17:20', user:'김백업', action:'차량 수정', target:'Vehicles', detail:'customs_clearance_date 입력 3건'},
  {at:'2026-10-06 15:02', user:'정물류', action:'KUFRI 계획 확정', target:'KUFRI_Plan v2026-10a', detail:'2026-11~2027-06 sales_plan 확정'},
  {at:'2026-10-05 10:11', user:'정물류', action:'엑셀 내보내기', target:'/Exports/Logistics_2026-10-05.xlsx', detail:'필터: In Transit · 66행'},
  {at:'2026-10-02 09:12', user:'김백업', action:'AFAB 제외 보류', target:'Vehicles', detail:'Comm 071003541 — Cancelled 보류'},
  {at:'2026-10-01 14:30', user:'정물류', action:'상태 override', target:'Vehicles', detail:'Comm 071001203 → Cancelled (사유: 고객 주문 취소)'},
  {at:'2026-09-30 08:50', user:'정물류', action:'AFAB 검증 실패', target:'SDISP_2026-09-30.xlsx', detail:'헤더 불일치'},
  {at:'2026-09-29 11:05', user:'정물류', action:'설정 변경', target:'Settings', detail:'stock_months_warn 2.5 → 3.0'},
  {at:'2026-09-28 08:40', user:'정물류', action:'AFAB 업로드 반영', target:'SDISP_2026-09-28.xlsx', detail:'신규 181건 (2027 PM)'},
  {at:'2026-09-25 16:44', user:'관리자', action:'되돌리기', target:'Vehicles', detail:'Comm 071002118 eta_final 복원'},
  {at:'2026-09-19 08:38', user:'정물류', action:'AFAB 업로드 반영', target:'SDISP_2026-09-19.xlsx', detail:'신규 186건 (2027 PM)'},
];

// ---- 상태 규칙 (§7) ----
const STAGE_RULES = [
  {order:1, stage:'Cancelled', cond:'수동 지정 (AFAB 목록에서 사라지면 "확인 필요" 알림, 자동 취소 금지)', legacy:'Cancelled'},
  {order:2, stage:'Rejected', cond:'수동 지정 (거절된 오더)', legacy:'—'},
  {order:3, stage:'Ordered(Dummy)', cond:'수동 지정 (더미 오더)', legacy:'—'},
  {order:4, stage:'Sold', cond:'Current Status = Sold (sales_month 입력)', legacy:'Sold'},
  {order:5, stage:'OH Stock', cond:'Current Status = OH Stock (customs_clearance_date 입력)', legacy:'OH Stock'},
  {order:6, stage:'Bonded Stock', cond:'입고일 = eta_final (ETA Final Arrival) ≤ 오늘', legacy:'Bonded Stock'},
  {order:7, stage:'In Transit', cond:'shipping_date ≤ 오늘, eta_final 미도래 (Shipped / Invoiced)', legacy:'Ordered'},
  {order:8, stage:'Shipment scheduled', cond:'Shipping 전이나 vessel 또는 bl_no 확인', legacy:'Ordered'},
  {order:9, stage:'In Production', cond:'pm_final ≤ 당월, 미선적·배편 미확정 (생산월 경과분 포함)', legacy:'Ordered'},
  {order:10, stage:'Ordered(Fixed)', cond:'그 외 (pm_final > 당월) 중 PM(final) = 익월 (당월+1)', legacy:'Ordered / 공란'},
  {order:11, stage:'Ordered(Changeable)', cond:'그 외 (pm_final > 당월) 중 PM(final) ≥ 당월+2', legacy:'Ordered / 공란'},
];

// ---- 공통 집계 헬퍼 ----
function countBy(list, fn){ const m={}; list.forEach(v=>{ const k=fn(v); if(k==null||k==='') return; m[k]=(m[k]||0)+1; }); return m; }
function expectedArrivalYm(v){ // 입항 예정월: eta_final → pl_arrival_afab → PM + 리드타임
  if(v.ata) return v.ata.slice(0,7);
  if(v.planned_arrival) return v.planned_arrival.slice(0,7);
  if(v.pm) return ymAdd(v.pm, v.lead_time||3);
  return '';
}
function closingStock(ym){ // 월말 마감 재고 (ym='current' 는 현재 상태 기준)
  if(ym==='current') return VEHICLES.filter(v=>v.current_status==='Bonded Stock'||v.current_status==='OH Stock').map(v=>({v, cleared: !!v.customs_clearance_date}));
  const end=monthEnd(ym); const endS=fmtD(end);
  return VEHICLES.filter(v=> v.current_status!=='Cancelled' && v.ata && v.ata<=endS && (!v.sales_month || v.sales_month>ym))
    .map(v=>({v, cleared: !!v.customs_clearance_date && v.customs_clearance_date<=endS}));
}
