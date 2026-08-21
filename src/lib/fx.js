// ---------------------------------------------------------------------------
// Currency conversion for the net-worth page.
//
// Deliberately not routed through the stock-quote registry: Finnhub and friends
// put forex behind a paid tier, so a perfectly good free stock key fails with
// "invalid key" the moment it is asked for an FX pair — a confusing dead end.
// open.er-api.com needs no key at all, sends CORS headers, and answers with
// every rate for a base in a single request, so converting a whole ledger costs
// one call rather than one per currency.
//
// Rates are quoted as quote -> X, so a base -> quote rate is the reciprocal.
// ---------------------------------------------------------------------------

import { applyProxy } from "./quotes.js";

const FX_ENDPOINT = "https://open.er-api.com/v6/latest/";

export function fxPairKey(base, quote) {
  return `${base}_${quote}`;
}

export class FxError extends Error {
  constructor(message, { kind } = {}) {
    super(message);
    this.name = "FxError";
    this.kind = kind; // 'blocked' | 'network' | 'parse' | 'notfound' | 'other'
  }
}

export function fxUrl(quote) {
  return `${FX_ENDPOINT}${encodeURIComponent(String(quote || "").trim().toUpperCase())}`;
}

/**
 * One request: every rate expressed against `quote`.
 * Returns { rates, asOf } where rates maps a currency code to quote -> code.
 */
export async function fetchFxTable(quote, { fetchImpl, proxy } = {}) {
  const q = String(quote || "").trim().toUpperCase();
  if (!q) throw new FxError("没有指定目标币种。", { kind: "config" });

  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) throw new FxError("当前环境不支持网络请求。", { kind: "network" });

  let res;
  try {
    res = await doFetch(applyProxy(fxUrl(q), proxy), { method: "GET", cache: "no-store" });
  } catch {
    throw new FxError("汇率请求被浏览器拦下了（跨域）。可以在设置里配一个代理。", { kind: "blocked" });
  }
  const text = await res.text();
  if (!res.ok) throw new FxError(`汇率源返回 ${res.status}。`, { kind: "other" });

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new FxError("汇率源返回的不是 JSON，检查一下代理地址是否正确。", { kind: "parse" });
  }
  if (body?.result === "error" || !body?.rates) {
    throw new FxError(`查不到 ${q} 的汇率（${body?.["error-type"] || "返回内容里没有汇率"}）。`, { kind: "notfound" });
  }
  return { rates: body.rates, asOf: body.time_last_update_utc || null };
}

/**
 * Every base -> quote rate needed to convert a ledger into one display
 * currency. Never rejects: returns what worked and what didn't, the same
 * contract as fetchQuotes.
 */
export async function fetchFxRates(bases, quote, { fetchImpl, proxy } = {}) {
  const rates = {};
  const errors = [];
  const list = Array.from(new Set(bases)).filter((b) => b && b !== quote);
  if (!list.length) return { rates, errors };

  let table;
  try {
    table = await fetchFxTable(quote, { fetchImpl, proxy });
  } catch (e) {
    // One request covers every pair, so one failure is the whole batch.
    for (const base of list) errors.push({ pair: fxPairKey(base, quote), message: e.message, kind: e.kind });
    return { rates, errors };
  }

  const fetchedAt = new Date().toISOString();
  for (const base of list) {
    const inverse = Number(table.rates[base]);
    if (!Number.isFinite(inverse) || inverse === 0) {
      errors.push({ pair: fxPairKey(base, quote), message: `汇率源里没有 ${base} 这个币种。`, kind: "notfound" });
      continue;
    }
    rates[fxPairKey(base, quote)] = { rate: 1 / inverse, asOf: table.asOf, fetchedAt };
  }
  return { rates, errors };
}

/** Converts one amount using a rates cache keyed by fxPairKey. Returns null when the rate is missing. */
export function convertAmount(amount, from, to, ratesCache) {
  if (from === to) return amount;
  const entry = ratesCache?.[fxPairKey(from, to)];
  if (!entry || !Number.isFinite(Number(entry.rate))) return null;
  return amount * Number(entry.rate);
}
