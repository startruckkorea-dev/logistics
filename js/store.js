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
      const p = { vehicle:m.vehicle, gen:m.gen, model:m.model, axle:m.axle, cab:m.cab, option:m.option, lead_time:m.lead,
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
    // 선박 단위 입력값을 해당 선박 차량 전체의 vehKey(bl_no · eta_from_eukor_pirt · ata)에 대입하고 eta_delta · eta_mismatch 재계산. 반영한 차량 수를 반환.
    applyToVehicles(vessel, vehKey, val){
      const vs = VEHICLES.filter(v=>v.vessel===vessel);
      vs.forEach(v=>{ v[vehKey] = val;
        if(vehKey==='ata') v.eta_delta = (val && v.planned_arrival)? diffDays(parseD(val), parseD(v.planned_arrival)) : null;
        if(vehKey==='eta_from_eukor_pirt') v.eta_mismatch = (val && v.planned_arrival)? Math.abs(diffDays(parseD(v.planned_arrival), parseD(val)))>7 : false; });
      return vs.length;
    },
  },
};
