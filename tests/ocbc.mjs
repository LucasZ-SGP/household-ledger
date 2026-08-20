import assert from "node:assert/strict";
import { parse, detect, reconcile } from "../src/lib/statements/ocbc.js";
import { detectParser } from "../src/lib/statements/index.js";
import { makeStatementPage, makeGlossaryPage, makePromoPage } from "./fixtures/ocbc.mjs";

// A small statement whose balances are internally consistent.
function sampleStatement() {
  return [
    makeStatementPage({
      pageNumber: 1,
      openingBalance: 914.11,
      blocks: [
        { date: "01 JUL", lines: ["DEBIT PURCHASE", "29/06/26", "xx-7126 MCDONALD'S (SLT)", "S"], withdrawal: 2.0, balance: 912.11 },
        { date: "01 JUL", lines: ["DEBIT PURCHASE", "29/06/26", "xx-7126 The Daily Cut Pte", "Ltd", "S"], withdrawal: 22.43, balance: 889.68 },
        { date: "01 JUL", lines: ["DEBIT PURCHASE", "26/06/26", "xx-7126 BUS/MRT 878685326", "S"], withdrawal: 4.04, balance: 885.64 },
        { date: "01 JUL", lines: ["PAYMENT/TRANSFER", "DBSS", "from JIN HUIHUI", "OTHR Transfer"], deposit: 2800.0, balance: 3685.64 },
        { date: "01 JUL", lines: ["FAST PAYMENT", "via PayNow-UEN", "to AXS PTE. LTD.", "OTHR-2607017290518200613"], withdrawal: 91.2, balance: 3594.44 },
      ],
    }),
    makeGlossaryPage(2),
    makeStatementPage({
      pageNumber: 3,
      blocks: [
        { date: "03 JUL", lines: ["CCY CONVERSION FEE", "FOR: 3.98 SGD"], withdrawal: 0.11, balance: 3594.33 },
        { date: "14 JUL", lines: ["DEBIT PURCHASE", "12/07/26", "xx-9931 Grab*", "GPC-001531467344-C8S"], withdrawal: 2.14, balance: 3592.19 },
        { date: "17 JUL", lines: ["CASH REBATE", "CASH REBATE"], deposit: 8.56, balance: 3600.75 },
        { date: "21 JUL", lines: ["NETS QR", "23019193", "NETS QR PURCHASE", "B24 RH"], withdrawal: 4.4, balance: 3596.35 },
        { date: "01 AUG", valueDate: "31 JUL", lines: ["INTEREST CREDIT"], deposit: 0.11, balance: 3596.46 },
      ],
      closingBalance: 3596.46,
      totals: { withdrawals: 126.32, deposits: 2808.67 },
    }),
    makePromoPage(4),
  ];
}

export function runOcbcTests(t) {
  // ---------- detection ----------
  t("detects an OCBC statement", () => {
    assert.equal(detect(sampleStatement()), true);
  });
  t("registry resolves the OCBC parser", () => {
    const p = detectParser(sampleStatement());
    assert.ok(p);
    assert.equal(p.id, "ocbc");
  });
  t("does not claim an unrelated PDF", () => {
    const pages = [{ pageNumber: 1, items: [{ str: "ACME INVOICE", x: 50, y: 700, width: 40, right: 90, center: 70 }] }];
    assert.equal(detect(pages), false);
    assert.equal(detectParser(pages), null);
  });

  // ---------- structural parsing ----------
  const r = parse(sampleStatement());

  t("reads account number and statement period", () => {
    assert.equal(r.accountNumber, "594532335001");
    assert.equal(r.period.start, "2026-07-01");
    assert.equal(r.period.end, "2026-07-31");
  });

  t("skips the glossary and promo pages", () => {
    assert.equal(r.statementPages, 2);
  });

  t("extracts every transaction and no extras", () => {
    assert.equal(r.transactions.length, 10);
  });

  t("reads opening, closing and printed totals", () => {
    assert.equal(r.opening, 914.11);
    assert.equal(r.closing, 3596.46);
    assert.deepEqual(r.totals, { withdrawals: 126.32, deposits: 2808.67 });
  });

  t("direction comes from the column, not the sign", () => {
    const byDesc = Object.fromEntries(r.transactions.map((x) => [x.description, x]));
    assert.equal(byDesc["DEBIT PURCHASE MCDONALD'S (SLT)"].direction, "expense");
    assert.equal(byDesc["PAYMENT/TRANSFER DBSS from JIN HUIHUI"].direction, "income");
    assert.equal(byDesc["INTEREST CREDIT"].direction, "income");
    assert.equal(byDesc["CASH REBATE"].direction, "income");
  });

  t("amounts are positive magnitudes", () => {
    assert.ok(r.transactions.every((x) => x.amount > 0));
  });

  t("parses dates without a printed year", () => {
    assert.equal(r.transactions[0].date, "2026-07-01");
  });

  t("infers the year across a month boundary (01 AUG on a July statement)", () => {
    const interest = r.transactions.find((x) => x.description === "INTEREST CREDIT");
    assert.equal(interest.date, "2026-08-01");
    assert.equal(interest.valueDate, "2026-07-31");
  });

  // ---------- description handling ----------
  t("joins a wrapped merchant name", () => {
    assert.ok(r.transactions.some((x) => x.description === "DEBIT PURCHASE The Daily Cut Pte Ltd"));
  });
  t("extracts the card suffix out of the description", () => {
    const mc = r.transactions.find((x) => x.description.includes("MCDONALD"));
    assert.equal(mc.card, "xx-7126");
    assert.ok(!mc.description.includes("xx-7126"));
  });
  t("strips embedded reference numbers so merchants group", () => {
    assert.ok(r.transactions.some((x) => x.description === "DEBIT PURCHASE BUS/MRT"));
  });
  t("drops posting-date, OTHR, GPC and FOR: noise lines", () => {
    const descs = r.transactions.map((x) => x.description);
    assert.ok(descs.includes("FAST PAYMENT via PayNow-UEN to AXS PTE. LTD."));
    assert.ok(descs.includes("DEBIT PURCHASE Grab*"));
    assert.ok(descs.includes("CCY CONVERSION FEE"));
    assert.ok(!descs.some((d) => /\d{2}\/\d{2}\/\d{2}/.test(d)), "posting dates leaked into descriptions");
    assert.ok(!descs.some((d) => /GPC-/.test(d)), "Grab reference leaked");
  });
  t("collapses duplicated consecutive lines", () => {
    assert.ok(r.transactions.some((x) => x.description === "CASH REBATE"));
  });
  t("drops the trailing card-scheme indicator", () => {
    assert.ok(!r.transactions.some((x) => /\sS$/.test(x.description)));
  });
  t("keeps the raw text for reference", () => {
    const mc = r.transactions.find((x) => x.description.includes("MCDONALD"));
    assert.ok(mc.raw.includes("29/06/26"), "raw should retain everything that was stripped");
  });

  // ---------- reconciliation: the safety net ----------
  t("clean statement reconciles on all three checks", () => {
    assert.equal(r.reconciliation.ok, true);
    assert.equal(r.reconciliation.rowMismatches.length, 0);
    assert.equal(r.reconciliation.closingOk, true);
    assert.equal(r.reconciliation.totalsOk, true);
    assert.equal(r.warnings.length, 0);
  });

  t("reconciliation CATCHES a misread amount", () => {
    const bad = JSON.parse(JSON.stringify(r.transactions));
    bad[0].amount = 20.0;                       // 2.00 misread as 20.00
    const rec = reconcile({ opening: r.opening, closing: r.closing, totals: r.totals, transactions: bad });
    assert.equal(rec.ok, false);
    assert.ok(rec.rowMismatches.length > 0);
  });

  t("reconciliation CATCHES a flipped direction", () => {
    const bad = JSON.parse(JSON.stringify(r.transactions));
    const dep = bad.find((x) => x.direction === "income");
    dep.direction = "expense";
    const rec = reconcile({ opening: r.opening, closing: r.closing, totals: r.totals, transactions: bad });
    assert.equal(rec.ok, false);
  });

  t("reconciliation CATCHES a dropped transaction", () => {
    const bad = r.transactions.slice(0, -1);
    const rec = reconcile({ opening: r.opening, closing: r.closing, totals: r.totals, transactions: bad });
    assert.equal(rec.ok, false);
    assert.equal(rec.closingOk, false);
  });

  t("reconciliation CATCHES a duplicated transaction", () => {
    const bad = [...r.transactions, r.transactions[r.transactions.length - 1]];
    const rec = reconcile({ opening: r.opening, closing: r.closing, totals: r.totals, transactions: bad });
    assert.equal(rec.ok, false);
  });

  t("a single bad row does not cascade into every later row", () => {
    const bad = JSON.parse(JSON.stringify(r.transactions));
    bad[0].amount = 20.0;
    const rec = reconcile({ opening: r.opening, closing: r.closing, totals: r.totals, transactions: bad });
    assert.equal(rec.rowMismatches.length, 1, "resync should limit the report to the actual error");
  });

  t("reports 'unchecked' when the statement has no opening balance", () => {
    const pages = [makeStatementPage({
      pageNumber: 1,
      blocks: [{ date: "01 JUL", lines: ["DEBIT PURCHASE", "xx-1234 SOMEWHERE"], withdrawal: 5, balance: 100 }],
    })];
    const res = parse(pages);
    assert.equal(res.reconciliation.checked, false);
    assert.equal(res.transactions.length, 1);
  });

  // ---------- edge cases ----------
  t("handles a transaction block split across a page break", () => {
    const pages = [
      makeStatementPage({
        pageNumber: 1,
        openingBalance: 100,
        blocks: [{ date: "01 JUL", lines: ["DEBIT PURCHASE", "xx-7126 LONG MERCHANT NAME"], withdrawal: 10, balance: 90 }],
      }),
      makeStatementPage({
        pageNumber: 2,
        blocks: [{ date: "02 JUL", lines: ["DEBIT PURCHASE", "xx-7126 SECOND ONE"], withdrawal: 20, balance: 70 }],
        closingBalance: 70,
      }),
    ];
    const res = parse(pages);
    assert.equal(res.transactions.length, 2);
    assert.equal(res.reconciliation.ok, true);
  });

  t("ignores stray numbers on non-table pages", () => {
    // the glossary fixture contains a decoy "1,234.56"
    assert.ok(!r.transactions.some((x) => x.amount === 1234.56));
  });

  t("warns instead of guessing when a dated row has no amount", () => {
    const pages = [makeStatementPage({
      pageNumber: 1,
      openingBalance: 100,
      blocks: [{ date: "01 JUL", lines: ["ODD ROW"], balance: 100 }],
    })];
    const res = parse(pages);
    assert.equal(res.transactions.length, 0);
    assert.ok(res.warnings.some((w) => /没有金额/.test(w)));
  });

  t("handles a December statement posting into January", () => {
    const pages = [makeStatementPage({
      pageNumber: 1,
      period: "1 DEC 2026 TO 31 DEC 2026",
      openingBalance: 500,
      blocks: [
        { date: "31 DEC", lines: ["DEBIT PURCHASE", "xx-1111 YEAR END"], withdrawal: 100, balance: 400 },
        { date: "01 JAN", valueDate: "31 DEC", lines: ["INTEREST CREDIT"], deposit: 1, balance: 401 },
      ],
      closingBalance: 401,
    })];
    const res = parse(pages);
    assert.equal(res.transactions[0].date, "2026-12-31");
    assert.equal(res.transactions[1].date, "2027-01-01");
    assert.equal(res.reconciliation.ok, true);
  });

  t("thousands separators in the PDF parse correctly", () => {
    const pages = [makeStatementPage({
      pageNumber: 1,
      openingBalance: 914.11,
      blocks: [{ date: "01 JUL", lines: ["PAYMENT/TRANSFER", "from SOMEONE"], deposit: 12345.67, balance: 13259.78 }],
      closingBalance: 13259.78,
    })];
    const res = parse(pages);
    assert.equal(res.transactions[0].amount, 12345.67);
    assert.equal(res.reconciliation.ok, true);
  });
}
