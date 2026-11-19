// 앱 시작 — 로그인 상태를 확인하고 화면 틀을 띄운다.
import { ENV, ENV_NAME } from "./lib/config.js";
import { initAuth, login, logout } from "./lib/auth.js";
import { mk } from "./lib/dom.js";
import { state } from "./app/state.js";
import { baseDate, isBaseDateFixed } from "./app/base-date.js";
import { tx } from "./app/i18n.js";
import { initUi } from "./app/ui.js";
import { registerPage, startRouter, route } from "./app/router.js";
import { adminPage } from "./pages/admin.js";
import { logisticsPage } from "./pages/logistics.js";
import { dashboardPage } from "./pages/dashboard.js";
import { shippingPage } from "./pages/shipping.js";

const $ = (id) => document.getElementById(id);

// 로그인 전이나 로그인 실패 때 화면 가운데에 보여주는 안내
function showNotice(message, isError) {
  $("app").replaceChildren(
    mk(
      "div",
      { class: "card notice-card" },
      mk("h2", null, "STK Logistics Hub"),
      mk("p", { class: isError ? "error" : null }, message),
      mk("button", { class: "btn primary", type: "button", onclick: login }, tx("Microsoft 로그인"))
    )
  );
}

// 상단 바의 기준일 표시. 설정으로 고정한 날짜면 그 사실을 풍선 도움말로 알린다.
function showBaseDate() {
  const box = $("baseDate");
  box.replaceChildren(`${tx("기준일")} `, mk("b", null, baseDate()));
  box.title = isBaseDateFixed()
    ? "설정으로 고정한 기준일입니다. 화면의 당월·경과 일수·입항 예정 계산이 이 날짜를 오늘로 삼습니다."
    : "오늘 날짜입니다. 화면의 당월·경과 일수·입항 예정 계산의 기준입니다.";
  box.hidden = false;
}

function setLanguage(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  document.documentElement.lang = lang;
  for (const button of document.querySelectorAll("#langbox button")) {
    button.classList.toggle("active", button.dataset.lang === lang);
  }
  if (state.account) {
    showBaseDate();
    route();
  }
}

async function main() {
  initUi();
  // 운영이 아닌 환경은 상단에 환경 이름을 표시해 헷갈리지 않게 한다.
  if (ENV_NAME !== "prod") {
    $("envTag").textContent = ENV.label;
    $("envTag").hidden = false;
  }
  for (const button of document.querySelectorAll("#langbox button")) {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  }
  $("logout").addEventListener("click", logout);

  try {
    state.account = await initAuth();
  } catch (err) {
    console.error(err);
    showNotice(`로그인 실패: ${err.errorCode ?? ""} ${err.message}`, true);
    return;
  }
  if (!state.account) {
    showNotice(tx("Microsoft 계정으로 로그인하세요."), false);
    return;
  }

  showBaseDate();
  $("userName").textContent = state.account.name ?? state.account.username;
  $("userName").title = state.account.username;
  $("userbox").hidden = false;

  registerPage("dashboard", dashboardPage);
  registerPage("logistics", logisticsPage);
  registerPage("shipping", shippingPage);
  registerPage("admin", adminPage);
  startRouter();
}

main();
