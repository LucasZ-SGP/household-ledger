import assert from "node:assert/strict";
import {
  quoteUrl, applyProxy, parseQuote, fetchQuote, fetchQuotes,
  providerMeta, mergeQuotes, manualQuote, QuoteError, QUOTE_PROVIDERS,
} from "../src/lib/quotes.js";

const res = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

async function expectThrows(fn, kindOrRe) {
  try {
    await fn();
  } catch (e) {
    if (kindOrRe instanceof RegExp) assert.match(e.message, kindOrRe);
    else assert.equal(e.kind, kindOrRe, `expected kind ${kindOrRe}, got ${e.kind} (${e.message})`);
    return e;
  }
  throw new Error("expected a throw");
}

export function runQuoteTests(t) {
  // ---------- urls ----------
  t("finnhub url carries symbol and token", () => {
    assert.equal(quoteUrl("finnhub", "QQQ", { apiKey: "k1" }), "https://finnhub.io/api/v1/quote?symbol=QQQ&token=k1");
  });
  t("stooq url lowercases the symbol", () => {
    assert.ok(quoteUrl("stooq", "QQQ.US", {}).includes("s=qqq.us"));
  });
  t("symbols with a dot or caret are url-encoded", () => {
    assert.ok(quoteUrl("twelvedata", "BRK.B", { apiKey: "k" }).includes("symbol=BRK.B"));
    assert.ok(quoteUrl("yahoo", "^GSPC", {}).includes("%5EGSPC"));
  });
  t("an unknown provider has no url", () => assert.equal(quoteUrl("manual", "QQQ", {}), null));

  t("a proxy prefix is prepended", () => {
    assert.equal(applyProxy("https://x.test/a", "https://p.test/"), "https://p.test/https://x.test/a");
  });
  t("a {url} template gets the encoded target", () => {
    assert.equal(applyProxy("https://x.test/a?b=1", "https://p.test/?url={url}"),
      "https://p.test/?url=https%3A%2F%2Fx.test%2Fa%3Fb%3D1");
  });
  t("no proxy leaves the url alone", () => {
    assert.equal(applyProxy("https://x.test/a", ""), "https://x.test/a");
    assert.equal(applyProxy("https://x.test/a", "   "), "https://x.test/a");
  });

  // ---------- parsers ----------
  t("finnhub quote parses the current price", () => {
    const q = parseQuote("finnhub", { c: 512.34, pc: 509, t: 1755648000 }, "QQQ");
    assert.equal(q.price, 512.34);
    assert.equal(q.asOf.slice(0, 4), "2025");
  });
  t("finnhub answers an unknown ticker with zeros, which is not a price", () => {
    assert.throws(() => parseQuote("finnhub", { c: 0, pc: 0 }, "NOPE"), /查不到/);
  });
  t("twelvedata quote carries its currency", () => {
    const q = parseQuote("twelvedata", { close: "40.12", currency: "SGD", datetime: "2026-08-19" }, "D05.SI");
    assert.equal(q.price, 40.12);
    assert.equal(q.currency, "SGD");
  });
  t("twelvedata errors map to a kind", () => {
    try {
      parseQuote("twelvedata", { status: "error", code: 401, message: "bad key" }, "QQQ");
      throw new Error("expected throw");
    } catch (e) { assert.equal(e.kind, "auth"); }
  });
  t("alphavantage global quote parses", () => {
    const q = parseQuote("alphavantage", { "Global Quote": { "05. price": "512.3400", "07. latest trading day": "2026-08-19" } }, "QQQ");
    assert.equal(q.price, 512.34);
    assert.equal(q.asOf, "2026-08-19");
  });
  t("alphavantage's quota note is reported as a limit, not a crash", () => {
    try {
      parseQuote("alphavantage", { Note: "call frequency" }, "QQQ");
      throw new Error("expected throw");
    } catch (e) { assert.equal(e.kind, "limit"); }
  });
  t("stooq csv parses the close column", () => {
    const csv = "Symbol,Date,Time,Open,High,Low,Close,Volume\nQQQ.US,2026-08-19,22:00:00,510,515,509,512.34,1000";
    const q = parseQuote("stooq", csv, "QQQ.US");
    assert.equal(q.price, 512.34);
    assert.equal(q.asOf, "2026-08-19");
  });
  t("stooq's N/D means the symbol is wrong", () => {
    const csv = "Symbol,Date,Time,Open,High,Low,Close,Volume\nQQQ,N/D,N/D,N/D,N/D,N/D,N/D,N/D";
    try {
      parseQuote("stooq", csv, "QQQ");
      throw new Error("expected throw");
    } catch (e) { assert.equal(e.kind, "notfound"); }
  });
  t("yahoo chart meta parses price and currency", () => {
    const q = parseQuote("yahoo", { chart: { result: [{ meta: { regularMarketPrice: 512.34, currency: "USD", regularMarketTime: 1755648000 } }] } }, "QQQ");
    assert.equal(q.price, 512.34);
    assert.equal(q.currency, "USD");
  });
  t("yahoo's own error object is surfaced", () => {
    try {
      parseQuote("yahoo", { chart: { error: { code: "Not Found", description: "No data found" } } }, "NOPE");
      throw new Error("expected throw");
    } catch (e) { assert.equal(e.kind, "notfound"); }
  });
  t("an HTML error page is a readable message, not a JSON crash", () => {
    try {
      parseQuote("finnhub", "<html>502 Bad Gateway</html>", "QQQ");
      throw new Error("expected throw");
    } catch (e) {
      assert.equal(e.kind, "parse");
      assert.match(e.message, /代理/);
    }
  });

  // ---------- fetch ----------
  t("fetchQuote returns a normalized quote", async () => {
    const q = await fetchQuote("qqq", { provider: "finnhub", apiKey: "k" }, {
      fetchImpl: async (url) => {
        assert.ok(url.includes("symbol=QQQ"), "symbol should be upper-cased");
        return res({ c: 512.34, pc: 509, t: 1755648000 });
      },
    });
    assert.equal(q.symbol, "QQQ");
    assert.equal(q.price, 512.34);
    assert.equal(q.source, "finnhub");
    assert.ok(q.fetchedAt);
  });
  t("manual mode never hits the network", async () => {
    await expectThrows(() => fetchQuote("QQQ", { provider: "manual" }, {
      fetchImpl: () => { throw new Error("should not be called"); },
    }), "config");
  });
  t("a missing api key is caught before the request", async () => {
    await expectThrows(() => fetchQuote("QQQ", { provider: "finnhub", apiKey: "" }, {
      fetchImpl: () => { throw new Error("should not be called"); },
    }), "config");
  });
  t("a rejected fetch is explained as a cross-origin block", async () => {
    const e = await expectThrows(() => fetchQuote("QQQ", { provider: "finnhub", apiKey: "k" }, {
      fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    }), "blocked");
    assert.match(e.message, /跨域|代理/);
  });
  t("http status codes map to useful kinds", async () => {
    const call = (status) => fetchQuote("QQQ", { provider: "finnhub", apiKey: "k" }, { fetchImpl: async () => res({}, { status }) });
    await expectThrows(() => call(401), "auth");
    await expectThrows(() => call(429), "limit");
    await expectThrows(() => call(404), "notfound");
    await expectThrows(() => call(500), "other");
  });
  t("the proxy is applied to the real request", async () => {
    let seen = null;
    await fetchQuote("QQQ", { provider: "finnhub", apiKey: "k", proxy: "https://p.test/?url={url}" }, {
      fetchImpl: async (url) => { seen = url; return res({ c: 1, pc: 1 }); },
    });
    assert.ok(seen.startsWith("https://p.test/?url=https%3A%2F%2Ffinnhub.io"), seen);
  });

  // ---------- batch ----------
  t("fetchQuotes returns what worked and what didn't", async () => {
    const { quotes, errors } = await fetchQuotes(["QQQ", "NOPE"], { provider: "finnhub", apiKey: "k" }, {
      fetchImpl: async (url) => (url.includes("NOPE") ? res({ c: 0, pc: 0 }) : res({ c: 500, pc: 499 })),
    });
    assert.equal(quotes.QQQ.price, 500);
    assert.equal(quotes.NOPE, undefined);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].symbol, "NOPE");
  });
  t("fetchQuotes deduplicates and upper-cases the symbol list", async () => {
    let calls = 0;
    await fetchQuotes(["qqq", "QQQ", " qqq "], { provider: "finnhub", apiKey: "k" }, {
      fetchImpl: async () => { calls++; return res({ c: 1, pc: 1 }); },
    });
    assert.equal(calls, 1);
  });
  t("a key error stops the run instead of burning the rate limit", async () => {
    let calls = 0;
    const { errors } = await fetchQuotes(["A", "B", "C"], { provider: "finnhub", apiKey: "k" }, {
      fetchImpl: async () => { calls++; return res({}, { status: 401 }); },
    });
    assert.equal(calls, 1, "should stop after the first auth failure");
    assert.equal(errors.length, 3, "the remaining symbols are reported as skipped");
    assert.equal(errors[1].kind, "skipped");
  });
  t("fetchQuotes reports progress per symbol", async () => {
    const seen = [];
    await fetchQuotes(["A", "B"], { provider: "finnhub", apiKey: "k" }, {
      fetchImpl: async () => res({ c: 1, pc: 1 }),
      onProgress: (p) => seen.push(p.symbol),
    });
    assert.deepEqual(seen, ["A", "B"]);
  });
  t("fetchQuotes never rejects, even when everything fails", async () => {
    const out = await fetchQuotes(["A"], { provider: "manual" }, {});
    assert.deepEqual(out.quotes, {});
    assert.equal(out.errors.length, 1);
  });

  // ---------- misc ----------
  t("manualQuote is shaped like a fetched one", () => {
    const q = manualQuote("12.5", "SGD");
    assert.equal(q.price, 12.5);
    assert.equal(q.source, "manual");
    assert.ok(q.asOf);
  });
  t("mergeQuotes lets fresh prices win", () => {
    const merged = mergeQuotes({ A: { price: 1 }, B: { price: 2 } }, { A: { price: 9 } });
    assert.equal(merged.A.price, 9);
    assert.equal(merged.B.price, 2);
  });
  t("providerMeta falls back to manual for an unknown id", () => {
    assert.equal(providerMeta("nope").id, "manual");
    assert.equal(providerMeta("finnhub").needsKey, true);
  });
  t("every provider that needs a key advertises where to get one", () => {
    for (const p of QUOTE_PROVIDERS) {
      if (p.needsKey) assert.ok(p.signup, `${p.id} has no signup link`);
    }
  });
  t("QuoteError carries its kind", () => {
    const e = new QuoteError("x", { kind: "limit", symbol: "QQQ" });
    assert.equal(e.kind, "limit");
    assert.equal(e.symbol, "QQQ");
  });
}
