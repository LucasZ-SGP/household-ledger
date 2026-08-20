// ---------------------------------------------------------------------------
// Positions: what you own and what you owe, and the arithmetic that turns a
// position into a number for today.
//
// Nothing here mutates state and nothing here talks to the network. A loan's
// balance is *derived* from its start date, its rate and the payments you
// recorded — never stored and incremented in place. That way opening the app
// after three months away gives the same answer as opening it every day, and
// the whole thing is reproducible from the JSON in your repo.
// ---------------------------------------------------------------------------

import { uid } from "./model.js";

export const ASSET_KINDS = ["cash", "fixed_deposit", "brokerage", "cpf", "other_asset"];
export const LIABILITY_KINDS = ["mortgage", "loan"];

export const KIND_META = {
  cash: { label: "现金 / 活期", side: "asset", color: "#3D8361" },
  fixed_deposit: { label: "银行定期", side: "asset", color: "#2F6F5E" },
  brokerage: { label: "股票账户", side: "asset", color: "#35618F" },
  cpf: { label: "CPF 公积金", side: "asset", color: "#6E5A9E" },
  other_asset: { label: "其他资产", side: "asset", color: "#8A9A8F" },
  mortgage: { label: "房贷", side: "liability", color: "#A63D40" },
  loan: { label: "其他贷款", side: "liability", color: "#C1502E" },
};

export function sideOf(kind) {
  return KIND_META[kind]?.side === "liability" ? "liability" : "asset";
}

// ---------------------------------------------------------------------------
// Calendar helpers. Everything is a plain YYYY-MM-DD string handled in UTC, so
// the answer never shifts when the phone crosses a timezone.
// ---------------------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s) {
  return typeof s === "string" && ISO_RE.test(s) && !Number.isNaN(msOf(s));
}

export function msOf(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

export function isoOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((msOf(toISO) - msOf(fromISO)) / 86400000);
}

export function daysInMonth(year, month1) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Adds n months, clamping the day to the end of the target month (Jan 31 + 1m = Feb 28). */
export function addMonthsISO(iso, n) {
  if (!isISODate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + Math.round(n);
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const dd = Math.min(d, daysInMonth(ny, nm));
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** The `day`-th of the month containing `iso`, clamped to that month's length. */
export function dayOfMonthISO(iso, day) {
  const [y, m] = iso.split("-").map(Number);
  const dd = Math.min(Math.max(1, Math.round(day) || 1), daysInMonth(y, m));
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function newAccount(kind, currency = "SGD") {
  const base = {
    id: uid(), kind, name: "", currency,
    institution: "", note: "", archived: false,
  };
  const today = todayISO();
  switch (kind) {
    case "cash":
      return { ...base, balance: 0, annualRate: 0, asOf: today };
    case "fixed_deposit":
      return {
        ...base, principal: 0, annualRate: 0, startDate: today,
        termMonths: 12, maturityDate: addMonthsISO(today, 12),
        compounding: "simple", autoRenew: false,
      };
    case "brokerage":
      return { ...base, cash: 0, holdings: [] };
    case "cpf":
      return {
        ...base, currency: "SGD",
        balances: { oa: 0, sa: 0, ma: 0, ra: 0 },
        rates: { ...CPF_DEFAULT_RATES },
        birthYear: null, extraInterest: true, asOf: today,
      };
    case "other_asset":
      return { ...base, value: 0, asOf: today };
    case "mortgage":
    case "loan":
      return {
        ...base, principal: 0, annualRate: 0, startDate: today,
        accrualDay: 1, monthlyPayment: 0, termMonths: 0, entries: [],
      };
    default:
      return base;
  }
}

export function newHolding(currency = "USD") {
  return { id: uid(), symbol: "", quantity: 0, currency, costBasis: 0 };
}

export function newLoanEntry(type = "payment") {
  return { id: uid(), type, date: todayISO(), amount: 0, rate: 0, note: "" };
}

// ---------------------------------------------------------------------------
// Fixed deposits
// ---------------------------------------------------------------------------

export function maturityOf(acc) {
  if (isISODate(acc.maturityDate)) return acc.maturityDate;
  if (isISODate(acc.startDate)) return addMonthsISO(acc.startDate, num(acc.termMonths));
  return null;
}

/** Interest earned on `principal` over `days` at `annualRate`% — ACT/365. */
export function accruedInterest(principal, annualRate, days, compounding = "simple") {
  const p = num(principal);
  const r = num(annualRate) / 100;
  const d = Math.max(0, num(days));
  if (!p || !r || !d) return 0;
  if (compounding === "monthly") {
    const months = d / (365 / 12);
    return p * (Math.pow(1 + r / 12, months) - 1);
  }
  return p * r * (d / 365);
}

/**
 * Values a fixed deposit as of a date. Interest stops accruing at maturity —
 * banks stop paying the promised rate the moment the tenor ends, so showing it
 * climbing past the maturity date would be a lie that grows over time.
 */
export function valueFixedDeposit(acc, asOfISO = todayISO()) {
  const principal = num(acc.principal);
  const maturityDate = maturityOf(acc);
  const start = isISODate(acc.startDate) ? acc.startDate : asOfISO;
  const hasMaturity = isISODate(maturityDate);
  const stop = hasMaturity && maturityDate < asOfISO ? maturityDate : asOfISO;
  const elapsedDays = Math.max(0, daysBetween(start, stop));
  const interest = accruedInterest(principal, acc.annualRate, elapsedDays, acc.compounding);
  const termDays = hasMaturity ? Math.max(0, daysBetween(start, maturityDate)) : 0;
  return {
    principal,
    interest,
    value: principal + interest,
    maturityDate: hasMaturity ? maturityDate : null,
    matured: hasMaturity ? asOfISO >= maturityDate : false,
    daysToMaturity: hasMaturity ? daysBetween(asOfISO, maturityDate) : null,
    elapsedDays,
    termDays,
    maturityValue: principal + accruedInterest(principal, acc.annualRate, termDays, acc.compounding),
  };
}

// ---------------------------------------------------------------------------
// CPF
//
// There is no public API a personal app can call: CPF balances are only
// exposed through Singpass Myinfo, which is a paid, server-to-server product
// that requires business onboarding — a static page in your browser cannot
// hold those credentials. So the balances are typed in, and what we automate
// is the part that is actually mechanical: the interest.
// ---------------------------------------------------------------------------

export const CPF_DEFAULT_RATES = { oa: 2.5, sa: 4, ma: 4, ra: 4 };
export const CPF_ACCOUNTS = [
  { key: "oa", label: "普通账户 OA" },
  { key: "sa", label: "特别账户 SA" },
  { key: "ma", label: "保健储蓄 MA" },
  { key: "ra", label: "退休账户 RA" },
];

// Only the first $20k of OA counts toward the extra-interest tiers.
const CPF_OA_EXTRA_CAP = 20000;

export function cpfAge(birthYear, asOfISO = todayISO()) {
  const y = Number(birthYear);
  if (!y) return null;
  return Number(asOfISO.slice(0, 4)) - y;
}

/**
 * One year of CPF interest at the current rates.
 *
 * Base interest is per account. On top of that, members below 55 get +1% on
 * the first $60k of combined balances; from 55 it is +2% on the first $30k and
 * +1% on the next $30k. OA only contributes $20k toward those tiers.
 *
 * This is a projection, not a statement: CPF computes monthly on the lowest
 * balance and credits once a year, so the real number depends on the shape of
 * your year, not just its ending balance.
 */
export function cpfInterest(acc, asOfISO = todayISO()) {
  const balances = acc.balances || {};
  const rates = { ...CPF_DEFAULT_RATES, ...(acc.rates || {}) };
  const age = cpfAge(acc.birthYear, asOfISO);
  const senior = age !== null && age >= 55;

  const base = {};
  let baseTotal = 0;
  for (const { key } of CPF_ACCOUNTS) {
    const v = num(balances[key]) * (num(rates[key]) / 100);
    base[key] = v;
    baseTotal += v;
  }

  const extra = { oa: 0, sa: 0, ma: 0, ra: 0 };
  let extraTotal = 0;
  if (acc.extraInterest !== false) {
    // Tiers are filled from the accounts that pay the least first, which is
    // how CPF illustrates it: RA (if any) then OA, then SA, then MA.
    const tiers = senior
      ? [{ cap: 30000, bonus: 2 }, { cap: 30000, bonus: 1 }]
      : [{ cap: 60000, bonus: 1 }];
    const order = senior ? ["ra", "oa", "sa", "ma"] : ["oa", "sa", "ma", "ra"];
    for (const key of order) {
      let avail = num(balances[key]);
      if (key === "oa") avail = Math.min(avail, CPF_OA_EXTRA_CAP);
      for (const tier of tiers) {
        if (avail <= 0 || tier.cap <= 0) continue;
        const take = Math.min(avail, tier.cap);
        const amt = take * (tier.bonus / 100);
        extra[key] += amt;
        extraTotal += amt;
        tier.cap -= take;
        avail -= take;
      }
    }
  }

  const total = Object.values(balances).reduce((s, v) => s + num(v), 0);
  return { base, baseTotal, extra, extraTotal, annual: baseTotal + extraTotal, total, age, senior };
}

export function cpfTotal(acc) {
  const b = acc.balances || {};
  return CPF_ACCOUNTS.reduce((s, { key }) => s + num(b[key]), 0);
}

// ---------------------------------------------------------------------------
// Loans
//
// The model your bank uses: on the accrual day of every month the outstanding
// balance grows by one month of interest, and whatever you pay comes off after
// that. We replay the whole thing from the start date each time rather than
// storing a running balance, so a missed month can never silently vanish.
// ---------------------------------------------------------------------------

const ENTRY_ORDER = { rate_change: 0, interest: 1, drawdown: 2, payment: 3, set_balance: 4 };

export const LOAN_ENTRY_LABELS = {
  interest: "月度利息",
  payment: "还款",
  drawdown: "追加提款",
  rate_change: "利率变更",
  set_balance: "余额校准",
};

/** The accrual dates strictly after `startDate` and up to `asOfISO`. */
export function accrualDates(startDate, accrualDay, asOfISO) {
  if (!isISODate(startDate) || !isISODate(asOfISO) || asOfISO < startDate) return [];
  const out = [];
  let cursor = dayOfMonthISO(startDate, accrualDay);
  if (cursor <= startDate) cursor = dayOfMonthISO(addMonthsISO(startDate, 1), accrualDay);
  // Guard against a pathological date pair producing an unbounded loop.
  for (let i = 0; i < 1200 && cursor <= asOfISO; i++) {
    out.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    const nextMonth = addMonthsISO(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`, 1);
    cursor = dayOfMonthISO(nextMonth, accrualDay);
  }
  return out;
}

/**
 * Replays a loan to `asOfISO`.
 * Returns every event in order with the balance after it, plus the totals.
 */
export function loanTimeline(acc, asOfISO = todayISO()) {
  const startDate = isISODate(acc.startDate) ? acc.startDate : asOfISO;
  const accrualDay = num(acc.accrualDay) || 1;
  const entries = (acc.entries || [])
    .filter((e) => isISODate(e.date) && e.date <= asOfISO)
    .map((e) => ({ ...e, amount: num(e.amount) }));

  const events = [
    ...accrualDates(startDate, accrualDay, asOfISO).map((date) => ({ type: "interest", date })),
    ...entries,
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (ENTRY_ORDER[a.type] ?? 9) - (ENTRY_ORDER[b.type] ?? 9);
  });

  let balance = num(acc.principal);
  let rate = num(acc.annualRate);
  let totalInterest = 0;
  let totalPaid = 0;
  const rows = [];

  for (const ev of events) {
    if (ev.type === "rate_change") {
      rate = num(ev.rate);
      rows.push({ ...ev, balance, rate, amount: 0 });
      continue;
    }
    if (ev.type === "interest") {
      const amount = balance > 0 ? balance * (rate / 100) / 12 : 0;
      balance += amount;
      totalInterest += amount;
      rows.push({ ...ev, amount, rate, balance, id: `i-${ev.date}` });
      continue;
    }
    if (ev.type === "payment") {
      const applied = Math.min(Math.max(0, ev.amount), balance);
      balance -= applied;
      totalPaid += applied;
      rows.push({ ...ev, amount: applied, rate, balance, short: applied < ev.amount });
      continue;
    }
    if (ev.type === "drawdown") {
      balance += Math.max(0, ev.amount);
      rows.push({ ...ev, rate, balance });
      continue;
    }
    if (ev.type === "set_balance") {
      balance = Math.max(0, ev.amount);
      rows.push({ ...ev, rate, balance });
    }
  }

  const nextAccrualDate = nextAccrualAfter(startDate, accrualDay, asOfISO);
  return {
    rows,
    balance,
    rate,
    totalInterest,
    totalPaid,
    principalRepaid: totalPaid - totalInterest,
    nextAccrualDate,
    nextAccrualInterest: balance * (rate / 100) / 12,
    monthsAccrued: rows.filter((r) => r.type === "interest").length,
  };
}

export function nextAccrualAfter(startDate, accrualDay, asOfISO) {
  if (!isISODate(startDate) || !isISODate(asOfISO)) return null;
  const base = asOfISO > startDate ? asOfISO : startDate;
  let next = dayOfMonthISO(base, accrualDay);
  if (next <= base) {
    const [y, m] = base.split("-").map(Number);
    next = dayOfMonthISO(addMonthsISO(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`, 1), accrualDay);
  }
  return next;
}

/**
 * How long the current payment takes to clear the balance, and what the
 * interest costs along the way. Returns `enough: false` when the payment does
 * not even cover one month of interest — the balance would grow forever.
 */
export function loanPayoff(balance, annualRate, monthlyPayment, maxMonths = 720) {
  const b0 = num(balance);
  const r = num(annualRate) / 100 / 12;
  const pay = num(monthlyPayment);
  if (b0 <= 0) return { enough: true, months: 0, totalInterest: 0, totalPaid: 0 };
  if (pay <= 0) return { enough: false, months: null, totalInterest: null, totalPaid: null };
  if (pay <= b0 * r) return { enough: false, months: null, totalInterest: null, totalPaid: null };

  let balanceLeft = b0;
  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  while (balanceLeft > 0 && months < maxMonths) {
    const interest = balanceLeft * r;
    balanceLeft += interest;
    const applied = Math.min(pay, balanceLeft);
    balanceLeft -= applied;
    totalInterest += interest;
    totalPaid += applied;
    months++;
  }
  return { enough: balanceLeft <= 0, months, totalInterest, totalPaid };
}

// ---------------------------------------------------------------------------
// Brokerage
// ---------------------------------------------------------------------------

export function normalizeSymbol(s) {
  return String(s || "").trim().toUpperCase();
}

/**
 * Prices every holding from the quote cache. A holding with no quote yet is
 * reported in `missing` and contributes nothing, rather than silently counting
 * as zero inside a total that looks complete.
 */
export function valueBrokerage(acc, quotes = {}, asOfISO = todayISO()) {
  const byCurrency = {};
  const add = (ccy, amt) => { byCurrency[ccy] = (byCurrency[ccy] || 0) + amt; };
  const cash = num(acc.cash);
  if (cash) add(acc.currency, cash);

  const missing = [];
  const rows = (acc.holdings || []).map((h) => {
    const symbol = normalizeSymbol(h.symbol);
    const quote = quotes[symbol] || null;
    const qty = num(h.quantity);
    const ccy = quote?.currency || h.currency || acc.currency;
    const price = quote ? num(quote.price) : null;
    const value = price === null ? null : price * qty;
    const cost = num(h.costBasis) * qty;
    if (price === null && symbol) missing.push(symbol);
    if (value !== null) add(ccy, value);
    return {
      ...h, symbol, quantity: qty, currency: ccy, price, value,
      cost: cost || null,
      gain: value !== null && cost ? value - cost : null,
      gainPct: value !== null && cost ? ((value - cost) / cost) * 100 : null,
      quoteAsOf: quote?.asOf || null,
      quoteSource: quote?.source || null,
      stale: quote?.asOf ? daysBetween(String(quote.asOf).slice(0, 10), asOfISO) > 4 : false,
      currencyMismatch: Boolean(quote?.currency && h.currency && quote.currency !== h.currency),
    };
  });

  return { rows, cash, byCurrency, missing };
}

// ---------------------------------------------------------------------------
// Valuation across every kind
// ---------------------------------------------------------------------------

/**
 * One account -> { side, byCurrency, detail }.
 * `byCurrency` holds positive magnitudes; `side` says which column they land in.
 * Deliberately no FX: the app reports each currency on its own terms, the same
 * way the dashboard does, instead of inventing a rate.
 */
export function valueAccount(acc, { asOf = todayISO(), quotes = {} } = {}) {
  const side = sideOf(acc.kind);
  const one = (amount) => ({ [acc.currency]: amount });

  switch (acc.kind) {
    case "cash":
      return { side, byCurrency: one(num(acc.balance)), detail: null };
    case "other_asset":
      return { side, byCurrency: one(num(acc.value)), detail: null };
    case "fixed_deposit": {
      const detail = valueFixedDeposit(acc, asOf);
      return { side, byCurrency: one(detail.value), detail };
    }
    case "brokerage": {
      const detail = valueBrokerage(acc, quotes, asOf);
      return { side, byCurrency: { ...detail.byCurrency }, detail };
    }
    case "cpf": {
      const detail = cpfInterest(acc, asOf);
      return { side, byCurrency: one(detail.total), detail };
    }
    case "mortgage":
    case "loan": {
      const detail = loanTimeline(acc, asOf);
      return { side, byCurrency: one(detail.balance), detail };
    }
    default:
      return { side, byCurrency: {}, detail: null };
  }
}

/** Rolls every non-archived account into per-currency asset/liability totals. */
export function summarizeAccounts(accounts = [], { asOf = todayISO(), quotes = {} } = {}) {
  const byCurrency = {};
  const missing = new Set();
  const bump = (ccy, side, kind, amount) => {
    const row = byCurrency[ccy] || (byCurrency[ccy] = { assets: 0, liabilities: 0, net: 0, byKind: {} });
    if (side === "liability") row.liabilities += amount;
    else row.assets += amount;
    row.byKind[kind] = (row.byKind[kind] || 0) + amount;
  };

  const valued = [];
  for (const acc of accounts) {
    if (acc.archived) continue;
    const v = valueAccount(acc, { asOf, quotes });
    valued.push({ account: acc, ...v });
    if (v.detail && Array.isArray(v.detail.missing)) v.detail.missing.forEach((s) => missing.add(s));
    for (const [ccy, amount] of Object.entries(v.byCurrency)) {
      if (!amount) continue;
      bump(ccy, v.side, acc.kind, amount);
    }
  }
  for (const row of Object.values(byCurrency)) row.net = row.assets - row.liabilities;

  return {
    byCurrency,
    currencies: Object.keys(byCurrency).sort(),
    valued,
    missingQuotes: Array.from(missing).sort(),
  };
}

/** Every symbol held anywhere, for the quote refresh button. */
export function heldSymbols(accounts = []) {
  const set = new Set();
  for (const acc of accounts) {
    if (acc.kind !== "brokerage" || acc.archived) continue;
    for (const h of acc.holdings || []) {
      const s = normalizeSymbol(h.symbol);
      if (s) set.add(s);
    }
  }
  return Array.from(set).sort();
}

/** Turns today's positions into net-worth snapshot rows, one per currency. */
export function snapshotFromAccounts(accounts, { asOf = todayISO(), quotes = {} } = {}) {
  const { byCurrency } = summarizeAccounts(accounts, { asOf, quotes });
  const out = [];
  for (const [currency, row] of Object.entries(byCurrency)) {
    if (row.assets) out.push({ id: uid(), date: asOf, currency, type: "asset", name: "账户合计（自动）", amount: row.assets });
    if (row.liabilities) out.push({ id: uid(), date: asOf, currency, type: "liability", name: "负债合计（自动）", amount: row.liabilities });
  }
  return out;
}

/** Things worth surfacing without being asked: maturities, unpayable loans, stale prices. */
export function accountAlerts(accounts = [], { asOf = todayISO(), quotes = {} } = {}) {
  const alerts = [];
  for (const acc of accounts) {
    if (acc.archived) continue;
    if (acc.kind === "fixed_deposit") {
      const v = valueFixedDeposit(acc, asOf);
      if (v.matured) {
        alerts.push({ tone: "warn", accountId: acc.id, message: `「${acc.name || "定期存款"}」已于 ${v.maturityDate} 到期，记得转存或续做。` });
      } else if (v.daysToMaturity !== null && v.daysToMaturity <= 30) {
        alerts.push({ tone: "info", accountId: acc.id, message: `「${acc.name || "定期存款"}」还有 ${v.daysToMaturity} 天到期（${v.maturityDate}）。` });
      }
    }
    if (acc.kind === "mortgage" || acc.kind === "loan") {
      const t = loanTimeline(acc, asOf);
      if (t.balance > 0 && num(acc.monthlyPayment) > 0) {
        const p = loanPayoff(t.balance, t.rate, acc.monthlyPayment);
        if (!p.enough) {
          alerts.push({ tone: "warn", accountId: acc.id, message: `「${acc.name || "贷款"}」的月供不足以覆盖每月利息，余额会越滚越大。` });
        }
      }
    }
  }
  return alerts;
}
