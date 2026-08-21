// ---------------------------------------------------------------------------
// Data model, constants and pure helpers.
// Everything here is framework-free so it can be unit-tested directly in node.
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 3;

export const CURRENCY_META = {
  SGD: { label: "新加坡元", symbol: "S$", accent: "#2F6F5E" },
  CNY: { label: "人民币", symbol: "¥", accent: "#A63D40" },
  USD: { label: "美元", symbol: "$", accent: "#35618F" },
};

const FALLBACK_ACCENTS = ["#6E5A9E", "#B08A2E", "#3D7A99", "#8C4E6B"];

export function accentFor(ccy) {
  if (CURRENCY_META[ccy]) return CURRENCY_META[ccy].accent;
  let h = 0;
  for (let i = 0; i < ccy.length; i++) h = (h * 31 + ccy.charCodeAt(i)) % FALLBACK_ACCENTS.length;
  return FALLBACK_ACCENTS[h];
}

export function symbolFor(ccy) {
  return (CURRENCY_META[ccy] && CURRENCY_META[ccy].symbol) || ccy + " ";
}

export const DEFAULT_CATEGORIES = {
  income: [
    { id: "salary", name: "工资 / 奖金", color: "#2F6F5E" },
    { id: "capital_gains", name: "资本利得（股息/已实现收益）", color: "#3D8361" },
    { id: "interest", name: "利息", color: "#5B9279" },
    { id: "other_income", name: "其他收入", color: "#8A9A8F" },
  ],
  expense: [
    { id: "mortgage", name: "房贷 / 房租", color: "#A63D40" },
    { id: "groceries", name: "餐饮 / 日常", color: "#C1502E" },
    { id: "transport", name: "交通", color: "#C17A2E" },
    { id: "utilities", name: "水电网络", color: "#B58A3D" },
    { id: "entertainment", name: "娱乐", color: "#9C6B9E" },
    { id: "shopping", name: "购物", color: "#B25C8A" },
    { id: "family_support", name: "给父母 / 亲戚", color: "#6E5A9E" },
    { id: "social_gifts", name: "人情往来（红包/礼金）", color: "#8C4E6B" },
    { id: "healthcare", name: "医疗", color: "#8A5A3D" },
    { id: "travel", name: "旅行", color: "#5B7A9E" },
    { id: "other_expense", name: "其他支出", color: "#7A7A72" },
  ],
};

export const INCOME_PALETTE = ["#2F6F5E", "#3D8361", "#5B9279", "#8A9A8F"];
export const EXPENSE_PALETTE = ["#A63D40", "#C1502E", "#C17A2E", "#9C6B9E", "#6E5A9E", "#B25C8A", "#8A5A3D", "#5B7A9E"];

// Starter keyword rules. These are only a head start — the review queue grows
// this list over time, and everything here can be edited or deleted.
const SEED_RULES = [
  // income
  { pattern: "salary", categoryId: "salary", direction: "income" },
  { pattern: "payroll", categoryId: "salary", direction: "income" },
  { pattern: "dividend", categoryId: "capital_gains", direction: "income" },
  { pattern: "interest credit", categoryId: "interest", direction: "income" },
  { pattern: "cash rebate", categoryId: "other_income", direction: "income" },
  // housing / bills
  { pattern: "mortgage", categoryId: "mortgage", direction: "expense" },
  { pattern: "home loan", categoryId: "mortgage", direction: "expense" },
  { pattern: "hdb", categoryId: "mortgage", direction: "expense" },
  { pattern: "singtel", categoryId: "utilities", direction: "expense" },
  { pattern: "starhub", categoryId: "utilities", direction: "expense" },
  { pattern: "sp services", categoryId: "utilities", direction: "expense" },
  // transport
  { pattern: "bus/mrt", categoryId: "transport", direction: "expense" },
  { pattern: "grab", categoryId: "transport", direction: "expense" },
  { pattern: "comfortdelgro", categoryId: "transport", direction: "expense" },
  // groceries / dining
  { pattern: "fairprice", categoryId: "groceries", direction: "expense" },
  { pattern: "cold storage", categoryId: "groceries", direction: "expense" },
  { pattern: "sheng siong", categoryId: "groceries", direction: "expense" },
  { pattern: "giant", categoryId: "groceries", direction: "expense" },
  { pattern: "mcdonald", categoryId: "groceries", direction: "expense" },
  { pattern: "koufu", categoryId: "groceries", direction: "expense" },
  { pattern: "kopitiam", categoryId: "groceries", direction: "expense" },
  { pattern: "food panda", categoryId: "groceries", direction: "expense" },
  { pattern: "foodpanda", categoryId: "groceries", direction: "expense" },
  { pattern: "deliveroo", categoryId: "groceries", direction: "expense" },
  { pattern: "7-eleven", categoryId: "groceries", direction: "expense" },
  // shopping
  { pattern: "taobao", categoryId: "shopping", direction: "expense" },
  { pattern: "shopee", categoryId: "shopping", direction: "expense" },
  { pattern: "lazada", categoryId: "shopping", direction: "expense" },
  { pattern: "ikea", categoryId: "shopping", direction: "expense" },
  { pattern: "watsons", categoryId: "healthcare", direction: "expense" },
  // entertainment
  { pattern: "netflix", categoryId: "entertainment", direction: "expense" },
  { pattern: "spotify", categoryId: "entertainment", direction: "expense" },
  { pattern: "gv online", categoryId: "entertainment", direction: "expense" },
  { pattern: "apple.com/bill", categoryId: "entertainment", direction: "expense" },
];

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    currencies: ["SGD", "CNY", "USD"],
    inflationRates: { SGD: 3, CNY: 2, USD: 3 },
    categories: {
      income: DEFAULT_CATEGORIES.income.map((c) => ({ ...c })),
      expense: DEFAULT_CATEGORIES.expense.map((c) => ({ ...c })),
    },
    rules: SEED_RULES.map((r) => ({ id: uid(), ...r })),
    transactions: [],
    netWorthEntries: [],
    accounts: [],
    quotes: {},
    incomeEntries: [],
    allocations: [],
    lastAccount: "",
  };
}

// Merge a loaded blob onto a fresh skeleton so older/partial files still open.
export function normalizeState(parsed) {
  const base = freshState();
  if (!parsed || typeof parsed !== "object") return base;
  return {
    ...base,
    ...parsed,
    schemaVersion: SCHEMA_VERSION,
    currencies: Array.isArray(parsed.currencies) && parsed.currencies.length ? parsed.currencies : base.currencies,
    inflationRates: { ...base.inflationRates, ...(parsed.inflationRates || {}) },
    categories: {
      income: Array.isArray(parsed.categories?.income) ? parsed.categories.income : base.categories.income,
      expense: Array.isArray(parsed.categories?.expense) ? parsed.categories.expense : base.categories.expense,
    },
    rules: Array.isArray(parsed.rules) ? parsed.rules : base.rules,
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    netWorthEntries: Array.isArray(parsed.netWorthEntries) ? parsed.netWorthEntries : [],
    // v2 added standing positions (accounts) and their last-known prices.
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map(normalizeAccount) : [],
    quotes: parsed.quotes && typeof parsed.quotes === "object" ? parsed.quotes : {},
    // v3 added the monthly clearing sheet: income the statement misses, and
    // where each month's surplus was placed.
    incomeEntries: Array.isArray(parsed.incomeEntries) ? parsed.incomeEntries : [],
    allocations: Array.isArray(parsed.allocations) ? parsed.allocations : [],
  };
}

// Accounts are edited through free-form inputs, so an older or hand-edited
// file can carry a string where a number belongs. Coercing here keeps every
// downstream calculation from having to defend itself.
function normalizeAccount(acc) {
  if (!acc || typeof acc !== "object") return acc;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const out = { ...acc };
  for (const k of ["balance", "principal", "annualRate", "termMonths", "accrualDay", "monthlyPayment", "cash", "value"]) {
    if (k in out) out[k] = n(out[k]);
  }
  if (Array.isArray(out.holdings)) {
    out.holdings = out.holdings.map(({ costBasis, ...h }) => ({ ...h, quantity: n(h.quantity) }));
  }
  // Brokerage cash used to be one number against the account's own currency.
  if (out.kind === "brokerage" && !out.cashByCurrency) {
    out.cashByCurrency = n(out.cash) ? { [out.currency]: n(out.cash) } : {};
    delete out.cash;
  }
  if (out.cashByCurrency && typeof out.cashByCurrency === "object") {
    out.cashByCurrency = Object.fromEntries(
      Object.entries(out.cashByCurrency).map(([k, v]) => [k, n(v)])
    );
  }
  if (Array.isArray(out.entries)) {
    out.entries = out.entries.map((e) => ({ ...e, amount: n(e.amount), rate: n(e.rate) }));
  }
  if (out.balances && typeof out.balances === "object") {
    out.balances = Object.fromEntries(Object.entries(out.balances).map(([k, v]) => [k, n(v)]));
  }
  return out;
}

export function formatMoney(amount, currency, opts = {}) {
  const sym = symbolFor(currency);
  const v = Number(amount) || 0;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = opts.forceSign && v > 0 ? "+" : v < 0 ? "-" : "";
  return `${sign}${sym}${abs}`;
}

export function monthKey(dateISO) { return dateISO ? dateISO.slice(0, 7) : ""; }
export function yearOf(dateISO) { return dateISO ? dateISO.slice(0, 4) : ""; }

export function catName(categories, direction, id) {
  if (!id) return "待确认";
  const found = (categories[direction] || []).find((c) => c.id === id);
  return found ? found.name : "待确认";
}

export function catColor(categories, direction, id) {
  const found = (categories[direction] || []).find((c) => c.id === id);
  return found ? found.color : "#C08A2E";
}

export function validCategoryId(categories, direction, id) {
  if (!id) return false;
  return (categories[direction] || []).some((c) => c.id === id);
}

// Converts a historical nominal amount into today's purchasing power using a
// flat annual inflation rate. Deliberately simple — it's a sanity check, not
// an economic model.
export function realValue(nominal, dateISO, currency, inflationRates, refDateISO) {
  const rate = ((inflationRates && inflationRates[currency]) || 0) / 100;
  if (!dateISO) return nominal;
  const years = (new Date(refDateISO) - new Date(dateISO)) / (1000 * 60 * 60 * 24 * 365.25);
  if (!isFinite(years) || years <= 0) return nominal;
  return nominal * Math.pow(1 + rate, years);
}
