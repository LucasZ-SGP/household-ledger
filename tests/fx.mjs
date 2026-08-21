import assert from "node:assert/strict";
import { fxUrl, fxPairKey, fetchFxTable, fetchFxRates, convertAmount } from "../src/lib/fx.js";

const res = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

// A trimmed copy of what open.er-api.com actually answers, base SGD.
const table = (rates = { CNY: 5.301414, USD: 0.786257, JPY: 124.866476, EUR: 0.672934, SGD: 1 }) => ({
  result: "success",
  base_code: "SGD",
  time_last_update_utc: "Fri, 21 Aug 2026 00:02:31 +0000",
  rates,
});

const near = (actual, expected, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tol, `expected ~${expected}, got ${actual}`);

async function expectThrows(fn, kind) {
  try {
    await fn();
  } catch (e) {
    assert.equal(e.kind, kind, `expected kind ${kind}, got ${e.kind} (${e.message})`);
    return e;
  }
  throw new Error("expected a throw");
}

export function runFxTests(t) {
  // ---------- url / keys ----------
  t("fx url targets the display currency", () => {
    assert.equal(fxUrl("SGD"), "https://open.er-api.com/v6/latest/SGD");
  });
  t("fx url upper-cases and trims", () => {
    assert.equal(fxUrl(" sgd "), "https://open.er-api.com/v6/latest/SGD");
  });
  t("pair keys are stable", () => assert.equal(fxPairKey("USD", "CNY"), "USD_CNY"));

  // ---------- the table ----------
  t("the table parses rates and a timestamp", async () => {
    const r = await fetchFxTable("SGD", { fetchImpl: async () => res(table()) });
    assert.equal(r.rates.CNY, 5.301414);
    assert.match(r.asOf, /2026/);
  });
  t("one request covers every currency", async () => {
    let calls = 0;
    await fetchFxRates(["CNY", "USD", "JPY"], "SGD", {
      fetchImpl: async () => { calls++; return res(table()); },
    });
    assert.equal(calls, 1, "should not fan out one request per currency");
  });

  // ---------- direction ----------
  t("a base -> quote rate is the reciprocal of what the source prints", async () => {
    const { rates } = await fetchFxRates(["CNY"], "SGD", { fetchImpl: async () => res(table()) });
    // The source says 1 SGD = 5.301414 CNY, so 1 CNY must be ~0.1886 SGD.
    near(rates.CNY_SGD.rate, 1 / 5.301414);
  });
  t("converting round-trips back to the original amount", async () => {
    const { rates } = await fetchFxRates(["CNY"], "SGD", { fetchImpl: async () => res(table()) });
    const inSgd = convertAmount(1000, "CNY", "SGD", rates);
    near(inSgd * 5.301414, 1000, 1e-6);
  });
  t("100 CNY is worth less than 100 SGD, not more", async () => {
    const { rates } = await fetchFxRates(["CNY"], "SGD", { fetchImpl: async () => res(table()) });
    assert.ok(convertAmount(100, "CNY", "SGD", rates) < 100, "direction is inverted");
  });

  // ---------- conversion ----------
  t("the display currency converts to itself without a rate", () => {
    assert.equal(convertAmount(500, "SGD", "SGD", {}), 500);
  });
  t("a missing rate is null, never a silent zero", () => {
    assert.equal(convertAmount(500, "THB", "SGD", {}), null);
  });
  t("a garbage cached rate is treated as missing", () => {
    assert.equal(convertAmount(500, "THB", "SGD", { THB_SGD: { rate: "abc" } }), null);
  });

  // ---------- what it skips ----------
  t("the display currency is never fetched against itself", async () => {
    const { rates, errors } = await fetchFxRates(["SGD"], "SGD", {
      fetchImpl: async () => { throw new Error("should not be called"); },
    });
    assert.deepEqual(rates, {});
    assert.deepEqual(errors, []);
  });
  t("duplicate currencies are only fetched once", async () => {
    const { rates } = await fetchFxRates(["CNY", "CNY"], "SGD", { fetchImpl: async () => res(table()) });
    assert.equal(Object.keys(rates).length, 1);
  });

  // ---------- failure ----------
  t("a currency the source does not carry is reported, not guessed", async () => {
    const { rates, errors } = await fetchFxRates(["XYZ"], "SGD", { fetchImpl: async () => res(table()) });
    assert.deepEqual(rates, {});
    assert.equal(errors[0].pair, "XYZ_SGD");
    assert.equal(errors[0].kind, "notfound");
  });
  t("a blocked request explains itself as a cross-origin problem", async () => {
    await expectThrows(
      () => fetchFxTable("SGD", { fetchImpl: async () => { throw new Error("boom"); } }),
      "blocked"
    );
  });
  t("an HTML error page is a readable message, not a JSON crash", async () => {
    await expectThrows(() => fetchFxTable("SGD", { fetchImpl: async () => res("<html>nope</html>") }), "parse");
  });
  t("the source's own error object surfaces", async () => {
    await expectThrows(
      () => fetchFxTable("XYZ", { fetchImpl: async () => res({ result: "error", "error-type": "unsupported-code" }) }),
      "notfound"
    );
  });
  t("one failed request fails the whole batch rather than half-converting", async () => {
    const { rates, errors } = await fetchFxRates(["CNY", "USD"], "SGD", {
      fetchImpl: async () => { throw new Error("offline"); },
    });
    assert.deepEqual(rates, {});
    assert.equal(errors.length, 2, "every requested pair should be accounted for");
  });
  t("fetchFxRates never rejects, even when everything fails", async () => {
    const out = await fetchFxRates(["CNY"], "SGD", { fetchImpl: async () => res("nope", { status: 500 }) });
    assert.equal(Object.keys(out.rates).length, 0);
    assert.equal(out.errors.length, 1);
  });

  // ---------- proxy ----------
  t("the proxy is applied to the rate request", async () => {
    let seen = null;
    await fetchFxTable("SGD", {
      proxy: "https://p.test/?url={url}",
      fetchImpl: async (url) => { seen = url; return res(table()); },
    });
    assert.ok(seen.startsWith("https://p.test/?url="), seen);
  });
}
