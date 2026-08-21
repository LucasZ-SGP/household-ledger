import assert from "node:assert/strict";
import {
  monthlyFlow, monthlySeries, monthsWithActivity, flowTotals,
  groupOfIncomeCategory, allocationTargets, loanPrepaymentsInMonth,
  newIncomeEntry, newAllocation, INCOME_GROUPS,
} from "../src/lib/flows.js";
import { freshState, normalizeState } from "../src/lib/model.js";

const txn = (date, description, amount, direction, categoryId, currency = "SGD") =>
  ({ id: `${date}-${description}`, date, description, amount, direction, categoryId, currency });

function ledger(over = {}) {
  return {
    ...freshState(),
    transactions: [],
    accounts: [],
    incomeEntries: [],
    allocations: [],
    ...over,
  };
}

export function runFlowTests(t) {
  // ---------- grouping ----------
  t("salary lands in the pay bucket", () => assert.equal(groupOfIncomeCategory("salary"), "salary"));
  t("dividends and interest count as returns on capital", () => {
    assert.equal(groupOfIncomeCategory("capital_gains"), "capital");
    assert.equal(groupOfIncomeCategory("interest"), "capital");
  });
  t("an unknown or missing category falls into other, never disappears", () => {
    assert.equal(groupOfIncomeCategory("freelance"), "other");
    assert.equal(groupOfIncomeCategory(null), "other");
  });
  t("the three buckets are labelled", () => {
    assert.equal(INCOME_GROUPS.salary.label, "工资性收入");
    assert.equal(INCOME_GROUPS.capital.label, "资本利得");
  });

  // ---------- income comes from the statement, not retyped ----------
  const withPay = ledger({
    transactions: [
      txn("2026-08-01", "SALARY", 8000, "income", "salary"),
      txn("2026-08-15", "DIVIDEND", 300, "income", "capital_gains"),
      txn("2026-08-16", "GROCERIES", 500, "expense", "groceries"),
      txn("2026-07-01", "SALARY", 8000, "income", "salary"),
    ],
  });

  t("income is read from the transactions already imported", () => {
    const f = monthlyFlow(withPay, "2026-08", "SGD");
    assert.equal(f.income.salary, 8000);
    assert.equal(f.income.capital, 300);
    assert.equal(f.income.total, 8300);
  });
  t("expenses come from the same month's transactions", () => {
    assert.equal(monthlyFlow(withPay, "2026-08", "SGD").expense.total, 500);
  });
  t("surplus is income minus spending", () => {
    assert.equal(monthlyFlow(withPay, "2026-08", "SGD").surplus, 7800);
  });
  t("another month's money stays in that month", () => {
    const f = monthlyFlow(withPay, "2026-07", "SGD");
    assert.equal(f.income.total, 8000);
    assert.equal(f.expense.total, 0);
  });
  t("a different currency is a different sheet", () => {
    assert.equal(monthlyFlow(withPay, "2026-08", "USD").income.total, 0);
  });

  t("manual entries top up what the statement never saw", () => {
    const d = ledger({
      ...withPay,
      incomeEntries: [
        { id: "m1", month: "2026-08", currency: "SGD", categoryId: "capital_gains", amount: 1200, note: "券商股息" },
      ],
    });
    const f = monthlyFlow(d, "2026-08", "SGD");
    assert.equal(f.income.capital, 1500);
    assert.equal(f.income.total, 9500);
    assert.equal(f.income.manual.length, 1);
  });
  t("statement and manual money in one category are shown as mixed", () => {
    const d = ledger({
      ...withPay,
      incomeEntries: [{ id: "m1", month: "2026-08", currency: "SGD", categoryId: "salary", amount: 500, note: "" }],
    });
    const row = monthlyFlow(d, "2026-08", "SGD").income.rows.find((r) => r.categoryId === "salary" && r.source === "manual");
    assert.ok(row, "the manual half should be listed on its own");
    assert.equal(monthlyFlow(d, "2026-08", "SGD").income.salary, 8500);
  });

  // ---------- the point: the month clears to zero ----------
  const fd = { id: "fd1", kind: "fixed_deposit", name: "OCBC 定期", currency: "SGD", principal: 0, annualRate: 3, startDate: "2026-08-01", termMonths: 12 };
  const loan = {
    id: "ln1", kind: "mortgage", name: "HDB 房贷", currency: "SGD",
    principal: 300000, annualRate: 2.6, startDate: "2026-01-01", accrualDay: 1, entries: [],
  };

  t("the example from the brief: 1000 in, 800 into a deposit", () => {
    const d = ledger({
      accounts: [fd],
      transactions: [txn("2026-08-01", "PAY", 1000, "income", "salary"), txn("2026-08-10", "SPEND", 200, "expense", "groceries")],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "fd1", amount: 800, note: "" }],
    });
    const f = monthlyFlow(d, "2026-08", "SGD");
    assert.equal(f.surplus, 800);
    assert.equal(f.toAssets, 800);
    assert.equal(f.unallocated, 0);
    assert.equal(f.settled, true, "a fully placed month is closed out");
  });

  t("a prepayment against the mortgage counts as clearing debt, not buying an asset", () => {
    const d = ledger({
      accounts: [loan],
      transactions: [txn("2026-08-01", "PAY", 5000, "income", "salary")],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "ln1", amount: 5000, note: "" }],
    });
    const f = monthlyFlow(d, "2026-08", "SGD");
    assert.equal(f.toLiabilities, 5000);
    assert.equal(f.toAssets, 0);
    assert.equal(f.settled, true);
    assert.equal(f.allocations[0].side, "liability");
  });

  t("an unplaced surplus is reported rather than quietly ignored", () => {
    const d = ledger({
      accounts: [fd],
      transactions: [txn("2026-08-01", "PAY", 1000, "income", "salary")],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "fd1", amount: 400, note: "" }],
    });
    const f = monthlyFlow(d, "2026-08", "SGD");
    assert.equal(f.unallocated, 600);
    assert.equal(f.settled, false);
  });

  t("placing more than the surplus is flagged, not hidden", () => {
    const d = ledger({
      accounts: [fd],
      transactions: [txn("2026-08-01", "PAY", 1000, "income", "salary")],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "fd1", amount: 1500, note: "" }],
    });
    const f = monthlyFlow(d, "2026-08", "SGD");
    assert.equal(f.unallocated, -500);
    assert.equal(f.overAllocated, true);
    assert.equal(f.settled, false);
  });

  t("a month where spending exceeds income has a negative surplus", () => {
    const d = ledger({
      transactions: [txn("2026-08-01", "PAY", 1000, "income", "salary"), txn("2026-08-05", "RENT", 1800, "expense", "mortgage")],
    });
    assert.equal(monthlyFlow(d, "2026-08", "SGD").surplus, -800);
  });

  t("cents do not drift the closing balance off zero", () => {
    const d = ledger({
      accounts: [fd],
      transactions: [txn("2026-08-01", "PAY", 1000.1, "income", "salary"), txn("2026-08-02", "X", 0.05, "expense", "groceries")],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "fd1", amount: 1000.05, note: "" }],
    });
    const f = monthlyFlow(d, "2026-08", "SGD");
    assert.equal(f.unallocated, 0);
    assert.equal(f.settled, true);
  });

  t("an allocation whose account was deleted still shows up", () => {
    const d = ledger({
      transactions: [txn("2026-08-01", "PAY", 1000, "income", "salary")],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "gone", amount: 100, note: "" }],
    });
    const f = monthlyFlow(d, "2026-08", "SGD");
    assert.equal(f.allocations[0].account, null);
    assert.equal(f.allocated, 100, "the money is still spoken for");
  });

  // ---------- cross-check against the loan ledger ----------
  t("an allocation to a loan is checked against what the loan actually recorded", () => {
    const paid = {
      ...loan,
      entries: [{ id: "p1", type: "prepayment", date: "2026-08-14", amount: 5000 }],
    };
    const d = ledger({
      accounts: [paid],
      transactions: [txn("2026-08-01", "PAY", 6000, "income", "salary")],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "ln1", amount: 5000, note: "" }],
    });
    assert.equal(monthlyFlow(d, "2026-08", "SGD").allocations[0].recorded, 5000);
  });
  t("the cross-check counts only that month's payments", () => {
    const paid = {
      ...loan,
      entries: [
        { id: "p1", type: "prepayment", date: "2026-07-10", amount: 1000 },
        { id: "p2", type: "prepayment", date: "2026-08-14", amount: 5000 },
        { id: "p3", type: "instalment", date: "2026-08-12", amount: 1483 },
      ],
    };
    assert.equal(loanPrepaymentsInMonth(paid, "2026-08"), 6483);
    assert.equal(loanPrepaymentsInMonth(paid, "2026-07"), 1000);
  });
  t("there is nothing to cross-check on an asset account", () => {
    assert.equal(loanPrepaymentsInMonth(fd, "2026-08"), null);
  });

  // ---------- targets ----------
  t("allocation targets are split into assets and debts", () => {
    const targets = allocationTargets([fd, loan]);
    assert.deepEqual(targets.assets.map((a) => a.id), ["fd1"]);
    assert.deepEqual(targets.liabilities.map((a) => a.id), ["ln1"]);
  });
  t("archived accounts and physical things are not offered as targets", () => {
    const targets = allocationTargets([
      { ...fd, archived: true },
      { id: "h", kind: "property", name: "组屋" },
      loan,
    ]);
    assert.equal(targets.assets.length, 0, "a house cannot absorb a surplus — it has no amount");
    assert.equal(targets.liabilities.length, 1);
  });

  // ---------- months and totals ----------
  t("months are listed newest first, from every source", () => {
    const d = ledger({
      transactions: [txn("2026-06-01", "PAY", 1, "income", "salary")],
      incomeEntries: [{ id: "m", month: "2026-08", currency: "SGD", categoryId: "salary", amount: 1 }],
      allocations: [{ id: "a", month: "2026-07", currency: "SGD", accountId: "x", amount: 1 }],
    });
    assert.deepEqual(monthsWithActivity(d, "SGD"), ["2026-08", "2026-07", "2026-06"]);
  });
  t("the trend series runs oldest to newest for the chart", () => {
    const s = monthlySeries(withPay, "SGD");
    assert.deepEqual(s.map((r) => r.month), ["2026-07", "2026-08"]);
    assert.equal(s[1].income, 8300);
  });
  t("running totals count the months that never got closed out", () => {
    const d = ledger({
      accounts: [fd],
      transactions: [
        txn("2026-07-01", "PAY", 1000, "income", "salary"),
        txn("2026-08-01", "PAY", 1000, "income", "salary"),
      ],
      allocations: [{ id: "a1", month: "2026-08", currency: "SGD", accountId: "fd1", amount: 1000, note: "" }],
    });
    const totals = flowTotals(d, "SGD");
    assert.equal(totals.income, 2000);
    assert.equal(totals.toAssets, 1000);
    assert.equal(totals.unsettled, 1, "July was never placed");
  });

  // ---------- persistence ----------
  t("the new collections survive a load of an older file", () => {
    const s = normalizeState({ transactions: [] });
    assert.deepEqual(s.incomeEntries, []);
    assert.deepEqual(s.allocations, []);
    assert.equal(s.schemaVersion, 3);
  });
  t("factories stamp the month and currency they were opened in", () => {
    assert.equal(newIncomeEntry("2026-08", "SGD").month, "2026-08");
    assert.equal(newAllocation("2026-08", "USD").currency, "USD");
  });
  t("an empty ledger produces an empty, non-throwing sheet", () => {
    const f = monthlyFlow(freshState(), "2026-08", "SGD");
    assert.equal(f.income.total, 0);
    assert.equal(f.surplus, 0);
    assert.equal(f.settled, true);
  });
}
