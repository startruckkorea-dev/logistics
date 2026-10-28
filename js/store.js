'use strict';
/* ===== Store: data.js 데이터 쓰기 함수 (조회는 각 화면에서 data.js 변수를 직접 읽음) ===== */
function nowStamp(){ const d=new Date(); return TODAY_S+' '+pad2(d.getHours())+':'+pad2(d.getMinutes()); } // Vehicle_History changed_at (기준일 + 현재 시각)
// Current Status 자동 전환 규칙 (10/28, 상태 규칙 3·5·7 · 기준일 TODAY_S/BASE_YM): 차량 1대 → {v, from, to, rule, reason} 또는 null. override 여부는 보지 않는다(호출 쪽에서 구분)
// 규칙 3 Ordered(Changeable) → Ordered(Fixed): Changeability Date 경과 · 규칙 5 Ordered(Fixed) → In Production: PM 도래 · 규칙 7 In Production/Shipment scheduled → In Transit: Shipping Date 경과
function statusRuleOf(v){
  const s = v.current_status;
  if(s==='Ordered(Changeable)' && v.changeability_date && v.changeability_date<=TODAY_S) return {v, from:s, to:'Ordered(Fixed)', rule:3, reason:`Changeability Date ${v.changeability_date} 경과`};
  if(s==='Ordered(Fixed)' && v.pm && v.pm<=BASE_YM) return {v, from:s, to:'In Production', rule:5, reason:`PM ${v.pm} 도래`};
  if((s==='In Production'||s==='Shipment scheduled') && v.shipping && v.shipping<=TODAY_S) return {v, from:s, to:'In Transit', rule:7, reason:`Shipping Date ${v.shipping} 경과`};
  return null;
}
const Store = {
  vehicles: {
    // Commission No로 찾은 차량 행에 patch 필드 대입. 없으면 null.
    update(comm, patch){
      const v = VEHICLE_BY_COMM[comm]; if(!v) return null;
      Object.assign(v, patch);
      if('pm' in patch || 'lead_days' in patch) v.shipping_calc = shippingCalc(v.pm, v.lead_days); // 10/27 #7: PM·모델(리드타임) 변경 시 Shipping Calc 재계산
      return v;
    },
    updateMany(comms, patch){ return comms.map(c=>Store.vehicles.update(c, patch)).filter(Boolean); },
    // Model_Master 행 → 차량에 적용할 모델 속성 patch(파생 모델명 포함). 적용하지 않고 값만 돌려준다 (편집 종료 시 일괄 저장용).
    modelMasterPatch(m){
      const p = { vehicle:m.vehicle, gen:m.gen, series:m.series, model:m.model, axle:m.axle, cab:m.cab, option:m.option, lead_time:m.lead, lead_days:m.lead_days, // series = 차량 마스터 'Model' 열 (10/19 No.16)
        baumuster:m.prefix+' '+m.suffix, bm:m.prefix+'-'+m.code2 };
      p.model_classification = [p.gen,p.model,p.axle,p.cab,p.option].filter(Boolean).join(' ');
      p.dms_model_name = [p.vehicle,p.model,p.axle,p.cab].join(' ');
      p.model_key = [p.vehicle,p.model,p.axle,p.cab].join('|');
      return p;
    },
    // Model_Master 행의 모델 속성을 차량에 일괄 적용 + 파생 모델명 재계산
    applyModelMaster(comm, m){
      const v = VEHICLE_BY_COMM[comm]; if(!v) return null;
      Object.assign(v, Store.vehicles.modelMasterPatch(m));
      return v;
    },
    // 마지막 Commission No (숫자 기준 최댓값). 없으면 null.
    lastCommissionNo(){ return VEHICLES.reduce((a,v)=> (a==null || Number(v.commission_no)>Number(a))? v.commission_no : a, null); },
    // 수동 오더 생성용 차량 1행 (10/19 오더 생성 화면): Model_Master 속성 + 입력값(Original PM · 단계 · MY) · 나머지 필드는 공란
    create(o){ // o: {commission_no, m(Model_Master 행), pm(Original PM), status, model_year, by}
      const v = { commission_no:o.commission_no, current_status:o.status, status_override:'', status_reason:'', model_year:o.model_year, vin_no:'',
        changeability_date:'', pm:'', original_pm:o.pm, tdd_calc:'', production_done:'', dispatch:'', shipping:'', invoice:'', planned_arrival:'', eta_from_tdd:'', eta_from_eukor_pirt:'', ata:'', tsc_arrival_date:'', // 10/20 No.22: 입력받는 생산월은 Original PM에만 기록, PM은 공란(AFAB 확정 후 채움)
        bl_no:'', vessel:'', customs_clearance_date:'', color_code:'', color_name:'', tires:'', model_in_afab:o.m.type_desc, engine_no:'', import_license:'', ref_commission_no:'',
        option_remarks:'', order_note:'', b1_factory_order:'', sales_month:'', sub_cat: o.m.vehicle==='Tipper'?'KIP':(o.m.vehicle==='Tractor'?'SZM':'LKW'), co:'', afab_editable:'', create_order_date:TODAY_S, // 10/20 No.14 co · No.10 시스템 오더 등록일
        eta_month:'', tdd_month:'', shipping_month:'', in_afab_today:false, order_class:'—', changeability_dday:null,
        modified:TODAY_S, modified_by:o.by };
      Object.assign(v, Store.vehicles.modelMasterPatch(o.m));
      v.shipping_calc = shippingCalc(v.pm, v.lead_days); // PM 공란 → '' (10/27 #7)
      v.series = o.m.series; v.spec = [v.vehicle, v.series, v.model, v.axle, v.cab].join(' ');
      return v;
    },
    // 차량 행 추가 (Vehicles + Comm 색인). Commission No 중복은 건너뛰고 추가한 건수를 반환.
    add(rows){ let n=0; rows.forEach(v=>{ if(VEHICLE_BY_COMM[v.commission_no]) return; VEHICLES.push(v); VEHICLE_BY_COMM[v.commission_no]=v; n++; }); return n; },
    // 통관 정보 입력 (10/26 No.1): rows = [{commission_no, customs_clearance_date, import_license}] · 값이 바뀐 필드만 대입 + Vehicle_History 기록
    // 통관일이 채워지면 Bonded Stock → OH Stock 전환 (상태 규칙 9, 출처 '규칙'). 반환 {vehicles, fields, cleared}
    applyCustoms(rows, by, source){
      const at = nowStamp(); const hist = []; let vehicles = 0, cleared = 0;
      rows.forEach(r=>{ const v = VEHICLE_BY_COMM[r.commission_no]; if(!v) return;
        const patch = {};
        ['customs_clearance_date','import_license'].forEach(k=>{ if(r[k]==null) return; const nw = String(r[k]).trim(); if(nw!==String(v[k]||'')) patch[k] = nw; });
        if(!Object.keys(patch).length) return;
        Object.entries(patch).forEach(([k,nw])=>hist.push({commission_no:v.commission_no, field:k, old_value:v[k]||'', new_value:nw, changed_by:by, changed_at:at, source}));
        if(patch.customs_clearance_date && v.current_status==='Bonded Stock'){ patch.current_status = 'OH Stock'; cleared++;
          hist.push({commission_no:v.commission_no, field:'current_status', old_value:'Bonded Stock', new_value:'OH Stock', changed_by:by, changed_at:at, source:'규칙'}); }
        Object.assign(v, patch); vehicles++; });
      Store.history.add(hist);
      return {vehicles, fields:hist.length, cleared};
    },
    // Current Status 자동 업데이트 후보 (10/28): 기준일 TODAY_S·BASE_YM 기준 상태 규칙 3·5·7 판정(statusRuleOf). 쓰지 않고 후보만 돌려준다 (반영은 applyStatusUpdate).
    // status_override가 있는 차량은 제외(override 우선 → statusUpdateHeld에서 따로 조회) · 한 번에 한 단계만(연쇄 전환은 다음 점검에서). 반환 [{v, from, to, rule, reason}]
    statusUpdateCandidates(){
      return VEHICLES.filter(v=>!v.status_override).map(v=>statusRuleOf(v)).filter(Boolean);
    },
    // 규칙에는 맞지만 status_override 때문에 자동 전환하지 않는 차량 (10/28): 팝업에 '보류'로 표시해 override 때문인지 확인할 수 있게 한다. 쓰기 없음. 반환 형식은 statusUpdateCandidates와 동일
    statusUpdateHeld(){
      return VEHICLES.filter(v=>v.status_override).map(v=>statusRuleOf(v)).filter(Boolean);
    },
    // Current Status 자동 업데이트 반영 (10/28): items = 후보 중 제외하지 않은 것 · excluded = 제외한 건수 · by = 사용자.
    // current_status 대입 + Vehicle_History(출처 규칙) + Audit_Log 1건. 반환 {n, by:{'A → B': n}, excluded}
    applyStatusUpdate(items, excluded, by){
      const at = nowStamp(); const byT = {};
      const hist = items.map(it=>{ it.v.current_status = it.to; const k = `${it.from} → ${it.to}`; byT[k] = (byT[k]||0)+1;
        return {commission_no:it.v.commission_no, field:'current_status', old_value:it.from, new_value:it.to, changed_by:by, changed_at:at, source:'규칙'}; });
      Store.history.add(hist);
      AUDIT_LOG.unshift({at, user:by, action:'Current Status 업데이트', target:'Vehicles', detail:`${items.length}건 전환 (${Object.entries(byT).map(([k,n])=>`${k} ${n}`).join(' · ')}) · 제외 ${excluded}건`});
      return {n:items.length, by:byT, excluded};
    },
  },
  history: {
    // Vehicle_History에 변경 이력 행 추가 (최신순 유지). 추가한 건수를 반환.
    add(rows){
      rows.forEach(r=>VEHICLE_HISTORY.push(r));
      VEHICLE_HISTORY.sort((a,b)=> a.changed_at<b.changed_at?1:-1);
      return rows.length;
    },
  },
  voyages: {
    // VOYAGES.id로 찾은 항차 행에 patch 대입. 없으면 null.
    update(voyId, patch){
      const y = VOYAGES.find(x=>x.id===voyId); if(!y) return null;
      Object.assign(y, patch); return y;
    },
    // 선박 단위 입력값을 해당 선박 차량 전체의 vehKey(bl_no · eta_from_eukor_pirt · ata · tsc_arrival_date)에 대입.
    // 값이 바뀐 차량만 Vehicle_History(출처: 수동)에 기록 (10/26). 반환 {n: 해당 선박 차량 수, changed: 값이 바뀐 차량 수}
    applyToVehicles(vessel, vehKey, val, by){
      const at = nowStamp(); const hist = [];
      const vs = VEHICLES.filter(v=>v.vessel===vessel);
      vs.forEach(v=>{ const old = v[vehKey]==null? '' : v[vehKey]; if(String(old)===String(val==null? '' : val)) return;
        hist.push({commission_no:v.commission_no, field:vehKey, old_value:old, new_value:val, changed_by:by, changed_at:at, source:'수동'}); v[vehKey] = val; });
      Store.history.add(hist);
      return {n:vs.length, changed:hist.length};
    },
    // TSC Arrival Date 입력 시 (10/26 No.8): 해당 선박의 In Transit 차량을 Bonded Stock으로 전환 + Vehicle_History(출처: 규칙). 전환 대수를 반환.
    bondedByTsc(vessel, by){
      const at = nowStamp();
      const vs = VEHICLES.filter(v=>v.vessel===vessel && v.current_status==='In Transit');
      vs.forEach(v=>{ v.current_status = 'Bonded Stock'; });
      Store.history.add(vs.map(v=>({commission_no:v.commission_no, field:'current_status', old_value:'In Transit', new_value:'Bonded Stock', changed_by:by, changed_at:at, source:'규칙'})));
      return vs.length;
    },
    // TSC 입고일 예정 저장 (10/27): 선박(VOYAGES) 단위만 기록. 차량 마스터·단계는 바꾸지 않는다. date ''이면 예정 해제. 반환 항차 행 또는 null
    scheduleTsc(voyId, date){ return Store.voyages.update(voyId, {tsc:date, tsc_status: date? 'scheduled' : ''}); },
    // TSC 입고일 확정 (10/27): date 공란이면 아무것도 쓰지 않고 null. tsc_status='confirmed' → 해당 선박 차량 tsc_arrival_date 반영(Vehicle_History 출처 수동) → In Transit → Bonded Stock(출처 규칙)
    // 반환 {vessel, date, n: 선박 차량 수, changed: 값 바뀐 차량 수, moved: 전환 대수}
    confirmTsc(voyId, date, by){
      if(!date) return null;
      const y = Store.voyages.update(voyId, {tsc:date, tsc_status:'confirmed'}); if(!y) return null;
      const r = Store.voyages.applyToVehicles(y.vessel, 'tsc_arrival_date', date, by);
      const moved = Store.voyages.bondedByTsc(y.vessel, by);
      return {vessel:y.vessel, date, n:r.n, changed:r.changed, moved};
    },
  },
  customsRequests: {
    // 통관 신청 등록 (10/27, Sales): comms = Commission No 배열 · by = 신청자. CUSTOMS_REQUESTS 맨 앞(최신순) + Audit_Log 기록. 차량 행·Vehicle_History는 건드리지 않는다. 반환 {req, to: 수신자 이름 배열}
    // 10/27 #11: 상태는 Commission No별 items[].status — 등록 시 전부 '신청'
    add(comms, by){
      const u = USERS.find(x=>x.name===by); const at = nowStamp();
      const seq = CUSTOMS_REQUESTS.filter(r=>r.requested_at.startsWith(TODAY_S)).length+1;
      const items = comms.map(c=>({comm:c, status:'신청', at:'', by:'', reason:''}));
      const req = {id:'CR-'+TODAY_S.replace(/-/g,'')+'-'+pad2(seq), requested_at:at, requested_by:by, dept:u? u.dept : '', items, n:items.length, note:''};
      CUSTOMS_REQUESTS.unshift(req);
      const to = USERS.filter(x=>x.role==='Editor' && x.dept==='Ordering & Logistics').map(x=>x.name);
      AUDIT_LOG.unshift({at, user:by, action:'통관 신청', target:'Customs_Requests '+req.id, detail:`${comms.length}건 · 메일 수신 ${to.join(', ')}`});
      return {req, to};
    },
    // 신청 처리 제출 (10/27 #12·#13, PMM = Editor): decisions = [{comm, status:'접수'|'거절', reason}] — 아직 '신청'인 item만 status·at·by·reason(거절만) 갱신, 한 번의 제출 = Audit_Log 1행.
    // 거절 건이 있으면 신청자에게 사유 메일(시연은 토스트). 반환 {req, accepted:[comm], rejected:[{comm, reason}], to: 신청자 이름}. 바뀐 건이 없으면 Audit 없음
    process(reqId, decisions, by){
      const req = CUSTOMS_REQUESTS.find(r=>r.id===reqId); if(!req) return null;
      const at = nowStamp(); const accepted = [], rejected = [];
      decisions.forEach(d=>{ const it = req.items.find(i=>i.comm===d.comm); if(!it || it.status!=='신청' || (d.status!=='접수' && d.status!=='거절')) return;
        it.status = d.status; it.at = at; it.by = by; it.reason = d.status==='거절'? (d.reason||'') : '';
        if(d.status==='접수') accepted.push(d.comm); else rejected.push({comm:d.comm, reason:it.reason}); });
      if(accepted.length || rejected.length) AUDIT_LOG.unshift({at, user:by, action:'통관 신청 처리', target:'Customs_Requests '+reqId,
        detail:[accepted.length? `접수 ${accepted.length}건 (${accepted.join(', ')})` : '', rejected.length? `거절 ${rejected.length}건 (${rejected.map(x=>x.comm+': '+x.reason).join(' / ')}) · 메일 수신 ${req.requested_by}` : ''].filter(Boolean).join(' · ')});
      return {req, accepted, rejected, to:req.requested_by};
    },
  },
};
