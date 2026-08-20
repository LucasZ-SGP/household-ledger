import React, { useState, useMemo } from "react";
import { Trash2, Plus, Pencil, X, FileUp, Check, AlertTriangle } from "lucide-react";
import { Card, Field, Note } from "../components/ui.jsx";
import { formatMoney } from "../lib/model.js";
import {
  loanTimeline, loanPayoff, loanYearSummary, estimateRebate, entryMeta,
  MANUAL_ENTRY_TYPES, LOAN_ENTRY_TYPES, newLoanEntry, addMonthsISO, todayISO, round2,
} from "../lib/assets.js";
import {
  parseLoanStatement, reconcileLoanStatement, verifyStatementInterest,
  mergeLoanEntries, suggestedLoanSettings,
} from "../lib/loanStatement.js";

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

function ImportPanel({ acc, patch, onClose }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [applySettings, setApplySettings] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [done, setDone] = useState(null);

  function analyse() {
    const p = parseLoanStatement(text);
    // Reconcile from the statement's own opening balance when it prints one;
    // otherwise fall back to where our replay already stands on that date.
    const recon = reconcileLoanStatement(p);
    const interest = verifyStatementInterest(p);
    setParsed({ ...p, recon, interest });
    setAcknowledged(false);
    setDone(null);
  }

  function doImport() {
    const { entries, added, skipped } = mergeLoanEntries(acc.entries || [], parsed.rows);
    const settings = applySettings ? suggestedLoanSettings(parsed) : {};
    patch({ ...settings, entries });
    setDone({ added, skipped });
    setText("");
    setParsed(null);
  }

  const recon = parsed?.recon;
  const blocked = parsed && recon && !recon.ok && !acknowledged;

  return (
    <Card className="stack-sm">
      <div className="row-between">
        <div className="card-title" style={{ margin: 0 }}>导入对账单</div>
        <button className="btn-icon" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="tiny faint">
        把银行的 Statement of Account 里的表格整段复制粘贴进来（日期 / 代码 / 金额三列）。
        认识 BAL-BF、RES、IP-2.60、AXS-L、INT-R、CPF、CPF-A、CPF-L、AXS-I、BAL-CF 这些代码。
        导入前会用对账单自己打印的期末余额校验一遍，对不上会告诉你差多少。
      </div>
      <textarea
        className="input" rows={6} placeholder={"01 Jan 2026\tBAL-BF\t300,000.00\n01 Jan 2026\tIP-2.60\t650.00\n01 Jan 2026\tAXS-L\t-5,000.00"}
        value={text} onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={analyse} disabled={!text.trim()}>
          <FileUp size={13} />解析
        </button>
        {parsed && <button className="btn btn-sm" onClick={() => { setParsed(null); setText(""); }}>重新粘贴</button>}
      </div>

      {done && (
        <Note>导入完成：新增 {done.added} 条记录，跳过 {done.skipped} 条重复。</Note>
      )}

      {parsed && (
        <>
          <div className="tiny">
            解析出 <b>{parsed.rows.length}</b> 条记录
            {parsed.rate ? ` · 利率 ${pct(parsed.rate)}` : ""}
            {parsed.opening ? ` · 期初 ${formatMoney(parsed.opening.amount, acc.currency)}（${parsed.opening.date}）` : ""}
            {parsed.closing ? ` · 期末 ${formatMoney(parsed.closing.amount, acc.currency)}（${parsed.closing.date}）` : ""}
          </div>
          {recon && <Note tone={recon.ok ? "info" : "error"}>{recon.message}</Note>}
          {parsed.interest.checked > 0 && (
            <div className="tiny faint">
              利息复算：{parsed.interest.matched}/{parsed.interest.checked} 条与「余额 × 利率 ÷ 12」一致
              {parsed.interest.mismatches.length > 0 && (
                <> —— 对不上的：{parsed.interest.mismatches.slice(0, 3).map((m) => `${m.date} 打印 ${m.stated.toFixed(2)} / 算出 ${m.expected.toFixed(2)}`).join("；")}</>
              )}
            </div>
          )}
          {parsed.unknown.length > 0 && (
            <Note tone="warn">
              有 {parsed.unknown.length} 行没认出来，不会被导入：
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {parsed.unknown.slice(0, 5).map((u, i) => <li key={i} className="tiny">第 {u.line} 行 · {u.reason} · <span className="mono-inline">{u.text.slice(0, 60)}</span></li>)}
              </ul>
            </Note>
          )}
          {parsed.signConflicts.length > 0 && (
            <Note tone="warn">
              有 {parsed.signConflicts.length} 条记录的正负号和它的代码含义不一致（例如本该是还款却是正数），导入后余额可能对不上。
            </Note>
          )}
          {Object.keys(suggestedLoanSettings(parsed)).length > 0 && (
            <label className="check tiny">
              <input type="checkbox" checked={applySettings} onChange={(e) => setApplySettings(e.target.checked)} />
              同时把账户设置改成对账单里的值（
              {Object.entries(suggestedLoanSettings(parsed)).map(([k, v]) => `${k}=${v}`).join("，")}）
            </label>
          )}
          {blocked && (
            <label className="check tiny">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              我知道对不上，仍要导入
            </label>
          )}
          <div className="row">
            <button className="btn btn-primary" onClick={doImport} disabled={blocked || !parsed.rows.length}>
              <Check size={13} />确认导入 {parsed.rows.length} 条
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function EntryForm({ acc, editing, timeline, onSubmit, onCancel }) {
  // No id: whether this is an edit is decided by the `editing` prop, never by
  // whatever the blank factory happened to stamp on the draft.
  const blank = () => ({ ...newLoanEntry("prepayment"), id: null, withRebate: true });
  const [f, setF] = useState(editing ? { ...editing, withRebate: false } : blank);
  const [touchedRebate, setTouchedRebate] = useState(false);

  React.useEffect(() => {
    setF(editing ? { ...editing, withRebate: false } : blank());
    setTouchedRebate(false);
  }, [editing?.id]);

  const isRate = f.type === "rate_change";
  const isPrepay = f.type === "prepayment";
  const rateNow = timeline.rate;
  const autoRebate = isPrepay ? estimateRebate(parseFloat(f.amount) || 0, rateNow, f.date) : 0;
  const rebateValue = touchedRebate ? f.rebate : autoRebate;

  function submit() {
    const amount = parseFloat(f.amount) || 0;
    if (!isRate && !(amount > 0)) return;
    onSubmit({
      entry: {
        id: editing ? editing.id || undefined : undefined,
        type: f.type,
        date: f.date,
        amount: isRate ? 0 : round2(amount),
        rate: isRate ? parseFloat(f.rate) || 0 : 0,
        note: f.note || "",
      },
      rebate: !editing && isPrepay && f.withRebate && Number(rebateValue) > 0
        ? { id: undefined, type: "rebate", date: f.date, amount: round2(Number(rebateValue)), rate: 0, note: "提前还款利息回扣" }
        : null,
    });
    if (!editing) { setF(blank()); setTouchedRebate(false); }
  }

  return (
    <div className="stack-sm">
      <div className="card-title" style={{ margin: 0 }}>{editing ? "修改记录" : "记一笔"}</div>
      <div className="grid-form">
        <Field label="类型">
          <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {MANUAL_ENTRY_TYPES.map((k) => (
              <option key={k} value={k}>{LOAN_ENTRY_TYPES[k].label}（{LOAN_ENTRY_TYPES[k].code}）</option>
            ))}
            {editing && editing.type === "interest" && <option value="interest">月度利息（IP）</option>}
          </select>
        </Field>
        <Field label="日期">
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        {isRate ? (
          <Field label="新年利率 %">
            <input className="input num" type="number" step="0.01" value={f.rate}
              onChange={(e) => setF({ ...f, rate: e.target.value })} />
          </Field>
        ) : (
          <Field label={f.type === "set_balance" ? "校准后的余额" : "金额"}>
            <input className="input num" type="number" step="0.01" value={f.amount || ""}
              onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
        )}
        <Field label="备注">
          <input className="input" value={f.note || ""} placeholder="可留空"
            onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>

      {!editing && isPrepay && (
        <div className="row" style={{ gap: 10 }}>
          <label className="check tiny">
            <input type="checkbox" checked={f.withRebate} onChange={(e) => setF({ ...f, withRebate: e.target.checked })} />
            同时记一笔利息回扣
          </label>
          {f.withRebate && (
            <>
              <input className="input num" style={{ width: 110 }} type="number" step="0.01"
                value={rebateValue} onChange={(e) => { setTouchedRebate(true); setF({ ...f, rebate: e.target.value }); }} />
              <span className="tiny faint">
                当月已按月初余额收过整月利息，中途还款会退回剩余天数那部分：
                还款额 × {pct(rateNow)} ÷ 12 × 当月剩余天数 ÷ 当月天数
              </span>
            </>
          )}
        </div>
      )}

      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={submit}>
          {editing ? <><Check size={13} />保存修改</> : <><Plus size={13} />记入</>}
        </button>
        {editing && <button className="btn btn-sm" onClick={onCancel}>取消</button>}
        {!editing && (
          <span className="tiny faint">
            每月 {acc.accrualDay || 1} 号的利息不用记 —— 会自动按余额 × 利率 ÷ 12 算出来。
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function LoanLedger({ account: acc, patch, asOf = todayISO() }) {
  const currency = acc.currency;
  const [year, setYear] = useState("最近");
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const t = useMemo(() => loanTimeline(acc, asOf), [acc, asOf]);
  const years = useMemo(
    () => Array.from(new Set(t.rows.map((r) => r.date.slice(0, 4)))).sort().reverse(),
    [t.rows]
  );
  const yearRows = useMemo(() => {
    if (year === "全部") return t.rows;
    if (year === "最近") return t.rows.slice(-15);
    return t.rows.filter((r) => r.date.slice(0, 4) === year);
  }, [t.rows, year]);
  const summaries = useMemo(() => loanYearSummary(t), [t]);
  const thisYear = summaries.find((s) => s.year === year);
  const payoff = loanPayoff(t.balance, t.rate, acc.monthlyPayment);

  function upsertEntry({ entry, rebate }) {
    const list = acc.entries || [];
    let next;
    if (entry.id) {
      next = list.map((e) => (e.id === entry.id ? { ...e, ...entry } : e));
    } else {
      next = [...list, { ...entry, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }];
      if (rebate) next.push({ ...rebate, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` });
    }
    patch({ entries: next });
    setEditing(null);
  }

  function removeEntry(id) {
    patch({ entries: (acc.entries || []).filter((e) => e.id !== id) });
    setConfirmDelete(null);
  }

  // Editing a generated interest row turns it into a real entry you own, so
  // you can set it to whatever the bank actually charged.
  function startEdit(row) {
    if (row.generated) {
      setEditing({ id: null, type: "interest", date: row.date, amount: row.amount, rate: row.rate, note: "", materialize: true });
    } else {
      const original = (acc.entries || []).find((e) => e.id === row.id);
      setEditing(original ? { ...original } : null);
    }
  }

  function submitEdit(payload) {
    if (editing && editing.materialize && !payload.entry.id) {
      upsertEntry({ entry: { ...payload.entry, type: "interest" }, rebate: null });
      return;
    }
    upsertEntry(payload);
  }

  return (
    <div className="stack-sm">
      <div className="grid-4">
        <Metric label="当前欠款" value={formatMoney(t.balance, currency)} tone="neg"
          sub={`利率 ${pct(t.rate)} · 已计息 ${t.monthsAccrued} 个月`} />
        <Metric label="累计利息" value={formatMoney(t.totalInterest, currency)} tone="neg"
          sub={t.totals.rebate ? `已退回回扣 ${formatMoney(t.totals.rebate, currency)}` : ""} />
        <Metric label="累计还款" value={formatMoney(t.totalPaid, currency)}
          sub={`月供 ${formatMoney(t.totals.instalment, currency)} · 提前还 ${formatMoney(t.totals.prepayment, currency)}`} />
        <Metric label={`下次计息（${t.nextAccrualDate || "—"}）`}
          value={formatMoney(t.nextAccrualInterest, currency)} tone="neg"
          sub={`每月 ${acc.accrualDay || 1} 号 · 余额 × ${pct(t.rate)} ÷ 12`} />
      </div>

      {t.balance > 0 && (Number(acc.monthlyPayment) || 0) > 0 && (
        payoff.enough ? (
          <div className="tiny faint">
            只按月供 {formatMoney(acc.monthlyPayment, currency)} 还，还需 {payoff.months} 个月
            （约 {(payoff.months / 12).toFixed(1)} 年，到 {addMonthsISO(asOf, payoff.months)}），
            期间利息 {formatMoney(payoff.totalInterest, currency)}。你平时的提前还款会把这个数字大幅拉低。
          </div>
        ) : (
          <Note tone="warn">月供还不够覆盖每月利息，这样下去余额只会越滚越大。</Note>
        )
      )}

      {importing
        ? <ImportPanel acc={acc} patch={patch} onClose={() => setImporting(false)} />
        : (
          <div className="row">
            <button className="btn btn-sm" onClick={() => setImporting(true)}><FileUp size={13} />导入对账单</button>
            <span className="tiny faint">有银行的 Statement of Account 就直接粘贴，不用一条条敲。</span>
          </div>
        )}

      <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
        <EntryForm acc={acc} editing={editing} timeline={t}
          onSubmit={submitEdit} onCancel={() => setEditing(null)} />
      </div>

      {t.rows.length > 0 && (
        <>
          <div className="row-between" style={{ marginTop: 6 }}>
            <div className="card-title" style={{ margin: 0 }}>完整记录</div>
            <div className="row">
              {["最近", "全部", ...years].map((y) => (
                <button key={y} className={`btn btn-sm ${year === y ? "btn-primary" : ""}`} onClick={() => setYear(y)}>
                  {y === "最近" ? "最近 15 条" : y === "全部" ? `全部 ${t.rows.length} 条` : `${y} 年`}
                </button>
              ))}
            </div>
          </div>

          {thisYear && (
            <div className="row tiny faint">
              <span>{thisYear.year} 年：</span>
              <span>利息 <span className="num neg">{formatMoney(thisYear.interest, currency)}</span></span>
              <span>月供 <span className="num">{formatMoney(thisYear.instalment, currency)}</span></span>
              <span>提前还款 <span className="num">{formatMoney(thisYear.prepayment, currency)}</span></span>
              <span>回扣 <span className="num pos">{formatMoney(thisYear.rebate, currency)}</span></span>
              <span>年末余额 <span className="num">{formatMoney(thisYear.closing, currency)}</span></span>
            </div>
          )}

          <div className="table-wrap" style={{ maxHeight: 460, overflowY: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>日期</th><th>代码</th><th>项目</th>
                  <th className="ta-r">金额</th><th className="ta-r">余额</th><th></th>
                </tr>
              </thead>
              <tbody>
                {yearRows.slice().reverse().map((r, i) => {
                  const meta = entryMeta(r.type);
                  return (
                    <tr key={r.id || `${r.type}-${r.date}-${i}`}>
                      <td className="num nowrap">{r.date}</td>
                      <td className="nowrap"><span className="mono-inline">{r.code}</span></td>
                      <td className="nowrap">
                        {meta.label}
                        {r.type === "rate_change" ? ` → ${pct(r.rate)}` : ""}
                        {r.generated ? <span className="tiny faint"> · 自动</span> : null}
                        {r.note ? <span className="faint small"> · {r.note}</span> : null}
                        {r.short ? <span className="warn small"> · 超出余额部分未计入</span> : null}
                      </td>
                      <td className={`ta-r num nowrap ${meta.sign > 0 ? "neg" : meta.sign < 0 ? "pos" : ""}`}>
                        {r.type === "rate_change" ? "—" : `${meta.sign > 0 ? "+" : meta.sign < 0 ? "−" : ""}${formatMoney(r.amount, currency)}`}
                      </td>
                      <td className="ta-r num nowrap">{formatMoney(r.balance, currency)}</td>
                      <td className="nowrap">
                        <button className="btn-icon" title={r.generated ? "改成手动填写的金额" : "编辑"}
                          style={{ color: "var(--ink-faint)" }} onClick={() => startEdit(r)}>
                          <Pencil size={12} />
                        </button>
                        {!r.generated && (
                          <button className="btn-icon" title="删除" onClick={() => setConfirmDelete(r.id)}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {confirmDelete && (
            <div className="note note-warn" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <AlertTriangle size={15} />
                <div>删除这条记录？之后的余额会重新算过。</div>
              </div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>取消</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeEntry(confirmDelete)}>删除</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
