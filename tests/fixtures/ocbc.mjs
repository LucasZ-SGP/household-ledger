// Builds synthetic page-item arrays that reproduce the column geometry of a
// real OCBC "STATEMENT OF ACCOUNT" PDF, so the parser can be tested in CI
// without committing anyone's actual bank statement to the repo.
//
// The x-coordinates below were measured from a real statement:
//   transaction date 46.2 | value date 91.6 | description 136.9
//   withdrawal values right-aligned at 379.0
//   deposit    values right-aligned at 464.0
//   balance    values right-aligned at 560.4

const CHAR_W = 3.3;

function item(str, x, y) {
  const width = str.length * CHAR_W;
  return {
    str, x: +x.toFixed(1), y: +y.toFixed(1),
    width: +width.toFixed(1),
    right: +(x + width).toFixed(1),
    center: +(x + width / 2).toFixed(1),
  };
}

function rightAligned(str, rightEdge, y) {
  const width = str.length * CHAR_W;
  return item(str, rightEdge - width, y);
}

const COL = {
  date: 46.2,
  valueDate: 91.6,
  desc: 136.9,
  withdrawalRight: 379.0,
  depositRight: 464.0,
  balanceRight: 560.4,
};

function headerItems(y) {
  return [
    item("Transaction", COL.date, y + 13),
    item("Value", COL.valueDate, y + 13),
    item("Date", COL.date, y),
    item("Date", COL.valueDate, y),
    item("Description", COL.desc, y),
    item("Cheque", 233.3, y),
    item("Withdrawal", 331.0, y),
    item("Deposit", 426.4, y),
    item("Balance", 512.1, y),
  ];
}

function chromeItems(pageNumber, { period = "1 JUL 2026 TO 31 JUL 2026", account = "594532335001" } = {}) {
  return [
    item("OCBC Bank", 405, 813.5),
    item("Oversea-Chinese Banking Corporation Limited", 405, 803.6),
    item("STATEMENT OF ACCOUNT", 406.6, 705.1),
    item(`Page ${pageNumber} of 20`, 528.4, 692.4),
    item(period, 467.1, 595.6),
    item("MONTHLY SAVINGS ACCOUNT", 46.2, 595),
    item(`Account No. ${account}`, 46.2, 579.6),
  ];
}

/**
 * @param {object} opts
 * @param {Array} opts.blocks  [{ date, valueDate, lines:[], withdrawal|deposit, balance }]
 * @param {number} [opts.openingBalance] emits a BALANCE B/F row first
 * @param {number} [opts.closingBalance] emits a BALANCE C/F row last
 * @param {object} [opts.totals] { withdrawals, deposits } emits the totals row
 */
export function makeStatementPage(opts) {
  const {
    pageNumber = 1, blocks = [], openingBalance = null, closingBalance = null,
    totals = null, period, account,
  } = opts;

  const headerY = 551.5;
  const items = [...chromeItems(pageNumber, { period, account }), ...headerItems(headerY)];
  let y = 535;

  if (openingBalance != null) {
    items.push(item("BALANCE B/F", COL.desc, y));
    items.push(rightAligned(openingBalance.toFixed(2), COL.balanceRight, y - 0.5));
    y -= 15.8;
  }

  for (const b of blocks) {
    const first = b.lines[0] ?? "";
    items.push(item(first, COL.desc, y));
    items.push(item(b.date, COL.date, y - 0.5));
    items.push(item(b.valueDate || b.date, COL.valueDate, y - 0.5));
    if (b.withdrawal != null) {
      items.push(rightAligned(fmt(b.withdrawal), COL.withdrawalRight, y - 0.5));
    }
    if (b.deposit != null) {
      items.push(rightAligned(fmt(b.deposit), COL.depositRight, y - 0.5));
    }
    if (b.balance != null) {
      items.push(rightAligned(fmt(b.balance), COL.balanceRight, y - 0.5));
    }
    y -= 10.8;
    for (const line of b.lines.slice(1)) {
      items.push(item(line, COL.desc, y));
      y -= 10.8;
    }
    y -= 2.1;
  }

  if (closingBalance != null) {
    items.push(item("BALANCE C/F", COL.desc, y));
    items.push(rightAligned(fmt(closingBalance), COL.balanceRight, y - 0.5));
    y -= 20;
  }
  if (totals) {
    items.push(item("Total Withdrawals/Deposits", COL.desc, y));
    items.push(rightAligned(fmt(totals.withdrawals), COL.withdrawalRight, y - 0.5));
    items.push(rightAligned(fmt(totals.deposits), COL.depositRight, y - 0.5));
  }

  return { pageNumber, width: 595.28, height: 841.89, items };
}

/** A page with no transaction table — the transaction-code glossary insert. */
export function makeGlossaryPage(pageNumber = 2) {
  return {
    pageNumber,
    width: 595.28,
    height: 841.89,
    items: [
      item("OCBC Bank", 405, 813.5),
      item("TRANSACTION CODE", 51.9, 773.5),
      item("DESCRIPTION", 125.6, 773.5),
      item("A/C", 51.9, 762.1),
      item("Account", 125.6, 762.1),
      item("INT", 307, 762.1),
      item("Interest", 369.4, 762.1),
      item("1,234.56", 400, 700),   // a decoy number in a non-table page
    ],
  };
}

export function makePromoPage(pageNumber = 21) {
  return {
    pageNumber,
    width: 595.28,
    height: 841.89,
    items: [
      item("OCBC Bank", 405, 813.5),
      item("STATEMENT OF ACCOUNT", 406.6, 705.1),
      item("OCBC PROMOTION & INFORMATION", 46.2, 520),
    ],
  };
}

function fmt(n) {
  return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export { COL };
