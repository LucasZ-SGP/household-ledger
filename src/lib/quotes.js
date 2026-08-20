// ---------------------------------------------------------------------------
// Stock quotes.
//
// The app has no backend, so the browser must talk to a market-data host
// directly — which means the host has to send CORS headers back, and most of
// the well-known free endpoints (Yahoo, Stooq) do not. So this is a small
// registry rather than one hard-coded vendor: pick a provider that works from
// your browser, and if none does, type the price in by hand. Whatever route
// you use, the last known price is cached in the ledger itself, so the numbers
// still add up on a plane.
// ---------------------------------------------------------------------------

export const QUOTE_PROVIDERS = [
  {
    id: "manual",
    label: "手动输入",
    needsKey: false,
    blurb: "不联网。价格由你自己填，适合行情源都被浏览器拦住的情况。",
  },
  {
    id: "finnhub",
    label: "Finnhub",
    needsKey: true,
    signup: "https://finnhub.io/register",
    blurb: "免费额度 60 次/分钟，浏览器可直接调用。美股代码直接填 AAPL、QQQ。",
  },
  {
    id: "twelvedata",
    label: "Twelve Data",
    needsKey: true,
    signup: "https://twelvedata.com/pricing",
    blurb: "免费额度 800 次/天。会返回报价币种，适合非美股（如 D05.SI）。",
  },
  {
    id: "alphavantage",
    label: "Alpha Vantage",
    needsKey: true,
    signup: "https://www.alphavantage.co/support/#api-key",
    blurb: "免费额度很小（约 25 次/天），持仓少时够用。",
  },
  {
    id: "stooq",
    label: "Stooq（无需 Key）",
    needsKey: false,
    blurb: "不用注册，但通常需要配一个代理才能在浏览器里调用。美股代码要加 .us，如 qqq.us。",
  },
  {
    id: "yahoo",
    label: "Yahoo Finance（无需 Key）",
    needsKey: false,
    blurb: "覆盖最全，但几乎一定需要配代理。代码同 Yahoo 网站，如 QQQ、D05.SI。",
  },
];

export function providerMeta(id) {
  return QUOTE_PROVIDERS.find((p) => p.id === id) || QUOTE_PROVIDERS[0];
}

export const EMPTY_QUOTE_CFG = { provider: "manual", apiKey: "", proxy: "" };

export class QuoteError extends Error {
  constructor(message, { kind, symbol } = {}) {
    super(message);
    this.name = "QuoteError";
    this.kind = kind; // 'auth' | 'limit' | 'notfound' | 'blocked' | 'network' | 'parse' | 'config' | 'other'
    this.symbol = symbol;
  }
}

/**
 * Routes a URL through a proxy if one is configured. Two shapes are supported:
 * a template containing {url} (encoded substitution), or a plain prefix.
 */
export function applyProxy(url, proxy) {
  const p = String(proxy || "").trim();
  if (!p) return url;
  if (p.includes("{url}")) return p.replace("{url}", encodeURIComponent(url));
  return p + url;
}

export function quoteUrl(provider, symbol, cfg = {}) {
  const s = encodeURIComponent(String(symbol || "").trim());
  const key = encodeURIComponent(String(cfg.apiKey || "").trim());
  switch (provider) {
    case "finnhub":
      return `https://finnhub.io/api/v1/quote?symbol=${s}&token=${key}`;
    case "twelvedata":
      return `https://api.twelvedata.com/quote?symbol=${s}&apikey=${key}`;
    case "alphavantage":
      return `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s}&apikey=${key}`;
    case "stooq":
      return `https://stooq.com/q/l/?s=${s.toLowerCase()}&f=sd2t2ohlcv&h&e=csv`;
    case "yahoo":
      return `https://query1.finance.yahoo.com/v8/finance/chart/${s}?range=1d&interval=1d`;
    default:
      return null;
  }
}

function parseCsvQuote(text, symbol) {
  const lines = String(text).trim().split(/\r?\n/);
  if (lines.length < 2) throw new QuoteError(`${symbol}：行情源没有返回数据。`, { kind: "parse", symbol });
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const cells = lines[1].split(",").map((c) => c.trim());
  const close = cells[head.indexOf("close")];
  const date = cells[head.indexOf("date")];
  if (!close || close === "N/D") throw new QuoteError(`${symbol}：查不到这个代码（Stooq 美股要写成 qqq.us）。`, { kind: "notfound", symbol });
  const price = Number(close);
  if (!Number.isFinite(price)) throw new QuoteError(`${symbol}：返回的价格无法解析。`, { kind: "parse", symbol });
  return { price, currency: null, asOf: date && date !== "N/D" ? date : null };
}

/** Maps one provider's payload onto { price, currency, asOf }, or throws. */
export function parseQuote(provider, payload, symbol) {
  if (provider === "stooq") return parseCsvQuote(payload, symbol);

  const body = typeof payload === "string" ? safeJson(payload, symbol) : payload;

  if (provider === "finnhub") {
    if (body && body.error) throw new QuoteError(`${symbol}：${body.error}`, { kind: "auth", symbol });
    const price = Number(body?.c);
    // Finnhub answers an unknown ticker with an all-zero quote rather than a 404.
    if (!Number.isFinite(price) || (price === 0 && Number(body?.pc) === 0)) {
      throw new QuoteError(`${symbol}：查不到这个代码，或免费额度不含这个市场。`, { kind: "notfound", symbol });
    }
    return { price, currency: null, asOf: body.t ? new Date(body.t * 1000).toISOString() : null };
  }

  if (provider === "twelvedata") {
    if (body?.status === "error" || body?.code >= 400) {
      const kind = body?.code === 401 || body?.code === 403 ? "auth" : body?.code === 429 ? "limit" : "notfound";
      throw new QuoteError(`${symbol}：${body?.message || "行情源返回错误"}`, { kind, symbol });
    }
    const price = Number(body?.close ?? body?.price);
    if (!Number.isFinite(price)) throw new QuoteError(`${symbol}：返回内容里没有价格。`, { kind: "parse", symbol });
    return { price, currency: body?.currency || null, asOf: body?.datetime || null };
  }

  if (provider === "alphavantage") {
    if (body?.["Error Message"]) throw new QuoteError(`${symbol}：查不到这个代码。`, { kind: "notfound", symbol });
    if (body?.Note || body?.Information) {
      throw new QuoteError(`${symbol}：${body.Note || body.Information}`, { kind: "limit", symbol });
    }
    const q = body?.["Global Quote"] || {};
    const price = Number(q["05. price"]);
    if (!Number.isFinite(price)) throw new QuoteError(`${symbol}：返回内容里没有价格（多半是免费额度用完了）。`, { kind: "limit", symbol });
    return { price, currency: null, asOf: q["07. latest trading day"] || null };
  }

  if (provider === "yahoo") {
    const err = body?.chart?.error;
    if (err) throw new QuoteError(`${symbol}：${err.description || err.code}`, { kind: "notfound", symbol });
    const meta = body?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price)) throw new QuoteError(`${symbol}：返回内容里没有价格。`, { kind: "parse", symbol });
    return {
      price,
      currency: meta.currency || null,
      asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    };
  }

  throw new QuoteError("这个行情源不支持自动查询。", { kind: "config", symbol });
}

function safeJson(text, symbol) {
  try {
    return JSON.parse(text);
  } catch {
    // An HTML error page is the classic symptom of a proxy that isn't set up.
    throw new QuoteError(`${symbol}：行情源返回的不是 JSON，检查一下代理地址是否正确。`, { kind: "parse", symbol });
  }
}

function describeHttp(status, symbol) {
  if (status === 401 || status === 403) return new QuoteError(`${symbol}：API Key 无效或没有权限。`, { kind: "auth", symbol });
  if (status === 429) return new QuoteError(`${symbol}：调用频率超限，等一会儿再刷新。`, { kind: "limit", symbol });
  if (status === 404) return new QuoteError(`${symbol}：查不到这个代码。`, { kind: "notfound", symbol });
  return new QuoteError(`${symbol}：行情源返回 ${status}。`, { kind: "other", symbol });
}

/** Fetches one symbol. Throws QuoteError; never returns a partial quote. */
export async function fetchQuote(symbol, cfg = EMPTY_QUOTE_CFG, { fetchImpl } = {}) {
  const provider = cfg.provider || "manual";
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new QuoteError("代码为空。", { kind: "config" });
  if (provider === "manual") {
    throw new QuoteError("当前行情源是「手动输入」，请到设置里选一个行情源，或直接在持仓里填价格。", { kind: "config", symbol: sym });
  }
  if (providerMeta(provider).needsKey && !String(cfg.apiKey || "").trim()) {
    throw new QuoteError("还没填 API Key，请到设置里补上。", { kind: "config", symbol: sym });
  }

  const url = quoteUrl(provider, sym, cfg);
  if (!url) throw new QuoteError("未知的行情源。", { kind: "config", symbol: sym });

  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) throw new QuoteError("当前环境不支持网络请求。", { kind: "network", symbol: sym });

  let res;
  try {
    res = await doFetch(applyProxy(url, cfg.proxy), { method: "GET", cache: "no-store" });
  } catch {
    // A browser reports a CORS rejection as an indistinguishable network error.
    throw new QuoteError(
      `${sym}：请求被浏览器拦下了（多半是行情源不允许跨域）。换一个行情源，或在设置里配一个代理。`,
      { kind: "blocked", symbol: sym }
    );
  }
  const text = await res.text();
  if (!res.ok) throw describeHttp(res.status, sym);

  const parsed = parseQuote(provider, text, sym);
  return { symbol: sym, ...parsed, source: provider, fetchedAt: new Date().toISOString() };
}

/**
 * Fetches many symbols one at a time — free tiers are rate-limited per minute
 * and a burst of parallel calls is the fastest way to get throttled.
 * Never rejects: returns what worked and what didn't.
 */
export async function fetchQuotes(symbols, cfg = EMPTY_QUOTE_CFG, { fetchImpl, onProgress } = {}) {
  const quotes = {};
  const errors = [];
  const list = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  for (let i = 0; i < list.length; i++) {
    const sym = list[i];
    if (onProgress) onProgress({ symbol: sym, index: i, total: list.length });
    try {
      const q = await fetchQuote(sym, cfg, { fetchImpl });
      quotes[sym] = { price: q.price, currency: q.currency, asOf: q.asOf || q.fetchedAt, source: q.source, fetchedAt: q.fetchedAt };
    } catch (e) {
      errors.push({ symbol: sym, message: e.message, kind: e.kind });
      // A key or quota problem hits every remaining symbol the same way.
      if (e.kind === "auth" || e.kind === "config" || e.kind === "limit") {
        for (const rest of list.slice(i + 1)) errors.push({ symbol: rest, message: "已跳过（上一个错误会同样发生）", kind: "skipped" });
        break;
      }
    }
  }
  return { quotes, errors };
}

export function mergeQuotes(existing = {}, incoming = {}) {
  return { ...existing, ...incoming };
}

/** A hand-typed price, stored in the same shape as a fetched one. */
export function manualQuote(price, currency) {
  return {
    price: Number(price) || 0,
    currency: currency || null,
    asOf: new Date().toISOString(),
    source: "manual",
    fetchedAt: new Date().toISOString(),
  };
}
