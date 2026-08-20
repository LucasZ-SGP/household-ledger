import assert from "node:assert/strict";
import { parseDateFlexible, parseAmountFlexible, categorize, txnSignature, rowsToDrafts } from "../src/lib/parse.js";
import { normalizeState, freshState, formatMoney, realValue } from "../src/lib/model.js";

export function runUnitTests(t) {
  // ---------- dates ----------
  t("ISO date", () => assert.equal(parseDateFlexible("2026-03-07"), "2026-03-07"));
  t("ISO with time", () => assert.equal(parseDateFlexible("2026-03-07 14:22:01"), "2026-03-07"));
  t("dotted ISO", () => assert.equal(parseDateFlexible("2026.03.07"), "2026-03-07"));
  t("DD/MM/YYYY default day-first", () => assert.equal(parseDateFlexible("07/03/2026"), "2026-03-07"));
  t("MM/DD/YYYY when dayFirst=false", () => assert.equal(parseDateFlexible("03/07/2026", false), "2026-03-07"));
  t("day>12 overrides dayFirst=false", () => assert.equal(parseDateFlexible("25/03/2026", false), "2026-03-25"));
  t("05 Jan 2026", () => assert.equal(parseDateFlexible("05 Jan 2026"), "2026-01-05"));
  t("5-January-2026", () => assert.equal(parseDateFlexible("5-January-2026"), "2026-01-05"));
  t("two-digit year", () => assert.equal(parseDateFlexible("05 Jan 26"), "2026-01-05"));
  t("Jan 5, 2026", () => assert.equal(parseDateFlexible("Jan 5, 2026"), "2026-01-05"));
  t("empty date -> null", () => assert.equal(parseDateFlexible("   "), null));
  t("garbage date -> null", () => assert.equal(parseDateFlexible("Balance b/f"), null));
  t("null date -> null", () => assert.equal(parseDateFlexible(null), null));

  // ---------- amounts ----------
  t("plain amount", () => assert.equal(parseAmountFlexible("1234.56"), 1234.56));
  t("thousands separator", () => assert.equal(parseAmountFlexible("1,234.56"), 1234.56));
  t("currency symbol", () => assert.equal(parseAmountFlexible("S$ 1,234.56"), 1234.56));
  t("leading minus", () => assert.equal(parseAmountFlexible("-52.30"), -52.3));
  t("trailing minus", () => assert.equal(parseAmountFlexible("52.30-"), -52.3));
  t("parentheses negative", () => assert.equal(parseAmountFlexible("(52.30)"), -52.3));
  t("DR suffix negative", () => assert.equal(parseAmountFlexible("52.30 DR"), -52.3));
  t("CR suffix positive", () => assert.equal(parseAmountFlexible("52.30 CR"), 52.3));
  t("EU grouping 1.234.567,89-ish", () => assert.equal(parseAmountFlexible("1.234.567"), 1234.567));
  t("empty amount -> null", () => assert.equal(parseAmountFlexible(""), null));
  t("non-numeric -> null", () => assert.equal(parseAmountFlexible("N/A"), null));

  // ---------- categorize ----------
  const rules = [
    { pattern: "salary", categoryId: "salary", direction: "income" },
    { pattern: "giro", categoryId: "mortgage", direction: "expense" },
  ];
  t("matches keyword case-insensitively", () =>
    assert.equal(categorize("SALARY PAYMENT ABC", "income", rules), "salary"));
  t("respects direction", () =>
    assert.equal(categorize("SALARY PAYMENT ABC", "expense", rules), null));
  t("no match -> null", () =>
    assert.equal(categorize("MYSTERY MERCHANT", "expense", rules), null));
  t("first rule wins", () => {
    const ordered = [
      { pattern: "grab", categoryId: "transport", direction: "expense" },
      { pattern: "grabfood", categoryId: "groceries", direction: "expense" },
    ];
    assert.equal(categorize("GRABFOOD SG", "expense", ordered), "transport");
  });

  // ---------- dedupe signature ----------
  t("signature ignores description case/whitespace", () => {
    const a = { date: "2026-01-01", description: " Salary ABC ", amount: 100, currency: "SGD", direction: "income" };
    const b = { date: "2026-01-01", description: "salary abc", amount: 100, currency: "SGD", direction: "income" };
    assert.equal(txnSignature(a), txnSignature(b));
  });
  t("signature separates currency", () => {
    const a = { date: "2026-01-01", description: "X", amount: 100, direction: "income" };
    assert.notEqual(txnSignature(a, "SGD"), txnSignature(a, "USD"));
  });
  t("signature separates direction", () => {
    const base = { date: "2026-01-01", description: "X", amount: 100, currency: "SGD" };
    assert.notEqual(
      txnSignature({ ...base, direction: "income" }),
      txnSignature({ ...base, direction: "expense" })
    );
  });

  // ---------- rowsToDrafts ----------
  const singleMapping = { dateCol: 0, descCol: 1, amountMode: "single", amountCol: 2, reverseSign: false, dayFirst: true };
  t("single-column mapping splits by sign", () => {
    const drafts = rowsToDrafts([
      ["2026-01-05", "Salary", "8000"],
      ["2026-01-06", "Mortgage", "-2500"],
    ], singleMapping);
    assert.equal(drafts.length, 2);
    assert.deepEqual(drafts[0], { date: "2026-01-05", description: "Salary", amount: 8000, direction: "income" });
    assert.deepEqual(drafts[1], { date: "2026-01-06", description: "Mortgage", amount: 2500, direction: "expense" });
  });
  t("reverseSign flips direction", () => {
    const drafts = rowsToDrafts([["2026-01-05", "Fee", "20"]], { ...singleMapping, reverseSign: true });
    assert.equal(drafts[0].direction, "expense");
    assert.equal(drafts[0].amount, 20);
  });
  t("split debit/credit mapping", () => {
    const m = { dateCol: 0, descCol: 1, amountMode: "split", debitCol: 2, creditCol: 3, dayFirst: true };
    const drafts = rowsToDrafts([
      ["2026-01-05", "Salary", "", "8000"],
      ["2026-01-06", "Rent", "2000", ""],
    ], m);
    assert.equal(drafts[0].direction, "income");
    assert.equal(drafts[1].direction, "expense");
    assert.equal(drafts[1].amount, 2000);
  });
  t("drops rows with no date / no desc / zero amount", () => {
    const drafts = rowsToDrafts([
      ["Balance brought forward", "", ""],
      ["2026-01-05", "", "100"],
      ["2026-01-05", "Zero", "0"],
      ["2026-01-05", "Good", "10"],
    ], singleMapping);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].description, "Good");
  });

  // ---------- state normalization ----------
  t("normalizeState fills missing collections", () => {
    const s = normalizeState({ transactions: null, currencies: [] });
    assert.ok(Array.isArray(s.transactions));
    assert.ok(s.currencies.length > 0);
    assert.ok(s.categories.income.length > 0);
  });
  t("normalizeState preserves user data", () => {
    const base = freshState();
    base.transactions = [{ id: "x", date: "2026-01-01", description: "测试", amount: 5, currency: "CNY", direction: "expense" }];
    const s = normalizeState(JSON.parse(JSON.stringify(base)));
    assert.equal(s.transactions.length, 1);
    assert.equal(s.transactions[0].description, "测试");
  });
  t("normalizeState survives garbage", () => {
    assert.ok(normalizeState(null).currencies.length > 0);
    assert.ok(normalizeState("nonsense").currencies.length > 0);
  });

  // ---------- money / inflation ----------
  t("formatMoney SGD", () => assert.equal(formatMoney(1234.5, "SGD"), "S$1,234.50"));
  t("formatMoney CNY", () => assert.equal(formatMoney(1234.5, "CNY"), "¥1,234.50"));
  t("formatMoney unknown currency", () => assert.equal(formatMoney(10, "JPY"), "JPY 10.00"));
  t("formatMoney forceSign", () => assert.equal(formatMoney(10, "USD", { forceSign: true }), "+$10.00"));
  t("formatMoney negative", () => assert.equal(formatMoney(-10, "USD"), "-$10.00"));
  t("realValue inflates past amounts", () => {
    const v = realValue(100, "2025-08-16", "SGD", { SGD: 3 }, "2026-08-16");
    assert.ok(v > 102.9 && v < 103.1, `expected ~103, got ${v}`);
  });
  t("realValue leaves future/equal dates alone", () => {
    assert.equal(realValue(100, "2026-08-16", "SGD", { SGD: 3 }, "2026-08-16"), 100);
  });
  t("realValue with no rate is identity", () => {
    assert.equal(realValue(100, "2020-01-01", "XYZ", {}, "2026-08-16"), 100);
  });
}
