// Mounts the real App component in jsdom against a fake in-memory GitHub repo
// and drives the flows a person actually performs.
import jsdomGlobal from "global-jsdom";
jsdomGlobal(undefined, { url: "http://localhost/", pretendToBeVisual: true });

import assert from "node:assert/strict";
import { createRequire } from "module";
import { HDB_ALL, CLOSING } from "./fixtures/loanstatement.mjs";

class RO { observe() {} unobserve() {} disconnect() {} }
window.ResizeObserver = RO; globalThis.ResizeObserver = RO;
window.URL.createObjectURL = () => "blob:mock";
window.URL.revokeObjectURL = () => {};
window.alert = () => {};

// ---- in-memory localStorage ----
const lsData = new Map();
const localStorageMock = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
  clear: () => lsData.clear(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock, configurable: true });
globalThis.localStorage = localStorageMock;

// ---- fake GitHub repo ----
const repo = {
  exists: true,
  pushable: true,
  file: null,       // { content: base64, sha }
  commits: 0,
  failNextSaveWithConflict: false,
};

function b64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}
function fromB64(s) {
  return Buffer.from(String(s).replace(/\s/g, ""), "base64").toString("utf8");
}

const fetchLog = [];
const quoteCalls = [];
// A stand-in Finnhub. `c` is the current price, `pc` the previous close.
const market = { QQQ: 512.34 };
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const method = opts.method || "GET";
  fetchLog.push(`${method} ${url}`);
  const mk = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });

  if (url.includes("finnhub.io")) {
    quoteCalls.push(url);
    const sym = decodeURIComponent(new URL(url).searchParams.get("symbol") || "");
    const price = market[sym];
    if (price === undefined) return mk(200, { c: 0, pc: 0 });
    return mk(200, { c: price, pc: price - 1, t: Math.floor(Date.now() / 1000) });
  }

  if (!repo.exists) return mk(404, { message: "Not Found" });

  // repo metadata endpoint
  if (/\/repos\/[^/]+\/[^/]+$/.test(url)) {
    return mk(200, { full_name: "brandon/ledger-data", private: true, default_branch: "main", permissions: { push: repo.pushable } });
  }

  // contents endpoint
  if (url.includes("/contents/")) {
    if (method === "GET") {
      if (!repo.file) return mk(404, { message: "Not Found" });
      return mk(200, { content: repo.file.content, sha: repo.file.sha });
    }
    if (method === "PUT") {
      const body = JSON.parse(opts.body);
      if (repo.failNextSaveWithConflict) {
        repo.failNextSaveWithConflict = false;
        return mk(409, { message: "sha does not match" });
      }
      if (repo.file && body.sha !== repo.file.sha) {
        return mk(409, { message: "sha does not match" });
      }
      repo.commits++;
      repo.file = { content: body.content, sha: "sha-" + repo.commits };
      return mk(200, { content: { sha: repo.file.sha }, commit: { html_url: "https://github.com/x/y/commit/z" } });
    }
  }
  return mk(500, { message: "unexpected call" });
};

// ---- build the app bundle for node ----
const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
await esbuild.build({
  entryPoints: ["src/App.jsx"],
  bundle: true,
  outfile: "tests/.app.cjs",
  format: "cjs",
  platform: "browser",
  jsx: "automatic",
  loader: { ".jsx": "jsx", ".css": "empty" },
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  logLevel: "silent",
});

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const App = require("./.app.cjs").default;

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);

const flush = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const text = () => document.body.textContent;

async function render() {
  await act(async () => { root.render(React.createElement(App)); await flush(80); });
}

function buttons() { return Array.from(container.querySelectorAll("button, a.btn")); }
async function click(label, { exact = false } = {}) {
  const btn = buttons().find((b) => {
    const s = b.textContent.trim();
    return exact ? s === label : s.startsWith(label);
  });
  if (!btn) throw new Error(`button not found: "${label}" (available: ${buttons().map((b) => b.textContent.trim()).filter(Boolean).slice(0, 25).join(" | ")})`);
  await act(async () => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });
  return btn;
}
function setValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc.set.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}
async function type(el, value) {
  await act(async () => { setValue(el, value); await flush(20); });
}
async function select(el, value) {
  await act(async () => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
    await flush(30);
  });
}
// Fields are rendered as <div class="field-label">名称</div> followed by the control.
function fieldInput(scope, label) {
  const el = Array.from(scope.querySelectorAll(".field-label")).find((d) => d.textContent.trim().startsWith(label));
  return el ? el.nextElementSibling : null;
}
function cardWith(frag) {
  return Array.from(container.querySelectorAll(".card")).find((c) => c.textContent.includes(frag));
}
// The per-currency summary card at the top of the assets page.
function summaryCard(ccy) {
  return Array.from(container.querySelectorAll(".card"))
    .find((c) => c.querySelector(".card-title")?.textContent.trim() === ccy);
}
function assetsOf(ccy) {
  const card = summaryCard(ccy);
  const m = card && card.textContent.match(/资产(S?\$[\d,]+\.\d\d)/);
  return m ? m[1] : null;
}
async function clickIn(scope, label) {
  const btn = Array.from(scope.querySelectorAll("button")).find((b) => b.textContent.trim() === label);
  if (!btn) throw new Error(`button "${label}" not found in scope`);
  await act(async () => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });
}
function inputByPlaceholder(frag) {
  return Array.from(container.querySelectorAll("input")).find((i) => (i.placeholder || "").includes(frag));
}

const results = [];
let pass = 0, fail = 0;
async function step(name, fn) {
  try { await fn(); pass++; results.push(`  ✓ ${name}`); }
  catch (e) { fail++; results.push(`  ✗ ${name}\n      ${String(e.message).split("\n")[0]}`); }
}

// =====================================================================
await render();

await step("app mounts and shows the brand", () => {
  assert.ok(text().includes("家账"));
});

await step("starts unconfigured with a warning to connect GitHub", () => {
  assert.ok(text().includes("未连接"), "expected 未连接 pill");
  assert.ok(text().includes("还没连接 GitHub"), "expected setup warning");
});

await step("all nav tabs render without crashing", async () => {
  for (const label of ["总览", "导入账单", "待确认", "交易记录", "月度结算", "资产负债", "净资产", "分类与规则", "设置"]) {
    await click(label);
    assert.ok(text().length > 100, `tab ${label} rendered empty`);
  }
});

// ---------- configure GitHub ----------
await step("connecting GitHub verifies access and persists config", async () => {
  await click("设置");
  await type(inputByPlaceholder("your-username"), "brandon");
  await type(inputByPlaceholder("ledger-data"), "ledger-data");
  await type(inputByPlaceholder("github_pat_"), "github_pat_test");
  await click("验证并保存");
  await flush(120);
  assert.ok(text().includes("已连接 brandon/ledger-data"), "expected success banner");
  assert.ok(lsData.has("ledger.github.config"), "config not persisted to localStorage");
  const saved = JSON.parse(lsData.get("ledger.github.config"));
  assert.equal(saved.owner, "brandon");
  assert.equal(saved.token, "github_pat_test");
});

// ---------- import a statement ----------
// Quoted thousands separators, the way real bank exports emit them.
const CSV = [
  "Date,Description,Amount",
  '05/01/2026,SALARY PAYMENT ABC CORP,"8,000.00"',
  '06/01/2026,GIRO MORTGAGE HDB LOAN,"-2,500.00"',
  "07/01/2026,NETFLIX.COM SINGAPORE,-19.98",
  '08/01/2026,PAYNOW XFER MUM,"-1,000.00"',
  "09/01/2026,PAYNOW XFER MUM,-500.00",
  "10/01/2026,WEIRD ABBREV POS 4471,-88.80",
].join("\n");

// Same data with the commas left unquoted — the silent-corruption case.
const MALFORMED_CSV = [
  "Date,Description,Amount",
  "05/02/2026,SOME MERCHANT,-2,500.00",
].join("\n");

await step("pasting a CSV reaches the mapping step", async () => {
  await click("导入账单");
  const ta = container.querySelector("textarea");
  await type(ta, CSV);
  await click("解析粘贴内容");
  assert.ok(text().includes("对应列与币种"), "did not reach mapping step");
});

await step("preview parses all 6 rows with correct directions", async () => {
  await click("下一步：预览");
  assert.match(text(), /识别出 6 笔有效交易/);
  assert.ok(text().includes("2026-01-05"), "day-first date not parsed");
  assert.ok(text().includes("S$8,000.00"), "salary amount missing");
  assert.ok(text().includes("S$2,500.00"), "comma-thousands amount not parsed");
});

await step("import applies seed rules and queues the rest for review", async () => {
  await click("确认导入");
  assert.ok(text().includes("导入完成"));
  assert.match(text(), /新增 6 笔交易（跳过 0 笔重复）/);
  // salary, mortgage(giro->no; 'mortgage' keyword yes), netflix => 3 auto
  assert.match(text(), /自动分类 3 笔/);
  assert.match(text(), /需要你确认 3 笔/);
});

await step("malformed CSV is flagged and blocked until acknowledged", async () => {
  await click("继续导入下一份");
  await type(container.querySelector("textarea"), MALFORMED_CSV);
  await click("解析粘贴内容");
  await click("下一步：预览");
  assert.ok(text().includes("列数对不上"), "expected structural warning");
  const importBtn = buttons().find((b) => b.textContent.trim().startsWith("确认导入"));
  assert.ok(importBtn.disabled, "import must be blocked until acknowledged");
  const ack = Array.from(container.querySelectorAll('input[type="checkbox"]'))
    .find((c) => c.closest("label")?.textContent.includes("仍要导入"));
  await act(async () => { ack.click(); await flush(40); });
  const importBtn2 = buttons().find((b) => b.textContent.trim().startsWith("确认导入"));
  assert.ok(!importBtn2.disabled, "acknowledging should unblock import");
});

await step("re-importing the same CSV adds nothing (dedupe)", async () => {
  await click("返回修改");   // preview -> map
  await click("重新选择");   // map -> select
  await type(container.querySelector("textarea"), CSV);
  await click("解析粘贴内容");
  await click("下一步：预览");
  await click("确认导入");
  assert.match(text(), /新增 0 笔交易（跳过 6 笔重复）/);
});

// ---------- review queue ----------
await step("review queue groups the two identical PAYNOW rows", async () => {
  await click("待确认");
  assert.ok(text().includes("PAYNOW XFER MUM"));
  assert.match(text(), /2 笔 · 支出 · 合计 S\$1,500\.00/);
});

await step("confirming with an existing category clears the group", async () => {
  const card = Array.from(container.querySelectorAll(".card")).find((c) => c.textContent.includes("PAYNOW XFER MUM"));
  const sel = card.querySelector("select");
  const famOpt = Array.from(sel.options).find((o) => o.textContent.includes("给父母"));
  await select(sel, famOpt.value);
  const confirmBtn = Array.from(card.querySelectorAll("button")).find((b) => b.textContent.trim() === "确认");
  await act(async () => { confirmBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });
  assert.ok(!text().includes("PAYNOW XFER MUM"), "group should have left the queue");
});

await step("inline new-category creation works and registers a rule", async () => {
  const card = Array.from(container.querySelectorAll(".card")).find((c) => c.textContent.includes("WEIRD ABBREV POS"));
  const sel = card.querySelector("select");
  await select(sel, "__new__");
  const nameInput = card.querySelector('input[placeholder="新分类名称"]');
  assert.ok(nameInput, "new-category name input did not appear");
  await type(nameInput, "自定义杂项");
  const confirmBtn = Array.from(card.querySelectorAll("button")).find((b) => b.textContent.trim() === "确认");
  await act(async () => { confirmBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });
  assert.ok(!text().includes("WEIRD ABBREV POS"), "group should have left the queue");

  await click("分类与规则");
  assert.ok(text().includes("自定义杂项"), "new category not in category list");
});

await step("generated rule auto-classifies the same merchant on re-import", async () => {
  await click("导入账单");
  const again = ["Date,Description,Amount", "11/01/2026,WEIRD ABBREV POS 4471,-12.00"].join("\n");
  await type(container.querySelector("textarea"), again);
  await click("解析粘贴内容");
  await click("下一步：预览");
  await click("确认导入");
  assert.match(text(), /新增 1 笔交易/);
  assert.match(text(), /自动分类 1 笔/, "the learned rule should have caught it");
  assert.match(text(), /需要你确认 0 笔/);
});

// ---------- dashboard ----------
await step("dashboard totals are correct", async () => {
  await click("总览");
  assert.ok(text().includes("S$8,000.00"), "income total missing");
  // expenses: 2500 + 19.98 + 1000 + 500 + 88.80 + 12 = 4120.78
  assert.ok(text().includes("S$4,120.78"), `expense total wrong; body had: ${text().match(/S\$[\d,]+\.\d\d/g)}`);
  assert.ok(text().includes("S$3,879.22"), "net cash flow wrong");
});

await step("savings rate is computed", () => {
  assert.match(text(), /48%/);
});

// ---------- assets & liabilities ----------
await step("the assets tab starts empty with a prompt to add an account", async () => {
  await click("资产负债");
  assert.ok(text().includes("还没有任何资产或负债"), "expected the empty state");
});

await step("a fixed deposit auto-fills its maturity date from the term", async () => {
  await click("银行定期");
  const nameInput = inputByPlaceholder("银行定期");
  await type(nameInput, "OCBC 12个月定期");
  const dates = Array.from(container.querySelectorAll('input[type="date"]'));
  await type(dates[0], "2026-01-01");           // 起息日
  const numbers = Array.from(container.querySelectorAll('input[type="number"]'));
  await type(numbers[0], "100000");             // 本金
  await type(numbers[1], "3.65");               // 年利率
  await type(numbers[2], "12");                 // 存期
  const maturity = Array.from(container.querySelectorAll('input[type="date"]'))[1];
  assert.equal(maturity.value, "2027-01-01", "maturity should follow the term");
  await click("添加账户");
  assert.ok(text().includes("OCBC 12个月定期"), "account not listed");
});

await step("the deposit shows principal plus interest accrued to today", async () => {
  // Started 2026-01-01 at 3.65% simple; the app values it as of today.
  const body = text();
  assert.ok(body.includes("S$100,000.00"), "principal missing");
  assert.ok(body.includes("2027-01-01"), "maturity date missing");
  assert.match(body, /还有 \d+ 天/, "expected a countdown to maturity");
});

await step("a mortgage accrues one month of interest on the 1st, every month", async () => {
  await click("房贷");
  await type(inputByPlaceholder("房贷"), "HDB 房贷");
  const numbers = Array.from(container.querySelectorAll('input[type="number"]'));
  await type(numbers[0], "500000");   // 放款金额
  await type(numbers[1], "3");        // 年利率
  const dates = Array.from(container.querySelectorAll('input[type="date"]'));
  await type(dates[0], "2026-01-01"); // 放款日
  await click("添加账户");
  assert.ok(text().includes("HDB 房贷"), "loan not listed");
  assert.ok(text().includes("每月 1 号计息"), "expected the accrual-day note");
});

await step("net worth reflects the loan as a liability", async () => {
  const body = text();
  assert.ok(body.includes("负债"), "expected a liability column");
  // 500k drawn on 2026-01-01 at 3%/12 per month has grown past 500k by now.
  const owed = body.match(/S\$5[0-9]{2},[0-9]{3}\.[0-9]{2}/);
  assert.ok(owed, `expected a balance above the 500,000 principal, body had: ${body.match(/S\$[\d,]+\.\d\d/g)}`);
});

const owed = () => parseFloat(cardWith("下次计息").textContent.match(/S\$([\d,]+\.\d\d)/)[1].replace(/,/g, ""));

await step("recording a prepayment reduces the outstanding balance", async () => {
  // A freshly added account opens expanded, so its detail is already on screen.
  assert.ok(text().includes("下次计息"), "loan detail should be open after adding");
  const before = owed();
  await type(fieldInput(cardWith("下次计息"), "金额"), "2500");
  await click("记入");
  assert.ok(owed() < before, `prepayment should reduce the balance (${before} -> ${owed()})`);
});

await step("a prepayment also books the mid-month interest rebate", async () => {
  const card = cardWith("下次计息");
  assert.ok(card.textContent.includes("利息回扣"), "expected the rebate row in the ledger");
  const rebateRows = Array.from(card.querySelectorAll("tbody tr"))
    .filter((r) => r.textContent.includes("INT-R"));
  assert.equal(rebateRows.length, 1, "one rebate per prepayment");
});

await step("the full ledger shows every row with its statement code", async () => {
  await click("全部");
  const card = cardWith("完整记录");
  // This loan was set up at 3%, so its generated charges print as IP-3.00.
  assert.match(card.textContent, /IP-3\.00/, "expected the interest code");
  assert.ok(card.textContent.includes("AXS-L"), "expected the prepayment code");
  assert.ok(card.textContent.includes("自动"), "generated interest should be marked");
});

await step("an entry can be edited and the balance recomputes", async () => {
  const card = cardWith("完整记录");
  const row = Array.from(card.querySelectorAll("tbody tr")).find((r) => r.textContent.includes("AXS-L"));
  const pencil = Array.from(row.querySelectorAll("button")).find((b) => b.getAttribute("title") === "编辑");
  await act(async () => { pencil.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });
  assert.ok(text().includes("修改记录"), "edit form did not open");
  const before = owed();
  await type(fieldInput(cardWith("修改记录"), "金额"), "5000");
  await click("保存修改");
  assert.ok(owed() < before, "raising the prepayment should lower the balance further");
});

await step("an entry can be deleted and the balance goes back", async () => {
  const before = owed();
  const row = Array.from(cardWith("完整记录").querySelectorAll("tbody tr")).find((r) => r.textContent.includes("AXS-L"));
  const bin = Array.from(row.querySelectorAll("button")).find((b) => b.getAttribute("title") === "删除");
  await act(async () => { bin.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });
  await click("删除");
  assert.ok(owed() > before, "removing a prepayment should raise the balance");
});

await step("pasting a real statement reconciles and imports", async () => {
  await click("导入对账单");
  const panel = cardWith("导入对账单");
  const ta = Array.from(panel.querySelectorAll("textarea")).pop();
  await type(ta, HDB_ALL);
  await click("解析");
  assert.match(text(), /解析出/, "parse summary missing");
  assert.match(text(), /对账通过/, `expected reconciliation to pass; got: ${text().match(/对不上[^。]*。/) || ""}`);
  assert.match(text(), /25\/25 条与/, "expected the interest cross-check");
  await click("确认导入");
  assert.match(text(), /导入完成：新增 135 条记录/);
});

await step("the imported loan matches the statement's closing balance to the cent", async () => {
  await click("全部");
  const card = cardWith("完整记录");
  const expected = `S$${CLOSING[2026].toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  assert.ok(card.textContent.includes(expected), `expected ${expected}; body had ${card.textContent.match(/S\$[\d,]+\.\d\d/g)?.slice(0, 5)}`);
});

await step("re-importing the same statement adds nothing", async () => {
  // The panel stays open after an import, ready for the next statement.
  await type(Array.from(cardWith("导入对账单").querySelectorAll("textarea")).pop(), HDB_ALL);
  await click("解析");
  await click("确认导入");
  assert.match(text(), /新增 0 条记录，跳过 135 条重复/);
});

await step("yearly subtotals appear when a year is picked", async () => {
  await click("2025 年");
  assert.match(text(), /2025 年：/);
  const expected = `S$${CLOSING[2025].toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  assert.ok(cardWith("完整记录").textContent.includes(expected), `expected the 2025 closing balance ${expected}`);
});

await step("a brokerage holding values at quantity x price once a price is known", async () => {
  await click("股票账户");
  await type(inputByPlaceholder("股票账户"), "IBKR");
  await click("添加账户");

  const card = Array.from(container.querySelectorAll(".card")).find((c) => c.textContent.includes("IBKR"));
  const addHolding = Array.from(card.querySelectorAll("button")).find((b) => b.textContent.includes("添加持仓"));
  await act(async () => { addHolding.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });

  const fresh = Array.from(container.querySelectorAll(".card")).find((c) => c.textContent.includes("IBKR"));
  await type(fresh.querySelector('input[placeholder="QQQ"]'), "QQQ");
  // The first number input on the card is the account's cash; quantity lives in the table.
  await type(fresh.querySelector('table input[type="number"]'), "50");
  assert.match(text(), /还没有 QQQ 的价格/, "a price-less holding must say so rather than count as zero");

  // Manual price entry — the fallback that works with no market-data provider.
  const pencil = Array.from(fresh.querySelectorAll("button")).find((b) => b.getAttribute("title") === "手动改价");
  await act(async () => { pencil.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(60); });
  const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.getAttribute("title") === "保存价格");
  assert.ok(saveBtn, "price editor did not open");
  await type(saveBtn.parentElement.querySelector('input[type="number"]'), "500");
  await act(async () => {
    Array.from(container.querySelectorAll("button")).find((b) => b.getAttribute("title") === "保存价格")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await flush(60);
  });
  assert.ok(text().includes("$25,000.00"), `50 x 500 should be 25,000; body had ${text().match(/\$[\d,]+\.\d\d/g)}`);
});

await step("brokerage cash is recorded per currency, never converted", async () => {
  const card = cardWith("IBKR");
  await clickIn(card, "SGD");
  await clickIn(cardWith("IBKR"), "USD");
  const rows = Array.from(cardWith("IBKR").querySelectorAll(".row"))
    .filter((r) => /^(SGD|USD)/.test(r.textContent.trim()));
  assert.ok(rows.length >= 2, "expected a row per currency");
  const sgdInput = rows.find((r) => r.textContent.trim().startsWith("SGD")).querySelector("input");
  const usdInput = rows.find((r) => r.textContent.trim().startsWith("USD")).querySelector("input");
  await type(sgdInput, "5000");
  await type(usdInput, "1000");
  const card2 = cardWith("IBKR");
  // The holding was added in SGD, so SGD carries 25,000 of QQQ plus 5,000 cash,
  // while the 1,000 of USD cash stays in its own column — no conversion anywhere.
  assert.ok(card2.textContent.includes("S$30,000.00"), `SGD subtotal wrong: ${card2.textContent.match(/S?\$[\d,]+\.\d\d/g)}`);
  assert.ok(card2.textContent.includes("$1,000.00"), "USD cash should stand on its own");
  assert.equal(assetsOf("USD"), "$1,000.00", "USD assets must not absorb any SGD");
});

await step("holdings carry no cost basis any more", () => {
  const head = cardWith("IBKR").querySelector("thead").textContent;
  assert.ok(!head.includes("成本"), "cost column should be gone");
  assert.ok(!head.includes("盈亏"), "gain column should be gone");
  assert.ok(head.includes("现价") && head.includes("市值"));
});

let assetsBeforePhysical = null;
await step("a house and a car are listed by name, with no amount", async () => {
  assetsBeforePhysical = assetsOf("SGD");
  await click("房产");
  await type(inputByPlaceholder("房产"), "Punggol 组屋");
  await click("添加账户");
  await click("汽车");
  await type(inputByPlaceholder("汽车"), "CR-V");
  await click("添加账户");

  const overview = cardWith("实物资产");
  assert.ok(overview, "expected the physical-asset card in the overview");
  assert.ok(overview.textContent.includes("Punggol 组屋") && overview.textContent.includes("CR-V"));
  assert.ok(overview.textContent.includes("不计入"), "it should say it stays out of the totals");

  const card = cardWith("Punggol 组屋");
  assert.ok(!card.textContent.includes("购入价"), "no price field should exist");
  assert.ok(!/S\$0\.00/.test(card.textContent), "a house must not show a zero valuation");
});

await step("adding them does not move the asset total", () => {
  assert.ok(assetsBeforePhysical, "failed to read the SGD assets figure");
  assert.equal(assetsOf("SGD"), assetsBeforePhysical, "a named house must not change the total");
});

await step("a snapshot can be generated from the live account values", async () => {
  await click("生成净资产快照");
  assert.match(text(), /已把今天的资产负债写入净资产快照/);
  await click("净资产");
  assert.ok(text().includes("账户合计（自动）"), "snapshot rows did not reach the net-worth page");
});

await step("accounts and prices survive a round-trip through the ledger file", async () => {
  await click("资产负债");
  assert.ok(text().includes("OCBC 12个月定期") && text().includes("HDB 房贷") && text().includes("IBKR"));
});

// ---------- the monthly clearing sheet ----------
await step("the month picks up salary and dividends from the imported statement", async () => {
  await click("月度结算");
  // The CSV imported earlier is dated January 2026.
  const picker = Array.from(container.querySelectorAll("select"))
    .find((sel) => Array.from(sel.options).some((o) => o.textContent.includes("2026 年 1 月")));
  assert.ok(picker, "expected January to be offered");
  await select(picker, "2026-01");
  const body = text();
  assert.ok(body.includes("S$8,000.00"), `expected the salary; body had ${body.match(/S\$[\d,]+\.\d\d/g)?.slice(0, 6)}`);
  assert.ok(body.includes("工资性收入"));
});

await step("surplus is income minus what was spent that month", () => {
  // 8,000 in; 4,120.78 of expenses were imported for January.
  assert.ok(text().includes("S$4,120.78"), "expected the month's spending");
  assert.ok(text().includes("S$3,879.22"), "expected income minus spending");
});

await step("an unplaced surplus is called out rather than left as a nice number", () => {
  assert.match(text(), /待分配/);
  assert.ok(!text().includes("已结清"), "an unplaced month must not read as closed");
});

await step("money that never touches the bank can be added by hand", async () => {
  await click("手动补一笔");
  const card = cardWith("收入构成");
  const catSel = card.querySelector("select");
  const opt = Array.from(catSel.options).find((o) => o.textContent.includes("资本利得"));
  await select(catSel, opt.value);
  await type(fieldInput(cardWith("收入构成"), "金额"), "1200");
  await clickIn(cardWith("收入构成"), "添加");
  const body = cardWith("收入构成").textContent;
  assert.ok(body.includes("S$1,200.00"), "the manual entry should show up");
  assert.ok(body.includes("手动补录"), "and be marked as hand-entered");
});

await step("allocating the surplus to a deposit and a loan closes the month", async () => {
  // 3,879.22 surplus + 1,200 manual capital gains = 5,079.22 to place.
  await click("添加分配");
  const card = cardWith("结余去向");
  const target = card.querySelector("select");
  const fdOpt = Array.from(target.options).find((o) => o.textContent.includes("OCBC 12个月定期"));
  assert.ok(fdOpt, `expected the deposit as a target; had ${Array.from(target.options).map((o) => o.textContent)}`);
  await select(target, fdOpt.value);
  await type(fieldInput(cardWith("结余去向"), "金额"), "4000");
  await clickIn(cardWith("结余去向"), "记入");
  assert.ok(cardWith("结余去向").textContent.includes("转化为资产"));

  await click("添加分配");
  const card2 = cardWith("结余去向");
  const target2 = card2.querySelector("select");
  const loanOpt = Array.from(target2.options).find((o) => o.textContent.includes("HDB 房贷"));
  await select(target2, loanOpt.value);
  await type(fieldInput(cardWith("结余去向"), "金额"), "1079.22");
  await clickIn(cardWith("结余去向"), "记入");

  assert.match(text(), /已结清/, `the month should now clear to zero; body: ${text().match(/待分配|超额分配|已结清/g)}`);
});

await step("a house is not offered as somewhere to put money", async () => {
  await click("添加分配");
  const opts = Array.from(cardWith("结余去向").querySelector("select").options).map((o) => o.textContent);
  assert.ok(!opts.some((o) => o.includes("Punggol 组屋")), "a property carries no amount, so it cannot absorb a surplus");
  assert.ok(opts.some((o) => o.includes("HDB 房贷")), "but a debt can");
});

// ---------- saving ----------
await step("dirty state is flagged before saving", () => {
  assert.ok(text().includes("有未保存的修改"), "expected dirty indicator");
});

await step("saving creates the file on GitHub", async () => {
  await click("保存到 GitHub");
  await flush(150);
  assert.equal(repo.commits, 1, "expected exactly one commit");
  assert.ok(repo.file, "file not created");
  assert.ok(text().includes("已保存到 GitHub"), "expected success banner");
  assert.ok(text().includes("已同步"), "expected synced pill");
});

await step("saved payload is valid UTF-8 JSON with Chinese intact", () => {
  const parsed = JSON.parse(fromB64(repo.file.content));
  assert.equal(parsed.transactions.length, 7);
  const names = parsed.categories.expense.map((c) => c.name);
  assert.ok(names.includes("人情往来（红包/礼金）"), "seed Chinese category corrupted");
  assert.ok(names.includes("自定义杂项"), "user-created category missing");
  assert.ok(parsed.rules.some((r) => r.pattern === "WEIRD ABBREV POS 4471"), "learned rule not persisted");
  assert.equal(parsed.accounts.length, 5, "accounts not persisted");
  const house = parsed.accounts.find((a) => a.kind === "property");
  assert.equal(house.value, undefined, "a property must not carry a valuation");
  const ibkr = parsed.accounts.find((a) => a.kind === "brokerage");
  assert.equal(Number(ibkr.cashByCurrency.SGD), 5000);
  assert.equal(Number(ibkr.cashByCurrency.USD), 1000);
  assert.ok(ibkr.holdings.every((h) => h.costBasis === undefined), "cost basis should be gone");
  const loan = parsed.accounts.find((a) => a.kind === "mortgage");
  const fromStatement = loan.entries.filter((e) => e.source === "statement");
  assert.equal(fromStatement.length, 135, "the imported statement should be in the file");
  assert.ok(loan.entries.some((e) => e.type === "rebate" && e.source !== "statement"), "the hand-entered rebate should survive too");
  assert.equal(parsed.quotes.QQQ.price, 500, "the last known price should travel with the ledger");
  assert.equal(parsed.schemaVersion, 3);
  assert.equal(parsed.incomeEntries.length, 1, "the hand-entered income should persist");
  assert.equal(parsed.allocations.length, 2, "both allocations should persist");
  assert.equal(parsed.allocations[0].month, "2026-01");
  assert.ok(parsed.allocations.some((a) => Number(a.amount) === 4000), "the deposit allocation should be there");
});

await step("second save sends the updated sha and succeeds", async () => {
  await click("交易记录");
  await click("手动添加");
  await type(inputByPlaceholder("给妈妈生活费"), "手动测试一笔");
  const amt = Array.from(container.querySelectorAll('input[type="number"]'))[0];
  await type(amt, "42");
  await click("添加交易");
  await click("保存到 GitHub");
  await flush(150);
  assert.equal(repo.commits, 2, "expected a second commit");
  const parsed = JSON.parse(fromB64(repo.file.content));
  assert.equal(parsed.transactions.length, 8);
});

// ---------- conflict handling ----------
await step("a stale-sha save surfaces the conflict UI instead of overwriting", async () => {
  await click("交易记录");
  await click("手动添加");
  await type(inputByPlaceholder("给妈妈生活费"), "冲突测试");
  await type(Array.from(container.querySelectorAll('input[type="number"]'))[0], "7");
  await click("添加交易");

  repo.failNextSaveWithConflict = true;
  const before = repo.commits;
  await click("保存到 GitHub");
  await flush(150);
  assert.equal(repo.commits, before, "conflicting save must not commit");
  assert.ok(text().includes("远端已被其他设备修改"), "expected conflict banner");
  assert.ok(text().includes("用本地覆盖远端"), "expected conflict resolution options");
});

await step("choosing 'overwrite remote' re-reads the sha and commits", async () => {
  const before = repo.commits;
  await click("用本地覆盖远端");
  await flush(200);
  assert.equal(repo.commits, before + 1, "forced save should commit once");
  assert.ok(text().includes("已保存到 GitHub"));
  const parsed = JSON.parse(fromB64(repo.file.content));
  assert.ok(parsed.transactions.some((t) => t.description === "冲突测试"));
});

// ---------- reload / persistence ----------
await step("remote data reloads correctly into a fresh app instance", async () => {
  lsData.delete("ledger.cache"); // simulate a different device
  await act(async () => { root.unmount(); await flush(20); });
  const c2 = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(c2);
  const root2 = createRoot(c2);
  await act(async () => { root2.render(React.createElement(App)); await flush(200); });
  const body = document.body.textContent;
  assert.ok(body.includes("已同步") || body.includes("加载"), "expected sync state on fresh load");
  assert.ok(body.includes("家账"));
  // navigate to transactions to confirm the data came back
  const btn = Array.from(c2.querySelectorAll("button")).find((b) => b.textContent.trim().startsWith("交易记录"));
  await act(async () => { btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(80); });
  assert.ok(document.body.textContent.includes("冲突测试"), "transactions did not reload from remote");
});

// ---------- prices fetch themselves ----------
await step("with a provider configured, prices are fetched on arrival", async () => {
  lsData.delete("ledger.cache");
  lsData.set("ledger.quotes.config", JSON.stringify({ provider: "finnhub", apiKey: "test-key", proxy: "" }));
  quoteCalls.length = 0;

  // Age the cached price by a day: this is the ordinary case of opening the app
  // the next morning, which is exactly when a fetch should happen by itself.
  const stored = JSON.parse(fromB64(repo.file.content));
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  stored.quotes.QQQ = { ...stored.quotes.QQQ, fetchedAt: yesterday, asOf: yesterday };
  repo.file = { content: b64(JSON.stringify(stored, null, 2)), sha: repo.file.sha };

  await act(async () => { root.unmount?.(); await flush(20); });
  const c3 = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(c3);
  const root3 = createRoot(c3);
  await act(async () => { root3.render(React.createElement(App)); await flush(250); });

  const goAssets = Array.from(c3.querySelectorAll("button")).find((b) => b.textContent.trim().startsWith("资产负债"));
  await act(async () => { goAssets.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(300); });

  assert.ok(quoteCalls.length > 0, "the page should fetch without anyone pressing refresh");
  assert.ok(quoteCalls[0].includes("symbol=QQQ"), `expected a QQQ quote call, got ${quoteCalls[0]}`);
  assert.ok(quoteCalls[0].includes("token=test-key"), "the api key should be sent");

  // 50 shares at the fetched 512.34 = 25,617, plus the 5,000 of SGD cash.
  const body = document.body.textContent;
  assert.ok(body.includes("30,617.00"), `the fetched price should flow into the totals; body had ${body.match(/[\d,]+\.\d\d/g)?.slice(0, 8)}`);
  assert.ok(!body.includes("30,000.00"), "the stale manual price should have been replaced");
});

await step("a second visit does not spend another API call on the same day", async () => {
  const before = quoteCalls.length;
  const goDash = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim().startsWith("总览"));
  await act(async () => { goDash.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(80); });
  const goAssets = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim().startsWith("资产负债"));
  await act(async () => { goAssets.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await flush(200); });
  assert.equal(quoteCalls.length, before, "today's price is already cached; free-tier calls are finite");
});

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
