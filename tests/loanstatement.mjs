import assert from "node:assert/strict";
import {
  parseLoanStatement, reconcileLoanStatement, verifyStatementInterest,
  mergeLoanEntries, suggestedLoanSettings, classifyCode,
} from "../src/lib/loanStatement.js";
import {
  loanTimeline, loanYearSummary, estimateRebate, monthlyInterest, round2,
  entryMeta, canonicalEntryType,
} from "../src/lib/assets.js";
import {
  HDB_STATEMENT_2024, HDB_STATEMENT_2025, HDB_STATEMENT_2026, HDB_ALL, CLOSING,
} from "./fixtures/loanstatement.mjs";

// Ground truth, copied straight off a real HDB statement. The bulk fixture is
// synthetic, so these few figures are what actually pin our arithmetic to what
// the bank charges rather than to our own formula.
const REAL = {
  // Balance of 652,164.90 at 2.60% was charged exactly 1,413.02 that month.
  interest: { balance: 652164.9, rate: 2.6, charged: 1413.02 },
  // 48,000 prepaid on 6 Sep 2024 (a 30-day month) was rebated exactly 83.20.
  rebateSep: { amount: 48000, date: "2024-09-06", rebated: 83.2 },
  // 500 prepaid on 2 Oct 2024 (a 31-day month) was rebated exactly 1.01.
  rebateOct: { amount: 500, date: "2024-10-02", rebated: 1.01 },
  // 7,000 prepaid on the second-to-last day of October was rebated 0.49.
  rebateLate: { amount: 7000, date: "2024-10-30", rebated: 0.49 },
};

export function runLoanStatementTests(t) {
  // ---------- codes ----------
  t("IP-2.60 is an interest charge carrying its rate", () => {
    assert.deepEqual(classifyCode("IP-2.60"), { type: "interest", rate: 2.6 });
  });
  t("CPF-A is a lump sum, plain CPF is the standing instalment", () => {
    assert.equal(classifyCode("CPF-A").type, "prepayment");
    assert.equal(classifyCode("CPF").type, "instalment");
  });
  t("AXS-I pays interest down rather than charging a fee", () => {
    // It prints negative on the statement, so it must reduce the balance.
    assert.equal(classifyCode("AXS-I").type, "interest_payment");
    assert.equal(entryMeta("interest_payment").sign, -1);
  });
  t("BAL-BF / BAL-CF are checkpoints, not movements", () => {
    assert.equal(classifyCode("BAL-BF").kind, "checkpoint");
    assert.equal(classifyCode("BAL-CF").checkpoint, "cf");
  });
  t("an unknown code is refused rather than guessed at", () => {
    assert.equal(classifyCode("ZZZ-9"), null);
  });

  // ---------- parsing ----------
  const p24 = parseLoanStatement(HDB_STATEMENT_2024);
  t("the arithmetic matches what a real bank actually charged", () => {
    // These four are the only real numbers in this file, and they are the ones
    // that matter: they say our formulas describe HDB, not just themselves.
    assert.equal(monthlyInterest(REAL.interest.balance, REAL.interest.rate), REAL.interest.charged);
    for (const k of ["rebateSep", "rebateOct", "rebateLate"]) {
      const c = REAL[k];
      assert.equal(estimateRebate(c.amount, 2.6, c.date), c.rebated, k);
    }
  });

  t("parses every movement row and skips the title/header lines", () => {
    assert.equal(p24.rows.length, 34);
    assert.equal(p24.unknown.length, 0);
  });
  t("picks up the opening and closing checkpoints", () => {
    assert.equal(p24.opening.date, "2024-06-01");
    assert.equal(p24.opening.amount, 0);
    assert.equal(p24.closing.date, "2024-12-31");
    assert.equal(p24.closing.amount, CLOSING[2024]);
  });
  t("reads the rate off the interest code", () => assert.equal(p24.rate, 2.6));
  t("thousands separators and minus signs survive", () => {
    const res = p24.rows.find((r) => r.code === "RES");
    assert.equal(res.amount, 438000);
    const axs = p24.rows.find((r) => r.code === "AXS-L");
    assert.equal(axs.statedSign, -1);
  });
  t("amounts are stored unsigned, with direction coming from the type", () => {
    assert.ok(p24.rows.every((r) => r.amount >= 0));
  });
  t("no printed sign contradicts what its code is supposed to do", () => {
    assert.deepEqual(p24.signConflicts, []);
  });
  t("dd-mmm-yyyy and extra whitespace both parse", () => {
    const p = parseLoanStatement("01-Jan-2026   IP-2.60   650.00\n  12 Jan 2026 \t CPF \t -1,200.00 ");
    assert.equal(p.rows.length, 2);
    assert.equal(p.rows[0].date, "2026-01-01");
    assert.equal(p.rows[1].amount, 1200);
  });
  t("garbage lines are reported, not silently dropped", () => {
    const p = parseLoanStatement("01 Jan 2026\tIP-2.60\t910.03\n01 Jan 2026\tWAT-99\t-1.00");
    assert.equal(p.rows.length, 1);
    assert.equal(p.unknown.length, 1);
    assert.match(p.unknown[0].reason, /WAT-99/);
  });
  t("empty text parses to nothing rather than throwing", () => {
    const p = parseLoanStatement("");
    assert.deepEqual(p.rows, []);
    assert.equal(p.opening, null);
  });

  // ---------- reconciliation ----------
  for (const [year, text, closing] of [
    ["2024", HDB_STATEMENT_2024, CLOSING[2024]],
    ["2025", HDB_STATEMENT_2025, CLOSING[2025]],
    ["2026", HDB_STATEMENT_2026, CLOSING[2026]],
  ]) {
    t(`${year} statement replays to the printed closing balance exactly`, () => {
      const parsed = parseLoanStatement(text);
      const r = reconcileLoanStatement(parsed);
      assert.equal(r.ok, true, r.message);
      assert.equal(r.computed, closing);
      assert.equal(r.diff, 0);
    });
  }

  t("three statements pasted together still reconcile end to end", () => {
    const parsed = parseLoanStatement(HDB_ALL);
    assert.equal(parsed.rows.length, 135);
    const r = reconcileLoanStatement(parsed);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.computed, CLOSING[2026]);
  });

  t("a misread amount is caught instead of being imported", () => {
    // One digit dropped from a prepayment: 6,100 -> 610.
    const broken = HDB_STATEMENT_2024.replace("18 Dec 2024\tAXS-L\t-6,100.00", "18 Dec 2024\tAXS-L\t-610.00");
    assert.notEqual(broken, HDB_STATEMENT_2024, "fixture line not found");
    const r = reconcileLoanStatement(parseLoanStatement(broken));
    assert.equal(r.ok, false);
    assert.equal(r.diff, 5490);
  });
  t("a dropped line is caught too", () => {
    const broken = HDB_STATEMENT_2025.replace("12 Jun 2025\tCPF\t-997.00\n", "");
    assert.notEqual(broken, HDB_STATEMENT_2025, "fixture line not found");
    assert.equal(reconcileLoanStatement(parseLoanStatement(broken)).ok, false);
  });
  t("reconciling without a closing balance says so instead of claiming success", () => {
    const noClose = HDB_STATEMENT_2024.split("\n").filter((l) => !l.includes("BAL-CF")).join("\n");
    const r = reconcileLoanStatement(parseLoanStatement(noClose));
    assert.equal(r.ok, false);
    assert.equal(r.reason, "no-closing");
    assert.equal(r.computed, CLOSING[2024], "it should still report what it computed");
  });
  t("an explicit opening balance overrides the statement's own", () => {
    const r = reconcileLoanStatement(parseLoanStatement(HDB_STATEMENT_2024), { openingBalance: 1000 });
    assert.equal(r.computed, CLOSING[2024] + 1000);
  });

  // ---------- the interest and rebate formulas ----------
  t("every printed interest charge equals balance x rate / 12", () => {
    const v = verifyStatementInterest(parseLoanStatement(HDB_ALL));
    assert.equal(v.checked, 25);
    assert.equal(v.matched, 25, JSON.stringify(v.mismatches.slice(0, 3)));
  });
  t("a wrong interest amount shows up in the cross-check", () => {
    const broken = HDB_STATEMENT_2025.replace("01 Jul 2025\tIP-2.60\t708.25", "01 Jul 2025\tIP-2.60\t1,208.25");
    assert.notEqual(broken, HDB_STATEMENT_2025, "fixture line not found");
    const v = verifyStatementInterest(parseLoanStatement(broken));
    // The bad row also throws off every month after it, which is the point:
    // one misread digit is loud, not a rounding-sized whisper.
    assert.ok(v.matched < v.checked);
    assert.equal(v.mismatches[0].date, "2025-07-01");
    assert.equal(v.mismatches[0].stated, 1208.25);
    assert.equal(v.mismatches[0].expected, 708.25);
  });

  t("every printed rebate matches the mid-month refund formula", () => {
    // INT-R = prepayment x rate/12 x (days left in month / days in month).
    const parsed = parseLoanStatement(HDB_ALL);
    const prepaidOn = new Map();
    for (const r of parsed.rows) {
      if (r.type === "prepayment") prepaidOn.set(r.date, (prepaidOn.get(r.date) || 0) + r.amount);
    }
    const rebates = parsed.rows.filter((r) => r.type === "rebate");
    assert.equal(rebates.length, 25);
    for (const r of rebates) {
      const expected = estimateRebate(prepaidOn.get(r.date) || 0, 2.6, r.date);
      assert.ok(Math.abs(expected - r.amount) < 0.02, `${r.date}: printed ${r.amount}, formula ${expected}`);
    }
  });
  t("a payment on the last day of the month earns no rebate", () => {
    assert.equal(estimateRebate(10000, 2.6, "2026-01-31"), 0);
    assert.equal(estimateRebate(10000, 2.6, "2026-04-30"), 0);
  });
  t("a payment on the 1st earns nearly the whole month back", () => {
    // 30 of January's 31 days are refunded, so almost a full month of interest.
    assert.equal(estimateRebate(6000, 2.6, "2025-01-01"), 12.58);
  });
  t("monthlyInterest rounds to the cent", () => {
    assert.equal(monthlyInterest(REAL.interest.balance, REAL.interest.rate), REAL.interest.charged);
    assert.equal(monthlyInterest(0, 2.6), 0);
    assert.equal(round2(1.005), 1.01);
  });

  // ---------- import into an account ----------
  t("an imported statement drives the loan balance to the statement's figure", () => {
    const parsed = parseLoanStatement(HDB_ALL);
    const { entries, added } = mergeLoanEntries([], parsed.rows);
    assert.equal(added, 135);
    const acc = { kind: "mortgage", currency: "SGD", ...suggestedLoanSettings(parsed), entries };
    const timeline = loanTimeline(acc, "2026-08-19");
    assert.equal(timeline.balance, CLOSING[2026]);
  });
  t("suggested settings come from the statement itself", () => {
    const s = suggestedLoanSettings(parseLoanStatement(HDB_ALL));
    assert.deepEqual(s, { startDate: "2024-06-01", principal: 0, annualRate: 2.6, accrualDay: 1 });
  });
  t("re-importing the same statement adds nothing", () => {
    const parsed = parseLoanStatement(HDB_ALL);
    const first = mergeLoanEntries([], parsed.rows);
    const second = mergeLoanEntries(first.entries, parsed.rows);
    assert.equal(second.added, 0);
    assert.equal(second.skipped, 135);
  });
  t("two identical CPF deductions on one day are both kept", () => {
    // A statement really does show the same CPF deduction twice on the 12th.
    const parsed = parseLoanStatement(HDB_STATEMENT_2025);
    const { entries } = mergeLoanEntries([], parsed.rows);
    const jun12 = entries.filter((e) => e.date === "2025-06-12" && e.type === "instalment");
    assert.equal(jun12.length, 2);
    assert.equal(jun12[0].amount, jun12[1].amount, "and they really are identical");
  });
  t("importing year by year gives the same result as all at once", () => {
    const all = mergeLoanEntries([], parseLoanStatement(HDB_ALL).rows);
    let step = { entries: [] };
    for (const text of [HDB_STATEMENT_2024, HDB_STATEMENT_2025, HDB_STATEMENT_2026]) {
      step = mergeLoanEntries(step.entries, parseLoanStatement(text).rows);
    }
    assert.equal(step.entries.length, all.entries.length);
    const settings = suggestedLoanSettings(parseLoanStatement(HDB_ALL));
    assert.equal(loanTimeline({ ...settings, entries: step.entries }, "2026-08-19").balance, CLOSING[2026]);
  });
  t("an overlapping re-import only tops up the missing rows", () => {
    const y24 = mergeLoanEntries([], parseLoanStatement(HDB_STATEMENT_2024).rows);
    const both = mergeLoanEntries(y24.entries, parseLoanStatement(HDB_ALL).rows);
    assert.equal(both.added, 135 - 34);
    assert.equal(both.skipped, 34);
  });

  // ---------- carrying on past the last statement ----------
  const imported = (() => {
    const parsed = parseLoanStatement(HDB_ALL);
    const { entries } = mergeLoanEntries([], parsed.rows);
    return { kind: "mortgage", currency: "SGD", ...suggestedLoanSettings(parsed), entries };
  })();

  t("the app keeps charging interest after the statement ends", () => {
    const t2 = loanTimeline(imported, "2026-09-02");
    const sep = t2.rows.filter((r) => r.date === "2026-09-01");
    assert.equal(sep.length, 1);
    assert.equal(sep[0].generated, true);
    assert.equal(sep[0].amount, monthlyInterest(CLOSING[2026], 2.6));
  });
  t("a month the statement already priced is never charged twice", () => {
    const rows = loanTimeline(imported, "2026-08-19").rows.filter((r) => r.type === "interest");
    const months = rows.map((r) => r.date.slice(0, 7));
    assert.equal(new Set(months).size, months.length, "one interest charge per month");
    assert.ok(rows.every((r) => !r.generated), "the statement's own figures should win");
  });
  t("months with no balance yet produce no phantom interest rows", () => {
    // The loan was only drawn down on 4 Jul 2024; nothing should be charged before that.
    const rows = loanTimeline(imported, "2026-08-19").rows;
    assert.ok(rows.every((r) => r.amount !== 0 || r.type === "rate_change"));
    assert.equal(rows[0].date, "2024-07-04");
  });
  t("the ledger carries a printable code on every row", () => {
    const rows = loanTimeline(imported, "2026-08-19").rows;
    assert.ok(rows.every((r) => typeof r.code === "string" && r.code.length));
    assert.ok(rows.some((r) => r.code === "IP-2.60"));
    assert.ok(rows.some((r) => r.code === "AXS-L"));
  });

  t("yearly subtotals line up with the statement's own years", () => {
    const summary = loanYearSummary(loanTimeline(imported, "2026-08-19"));
    const y2024 = summary.find((s) => s.year === "2024");
    const y2025 = summary.find((s) => s.year === "2025");
    assert.equal(round2(y2024.closing), CLOSING[2024]);
    assert.equal(round2(y2025.closing), CLOSING[2025]);
    // 24 instalments across 2025, two on the 12th of every month.
    assert.equal(round2(y2025.instalment), 997 * 24);
    assert.ok(y2025.prepayment > 50000);
  });

  t("legacy entry names still replay", () => {
    assert.equal(canonicalEntryType("payment"), "instalment");
    assert.equal(canonicalEntryType("drawdown"), "disbursement");
    const legacy = {
      kind: "mortgage", currency: "SGD", principal: 100000, annualRate: 2.6,
      startDate: "2026-01-01", accrualDay: 1,
      entries: [{ id: "a", type: "payment", date: "2026-02-01", amount: 1000 }],
    };
    const tl = loanTimeline(legacy, "2026-02-01");
    assert.equal(tl.balance, round2(100000 + monthlyInterest(100000, 2.6) - 1000));
  });
}
