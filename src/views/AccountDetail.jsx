import React, { useState } from "react";
import { Trash2, Plus, RefreshCw, Pencil, Check } from "lucide-react";
import { Field, Note } from "../components/ui.jsx";
import { formatMoney, accentFor } from "../lib/model.js";
import {
  valueFixedDeposit, loanTimeline, loanPayoff, cpfInterest, valueBrokerage,
  CPF_ACCOUNTS, LOAN_ENTRY_LABELS, newHolding, newLoanEntry, normalizeSymbol,
  todayISO, addMonthsISO,
} from "../lib/assets.js";
import { manualQuote } from "../lib/quotes.js";

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
  const annual = (Number(acc.balance) || 0) * (Number(acc.annualRate) || 0) / 100;
  return (
    <div className="grid-4">
      <Metric label="余额" value={formatMoney(acc.balance, acc.currency)} />
      <Metric label="年利率" value={pct(acc.annualRate)} />
      <Metric label="一年利息（估）" value={formatMoney(annual, acc.currency)} tone="pos" />
      <Metric label="更新于" value={acc.asOf || "—"} />
    </div>
  );
}

function FixedDepositDetail({ acc, asOf }) {
  const v = valueFixedDeposit(acc, asOf);
  const progress = v.termDays ? Math.min(100, Math.max(0, (v.elapsedDays / v.termDays) * 100)) : 0;
  return (
    <div className="stack-sm">
      <div className="grid-4">
        <Metric label="本金" value={formatMoney(v.principal, acc.currency)} />
        <Metric label="已计利息" value={formatMoney(v.interest, acc.currency)} tone="pos"
          sub={`${acc.compounding === "monthly" ? "按月复利" : "单利"} · ${pct(acc.annualRate)}`} />
        <Metric label="当前价值" value={formatMoney(v.value, acc.currency)} />
        <Metric
          label={v.matured ? "已到期" : "到期日"}
          value={v.maturityDate || "—"}
          tone={v.matured ? "warn" : ""}
          sub={v.matured ? "利息已停止计算" : v.daysToMaturity !== null ? `还有 ${v.daysToMaturity} 天` : ""}
        />
      </div>
      {v.termDays > 0 && (
        <>
          <div style={{ height: 6, borderRadius: 999, background: "var(--surface-alt)", overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: accentFor(acc.currency) }} />
          </div>
          <div className="tiny faint">
            存期 {acc.termMonths || Math.round(v.termDays / 30)} 个月 · 已过 {v.elapsedDays} 天 ·
            到期本息合计 {formatMoney(v.maturityValue, acc.currency)}
          </div>
        </>
      )}
      {v.matured && (
        <Note tone="warn">这笔定期已经到期了。转存之后，把开始日期和期限改成新的一期，或者新建一笔。</Note>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BrokerageDetail({ acc, quotes, patch, setQuote, currencies }) {
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
      <div className="grid-form">
        <Field label={`现金（${acc.currency}）`}>
          <input className="input" type="number" step="0.01" value={acc.cash ?? 0}
            onChange={(e) => patch({ cash: e.target.value })} />
        </Field>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>代码</th><th className="ta-r">数量</th><th>币种</th>
              <th className="ta-r">现价</th><th className="ta-r">市值</th>
              <th className="ta-r">成本价</th><th className="ta-r">盈亏</th><th></th>
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
                        <button className="btn-icon" title="保存价格" onClick={commitPrice}><Check size={13} /></button>
                      </span>
                    ) : (
                      <span className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <span className="num">{row.price === null || row.price === undefined ? "—" : formatMoney(row.price, row.currency)}</span>
                        <button className="btn-icon" title="手动改价"
                          onClick={() => setPriceEdit({ symbol: row.symbol, value: row.price ?? "" })}>
                          <Pencil size={12} />
                        </button>
                      </span>
                    )}
                    {row.quoteAsOf && (
                      <div className="tiny faint nowrap">
                        {String(row.quoteAsOf).slice(0, 10)} · {row.quoteSource === "manual" ? "手填" : row.quoteSource}
                        {row.stale ? " · 偏旧" : ""}
                      </div>
                    )}
                  </td>
                  <td className="ta-r num nowrap">{row.value === null || row.value === undefined ? "—" : formatMoney(row.value, row.currency)}</td>
                  <td className="ta-r">
                    <input className="input num ta-r" style={{ minWidth: 78 }} type="number" step="any"
                      value={h.costBasis} onChange={(e) => setHolding(h.id, "costBasis", e.target.value)} />
                  </td>
                  <td className={`ta-r num nowrap ${row.gain > 0 ? "pos" : row.gain < 0 ? "neg" : ""}`}>
                    {row.gain === null || row.gain === undefined ? "—" : (
                      <>
                        {formatMoney(row.gain, row.currency, { forceSign: true })}
                        <div className="tiny">{row.gainPct === null ? "" : `${row.gainPct > 0 ? "+" : ""}${row.gainPct.toFixed(1)}%`}</div>
                      </>
                    )}
                  </td>
                  <td><button className="btn-icon" onClick={() => removeHolding(h.id)}><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
            {!(acc.holdings || []).length && (
              <tr><td colSpan={8} className="faint small" style={{ textAlign: "center", padding: 18 }}>还没有持仓</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row-between">
        <button className="btn btn-sm" onClick={addHolding}><Plus size={13} />添加持仓</button>
        <div className="row">
          {Object.entries(v.byCurrency).map(([c, amt]) => (
            <span key={c} className="num small">
              <span className="faint">{c} 合计 </span>{formatMoney(amt, c)}
            </span>
          ))}
        </div>
      </div>

      {v.missing.length > 0 && (
        <Note tone="warn">
          还没有 {v.missing.join("、")} 的价格，这几笔暂时不计入合计。点上面的「刷新行情」，或用铅笔图标手填一个价。
        </Note>
      )}
      {v.rows.some((r) => r.currencyMismatch) && (
        <Note tone="warn">行情源返回的币种和你填的不一致，已按行情源的币种计算。</Note>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CpfDetail({ acc, patch, asOf }) {
  const info = cpfInterest(acc, asOf);
  const setBalance = (key, value) => patch({ balances: { ...(acc.balances || {}), [key]: value } });
  return (
    <div className="stack-sm">
      <div className="grid-form">
        {CPF_ACCOUNTS.map(({ key, label }) => (
          <Field key={key} label={label}>
            <input className="input num" type="number" step="0.01" value={acc.balances?.[key] ?? 0}
              onChange={(e) => setBalance(key, e.target.value)} />
          </Field>
        ))}
      </div>
      <div className="grid-form">
        <Field label="出生年份（用于额外利息档位）">
          <input className="input" type="number" placeholder="1990" value={acc.birthYear ?? ""}
            onChange={(e) => patch({ birthYear: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </Field>
        {CPF_ACCOUNTS.map(({ key, label }) => (
          <Field key={key} label={`${label.split(" ")[1]} 年利率 %`}>
            <input className="input num" type="number" step="0.01" value={acc.rates?.[key] ?? 0}
              onChange={(e) => patch({ rates: { ...(acc.rates || {}), [key]: parseFloat(e.target.value) || 0 } })} />
          </Field>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={acc.extraInterest !== false}
          onChange={(e) => patch({ extraInterest: e.target.checked })} />
        计入额外利息（55 岁以下：首 6 万 +1%；55 岁及以上：首 3 万 +2%、次 3 万 +1%；其中 OA 最多算 2 万）
      </label>

      <div className="grid-4">
        <Metric label="合计余额" value={formatMoney(info.total, acc.currency)} />
        <Metric label="基础利息（年）" value={formatMoney(info.baseTotal, acc.currency)} tone="pos" />
        <Metric label="额外利息（年）" value={formatMoney(info.extraTotal, acc.currency)} tone="pos" />
        <Metric label="预计年利息" value={formatMoney(info.annual, acc.currency)} tone="pos"
          sub={info.age === null ? "填了出生年份才能判断档位" : `按 ${info.age} 岁${info.senior ? "（55+）" : ""}计算`} />
      </div>

      <Note>
        CPF 没有面向个人的公开 API —— 余额只在 Singpass Myinfo 里，而那是要企业签约、按次收费的服务器端接口，
        纯前端的页面拿不到也存不住那种凭证。所以余额需要你从 CPF App 抄进来，能自动算的是利息部分。
        这里给的是按当前余额估的一年利息；CPF 实际按每月最低余额计息、每年 1 月 1 日入账，真实数字会略有出入。
      </Note>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LoanDetail({ acc, patch, asOf, currency }) {
  const [showAll, setShowAll] = useState(false);
  const [entry, setEntry] = useState(() => newLoanEntry("payment"));
  const t = loanTimeline(acc, asOf);
  const payoff = loanPayoff(t.balance, t.rate, acc.monthlyPayment);

  function addEntry() {
    const amount = parseFloat(entry.amount);
    const isRate = entry.type === "rate_change";
    if (!isRate && !(amount > 0)) return;
    patch({
      entries: [...(acc.entries || []), {
        ...entry,
        amount: isRate ? 0 : amount,
        rate: isRate ? parseFloat(entry.rate) || 0 : 0,
      }],
    });
    setEntry(newLoanEntry(entry.type));
  }
  const removeEntry = (id) => patch({ entries: (acc.entries || []).filter((e) => e.id !== id) });

  const rows = showAll ? t.rows.slice().reverse() : t.rows.slice(-12).reverse();

  return (
    <div className="stack-sm">
      <div className="grid-4">
        <Metric label="当前欠款" value={formatMoney(t.balance, currency)} tone="neg"
          sub={`已计息 ${t.monthsAccrued} 个月 · 当前利率 ${pct(t.rate)}`} />
        <Metric label="累计利息" value={formatMoney(t.totalInterest, currency)} tone="neg" />
        <Metric label="累计还款" value={formatMoney(t.totalPaid, currency)}
          sub={`其中本金 ${formatMoney(Math.max(0, t.principalRepaid), currency)}`} />
        <Metric label={`下次计息（${t.nextAccrualDate || "—"}）`}
          value={formatMoney(t.nextAccrualInterest, currency)} tone="neg"
          sub={`每月 ${acc.accrualDay || 1} 号自动加一个月利息`} />
      </div>

      {t.balance > 0 && (Number(acc.monthlyPayment) || 0) > 0 && (
        payoff.enough ? (
          <div className="tiny faint">
            按当前月供 {formatMoney(acc.monthlyPayment, currency)} 继续还，还需 {payoff.months} 个月
            （约 {(payoff.months / 12).toFixed(1)} 年，到 {addMonthsISO(asOf, payoff.months)}），
            期间还要付利息 {formatMoney(payoff.totalInterest, currency)}。
          </div>
        ) : (
          <Note tone="warn">月供还不够覆盖每月利息，这样下去余额只会越滚越大。</Note>
        )
      )}

      <div className="card-title" style={{ marginTop: 6 }}>记一笔</div>
      <div className="grid-form">
        <Field label="类型">
          <select className="select" value={entry.type} onChange={(e) => setEntry({ ...entry, type: e.target.value })}>
            <option value="payment">还款</option>
            <option value="drawdown">追加提款</option>
            <option value="rate_change">利率变更</option>
            <option value="set_balance">余额校准</option>
          </select>
        </Field>
        <Field label="日期">
          <input className="input" type="date" value={entry.date}
            onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
        </Field>
        {entry.type === "rate_change" ? (
          <Field label="新年利率 %">
            <input className="input num" type="number" step="0.01" value={entry.rate}
              onChange={(e) => setEntry({ ...entry, rate: e.target.value })} />
          </Field>
        ) : (
          <Field label={entry.type === "set_balance" ? "校准后的余额" : "金额"}>
            <input className="input num" type="number" step="0.01" value={entry.amount || ""}
              onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
          </Field>
        )}
        <Field label="备注">
          <input className="input" value={entry.note} placeholder="可留空"
            onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
        </Field>
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={addEntry}><Plus size={13} />记入</button>
        <span className="tiny faint">利息不用记 —— 每月 {acc.accrualDay || 1} 号的利息是按利率自动算出来的。</span>
      </div>

      {t.rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>日期</th><th>项目</th><th className="ta-r">金额</th><th className="ta-r">之后余额</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || `${r.type}-${r.date}-${i}`}>
                  <td className="num nowrap">{r.date}</td>
                  <td className="nowrap">
                    {LOAN_ENTRY_LABELS[r.type] || r.type}
                    {r.type === "rate_change" ? ` → ${pct(r.rate)}` : ""}
                    {r.note ? <span className="faint small"> · {r.note}</span> : null}
                    {r.short ? <span className="warn small"> · 超出余额部分未计入</span> : null}
                  </td>
                  <td className={`ta-r num nowrap ${r.type === "interest" || r.type === "drawdown" ? "neg" : r.type === "payment" ? "pos" : ""}`}>
                    {r.type === "rate_change" ? "—" : formatMoney(r.amount, currency)}
                  </td>
                  <td className="ta-r num nowrap">{formatMoney(r.balance, currency)}</td>
                  <td>
                    {r.type !== "interest" && (
                      <button className="btn-icon" onClick={() => removeEntry(r.id)}><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {t.rows.length > 12 && (
        <button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>
          <RefreshCw size={12} />{showAll ? "只看最近 12 条" : `显示全部 ${t.rows.length} 条`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AccountDetail({ account, quotes, patch, setQuote, currencies, asOf = todayISO() }) {
  switch (account.kind) {
    case "cash":
      return <CashDetail acc={account} />;
    case "fixed_deposit":
      return <FixedDepositDetail acc={account} asOf={asOf} />;
    case "brokerage":
      return <BrokerageDetail acc={account} quotes={quotes} patch={patch} setQuote={setQuote} currencies={currencies} />;
    case "cpf":
      return <CpfDetail acc={account} patch={patch} asOf={asOf} />;
    case "mortgage":
    case "loan":
      return <LoanDetail acc={account} patch={patch} asOf={asOf} currency={account.currency} />;
    default:
      return null;
  }
}
