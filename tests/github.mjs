import assert from "node:assert/strict";
import {
  utf8ToBase64, base64ToUtf8, loadLedger, saveLedger, verifyAccess, GitHubError,
} from "../src/lib/github.js";

const CFG = { owner: "brandon", repo: "ledger-data", path: "ledger.json", branch: "main", token: "tok" };

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    const res = await handler(String(url), opts, calls.length);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => (res.body === undefined ? "" : JSON.stringify(res.body)),
    };
  };
  return calls;
}

export function runGitHubTests(t) {
  // ---------- base64 round-trip ----------
  t("base64 round-trips ASCII", () => {
    const s = '{"a":1}';
    assert.equal(base64ToUtf8(utf8ToBase64(s)), s);
  });
  t("base64 round-trips Chinese (the btoa trap)", () => {
    const s = JSON.stringify({ name: "人情往来（红包/礼金）", note: "给父母的钱" });
    assert.equal(base64ToUtf8(utf8ToBase64(s)), s);
  });
  t("base64 round-trips emoji / astral plane", () => {
    const s = "净资产 📈 ¥1,234.50";
    assert.equal(base64ToUtf8(utf8ToBase64(s)), s);
  });
  t("base64 round-trips a large payload", () => {
    const big = JSON.stringify(Array.from({ length: 5000 }, (_, i) => ({ i, d: "描述文字" + i })));
    assert.equal(base64ToUtf8(utf8ToBase64(big)), big);
  });
  t("base64ToUtf8 tolerates GitHub's wrapped newlines", () => {
    const s = JSON.stringify({ k: "中文" });
    const wrapped = utf8ToBase64(s).replace(/(.{10})/g, "$1\n");
    assert.equal(base64ToUtf8(wrapped), s);
  });

  // ---------- loadLedger ----------
  t("loadLedger decodes content and returns sha", async () => {
    const payload = { transactions: [{ description: "测试交易" }] };
    mockFetch(async () => ({ status: 200, body: { content: utf8ToBase64(JSON.stringify(payload)), sha: "abc123" } }));
    const res = await loadLedger(CFG);
    assert.equal(res.sha, "abc123");
    assert.equal(res.state.transactions[0].description, "测试交易");
    assert.equal(res.missing, false);
  });

  t("loadLedger sends auth header and ref", async () => {
    const calls = mockFetch(async () => ({ status: 200, body: { content: utf8ToBase64("{}"), sha: "s" } }));
    await loadLedger(CFG);
    assert.match(calls[0].url, /repos\/brandon\/ledger-data\/contents\/ledger\.json/);
    assert.match(calls[0].url, /ref=main/);
    assert.equal(calls[0].headers.Authorization, "Bearer tok");
  });

  t("loadLedger reports missing file (not an error) when repo exists", async () => {
    mockFetch(async (url) => {
      if (url.includes("/contents/")) return { status: 404, body: { message: "Not Found" } };
      return { status: 200, body: { full_name: "brandon/ledger-data" } }; // repo check succeeds
    });
    const res = await loadLedger(CFG);
    assert.equal(res.missing, true);
    assert.equal(res.state, null);
    assert.equal(res.sha, null);
  });

  t("loadLedger throws notfound when the repo itself is missing", async () => {
    mockFetch(async () => ({ status: 404, body: { message: "Not Found" } }));
    await assert.rejects(() => loadLedger(CFG), (e) => e instanceof GitHubError && e.kind === "notfound");
  });

  t("loadLedger maps 401 to an auth error", async () => {
    mockFetch(async () => ({ status: 401, body: { message: "Bad credentials" } }));
    await assert.rejects(() => loadLedger(CFG), (e) => e.kind === "auth");
  });

  t("loadLedger rejects a directory path", async () => {
    mockFetch(async () => ({ status: 200, body: [{ name: "a.json" }] }));
    await assert.rejects(() => loadLedger(CFG), /目录/);
  });

  t("loadLedger reports corrupt JSON clearly", async () => {
    mockFetch(async () => ({ status: 200, body: { content: utf8ToBase64("{not json"), sha: "s" } }));
    await assert.rejects(() => loadLedger(CFG), /不是合法的 JSON/);
  });

  t("loadLedger handles nested paths", async () => {
    const calls = mockFetch(async () => ({ status: 200, body: { content: utf8ToBase64("{}"), sha: "s" } }));
    await loadLedger({ ...CFG, path: "data/2026/ledger.json" });
    assert.match(calls[0].url, /contents\/data\/2026\/ledger\.json/);
  });

  // ---------- saveLedger ----------
  t("saveLedger sends sha for updates and returns the new one", async () => {
    const calls = mockFetch(async () => ({ status: 200, body: { content: { sha: "newsha" }, commit: { html_url: "u" } } }));
    const res = await saveLedger(CFG, { transactions: [] }, "oldsha");
    assert.equal(calls[0].method, "PUT");
    assert.equal(calls[0].body.sha, "oldsha");
    assert.equal(calls[0].body.branch, "main");
    assert.equal(res.sha, "newsha");
  });

  t("saveLedger omits sha when creating the file", async () => {
    const calls = mockFetch(async () => ({ status: 200, body: { content: { sha: "s1" } } }));
    await saveLedger(CFG, {}, null);
    assert.equal("sha" in calls[0].body, false);
  });

  t("saveLedger content survives a Chinese round-trip", async () => {
    let captured = null;
    mockFetch(async (url, opts) => {
      captured = JSON.parse(opts.body).content;
      return { status: 200, body: { content: { sha: "s" } } };
    });
    const state = { categories: { expense: [{ name: "人情往来（红包/礼金）" }] } };
    await saveLedger(CFG, state, "x");
    assert.deepEqual(JSON.parse(base64ToUtf8(captured)), state);
  });

  t("saveLedger maps 409 to a conflict error", async () => {
    mockFetch(async () => ({ status: 409, body: { message: "does not match" } }));
    await assert.rejects(() => saveLedger(CFG, {}, "stale"), (e) => e.kind === "conflict");
  });

  t("saveLedger maps 422 (stale sha) to conflict", async () => {
    mockFetch(async () => ({ status: 422, body: { message: "sha does not match" } }));
    await assert.rejects(() => saveLedger(CFG, {}, "stale"), (e) => e.kind === "conflict");
  });

  t("saveLedger maps 403 to a permissions error", async () => {
    mockFetch(async () => ({ status: 403, body: { message: "Resource not accessible" } }));
    await assert.rejects(() => saveLedger(CFG, {}, "s"), (e) => e.kind === "auth");
  });

  t("network failure surfaces a friendly message", async () => {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(() => loadLedger(CFG), (e) => e.kind === "network");
  });

  // ---------- verifyAccess ----------
  t("verifyAccess accepts a pushable repo", async () => {
    mockFetch(async () => ({ status: 200, body: { full_name: "brandon/ledger-data", private: true, default_branch: "main", permissions: { push: true } } }));
    const info = await verifyAccess(CFG);
    assert.equal(info.fullName, "brandon/ledger-data");
    assert.equal(info.private, true);
  });

  t("verifyAccess rejects a read-only token", async () => {
    mockFetch(async () => ({ status: 200, body: { full_name: "x/y", permissions: { push: false } } }));
    await assert.rejects(() => verifyAccess(CFG), /只有读权限/);
  });
}
