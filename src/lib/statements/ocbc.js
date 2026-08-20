// ---------------------------------------------------------------------------
// Parser for OCBC "STATEMENT OF ACCOUNT" PDFs (savings / current accounts).
//
// Two things make this format tractable:
//   1. Withdrawal and deposit are both printed as positive numbers, so the
//      only signal for direction is the x-position of the column.
//   2. Every row carries a running balance, and the statement prints an opening
//      (BALANCE B/F), a closing (BALANCE C/F) and column totals. That lets the
//      parse be *verified* arithmetically rather than eyeballed.
// ---------------------------------------------------------------------------

import { buildRows } from "../pdf/extract.js";

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const AMOUNT_RE = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$|^-?\d+\.\d{2}$/;
const ROW_DATE_RE = /^(\d{1,2})\s+([A-Z]{3})$/;
const PERIOD_RE = /(\d{1,2})\s+([A-Z]{3})\s+(\d{4})\s+TO\s+(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i;

function pad(n) { return String(n).padStart(2, "0"); }

function toNumber(text) {
  const n = parseFloat(String(text).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

/** Finds the table header row and derives column geometry from it. */
function findHeader(rows) {
  for (const row of rows) {
    const texts = row.items.map((i) => i.str);
    if (texts.includes("Withdrawal") && texts.includes("Deposit") && texts.includes("Balance")) {
      const find = (s) => row.items.find((i) => i.str === s);
      const dates = row.items.filter((i) => i.str === "Date");
      const withdrawal = find("Withdrawal");
      const deposit = find("Deposit");
      const balance = find("Balance");
      const description = find("Description");
      if (!withdrawal || !deposit || !balance || !description || dates.length < 1) continue;
      return {
        y: row.y,
        dateX: dates[0].x,
        valueDateX: dates[1] ? dates[1].x : dates[0].x + 45,
        descX: description.x,
        columns: [
          { key: "withdrawal", center: withdrawal.center },
          { key: "deposit", center: deposit.center },
          { key: "balance", center: balance.center },
        ],
      };
    }
  }
  return null;
}

/** Assigns a numeric cell to withdrawal / deposit / balance by proximity. */
function classifyAmount(item, header) {
  let best = null;
  for (const col of header.columns) {
    const dist = Math.abs(item.center - col.center);
    if (!best || dist < best.dist) best = { key: col.key, dist };
  }
  return best.key;
}

function parsePeriod(pages) {
  for (const page of pages) {
    for (const it of page.items) {
      const m = it.str.match(PERIOD_RE);
      if (m) {
        const sMon = MONTHS[m[2].toUpperCase()];
        const eMon = MONTHS[m[5].toUpperCase()];
        if (!sMon || !eMon) continue;
        return {
          start: `${m[3]}-${pad(sMon)}-${pad(m[1])}`,
          end: `${m[6]}-${pad(eMon)}-${pad(m[4])}`,
          startYear: +m[3],
          endYear: +m[6],
          raw: it.str,
        };
      }
    }
  }
  return null;
}

function findAccountNumber(pages) {
  for (const page of pages) {
    for (const it of page.items) {
      const m = it.str.match(/Account No\.\s*(\S+)/i);
      if (m) return m[1];
    }
  }
  return null;
}

/**
 * Statement rows print "01 JUL" with no year. Choose the year that places the
 * date nearest the statement period — this handles the 01 AUG interest posting
 * on a July statement, and December/January statements that straddle a year.
 */
function resolveYear(day, monAbbr, period) {
  const mon = MONTHS[monAbbr];
  if (!mon) return null;
  if (!period) return null;
  const mid = (Date.parse(period.start) + Date.parse(period.end)) / 2;
  let best = null;
  const years = new Set([period.startYear - 1, period.startYear, period.startYear + 1, period.endYear, period.endYear + 1]);
  for (const y of years) {
    const t = Date.UTC(y, mon - 1, day);
    const dist = Math.abs(t - mid);
    if (!best || dist < best.dist) best = { y, dist };
  }
  return best.y;
}

// Lines that carry no descriptive meaning and would otherwise poison keyword
// rules and review-queue grouping, because they are unique per transaction.
function isNoiseLine(line) {
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(line)) return true;        // posting date
  if (/^OTHR\b/.test(line)) return true;                       // OTHR-1234567 / OTHR Transfer
  if (/^GPC-\S+$/i.test(line)) return true;                    // Grab reference
  if (/^QZ\d{6,}/i.test(line)) return true;                    // PayNow QR reference
  if (/^\d{6,}$/.test(line)) return true;                      // bare reference numbers
  if (/^FOR:\s/i.test(line)) return true;                      // "FOR: 3.98 SGD" on conversion fees
  return false;
}

function cleanDescription(lines) {
  let out = [];
  let card = null;

  for (let line of lines) {
    if (isNoiseLine(line)) continue;
    const m = line.match(/^xx-(\d{4})\s*(.*)$/);
    if (m) {
      card = `xx-${m[1]}`;
      line = m[2].trim();
      if (!line) continue;
    }
    out.push(line);
  }

  // Drop the trailing single-character card-scheme indicator (S / W / 8).
  while (out.length > 1 && out[out.length - 1].length === 1) out.pop();

  // Collapse consecutive duplicates ("CASH REBATE" / "CASH REBATE").
  out = out.filter((line, i) => i === 0 || line !== out[i - 1]);

  // Strip embedded reference numbers ("BUS/MRT 878685326" -> "BUS/MRT"), which
  // are unique per transaction and would otherwise make every recurring
  // merchant look like a brand-new payee to the rules engine.
  const description = out
    .join(" ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { description, card };
}

export function detect(pages) {
  let sawBank = false;
  let sawHeader = false;
  for (const page of pages) {
    for (const it of page.items) {
      if (/OCBC/i.test(it.str) || /Oversea-Chinese Banking/i.test(it.str)) sawBank = true;
      if (/STATEMENT OF ACCOUNT/i.test(it.str)) sawHeader = true;
    }
    if (sawBank && sawHeader) return true;
  }
  return false;
}

export function parse(pages, options = {}) {
  const currency = options.currency || "SGD";
  const period = parsePeriod(pages);
  const accountNumber = findAccountNumber(pages);
  const warnings = [];

  const transactions = [];
  let opening = null;
  let closing = null;
  let totals = null;
  let pending = null;          // transaction block still collecting description lines
  let statementPages = 0;
  let reachedEnd = false;

  const flush = () => {
    if (!pending) return;
    const { description, card } = cleanDescription(pending.lines);
    transactions.push({
      date: pending.date,
      valueDate: pending.valueDate,
      description: description || pending.lines[0] || "(无描述)",
      raw: pending.lines.join(" | "),
      card,
      amount: pending.amount,
      direction: pending.direction,
      balance: pending.balance,
      page: pending.page,
    });
    pending = null;
  };

  for (const page of pages) {
    const rows = buildRows(page.items);
    const header = findHeader(rows);
    if (!header) continue;               // cover page, transaction-code glossary, promo page
    statementPages++;

    const bodyRows = rows.filter((r) => r.y < header.y - 4);

    for (const row of bodyRows) {
      const amounts = {};
      const descParts = [];
      let rowDate = null;
      let rowValueDate = null;

      for (const it of row.items) {
        if (AMOUNT_RE.test(it.str) && it.x > header.descX + 60) {
          amounts[classifyAmount(it, header)] = toNumber(it.str);
          continue;
        }
        if (Math.abs(it.x - header.dateX) <= 3) {
          const m = it.str.match(ROW_DATE_RE);
          if (m) { rowDate = m; continue; }
        }
        if (Math.abs(it.x - header.valueDateX) <= 3) {
          const m = it.str.match(ROW_DATE_RE);
          if (m) { rowValueDate = m; continue; }
        }
        if (it.x >= header.descX - 3 && it.x < header.columns[0].center - 60) {
          descParts.push(it.str);
        }
      }

      const text = descParts.join(" ").trim();
      if (!text && !rowDate && Object.keys(amounts).length === 0) continue;

      // --- statement landmarks -------------------------------------------
      if (/^BALANCE B\/F/i.test(text)) {
        opening = amounts.balance;
        continue;
      }
      if (/^BALANCE C\/F/i.test(text)) {
        flush();
        closing = amounts.balance;
        reachedEnd = true;
        continue;
      }
      if (/^Total Withdrawals\/Deposits/i.test(text)) {
        flush();
        totals = { withdrawals: amounts.withdrawal ?? null, deposits: amounts.deposit ?? null };
        reachedEnd = true;
        continue;
      }
      if (/^(Total Interest Paid|Average Balance|CHECK YOUR STATEMENT)/i.test(text)) {
        flush();
        continue;
      }
      if (reachedEnd) continue;

      // --- transaction rows ----------------------------------------------
      if (rowDate) {
        flush();
        const year = resolveYear(+rowDate[1], rowDate[2].toUpperCase(), period);
        const mon = MONTHS[rowDate[2].toUpperCase()];
        const withdrawal = amounts.withdrawal;
        const deposit = amounts.deposit;

        if (withdrawal == null && deposit == null) {
          warnings.push(`第 ${page.pageNumber} 页有一行带日期但没有金额，已跳过：${text || "(空)"}`);
          continue;
        }
        if (withdrawal != null && deposit != null) {
          warnings.push(`第 ${page.pageNumber} 页有一行同时出现支出与收入金额，已按支出处理：${text}`);
        }

        let valueDateISO = null;
        if (rowValueDate) {
          const vYear = resolveYear(+rowValueDate[1], rowValueDate[2].toUpperCase(), period);
          const vMon = MONTHS[rowValueDate[2].toUpperCase()];
          if (vYear && vMon) valueDateISO = `${vYear}-${pad(vMon)}-${pad(+rowValueDate[1])}`;
        }

        pending = {
          date: year && mon ? `${year}-${pad(mon)}-${pad(+rowDate[1])}` : null,
          valueDate: valueDateISO,
          lines: text ? [text] : [],
          amount: withdrawal != null ? withdrawal : deposit,
          direction: withdrawal != null ? "expense" : "income",
          balance: amounts.balance ?? null,
          page: page.pageNumber,
        };
        continue;
      }

      // --- continuation lines of the current transaction -------------------
      if (pending && text) {
        pending.lines.push(text);
        continue;
      }
      if (!pending && text && Object.keys(amounts).length > 0) {
        warnings.push(`第 ${page.pageNumber} 页出现无法归属的金额行：${text}`);
      }
    }
  }
  flush();

  const reconciliation = reconcile({ opening, closing, totals, transactions });
  if (!period) warnings.push("没有从 PDF 中找到对账单周期，年份可能不准确，请核对导入后的日期。");
  if (statementPages === 0) warnings.push("没有识别到任何交易表格页。");

  return {
    bank: "OCBC",
    accountNumber,
    period,
    currency,
    opening,
    closing,
    totals,
    transactions,
    reconciliation,
    warnings,
    statementPages,
  };
}

/**
 * Verifies the parse arithmetically. Three independent checks:
 *   - every row's printed balance equals the previous balance ± the amount
 *   - opening + net movement equals the printed closing balance
 *   - summed withdrawals/deposits equal the printed column totals
 * Any mismatch means a transaction was misread, mis-signed, dropped or doubled.
 */
export function reconcile({ opening, closing, totals, transactions }) {
  const EPS = 0.005;
  const rowMismatches = [];
  let running = opening;

  if (opening != null) {
    for (const t of transactions) {
      running += t.direction === "income" ? t.amount : -t.amount;
      if (t.balance != null && Math.abs(running - t.balance) > EPS) {
        rowMismatches.push({
          date: t.date,
          description: t.description,
          expected: Math.round(running * 100) / 100,
          printed: t.balance,
        });
        running = t.balance; // resync so one error doesn't cascade
      }
    }
  }

  const sumWithdrawals = transactions.filter((t) => t.direction === "expense").reduce((a, t) => a + t.amount, 0);
  const sumDeposits = transactions.filter((t) => t.direction === "income").reduce((a, t) => a + t.amount, 0);

  const closingOk = opening != null && closing != null
    ? Math.abs(opening + sumDeposits - sumWithdrawals - closing) <= EPS
    : null;
  const totalsOk = totals && totals.withdrawals != null && totals.deposits != null
    ? Math.abs(sumWithdrawals - totals.withdrawals) <= EPS && Math.abs(sumDeposits - totals.deposits) <= EPS
    : null;

  return {
    ok: rowMismatches.length === 0 && closingOk !== false && totalsOk !== false,
    checked: opening != null,
    rowMismatches,
    closingOk,
    totalsOk,
    sumWithdrawals: Math.round(sumWithdrawals * 100) / 100,
    sumDeposits: Math.round(sumDeposits * 100) / 100,
    opening,
    closing,
    totals,
  };
}

export const OCBC_PARSER = { id: "ocbc", name: "OCBC Statement of Account", detect, parse };
