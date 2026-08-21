import React, { useState } from "react";
import { Trash2, Plus, Pencil, Check } from "lucide-react";
import { Field, Note } from "../components/ui.jsx";
import { formatMoney, accentFor } from "../lib/model.js";
import {
  valueFixedDeposit, cpfInterest, valueBrokerage,
  CPF_ACCOUNTS, newHolding, normalizeSymbol, todayISO,
} from "../lib/assets.js";
import { manualQuote } from "../lib/quotes.js";
import { useLang } from "../lib/i18n.js";
import LoanLedger from "./LoanLedger.jsx";

const pct = (v) => `${(Number(v) || 0).toFixed(2)}%`;

function Metric({ label, value, tone, sub }) {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className={`metric-value num ${tone || ""}`}>{value}</div>
      {sub ? <div className="tiny faint">{sub}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CashDetail({ acc }) {
  const { t } = useLang();
  const annual = (Number(acc.balance) || 0) * (Number(acc.annualRate) || 0) / 100;
  return (
    <div className="grid-4">
      <Metric label={t("余额")} value={formatMoney(acc.balance, acc.currency)} />
      <Metric label={t("年利率")} value={pct(acc.annualRate)} />
      <Metric label={t("一年利息（估）")} value={formatMoney(annual, acc.currency)} tone="pos" />
      <Metric label={t("更新于")} value={acc.asOf || "—"} />
    </div>
  );
}

function FixedDepositDetail({ acc, asOf }) {
  const { t } = useLang();
  const v = valueFixedDeposit(acc, asOf);
  const progress = v.termDays ? Math.min(100, Math.max(0, (v.elapsedDays / v.termDays) * 100)) : 0;
  return (
    <div className="stack-sm">
      <div className="grid-4">
        <Metric label={t("本金")} value={formatMoney(v.principal, acc.currency)} />
        <Metric label={t("已计利息")} value={formatMoney(v.interest, acc.currency)} tone="pos"
          sub={`${acc.compounding === "monthly" ? t("按月复利") : t("单利")} · ${pct(acc.annualRate)}`} />
        <Metric label={t("当前价值")} value={formatMoney(v.value, acc.currency)} />
        <Metric
          label={v.matured ? t("已到期") : t("到期日")}
          value={v.maturityDate || "—"}
          tone={v.matured ? "warn" : ""}
          sub={v.matured ? t("利息已停止计算") : v.daysToMaturity !== null ? t("还有 {days} 天", { days: v.daysToMaturity }) : ""}
        />
      </div>
      {v.termDays > 0 && (
        <>
          <div style={{ height: 6, borderRadius: 999, background: "var(--surface-alt)", overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: accentFor(acc.currency) }} />
          </div>
          <div className="tiny faint">
            {t("存期 {months} 个月 · 已过 {elapsed} 天 · 到期本息合计 {maturityValue}", {
              months: acc.termMonths || Math.round(v.termDays / 30),
              elapsed: v.elapsedDays,
              maturityValue: formatMoney(v.maturityValue, acc.currency),
            })}
          </div>
        </>
      )}
      {v.matured && (
        <Note tone="warn">{t("这笔定期已经到期了。转存之后，把开始日期和期限改成新的一期，或者新建一笔。")}</Note>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CashByCurrency({ acc, patch, currencies }) {
  const { t } = useLang();
  const cash = acc.cashByCurrency || {};
  const shown = Object.keys(cash);
  const addable = currencies.filter((c) => !shown.includes(c));

  const setAmount = (ccy, value) => patch({ cashByCurrency: { ...cash, [ccy]: value } });
  const remove = (ccy) => {
    const next = { ...cash };
    delete next[ccy];
    patch({ cashByCurrency: next });
  };
  const add = (ccy) => patch({ cashByCurrency: { ...cash, [ccy]: 0 } });

  return (
    <div className="stack-sm">
      <div className="field-label">{t("闲散资金（各币种分开记，不换算）")}</div>
      {shown.length === 0 && <div className="tiny faint">{t("还没记任何现金。")}</div>}
      {shown.map((ccy) => (
        <div className="row" key={ccy} style={{ flexWrap: "nowrap", maxWidth: 320 }}>
          <span className="num" style={{ width: 46, color: accentFor(ccy) }}>{ccy}</span>
          <input className="input num" type="number" step="0.01" value={cash[ccy] ?? 0}
            onChange={(e) => setAmount(ccy, e.target.value)} />
          <button className="btn-icon" title={t("删除 {ccy}", { ccy })} onClick={() => remove(ccy)}><Trash2 size={13} /></button>
        </div>
      ))}
      {addable.length > 0 && (
        <div className="row">
          {addable.map((c) => (
            <button key={c} className="btn btn-sm" onClick={() => add(c)}><Plus size={12} />{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function BrokerageDetail({ acc, quotes, patch, setQuote, currencies }) {
  const { t } = useLang();
  const [priceEdit, setPriceEdit] = useState(null); // { symbol, value }
  const v = valueBrokerage(acc, quotes);

  const setHolding = (id, key, value) =>
    patch({ holdings: (acc.holdings || []).map((h) => (h.id === id ? { ...h, [key]: value } : h)) });
  const addHolding = () => patch({ holdings: [...(acc.holdings || []), newHolding(acc.currency)] });
  const removeHolding = (id) => patch({ holdings: (acc.holdings || []).filter((h) => h.id !== id) });

  function commitPrice() {
    if (!priceEdit || !priceEdit.symbol) { setPriceEdit(null); return; }
    const price = parseFloat(priceEdit.value);
    if (Number.isFinite(price)) {
      const holding = (acc.holdings || []).find((h) => normalizeSymbol(h.symbol) === priceEdit.symbol);
      setQuote(priceEdit.symbol, manualQuote(price, holding?.currency || acc.currency));
    }
    setPriceEdit(null);
  }

  return (
    <div className="stack-sm">
      <CashByCurrency acc={acc} patch={patch} currencies={currencies} />

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("代码")}</th><th className="ta-r">{t("数量")}</th><th>{t("币种")}</th>
              <th className="ta-r">{t("现价")}</th><th className="ta-r">{t("市值")}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(acc.holdings || []).map((h) => {
              const row = v.rows.find((r) => r.id === h.id) || {};
              const editing = priceEdit && priceEdit.symbol === row.symbol && row.symbol;
              return (
                <tr key={h.id}>
                  <td>
                    <input className="input" style={{ minWidth: 90 }} placeholder="QQQ"
                      value={h.symbol} onChange={(e) => setHolding(h.id, "symbol", e.target.value.toUpperCase())} />
                  </td>
                  <td className="ta-r">
                    <input className="input num ta-r" style={{ minWidth: 78 }} type="number" step="any"
                      value={h.quantity} onChange={(e) => setHolding(h.id, "quantity", e.target.value)} />
                  </td>
                  <td>
                    <select className="select" style={{ minWidth: 78 }} value={h.currency}
                      onChange={(e) => setHolding(h.id, "currency", e.target.value)}>
                      {Array.from(new Set([...currencies, h.currency, "USD"])).filter(Boolean).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="ta-r nowrap">
                    {editing ? (
                      <span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <input className="input num ta-r" style={{ width: 84 }} type="number" step="any" autoFocus
                          value={priceEdit.value}
                          onChange={(e) => setPriceEdit({ ...priceEdit, value: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && commitPrice()} />
                        <button className="btn-icon" title={t("保存价格")} onClick={commitPrice}><Check size={13} /></button>
                      </span>
                    ) : (
                      <span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <span className="num">{row.price === null || row.price === undefined ? "—" : formatMoney(row.price, row.currency)}</span>
                        <button className="btn-icon" title={t("手动改价")}
                          onClick={() => setPriceEdit({ symbol: row.symbol, value: row.price ?? "" })}>
                          <Pencil size={12} />
                        </button>
                      </span>
                    )}
                    {row.quoteAsOf && (
                      <div className="tiny faint nowrap">
                        {String(row.quoteAsOf).slice(0, 10)} · {row.quoteSource === "manual" ? t("手填") : row.quoteSource}
                        {row.stale ? ` · ${t("偏旧")}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="ta-r num nowrap">{row.value === null || row.value === undefined ? "—" : formatMoney(row.value, row.currency)}</td>
                  <td><button className="btn-icon" onClick={() => removeHolding(h.id)}><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
            {!(acc.holdings || []).length && (
              <tr><td colSpan={6} className="faint small" style={{ textAlign: "center", padding: 18 }}>{t("还没有持仓")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row-between">
        <button className="btn btn-sm" onClick={addHolding}><Plus size={13} />{t("添加持仓")}</button>
        <div className="row">
          {Object.entries(v.byCurrency).map(([c, amt]) => (
            <span key={c} className="num small">
              <span className="faint">{t("{c} 合计 ", { c })}</span>{formatMoney(amt, c)}
            </span>
          ))}
        </div>
      </div>

      {v.missing.length > 0 && (
        <Note tone="warn">
          {t("还没有 {list} 的价格，这几笔暂时不计入合计。点上面的「刷新行情」，或用铅笔图标手填一个价。", { list: v.missing.join("、") })}
        </Note>
      )}
      {v.rows.some((r) => r.currencyMismatch) && (
        <Note tone="warn">{t("行情源返回的币种和你填的不一致，已按行情源的币种计算。")}</Note>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CpfDetail({ acc, patch, asOf }) {
  const { t } = useLang();
  const info = cpfInterest(acc, asOf);
  const setBalance = (key, value) => patch({ balances: { ...(acc.balances || {}), [key]: value } });
  return (
    <div className="stack-sm">
      <div className="grid-form">
        {CPF_ACCOUNTS.map(({ key, label }) => (
          <Field key={key} label={t(label)}>
            <input className="input num" type="number" step="0.01" value={acc.balances?.[key] ?? 0}
              onChange={(e) => setBalance(key, e.target.value)} />
          </Field>
        ))}
      </div>
      <div className="grid-form">
        <Field label={t("出生年份（用于额外利息档位）")}>
          <input className="input" type="number" placeholder="1990" value={acc.birthYear ?? ""}
            onChange={(e) => patch({ birthYear: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </Field>
        {CPF_ACCOUNTS.map(({ key, label }) => (
          <Field key={key} label={t("{code} 年利率 %", { code: label.split(" ")[1] })}>
            <input className="input num" type="number" step="0.01" value={acc.rates?.[key] ?? 0}
              onChange={(e) => patch({ rates: { ...(acc.rates || {}), [key]: parseFloat(e.target.value) || 0 } })} />
          </Field>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={acc.extraInterest !== false}
          onChange={(e) => patch({ extraInterest: e.target.checked })} />
        {t("计入额外利息（55 岁以下：首 6 万 +1%；55 岁及以上：首 3 万 +2%、次 3 万 +1%；其中 OA 最多算 2 万）")}
      </label>

      <div className="grid-4">
        <Metric label={t("合计余额")} value={formatMoney(info.total, acc.currency)} />
        <Metric label={t("基础利息（年）")} value={formatMoney(info.baseTotal, acc.currency)} tone="pos" />
        <Metric label={t("额外利息（年）")} value={formatMoney(info.extraTotal, acc.currency)} tone="pos" />
        <Metric label={t("预计年利息")} value={formatMoney(info.annual, acc.currency)} tone="pos"
          sub={info.age === null
            ? t("填了出生年份才能判断档位")
            : t("按 {age} 岁{senior}计算", { age: info.age, senior: info.senior ? t("（55+）") : "" })}
        />
      </div>

      <Note>
        {t("CPF 没有面向个人的公开 API —— 余额只在 Singpass Myinfo 里，而那是要企业签约、按次收费的服务器端接口， 纯前端的页面拿不到也存不住那种凭证。所以余额需要你从 CPF App 抄进来，能自动算的是利息部分。 这里给的是按当前余额估的一年利息；CPF 实际按每月最低余额计息、每年 1 月 1 日入账，真实数字会略有出入。")}
      </Note>
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function PhysicalDetail({ acc, patch }) {
  const { t } = useLang();
  return (
    <div className="stack-sm">
      <Field label={t("说明")}>
        <textarea className="input" rows={3}
          placeholder={acc.kind === "vehicle" ? t("例如：本田 CR-V，COE 2032 年到期") : t("例如：Punggol 四房，2024 年入伙")}
          value={acc.description || ""} onChange={(e) => patch({ description: e.target.value })} />
      </Field>
      <div className="tiny faint">
        {t("这里只记名字和说明，不记金额 —— 房子和车的「现值」本来就只是个估计， 一旦写进净资产合计，过几个月就会变成一个没人记得更新、却看起来很确定的数字。 真要估值的时候，用「其他资产」记一笔就好。")}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AccountDetail({ account, quotes, patch, setQuote, currencies, accounts = [], asOf = todayISO() }) {
  switch (account.kind) {
    case "cash":
      return <CashDetail acc={account} />;
    case "fixed_deposit":
      return <FixedDepositDetail acc={account} asOf={asOf} />;
    case "brokerage":
      return <BrokerageDetail acc={account} quotes={quotes} patch={patch} setQuote={setQuote} currencies={currencies} />;
    case "cpf":
      return <CpfDetail acc={account} patch={patch} asOf={asOf} />;
    case "property":
    case "vehicle":
      return <PhysicalDetail acc={account} patch={patch} />;
    case "mortgage":
    case "loan":
      return <LoanLedger account={account} patch={patch} asOf={asOf} />;
    default:
      return null;
  }
}
