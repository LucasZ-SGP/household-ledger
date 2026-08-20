// Mounts the real App component in jsdom against a fake in-memory GitHub repo
// and drives the flows a person actually performs.
import jsdomGlobal from "global-jsdom";
jsdomGlobal(undefined, { url: "http://localhost/", pretendToBeVisual: true });

import assert from "node:assert/strict";
import { createRequire } from "module";

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
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const method = opts.method || "GET";
  fetchLog.push(`${method} ${url}`);
  const mk = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });

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
  for (const label of ["总览", "导入账单", "待确认", "交易记录", "净资产", "分类与规则", "设置"]) {
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

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
