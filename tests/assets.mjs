import assert from "node:assert/strict";
import {
  addMonthsISO, dayOfMonthISO, daysBetween, accrualDates, nextAccrualAfter,
  accruedInterest, valueFixedDeposit, maturityOf,
  loanTimeline, loanPayoff,
  cpfInterest, cpfTotal, cpfAge,
  valueBrokerage, valueAccount, summarizeAccounts, heldSymbols,
  snapshotFromAccounts, accountAlerts, newAccount, sideOf,
  cashOf, physicalAssets, newHolding, isPhysical,
} from "../src/lib/assets.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label || ""} expected ~${expected}, got ${actual}`);

export function runAssetTests(t) {
  // ---------- calendar ----------
  t("addMonths keeps the day", () => assert.equal(addMonthsISO("2026-01-15", 3), "2026-04-15"));
  t("addMonths crosses the year", () => assert.equal(addMonthsISO("2026-11-30", 2), "2027-01-30"));
  t("addMonths clamps to a short month", () => assert.equal(addMonthsISO("2026-01-31", 1), "2026-02-28"));
  t("addMonths clamps into a leap February", () => assert.equal(addMonthsISO("2028-01-31", 1), "2028-02-29"));
  t("addMonths goes backwards", () => assert.equal(addMonthsISO("2026-03-10", -4), "2025-11-10"));
  t("dayOfMonth clamps past the month end", () => assert.equal(dayOfMonthISO("2026-02-07", 31), "2026-02-28"));
  t("daysBetween counts a leap year", () => assert.equal(daysBetween("2028-01-01", "2029-01-01"), 366));

  // ---------- accrual dates ----------
  t("accrual dates land on the 1st of each month after the start", () => {
    const dates = accrualDates("2026-01-15", 1, "2026-04-10");
    assert.deepEqual(dates, ["2026-02-01", "2026-03-01", "2026-04-01"]);
  });
  t("an accrual on the start date itself does not double-count", () => {
    // Drawn down on the 1st: the first interest charge is a month later.
    assert.deepEqual(accrualDates("2026-01-01", 1, "2026-03-01"), ["2026-02-01", "2026-03-01"]);
  });
  t("accrual day 31 clamps every short month", () => {
    assert.deepEqual(accrualDates("2026-01-01", 31, "2026-04-01"), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  t("no accrual dates before the loan exists", () => {
    assert.deepEqual(accrualDates("2026-05-01", 1, "2026-01-01"), []);
  });
  t("nextAccrualAfter finds the coming 1st", () => {
    assert.equal(nextAccrualAfter("2026-01-01", 1, "2026-03-14"), "2026-04-01");
    assert.equal(nextAccrualAfter("2026-01-01", 1, "2026-03-01"), "2026-04-01");
  });

  // ---------- fixed deposits ----------
  t("simple interest is principal x rate x time", () => {
    near(accruedInterest(10000, 3.65, 365, "simple"), 365, 0.01, "one year at 3.65%");
    near(accruedInterest(10000, 3.65, 100, "simple"), 100, 0.01, "100 days");
  });
  t("monthly compounding beats simple over a year", () => {
    const compound = accruedInterest(10000, 12, 365, "monthly");
    near(compound, 1268.25, 1, "12% compounded monthly");
    assert.ok(compound > accruedInterest(10000, 12, 365, "simple"));
  });
  t("maturity date derives from the term when not set", () => {
    assert.equal(maturityOf({ startDate: "2026-01-10", termMonths: 12 }), "2027-01-10");
  });
  t("an explicit maturity date wins over the term", () => {
    assert.equal(maturityOf({ startDate: "2026-01-10", termMonths: 12, maturityDate: "2026-07-10" }), "2026-07-10");
  });
  t("fixed deposit accrues to the valuation date", () => {
    const fd = { principal: 50000, annualRate: 3.2, startDate: "2026-01-01", termMonths: 12, compounding: "simple" };
    const v = valueFixedDeposit(fd, "2026-07-01");
    near(v.interest, 50000 * 0.032 * (181 / 365), 0.01, "half-year interest");
    assert.equal(v.matured, false);
    assert.equal(v.maturityDate, "2027-01-01");
    assert.equal(v.daysToMaturity, 184);
  });
  t("interest stops at maturity instead of growing forever", () => {
    const fd = { principal: 50000, annualRate: 3.2, startDate: "2026-01-01", termMonths: 12, compounding: "simple" };
    const atMaturity = valueFixedDeposit(fd, "2027-01-01");
    const muchLater = valueFixedDeposit(fd, "2029-06-01");
    assert.equal(muchLater.value, atMaturity.value);
    assert.equal(muchLater.matured, true);
    near(atMaturity.value, 51600, 1, "principal + one year at 3.2%");
  });
  t("maturityValue is the full-term figure even on day one", () => {
    const fd = { principal: 10000, annualRate: 4, startDate: "2026-01-01", termMonths: 6, compounding: "simple" };
    const v = valueFixedDeposit(fd, "2026-01-01");
    assert.equal(v.interest, 0);
    near(v.maturityValue, 10000 + 10000 * 0.04 * (181 / 365), 0.01);
  });

  // ---------- loans ----------
  const mortgage = {
    kind: "mortgage", principal: 500000, annualRate: 3, currency: "SGD",
    startDate: "2026-01-01", accrualDay: 1, monthlyPayment: 2500, entries: [],
  };

  t("one month of interest is added on the accrual day", () => {
    const t1 = loanTimeline(mortgage, "2026-02-01");
    assert.equal(t1.monthsAccrued, 1);
    near(t1.totalInterest, 500000 * 0.03 / 12, 0.001, "one month at 3%");
    near(t1.balance, 501250, 0.001);
  });
  t("nothing accrues before the first accrual day", () => {
    const t0 = loanTimeline(mortgage, "2026-01-31");
    assert.equal(t0.monthsAccrued, 0);
    assert.equal(t0.balance, 500000);
  });
  t("interest compounds month over month when nothing is repaid", () => {
    const t3 = loanTimeline(mortgage, "2026-03-01");
    // Rounded to cents each month, the way a bank posts it: 1250.00 then 1253.13.
    assert.equal(t3.balance, 502503.13);
  });
  t("every interest charge is rounded to the cent, not carried as a fraction", () => {
    const rows = loanTimeline(mortgage, "2026-03-01").rows;
    assert.deepEqual(rows.map((r) => r.amount), [1250, 1253.13]);
    assert.ok(rows.every((r) => Math.round(r.balance * 100) === r.balance * 100), "balances must be whole cents");
  });
  t("a payment on the accrual day lands after that month's interest", () => {
    const withPayment = {
      ...mortgage,
      entries: [{ id: "p1", type: "payment", date: "2026-02-01", amount: 2500 }],
    };
    const t1 = loanTimeline(withPayment, "2026-02-01");
    assert.equal(t1.balance, 501250 - 2500);
    assert.equal(t1.rows[0].type, "interest");
    // "payment" is the pre-statement-codes name; it reads back as an instalment.
    assert.equal(t1.rows[1].type, "instalment");
  });
  t("skipping the app for months still charges every month", () => {
    const t12 = loanTimeline(mortgage, "2027-01-01");
    assert.equal(t12.monthsAccrued, 12);
    assert.equal(t12.balance, 515207.99);
  });
  t("a rate change on the accrual day applies to that month", () => {
    const repriced = {
      ...mortgage,
      entries: [{ id: "r1", type: "rate_change", date: "2026-02-01", rate: 4 }],
    };
    const t1 = loanTimeline(repriced, "2026-02-01");
    assert.equal(t1.totalInterest, 1666.67);
    assert.equal(t1.rate, 4);
  });
  t("a payment larger than the balance cannot make it negative", () => {
    const nearlyDone = {
      ...mortgage, principal: 1000,
      entries: [{ id: "p", type: "payment", date: "2026-02-01", amount: 999999 }],
    };
    const done = loanTimeline(nearlyDone, "2026-03-01");
    assert.equal(done.balance, 0);
    assert.ok(done.rows.some((r) => r.short), "the unapplied excess should be flagged");
  });
  t("a cleared loan stops accruing interest", () => {
    const cleared = {
      ...mortgage, principal: 1000,
      entries: [{ id: "p", type: "payment", date: "2026-02-01", amount: 1002.5 }],
    };
    assert.equal(loanTimeline(cleared, "2027-01-01").balance, 0);
  });
  t("balance calibration overrides the replay", () => {
    const fixed = {
      ...mortgage,
      entries: [{ id: "s", type: "set_balance", date: "2026-02-01", amount: 480000 }],
    };
    assert.equal(loanTimeline(fixed, "2026-02-01").balance, 480000);
  });
  t("a drawdown increases the balance", () => {
    const more = {
      ...mortgage, principal: 100000,
      entries: [{ id: "d", type: "drawdown", date: "2026-01-15", amount: 50000 }],
    };
    const t1 = loanTimeline(more, "2026-01-20");
    assert.equal(t1.balance, 150000);
  });
  t("future-dated entries are ignored until their date", () => {
    const scheduled = {
      ...mortgage,
      entries: [{ id: "p", type: "payment", date: "2026-06-01", amount: 2500 }],
    };
    assert.equal(loanTimeline(scheduled, "2026-02-01").totalPaid, 0);
    assert.ok(loanTimeline(scheduled, "2026-06-01").totalPaid > 0);
  });
  t("replaying is idempotent — the same date gives the same balance", () => {
    const a = loanTimeline(mortgage, "2026-09-01").balance;
    const b = loanTimeline(mortgage, "2026-09-01").balance;
    assert.equal(a, b);
  });

  t("payoff refuses to project when the payment cannot cover the interest", () => {
    const p = loanPayoff(500000, 3, 1000); // one month of interest is 1250
    assert.equal(p.enough, false);
  });
  t("payoff months look like a real amortisation", () => {
    const p = loanPayoff(500000, 3, 2500);
    assert.equal(p.enough, true);
    // Closed form: -ln(1 - P*r/A) / ln(1+r) = 277.6 -> 278 months.
    assert.equal(p.months, 278);
    near(p.totalInterest, 194014, 1, "interest paid over the life of the loan");
    near(p.totalPaid, 500000 + p.totalInterest, 1, "payments = principal + interest");
  });
  t("payoff on a cleared loan is zero months", () => {
    assert.deepEqual(loanPayoff(0, 3, 2500), { enough: true, months: 0, totalInterest: 0, totalPaid: 0 });
  });

  // ---------- CPF ----------
  t("CPF base interest uses each account's own rate", () => {
    const acc = { balances: { oa: 100000, sa: 0, ma: 0, ra: 0 }, extraInterest: false, birthYear: 1990 };
    near(cpfInterest(acc, "2026-08-20").annual, 2500, 0.01, "2.5% on 100k OA");
  });
  t("under 55 gets +1% on the first 60k, with OA capped at 20k", () => {
    const acc = { balances: { oa: 40000, sa: 60000, ma: 0, ra: 0 }, birthYear: 1990 };
    const r = cpfInterest(acc, "2026-08-20");
    // extra tiers: 20k of OA + 40k of SA = 60k at +1%
    near(r.extraTotal, 600, 0.01);
    near(r.baseTotal, 40000 * 0.025 + 60000 * 0.04, 0.01);
  });
  t("55 and above gets +2% then +1%", () => {
    const acc = { balances: { oa: 0, sa: 0, ma: 0, ra: 100000 }, birthYear: 1960 };
    const r = cpfInterest(acc, "2026-08-20");
    assert.equal(r.senior, true);
    near(r.extraTotal, 30000 * 0.02 + 30000 * 0.01, 0.01);
  });
  t("extra interest can be switched off", () => {
    const acc = { balances: { oa: 50000, sa: 0, ma: 0, ra: 0 }, birthYear: 1990, extraInterest: false };
    assert.equal(cpfInterest(acc, "2026-08-20").extraTotal, 0);
  });
  t("without a birth year nobody is treated as 55+", () => {
    const r = cpfInterest({ balances: { oa: 10000 }, birthYear: null }, "2026-08-20");
    assert.equal(r.senior, false);
    assert.equal(r.age, null);
  });
  t("cpfAge counts by calendar year", () => assert.equal(cpfAge(1990, "2026-08-20"), 36));
  t("cpfTotal adds the four accounts", () => {
    assert.equal(cpfTotal({ balances: { oa: 1, sa: 2, ma: 3, ra: 4 } }), 10);
  });

  // ---------- brokerage ----------
  const brokerage = {
    kind: "brokerage", currency: "USD",
    cashByCurrency: { USD: 1200, SGD: 800 },
    holdings: [
      { id: "h1", symbol: "QQQ", quantity: 50, currency: "USD" },
      { id: "h2", symbol: "D05.SI", quantity: 300, currency: "SGD" },
    ],
  };
  const quotes = {
    QQQ: { price: 500, currency: "USD", asOf: "2026-08-19", source: "finnhub" },
    "D05.SI": { price: 40, currency: "SGD", asOf: "2026-08-19", source: "twelvedata" },
  };

  t("50 QQQ at 500 is a 25,000 position", () => {
    const v = valueBrokerage(brokerage, quotes, "2026-08-20");
    assert.equal(v.rows[0].value, 25000);
  });
  t("market value is kept per currency, never silently converted", () => {
    const v = valueBrokerage(brokerage, quotes, "2026-08-20");
    // USD: 25,000 of QQQ + 1,200 cash. SGD: 12,000 of D05 + 800 cash.
    assert.equal(v.byCurrency.USD, 26200);
    assert.equal(v.byCurrency.SGD, 12800);
    assert.equal(Object.keys(v.byCurrency).sort().join(), "SGD,USD");
  });
  t("idle cash is held per currency, side by side", () => {
    assert.deepEqual(cashOf(brokerage), { USD: 1200, SGD: 800 });
  });
  t("a single-number cash balance from an older file still reads", () => {
    assert.deepEqual(cashOf({ currency: "SGD", cash: 5000 }), { SGD: 5000 });
    assert.deepEqual(cashOf({ currency: "SGD" }), {});
  });
  t("zero balances drop out instead of cluttering the totals", () => {
    assert.deepEqual(cashOf({ cashByCurrency: { SGD: 5000, USD: 0, EUR: "" } }), { SGD: 5000 });
  });
  t("a holding with no price is reported, not counted as zero", () => {
    const v = valueBrokerage(brokerage, { QQQ: quotes.QQQ }, "2026-08-20");
    assert.deepEqual(v.missing, ["D05.SI"]);
    // The SGD cash still counts; only the unpriced holding is left out.
    assert.equal(v.byCurrency.SGD, 800);
    assert.equal(v.rows[1].value, null);
  });
  t("a stale quote is flagged", () => {
    const old = { QQQ: { price: 500, currency: "USD", asOf: "2026-08-01" } };
    assert.equal(valueBrokerage(brokerage, old, "2026-08-20").rows[0].stale, true);
    assert.equal(valueBrokerage(brokerage, quotes, "2026-08-20").rows[0].stale, false);
  });
  t("a currency mismatch against the quote is flagged", () => {
    const wrong = { QQQ: { price: 500, currency: "SGD", asOf: "2026-08-19" } };
    const v = valueBrokerage(brokerage, wrong, "2026-08-20");
    assert.equal(v.rows[0].currencyMismatch, true);
    assert.equal(v.byCurrency.SGD, 25000 + 800, "the quote's own currency wins");
  });
  t("symbols are matched case-insensitively", () => {
    const lower = { ...brokerage, cashByCurrency: {}, holdings: [{ id: "h", symbol: "qqq", quantity: 2, currency: "USD" }] };
    assert.equal(valueBrokerage(lower, quotes, "2026-08-20").rows[0].value, 1000);
  });
  t("heldSymbols collects every ticker once", () => {
    assert.deepEqual(heldSymbols([brokerage, brokerage]), ["D05.SI", "QQQ"]);
  });
  t("archived accounts are left out of the symbol list", () => {
    assert.deepEqual(heldSymbols([{ ...brokerage, archived: true }]), []);
  });

  // ---------- summary ----------
  const portfolio = [
    { id: "a", kind: "cash", currency: "SGD", balance: 20000 },
    { id: "b", kind: "fixed_deposit", currency: "SGD", principal: 100000, annualRate: 3, startDate: "2026-08-20", termMonths: 12, compounding: "simple" },
    { ...brokerage, id: "c" },
    { id: "d", kind: "cpf", currency: "SGD", balances: { oa: 50000, sa: 30000, ma: 20000, ra: 0 } },
    { id: "e", kind: "mortgage", currency: "SGD", principal: 400000, annualRate: 3, startDate: "2026-08-20", accrualDay: 1, entries: [] },
  ];

  t("summary splits assets and liabilities per currency", () => {
    const s = summarizeAccounts(portfolio, { asOf: "2026-08-20", quotes });
    assert.deepEqual(s.currencies, ["SGD", "USD"]);
    // SGD: 20000 cash + 100000 FD + 12000 D05 + 800 brokerage cash + 100000 CPF
    assert.equal(s.byCurrency.SGD.assets, 232800);
    assert.equal(s.byCurrency.SGD.liabilities, 400000);
    assert.equal(s.byCurrency.SGD.net, -167200);
    assert.equal(s.byCurrency.USD.assets, 26200);
    assert.equal(s.byCurrency.USD.liabilities, 0);
  });
  t("summary breaks the total down by kind", () => {
    const s = summarizeAccounts(portfolio, { asOf: "2026-08-20", quotes });
    assert.equal(s.byCurrency.SGD.byKind.cash, 20000);
    assert.equal(s.byCurrency.SGD.byKind.mortgage, 400000);
  });
  t("archived accounts drop out of the totals", () => {
    const s = summarizeAccounts(portfolio.map((a) => (a.id === "a" ? { ...a, archived: true } : a)), { asOf: "2026-08-20", quotes });
    assert.equal(s.byCurrency.SGD.assets, 212800);
  });
  t("missing quotes bubble up to the summary", () => {
    const s = summarizeAccounts(portfolio, { asOf: "2026-08-20", quotes: {} });
    assert.deepEqual(s.missingQuotes, ["D05.SI", "QQQ"]);
  });
  t("an empty portfolio summarizes to nothing rather than throwing", () => {
    const s = summarizeAccounts([], {});
    assert.deepEqual(s.currencies, []);
  });

  t("snapshot rows are one asset and one liability per currency", () => {
    const rows = snapshotFromAccounts(portfolio, { asOf: "2026-08-20", quotes });
    const sgd = rows.filter((r) => r.currency === "SGD");
    assert.equal(sgd.length, 2);
    assert.equal(sgd.find((r) => r.type === "asset").amount, 232800);
    assert.equal(sgd.find((r) => r.type === "liability").amount, 400000);
    assert.ok(rows.every((r) => r.date === "2026-08-20"));
  });

  // ---------- alerts ----------
  t("a matured deposit raises an alert", () => {
    const alerts = accountAlerts([{ id: "x", kind: "fixed_deposit", name: "OCBC 12M", currency: "SGD", principal: 1000, annualRate: 3, startDate: "2025-01-01", termMonths: 12 }], { asOf: "2026-08-20" });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /到期/);
  });
  t("a deposit maturing within a month is a heads-up, not a warning", () => {
    const alerts = accountAlerts([{ id: "x", kind: "fixed_deposit", name: "FD", currency: "SGD", principal: 1000, annualRate: 3, startDate: "2025-09-05", termMonths: 12 }], { asOf: "2026-08-20" });
    assert.equal(alerts[0].tone, "info");
  });
  t("a payment too small to cover the interest raises an alert", () => {
    const alerts = accountAlerts([{ id: "m", kind: "mortgage", name: "房贷", currency: "SGD", principal: 500000, annualRate: 3, startDate: "2026-01-01", accrualDay: 1, monthlyPayment: 500, entries: [] }], { asOf: "2026-08-20" });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].message, /月供/);
  });
  t("a healthy portfolio raises nothing", () => {
    assert.deepEqual(accountAlerts([{ id: "a", kind: "cash", currency: "SGD", balance: 100 }], { asOf: "2026-08-20" }), []);
  });

  // ---------- physical assets ----------
  t("a house and a car are recorded by name, with no amount attached", () => {
    const house = { id: "p", kind: "property", name: "Punggol 四房", currency: "SGD", description: "2024 年入伙" };
    const car = { id: "v", kind: "vehicle", name: "CR-V", currency: "SGD", description: "COE 2032 到期" };
    assert.deepEqual(valueAccount(house, {}).byCurrency, {});
    assert.deepEqual(valueAccount(car, {}).byCurrency, {});
  });
  t("physical assets never move the asset total", () => {
    const withHouse = [...portfolio, { id: "p", kind: "property", name: "组屋", currency: "SGD", description: "" }];
    const before = summarizeAccounts(portfolio, { asOf: "2026-08-20", quotes });
    const after = summarizeAccounts(withHouse, { asOf: "2026-08-20", quotes });
    assert.deepEqual(after.byCurrency.SGD, before.byCurrency.SGD);
  });
  t("physicalAssets lists them for the overview", () => {
    const list = physicalAssets([
      { id: "p", kind: "property", name: "组屋", description: "Punggol" },
      { id: "v", kind: "vehicle", name: "CR-V", description: "" },
      { id: "x", kind: "vehicle", name: "旧车", archived: true },
      { id: "c", kind: "cash", name: "现金" },
    ]);
    assert.deepEqual(list.map((p) => p.name), ["组屋", "CR-V"]);
    assert.equal(list[0].description, "Punggol");
  });
  t("a physical asset carries no price fields to go stale", () => {
    const car = newAccount("vehicle", "SGD");
    assert.equal(car.value, undefined);
    assert.equal(car.purchasePrice, undefined);
    assert.equal(car.description, "");
  });
  t("holdings no longer carry a cost basis", () => {
    assert.equal(newHolding("USD").costBasis, undefined);
  });

  // ---------- factories / plumbing ----------
  t("new accounts come with sane defaults", () => {
    const fd = newAccount("fixed_deposit", "SGD");
    assert.equal(fd.termMonths, 12);
    assert.equal(fd.maturityDate, addMonthsISO(fd.startDate, 12));
    assert.equal(newAccount("mortgage").accrualDay, 1);
    assert.equal(newAccount("mortgage").annualRate, 2.6, "HDB concessionary rate");
    assert.equal(newAccount("cpf").currency, "SGD");
  });
  t("physical kinds are recognised as physical", () => {
    assert.ok(isPhysical("property") && isPhysical("vehicle"));
    assert.ok(!isPhysical("brokerage") && !isPhysical("other_asset"));
  });
  t("liability kinds are on the liability side", () => {
    assert.equal(sideOf("mortgage"), "liability");
    assert.equal(sideOf("loan"), "liability");
    assert.equal(sideOf("brokerage"), "asset");
    assert.equal(sideOf("nonsense"), "asset");
  });
  t("valueAccount survives an unknown kind", () => {
    const v = valueAccount({ kind: "???", currency: "SGD" }, {});
    assert.deepEqual(v.byCurrency, {});
  });
  t("string amounts from hand-edited files still compute", () => {
    const v = valueAccount({ kind: "cash", currency: "SGD", balance: "1234.50" }, {});
    assert.equal(v.byCurrency.SGD, 1234.5);
  });
}
