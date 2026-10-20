'use strict';
/* ===== Store: data.js 데이터 쓰기 함수 (조회는 각 화면에서 data.js 변수를 직접 읽음) ===== */
const Store = {
  vehicles: {
    // Commission No로 찾은 차량 행에 patch 필드 대입. 없으면 null.
    update(comm, patch){
      const v = VEHICLE_BY_COMM[comm]; if(!v) return null;
      Object.assign(v, patch); return v;
    },
    updateMany(comms, patch){ return comms.map(c=>Store.vehicles.update(c, patch)).filter(Boolean); },
    // Model_Master 행 → 차량에 적용할 모델 속성 patch(파생 모델명 포함). 적용하지 않고 값만 돌려준다 (편집 종료 시 일괄 저장용).
    modelMasterPatch(m){
      const p = { vehicle:m.vehicle, gen:m.gen, series:m.series, model:m.model, axle:m.axle, cab:m.cab, option:m.option, lead_time:m.lead, // series = 차량 마스터 'Model' 열 (10/19 No.16)
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
        changeability_date:'', pm:'', original_pm:o.pm, tdd_calc:'', production_done:'', dispatch:'', shipping:'', invoice:'', planned_arrival:'', eta_from_tdd:'', eta_from_eukor_pirt:'', ata:'', // 10/20 No.22: 입력받는 생산월은 Original PM에만 기록, PM은 공란(AFAB 확정 후 채움)
        bl_no:'', vessel:'', customs_clearance_date:'', color_code:'', color_name:'', tires:'', model_in_afab:o.m.type_desc, engine_no:'', import_license:'', ref_commission_no:'',
        option_remarks:'', order_note:'', b1_factory_order:'', sales_month:'', sub_cat: o.m.vehicle==='Tipper'?'KIP':(o.m.vehicle==='Tractor'?'SZM':'LKW'), co:'', afab_editable:'', create_order_date:TODAY_S, // 10/20 No.14 co · No.10 시스템 오더 등록일
        eta_month:'', tdd_month:'', shipping_month:'', in_afab_today:false, order_class:'—', changeability_dday:null,
        modified:TODAY_S, modified_by:o.by };
      Object.assign(v, Store.vehicles.modelMasterPatch(o.m));
      v.series = o.m.series; v.spec = [v.vehicle, v.series, v.model, v.axle, v.cab].join(' ');
      return v;
    },
    // 차량 행 추가 (Vehicles + Comm 색인). Commission No 중복은 건너뛰고 추가한 건수를 반환.
    add(rows){ let n=0; rows.forEach(v=>{ if(VEHICLE_BY_COMM[v.commission_no]) return; VEHICLES.push(v); VEHICLE_BY_COMM[v.commission_no]=v; n++; }); return n; },
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
    // 선박 단위 입력값을 해당 선박 차량 전체의 vehKey(bl_no · eta_from_eukor_pirt · ata)에 대입. 반영한 차량 수를 반환.
    applyToVehicles(vessel, vehKey, val){
      const vs = VEHICLES.filter(v=>v.vessel===vessel);
      vs.forEach(v=>{ v[vehKey] = val; });
      return vs.length;
    },
  },
};
