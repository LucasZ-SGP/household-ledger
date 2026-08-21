// ---------------------------------------------------------------------------
// The monthly clearing sheet: where this month's money actually went.
//
// The balance sheet is a stock — what you own on a given day. This is the flow
// that feeds it. Income arrives, some of it is spent, and the rest has to end
// up somewhere: into an asset, or against a debt. The month is finished when
// nothing is left unaccounted for, which is why the bottom line here is
// designed to reach zero rather than to be a number you admire.
//
// Income is read from the transactions you already imported rather than typed
// again — the bank statement is the source of truth. Manual entries exist only
// for money that never passes through the statement (CPF, dividends held
// inside a brokerage account, cash).
// ---------------------------------------------------------------------------

import { uid, monthKey } from "./model.js";
import { sideOf, loanTimeline, isPhysical } from "./assets.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

// Which income categories count as pay, and which count as a return on capital.
// Anything unrecognised falls into "other" rather than being silently dropped.
export const INCOME_GROUPS = {
  salary: { label: "工资性收入", categories: ["salary"], color: "#2F6F5E" },
  capital: { label: "资本利得", categories: ["capital_gains", "interest"], color: "#3D8361" },
  other: { label: "其他收入", categories: [], color: "#8A9A8F" },
};

export const INCOME_GROUP_KEYS = ["salary", "capital", "other"];

export function groupOfIncomeCategory(categoryId) {
  for (const key of ["salary", "capital"]) {
    if (INCOME_GROUPS[key].categories.includes(categoryId)) return key;
  }
  return "other";
}

export function newIncomeEntry(month, currency) {
  return { id: uid(), month, currency, categoryId: "salary", amount: 0, note: "" };
}

export function newAllocation(month, currency) {
  return { id: uid(), month, currency, accountId: "", amount: 0, note: "" };
}

/** Every month that has anything in it, newest first. */
export function monthsWithActivity(data, currency) {
  const set = new Set();
  for (const t of data.transactions || []) {
    if (!currency || t.currency === currency) {
      const m = monthKey(t.date);
      if (m) set.add(m);
    }
  }
  for (const e of data.incomeEntries || []) {
    if (!currency || e.currency === currency) if (e.month) set.add(e.month);
  }
  for (const a of data.allocations || []) {
    if (!currency || a.currency === currency) if (a.month) set.add(a.month);
  }
  return Array.from(set).sort().reverse();
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Money already put against this loan during the month, for cross-checking. */
export function loanPrepaymentsInMonth(account, month) {
  if (!account || sideOf(account.kind) !== "liability") return null;
  // Replay to the end of the month so the month's own rows are all present.
  const [y, m] = month.split("-").map(Number);
  const endOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const rows = loanTimeline(account, endOfMonth).rows;
  return round2(
    rows
      .filter((r) => r.date.slice(0, 7) === month && (r.type === "prepayment" || r.type === "instalment"))
      .reduce((s, r) => s + r.amount, 0)
  );
}

/** Accounts a month's surplus can be moved into, grouped for a picker. */
export function allocationTargets(accounts = []) {
  const usable = (accounts || []).filter((a) => !a.archived && !isPhysical(a.kind));
  return {
    assets: usable.filter((a) => sideOf(a.kind) === "asset"),
    liabilities: usable.filter((a) => sideOf(a.kind) === "liability"),
  };
}

/**
 * The whole month in one object.
 *
 * `unallocated` is the point of the exercise: income minus spending minus
 * everything you have placed. Zero means the month is closed out.
 */
export function monthlyFlow(data, month, currency) {
  const txns = (data.transactions || []).filter(
    (t) => t.currency === currency && monthKey(t.date) === month
  );

  const byCategory = new Map();
  const bump = (key, categoryId, name, amount, source) => {
    const row = byCategory.get(key) || { key, categoryId, name, amount: 0, source };
    row.amount = round2(row.amount + amount);
    if (row.source !== source) row.source = "mixed";
    byCategory.set(key, row);
  };

  const catName = (id) => {
    const found = (data.categories?.income || []).find((c) => c.id === id);
    return found ? found.name : id ? id : "未分类收入";
  };

  const groups = { salary: 0, capital: 0, other: 0 };
  for (const t of txns) {
    if (t.direction !== "income") continue;
    const amount = num(t.amount);
    const g = groupOfIncomeCategory(t.categoryId);
    groups[g] = round2(groups[g] + amount);
    bump(`t:${t.categoryId || "none"}`, t.categoryId, catName(t.categoryId), amount, "statement");
  }

  const manual = (data.incomeEntries || []).filter((e) => e.currency === currency && e.month === month);
  for (const e of manual) {
    const amount = num(e.amount);
    const g = groupOfIncomeCategory(e.categoryId);
    groups[g] = round2(groups[g] + amount);
    bump(`m:${e.categoryId || "none"}`, e.categoryId, catName(e.categoryId), amount, "manual");
  }

  const incomeTotal = round2(groups.salary + groups.capital + groups.other);
  const expenseTotal = round2(
    txns.filter((t) => t.direction === "expense").reduce((s, t) => s + num(t.amount), 0)
  );
  const surplus = round2(incomeTotal - expenseTotal);

  const accounts = data.accounts || [];
  const allocations = (data.allocations || [])
    .filter((a) => a.currency === currency && a.month === month)
    .map((a) => {
      const account = accounts.find((x) => x.id === a.accountId) || null;
      const side = account ? sideOf(account.kind) : "other";
      return {
        ...a,
        amount: round2(a.amount),
        account,
        side,
        // For a loan, what the balance sheet already recorded that month.
        recorded: account ? loanPrepaymentsInMonth(account, month) : null,
      };
    });

  const sumWhere = (fn) => round2(allocations.filter(fn).reduce((s, a) => s + a.amount, 0));
  const toAssets = sumWhere((a) => a.side === "asset");
  const toLiabilities = sumWhere((a) => a.side === "liability");
  const toOther = sumWhere((a) => a.side === "other");
  const allocated = round2(toAssets + toLiabilities + toOther);
  const unallocated = round2(surplus - allocated);

  return {
    month, currency,
    income: { ...groups, total: incomeTotal, rows: Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount), manual },
    expense: { total: expenseTotal },
    surplus,
    allocations,
    toAssets, toLiabilities, toOther, allocated,
    unallocated,
    settled: Math.abs(unallocated) < 0.005,
    overAllocated: unallocated < -0.005,
  };
}

/** Month-by-month totals for the trend chart. */
export function monthlySeries(data, currency, limit = 12) {
  return monthsWithActivity(data, currency)
    .slice(0, limit)
    .reverse()
    .map((m) => {
      const f = monthlyFlow(data, m, currency);
      return {
        month: m,
        label: m.slice(2),
        income: f.income.total,
        expense: f.expense.total,
        toAssets: f.toAssets,
        toLiabilities: f.toLiabilities,
        unallocated: f.unallocated,
      };
    });
}

/** Running totals across every month, for the header strip. */
export function flowTotals(data, currency) {
  let income = 0, expense = 0, toAssets = 0, toLiabilities = 0, unsettled = 0;
  for (const m of monthsWithActivity(data, currency)) {
    const f = monthlyFlow(data, m, currency);
    income = round2(income + f.income.total);
    expense = round2(expense + f.expense.total);
    toAssets = round2(toAssets + f.toAssets);
    toLiabilities = round2(toLiabilities + f.toLiabilities);
    if (!f.settled) unsettled++;
  }
  return { income, expense, toAssets, toLiabilities, unsettled };
}
