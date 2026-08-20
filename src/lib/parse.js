// ---------------------------------------------------------------------------
// Bank-statement parsing helpers. Pure functions, unit-tested in node.
// ---------------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, "0"); }

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Handles the formats banks actually emit: ISO, DD/MM/YYYY, MM/DD/YYYY,
// "05 Jan 2026", "5-January-2026" etc. Ambiguous numeric dates are read as
// DD/MM/YYYY, which is what SG/CN/EU statements use; a US statement in
// MM/DD/YYYY needs the dayFirst flag turned off.
export function parseDateFlexible(raw, dayFirst = true) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10);
    if (!dayFirst) { const t = d; d = mo; mo = t; }
    // If the "day" slot can't be a month but the other can, the file disagrees
    // with the flag — trust the numbers rather than the flag.
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${m[3]}-${pad(mo)}-${pad(d)}`;
  }

  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})/);
  if (m) {
    const mo = MONTH_NAMES[m[2].slice(0, 3).toLowerCase()];
    if (mo) {
      const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${yr}-${pad(mo)}-${pad(m[1])}`;
    }
  }

  m = s.match(/^([A-Za-z]{3,})[\s-](\d{1,2}),?[\s-](\d{2,4})/);
  if (m) {
    const mo = MONTH_NAMES[m[1].slice(0, 3).toLowerCase()];
    if (mo) {
      const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${yr}-${pad(mo)}-${pad(m[2])}`;
    }
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return null;
}

// Handles thousands separators, currency symbols, trailing minus, CR/DR
// suffixes and accounting-style parentheses for negatives.
export function parseAmountFlexible(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/(^-)|(-$)/.test(s.trim())) neg = true;
  if (/\bDR\b/i.test(s)) neg = true;
  if (/\bCR\b/i.test(s)) neg = false;

  s = s.replace(/[^0-9.]/g, "");
  if (!s) return null;
  // Guard against strings like "1.234.567" (EU grouping) collapsing wrongly.
  const parts = s.split(".");
  if (parts.length > 2) s = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];

  const v = parseFloat(s);
  if (isNaN(v)) return null;
  return neg ? -v : v;
}

// First matching rule wins, so more specific patterns should sit earlier.
export function categorize(description, direction, rules) {
  const desc = (description || "").toLowerCase();
  for (const r of rules || []) {
    if (r.direction && r.direction !== direction) continue;
    if (r.pattern && desc.includes(String(r.pattern).toLowerCase())) return r.categoryId;
  }
  return null;
}

// Identity of a transaction for de-duplication across re-imports.
export function txnSignature(t, currency) {
  return [t.date, (t.description || "").trim().toLowerCase(), t.amount, currency || t.currency, t.direction].join("|");
}

// Turns raw spreadsheet rows + a column mapping into draft transactions.
export function rowsToDrafts(rows, mapping) {
  const out = [];
  for (const row of rows) {
    let amount = null;
    let direction = null;

    if (mapping.amountMode === "single") {
      let a = parseAmountFlexible(row[mapping.amountCol]);
      if (a !== null) {
        if (mapping.reverseSign) a = -a;
        direction = a >= 0 ? "income" : "expense";
        amount = Math.abs(a);
      }
    } else {
      const debit = parseAmountFlexible(row[mapping.debitCol]);
      const credit = parseAmountFlexible(row[mapping.creditCol]);
      if (credit !== null && Math.abs(credit) > 0) { amount = Math.abs(credit); direction = "income"; }
      else if (debit !== null && Math.abs(debit) > 0) { amount = Math.abs(debit); direction = "expense"; }
    }

    const date = parseDateFlexible(row[mapping.dateCol], mapping.dayFirst !== false);
    const description = String(row[mapping.descCol] ?? "").trim();

    if (date && description && amount !== null && amount > 0) {
      out.push({ date, description, amount, direction });
    }
  }
  return out;
}
