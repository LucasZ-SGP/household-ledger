// ---------------------------------------------------------------------------
// Reads a pasted housing-loan Statement of Account.
//
// The statement is already a complete, authoritative ledger — every interest
// charge, every instalment, every prepayment and the rebate that goes with it.
// Retyping it would be absurd, so this parses the text you copy out of the
// bank's PDF and reconciles the replay against the closing balance the
// statement itself prints. If those two numbers disagree, the import is wrong
// and says so, rather than quietly producing a plausible-looking wrong answer.
// ---------------------------------------------------------------------------

import { uid } from "./model.js";
import { round2, monthlyInterest, entryMeta, isISODate } from "./assets.js";

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// What each printed code means. Codes are matched longest-first so CPF-A does
// not get swallowed by CPF.
const CODE_MAP = [
  { code: "BAL-BF", kind: "checkpoint", checkpoint: "bf" },
  { code: "BAL-CF", kind: "checkpoint", checkpoint: "cf" },
  { code: "RES-I", type: "disbursement_interest" },
  { code: "RES", type: "disbursement" },
  { code: "INT-R", type: "rebate" },
  { code: "AXS-I", type: "interest_payment" },
  { code: "AXS-L", type: "prepayment" },
  { code: "CPF-A", type: "prepayment" },   // lump sum from CPF
  { code: "CPF-L", type: "prepayment" },
  { code: "CPF", type: "instalment" },     // the standing monthly deduction
  { code: "GIRO", type: "instalment" },
  { code: "CASH", type: "prepayment" },
];

const LINE_RE = /^\s*(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{4})\s+([A-Za-z][A-Za-z0-9.\-\/]*)\s+\(?(-?[\d,]*\.?\d+)\)?\s*$/;

function toISO(day, monthWord, year) {
  const m = MONTHS[String(monthWord).slice(0, 3).toLowerCase()];
  if (!m) return null;
  const d = Number(day);
  if (!(d >= 1 && d <= 31)) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseAmount(raw) {
  const negative = /^\(.*\)$/.test(raw) || raw.trim().startsWith("-");
  const n = Number(String(raw).replace(/[(),\s-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Resolves a printed code to an entry type. `IP-2.60` also yields its rate. */
export function classifyCode(code) {
  const upper = String(code || "").toUpperCase();
  const ip = upper.match(/^IP[-\s]?(\d+(?:\.\d+)?)?$/);
  if (ip) return { type: "interest", rate: ip[1] ? Number(ip[1]) : null };
  for (const entry of CODE_MAP) {
    if (upper === entry.code) return { ...entry };
  }
  return null;
}

/**
 * Parses statement text. Unrecognised lines are collected rather than dropped
 * silently, so a code this doesn't know about is visible instead of quietly
 * throwing the balance off.
 */
export function parseLoanStatement(text) {
  const rows = [];
  const checkpoints = [];
  const unknown = [];
  const rates = new Set();

  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(LINE_RE);
    if (!m) {
      // Statement titles and column headers are expected noise.
      if (!/statement|date\s+code|account|page|total|^\s*$/i.test(line)) {
        unknown.push({ line: i + 1, text: line.trim(), reason: "认不出这一行的格式" });
      }
      return;
    }
    const [, day, mon, year, code, rawAmount] = m;
    const date = toISO(day, mon, year);
    const amount = parseAmount(rawAmount);
    if (!date || amount === null) {
      unknown.push({ line: i + 1, text: line.trim(), reason: "日期或金额读不出来" });
      return;
    }
    const cls = classifyCode(code);
    if (!cls) {
      unknown.push({ line: i + 1, text: line.trim(), reason: `不认识的代码 ${code}` });
      return;
    }
    if (cls.kind === "checkpoint") {
      checkpoints.push({ date, kind: cls.checkpoint, amount, code: code.toUpperCase() });
      return;
    }
    if (cls.type === "interest" && cls.rate) rates.add(cls.rate);
    rows.push({
      lineNo: i + 1,
      date,
      code: code.toUpperCase(),
      type: cls.type,
      rate: cls.type === "interest" ? cls.rate : null,
      // Amounts are stored unsigned; the entry type carries the direction.
      amount: round2(Math.abs(amount)),
      statedSign: amount < 0 ? -1 : 1,
    });
  });

  rows.sort((a, b) => (a.date === b.date ? a.lineNo - b.lineNo : a.date < b.date ? -1 : 1));

  // A code whose printed sign contradicts what we think it does means the
  // mapping is wrong for this bank — worth saying out loud.
  const signConflicts = rows.filter((r) => {
    const sign = entryMeta(r.type).sign;
    return sign !== 0 && r.amount > 0 && sign !== r.statedSign;
  });

  const opening = checkpoints.find((c) => c.kind === "bf") || null;
  const closing = [...checkpoints].reverse().find((c) => c.kind === "cf") || null;
  const rate = rates.size === 1 ? [...rates][0] : rates.size ? Math.max(...rates) : null;

  return { rows, checkpoints, opening, closing, rate, rates: [...rates].sort(), unknown, signConflicts };
}

/**
 * Replays the parsed rows and compares the result with the statement's own
 * closing balance — the same three-way check the bank statement importer does.
 * Uses the interest the statement printed, not a recomputed figure, so a
 * mismatch points at a misread line rather than at a rounding choice.
 */
export function reconcileLoanStatement(parsed, { openingBalance = null } = {}) {
  const start = openingBalance !== null ? openingBalance : parsed.opening ? parsed.opening.amount : null;
  if (start === null) {
    return { ok: false, reason: "no-opening", message: "对账单里没有期初余额（BAL-BF），无法校验。" };
  }
  let balance = round2(start);
  const trail = [];
  for (const row of parsed.rows) {
    const sign = entryMeta(row.type).sign;
    balance = round2(balance + sign * row.amount);
    trail.push({ ...row, balance });
  }
  if (!parsed.closing) {
    return { ok: false, reason: "no-closing", computed: balance, trail, message: "对账单里没有期末余额（BAL-CF），只能导入、无法校验。" };
  }
  const diff = round2(balance - parsed.closing.amount);
  return {
    ok: Math.abs(diff) < 0.005,
    computed: balance,
    stated: parsed.closing.amount,
    opening: start,
    diff,
    trail,
    message: Math.abs(diff) < 0.005
      ? `对账通过：replay 出来的期末余额与对账单打印的 ${parsed.closing.amount.toFixed(2)} 完全一致。`
      : `对不上：replay 得到 ${balance.toFixed(2)}，对账单打印的是 ${parsed.closing.amount.toFixed(2)}，差 ${diff.toFixed(2)}。`,
  };
}

/**
 * Cross-checks each printed interest charge against balance x rate / 12.
 * Not a blocker — a rate change mid-month legitimately breaks it — but it is
 * how you catch a digit misread in an amount.
 */
export function verifyStatementInterest(parsed, { openingBalance = null } = {}) {
  const start = openingBalance !== null ? openingBalance : parsed.opening ? parsed.opening.amount : null;
  if (start === null) return { checked: 0, matched: 0, mismatches: [] };
  let balance = round2(start);
  let rate = parsed.rate || 0;
  let checked = 0;
  let matched = 0;
  const mismatches = [];
  for (const row of parsed.rows) {
    if (row.type === "interest") {
      if (row.rate) rate = row.rate;
      const expected = monthlyInterest(balance, rate);
      checked++;
      if (Math.abs(expected - row.amount) < 0.02) matched++;
      else mismatches.push({ date: row.date, stated: row.amount, expected, balance });
    }
    balance = round2(balance + entryMeta(row.type).sign * row.amount);
  }
  return { checked, matched, mismatches };
}

function signatureOf(e) {
  return `${e.date}|${e.type}|${round2(e.amount).toFixed(2)}`;
}

/**
 * Merges parsed rows into the entries a loan already has.
 *
 * Duplicates are counted, not just detected: two identical CPF deductions on
 * the same day are both real, so re-importing an overlapping statement adds
 * only the surplus rather than either doubling everything or dropping the
 * legitimate twin.
 */
export function mergeLoanEntries(existing = [], incoming = []) {
  const have = new Map();
  for (const e of existing) {
    const k = signatureOf({ ...e, amount: Number(e.amount) || 0 });
    have.set(k, (have.get(k) || 0) + 1);
  }
  const added = [];
  for (const row of incoming) {
    const k = signatureOf(row);
    const remaining = have.get(k) || 0;
    if (remaining > 0) {
      have.set(k, remaining - 1);
      continue;
    }
    added.push({
      id: uid(),
      type: row.type,
      date: row.date,
      amount: row.amount,
      rate: row.type === "interest" ? row.rate || 0 : 0,
      note: "",
      source: "statement",
      code: row.code,
    });
  }
  const entries = [...existing, ...added].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { entries, added: added.length, skipped: incoming.length - added.length };
}

/** What the account's own fields should become, given a freshly parsed statement. */
export function suggestedLoanSettings(parsed) {
  const out = {};
  if (parsed.opening && isISODate(parsed.opening.date)) {
    out.startDate = parsed.opening.date;
    out.principal = parsed.opening.amount;
  }
  if (parsed.rate) out.annualRate = parsed.rate;
  const firstInterest = parsed.rows.find((r) => r.type === "interest");
  if (firstInterest) out.accrualDay = Number(firstInterest.date.slice(8, 10));
  return out;
}
