// ---------------------------------------------------------------------------
// Currency conversion for the net-worth page.
//
// Deliberately narrower than the stock-quote registry: only Finnhub exposes a
// free, CORS-friendly forex quote from the browser (symbol shape
// `OANDA:BASE_QUOTE`), so FX conversion always goes through Finnhub regardless
// of which provider is chosen for stock prices. The API key is the same field
// as the stock-quote settings — if that key belongs to a different provider,
// conversion will fail the same way an unconfigured key does.
// ---------------------------------------------------------------------------

import { fetchQuote } from "./quotes.js";

export function fxPairKey(base, quote) {
  return `${base}_${quote}`;
}

function fxSymbol(base, quote) {
  return `OANDA:${base}_${quote}`;
}

/** One base->quote rate. base === quote is always 1, with no network call. */
export async function fetchFxRate(base, quote, apiKey, { fetchImpl } = {}) {
  if (base === quote) return { rate: 1, asOf: null, fetchedAt: new Date().toISOString() };
  const q = await fetchQuote(fxSymbol(base, quote), { provider: "finnhub", apiKey }, { fetchImpl });
  return { rate: q.price, asOf: q.asOf, fetchedAt: q.fetchedAt };
}

/**
 * Fetches every base->quote rate needed to convert a set of currencies into
 * one display currency. Never rejects: returns what worked and what didn't,
 * same contract as fetchQuotes.
 */
export async function fetchFxRates(bases, quote, apiKey, { fetchImpl, onProgress } = {}) {
  const rates = {};
  const errors = [];
  const list = Array.from(new Set(bases)).filter((b) => b && b !== quote);
  for (let i = 0; i < list.length; i++) {
    const base = list[i];
    if (onProgress) onProgress({ pair: fxPairKey(base, quote), index: i, total: list.length });
    try {
      rates[fxPairKey(base, quote)] = await fetchFxRate(base, quote, apiKey, { fetchImpl });
    } catch (e) {
      errors.push({ pair: fxPairKey(base, quote), message: e.message, kind: e.kind });
      if (e.kind === "auth" || e.kind === "config" || e.kind === "limit") {
        for (const rest of list.slice(i + 1)) {
          errors.push({ pair: fxPairKey(rest, quote), message: "已跳过（上一个错误会同样发生）", kind: "skipped" });
        }
        break;
      }
    }
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
