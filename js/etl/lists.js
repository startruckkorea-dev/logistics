// SharePoint List 정의 — 전처리 결과 표를 담는 List 의 열 이름·타입·키.
// List 생성과 적재가 같은 정의를 본다. List 이름은 환경별로 config.js 에 둔다.
// 날짜("YYYY-MM-DD")와 월("YYYY-MM")은 시간대 변환을 피하려고 텍스트로 저장한다.
//
// 타입: text(한 줄, 255자) | note(여러 줄) | number | boolean
import { SHAREPOINT } from "../lib/config.js";

const columns = (type, names) => names.map((name) => ({ name, type }));
const text = (...names) => columns("text", names);
const note = (...names) => columns("note", names);
const number = (...names) => columns("number", names);
const boolean = (...names) => columns("boolean", names);

// table  : 전처리 규칙 파일 outputs 의 name
// key    : 키 열. 고유값 + 인덱스를 건다
// indexed: 인덱스만 거는 열
const DEFINITIONS = [
  {
    id: "modelMaster",
    table: "model_master",
    key: "moma_no",
    columns: [
      ...text("moma_no", "my", "bm", "vehicle", "model", "type", "axle", "cab", "cab_gen", "pto"),
      ...number("wheelbase"),
      ...text("emission"),
      ...number("lead_days", "lead"),
      ...boolean("active"),
      ...text("spec"),
      ...boolean("is_rep"),
    ],
  },
  {
    id: "colorMaster",
    table: "color_master",
    key: "color_code",
    columns: [...number("no"), ...text("color_code", "color_name_mb", "color_name_molit")],
  },
  {
    id: "logisticsAfab",
    table: "logistics_afab",
    key: "commission_no",
    columns: text(
      "commission_no", "vin_no", "changeability_date", "pm", "tdd_calc",
      "dispatch", "shipping", "invoice", "planned_arrival", "vessel", "color_code",
      "model_in_afab", "engine_no", "gen", "sub_cat", "afab_editable", "baumuster"
    ),
  },
  {
    id: "logisticsMain",
    table: "logistics_main",
    key: "commission_no",
    indexed: ["moma_no"],
    columns: [
      ...text(
        "commission_no", "current_status", "moma_no", "model_year", "bm", "vehicle", "model", "type", "axle",
        "cab", "cab_gen", "pto"
      ),
      ...number("wheelbase"),
      ...text(
        "emission", "original_pm", "shipping_calc", "eta_from_tdd",
        "eta_from_eukor_pirt", "ata", "tsc_arrival_date", "bl_no", "customs_clearance_date",
        "color_name"
      ),
      ...note("tires"),
      ...text("import_license", "ref_commission_no"),
      ...note("option_note", "order_note"),
      ...text("order_update_date", "b1_factory_order", "co", "sales_month", "model_classification"),
    ],
  },
];

// 앱이 쓰면서 채우는 List. 전처리 결과를 적재하는 대상이 아니다.
const APP_DEFINITIONS = [
  {
    // 변경 이력: 저장 1회 × 차량 1대 = 1행. 변경자와 시각은 SharePoint 의 만든 사람·만든 날짜를 쓴다.
    //   batch_id: 같은 저장에서 나온 행을 묶는 값
    //   source  : 변경 경로(입력 등)
    //   changes : [{ field, old, new }] 를 JSON 으로
    id: "vehicleHistory",
    indexed: ["commission_no", "batch_id"],
    columns: [...text("commission_no", "batch_id", "source"), ...note("changes")],
  },
  {
    // 선박(항차) 단위 값: 차량 행에 두지 않는 값만 둔다.
    //   voyage_key : 선박 이름 + "|" + Shipping 날짜
    //   gw         : 총중량(kg)
    //   tsc_planned: TSC 입고일 예정("YYYY-MM-DD"). 확정하면 차량의 tsc_arrival_date 에 들어간다
    id: "voyages",
    key: "voyage_key",
    columns: [...text("voyage_key", "vessel", "shipping"), ...number("gw"), ...text("tsc_planned")],
  },
];

const withListName = (def) => ({
  ...def,
  indexed: def.indexed ?? [],
  listName: SHAREPOINT.lists[def.id],
});

// 현재 환경의 List 이름을 붙인 정의
export const LISTS = DEFINITIONS.map(withListName);
export const APP_LISTS = APP_DEFINITIONS.map(withListName);

export const appList = (id) => APP_LISTS.find((def) => def.id === id);

export const listForTable = (tableName) => LISTS.find((def) => def.table === tableName);
