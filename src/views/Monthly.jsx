import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Plus, Trash2, ArrowRight, CheckCircle2, CalendarDays } from "lucide-react";
import { Card, Field, Note, Chip, EmptyState } from "../components/ui.jsx";
import { formatMoney, accentFor } from "../lib/model.js";
import { KIND_META } from "../lib/assets.js";
import {
  monthlyFlow, monthlySeries, monthsWithActivity, currentMonth,
  allocationTargets, newIncomeEntry, newAllocation,
  INCOME_GROUPS, INCOME_GROUP_KEYS,
} from "../lib/flows.js";

function Metric({ label, value, tone, sub }) {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className={`metric-value num ${tone || ""}`}>{value}</div>
      {sub ? <div className="tiny faint">{sub}</div> : null}
    </div>
  );
}

function monthLabel(m) {
  const [y, mm] = m.split("-");
  return `${y} 年 ${Number(mm)} 月`;
}

function shiftMonth(m, delta) {
  const [y, mm] = m.split("-").map(Number);
  const total = y * 12 + (mm - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export default function Monthly({ data, setData, goToAssets }) {
  const [ccy, setCcy] = useState(data.currencies[0]);
  const [month, setMonth] = useState(currentMonth);
  const [incomeDraft, setIncomeDraft] = useState(null);
  const [allocDraft, setAllocDraft] = useState(null);

  useEffect(() => {
    if (!data.currencies.includes(ccy)) setCcy(data.currencies[0]);
  }, [data.currencies, ccy]);

  const months = useMemo(() => monthsWithActivity(data, ccy), [data, ccy]);
  const flow = useMemo(() => monthlyFlow(data, month, ccy), [data, month, ccy]);
  const series = useMemo(() => monthlySeries(data, ccy), [data, ccy]);
  const targets = useMemo(() => allocationTargets(data.accounts), [data.accounts]);
  const hasTargets = targets.assets.length + targets.liabilities.length > 0;

  function addIncome() {
    const amount = parseFloat(incomeDraft.amount);
    if (!(amount > 0)) return;
    setData((prev) => ({
      ...prev,
      incomeEntries: [...(prev.incomeEntries || []), { ...incomeDraft, amount }],
    }));
    setIncomeDraft(null);
  }
  const removeIncome = (id) =>
    setData((prev) => ({ ...prev, incomeEntries: (prev.incomeEntries || []).filter((e) => e.id !== id) }));

  function addAllocation(preset) {
    const draft = preset || allocDraft;
    const amount = parseFloat(draft.amount);
    if (!(amount > 0) || !draft.accountId) return;
    setData((prev) => ({
      ...prev,
      allocations: [...(prev.allocations || []), { ...draft, amount }],
    }));
    setAllocDraft(null);
  }
  const removeAllocation = (id) =>
    setData((prev) => ({ ...prev, allocations: (prev.allocations || []).filter((a) => a.id !== id) }));

  const startAllocation = (amount) =>
    setAllocDraft({ ...newAllocation(month, ccy), amount: amount ? String(amount) : "" });

  return (
    <div className="stack">
      <div className="row-between">
        <div className="row">
          {data.currencies.map((c) => (
            <Chip key={c} color={accentFor(c)} active={ccy === c} onClick={() => setCcy(c)}>{c}</Chip>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>← 上月</button>
          <select className="select w-auto" style={{ width: "auto" }} value={month}
            onChange={(e) => setMonth(e.target.value)}>
            {Array.from(new Set([month, currentMonth(), ...months])).sort().reverse().map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, 1))}>下月 →</button>
        </div>
      </div>

      {/* ---- the clearing identity ---- */}
      <Card>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ margin: 0 }}>{monthLabel(month)} 结算</div>
          {flow.settled && flow.income.total > 0 && (
            <span className="sync-pill pos"><CheckCircle2 size={12} />已结清</span>
          )}
        </div>
        <div className="grid-4">
          <Metric label="本月收入" value={formatMoney(flow.income.total, ccy)} tone="pos"
            sub={`工资 ${formatMoney(flow.income.salary, ccy)} · 资本 ${formatMoney(flow.income.capital, ccy)}`} />
          <Metric label="本月支出" value={formatMoney(flow.expense.total, ccy)} tone="neg"
            sub="来自交易记录" />
          <Metric label="本月结余" value={formatMoney(flow.surplus, ccy)}
            tone={flow.surplus >= 0 ? "" : "neg"} sub="收入 − 支出" />
          <Metric
            label={flow.overAllocated ? "超额分配" : "待分配"}
            value={formatMoney(Math.abs(flow.unallocated), ccy)}
            tone={flow.settled ? "pos" : flow.overAllocated ? "neg" : "warn"}
            sub={flow.settled ? "这个月已经结平" : flow.overAllocated ? "分配的比结余还多" : "还没落到资产或负债上"}
          />
        </div>

        {flow.income.total === 0 && flow.expense.total === 0 && (
          <Note tone="warn" >
            这个月还没有 {ccy} 的收支记录。先到「导入账单」把对账单导进来，工资和资本利得会自动归到这里；
            不走银行账单的收入（CPF、券商里的股息）可以在下面手动补一笔。
          </Note>
        )}

        {!flow.settled && flow.surplus > 0 && !flow.overAllocated && hasTargets && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => startAllocation(flow.unallocated)}>
              <ArrowRight size={13} />把剩下的 {formatMoney(flow.unallocated, ccy)} 分配掉
            </button>
            <span className="tiny faint">结余要么变成资产，要么用来还债 —— 分配完这个月就归零了。</span>
          </div>
        )}
        {!hasTargets && flow.surplus > 0 && (
          <Note tone="warn" >
            还没有可以承接的账户。先到<button className="btn btn-sm" style={{ margin: "0 4px" }} onClick={goToAssets}>资产负债</button>
            建一个定期存款或房贷账户，再回来分配。
          </Note>
        )}
      </Card>

      {/* ---- income ---- */}
      <Card className="stack-sm">
        <div className="row-between">
          <div className="card-title" style={{ margin: 0 }}>收入构成</div>
          <button className="btn btn-sm" onClick={() => setIncomeDraft(newIncomeEntry(month, ccy))}>
            <Plus size={13} />手动补一笔
          </button>
        </div>
        <div className="grid-4">
          {INCOME_GROUP_KEYS.map((k) => (
            <Metric key={k} label={INCOME_GROUPS[k].label} value={formatMoney(flow.income[k], ccy)}
              tone={flow.income[k] > 0 ? "pos" : ""} />
          ))}
        </div>

        {incomeDraft && (
          <div className="stack-sm" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
            <div className="grid-form">
              <Field label="类别">
                <select className="select" value={incomeDraft.categoryId}
                  onChange={(e) => setIncomeDraft({ ...incomeDraft, categoryId: e.target.value })}>
                  {(data.categories.income || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="金额">
                <input className="input num" type="number" step="0.01" autoFocus value={incomeDraft.amount || ""}
                  onChange={(e) => setIncomeDraft({ ...incomeDraft, amount: e.target.value })} />
              </Field>
              <Field label="备注">
                <input className="input" placeholder="例如：CPF 雇主缴纳 / 券商股息"
                  value={incomeDraft.note} onChange={(e) => setIncomeDraft({ ...incomeDraft, note: e.target.value })} />
              </Field>
            </div>
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={addIncome}>添加</button>
              <button className="btn btn-sm" onClick={() => setIncomeDraft(null)}>取消</button>
              <span className="tiny faint">只补账单里没有的收入 —— 已经导入的工资不用再录一遍。</span>
            </div>
          </div>
        )}

        {flow.income.rows.length > 0 && (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>类别</th><th>来源</th><th className="ta-r">金额</th></tr></thead>
              <tbody>
                {flow.income.rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.name}</td>
                    <td className="tiny faint">{r.source === "manual" ? "手动补录" : r.source === "mixed" ? "账单 + 手动" : "交易记录"}</td>
                    <td className="ta-r num nowrap pos">{formatMoney(r.amount, ccy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {flow.income.manual.length > 0 && (
          <div className="stack-sm">
            <div className="field-label">手动补录的收入</div>
            {flow.income.manual.map((e) => (
              <div className="row-between" key={e.id}>
                <span className="small">
                  {(data.categories.income.find((c) => c.id === e.categoryId) || {}).name || e.categoryId}
                  {e.note ? <span className="faint"> · {e.note}</span> : null}
                </span>
                <span className="row" style={{ flexWrap: "nowrap" }}>
                  <span className="num small pos">{formatMoney(e.amount, ccy)}</span>
                  <button className="btn-icon" onClick={() => removeIncome(e.id)}><Trash2 size={13} /></button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---- allocations ---- */}
      <Card className="stack-sm">
        <div className="row-between">
          <div className="card-title" style={{ margin: 0 }}>结余去向</div>
          <button className="btn btn-sm" disabled={!hasTargets} onClick={() => startAllocation()}>
            <Plus size={13} />添加分配
          </button>
        </div>
        <div className="grid-4">
          <Metric label="转化为资产" value={formatMoney(flow.toAssets, ccy)} tone="pos" />
          <Metric label="消除负债" value={formatMoney(flow.toLiabilities, ccy)} tone="pos" />
          <Metric label="合计已分配" value={formatMoney(flow.allocated, ccy)} />
          <Metric label="占结余比例"
            value={flow.surplus > 0 ? `${Math.round((flow.allocated / flow.surplus) * 100)}%` : "—"} />
        </div>

        {allocDraft && (
          <div className="stack-sm" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
            <div className="grid-form">
              <Field label="去向账户">
                <select className="select" value={allocDraft.accountId}
                  onChange={(e) => setAllocDraft({ ...allocDraft, accountId: e.target.value })}>
                  <option value="">选一个账户…</option>
                  {targets.assets.length > 0 && (
                    <optgroup label="转化为资产">
                      {targets.assets.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}（{KIND_META[a.kind]?.label}）</option>
                      ))}
                    </optgroup>
                  )}
                  {targets.liabilities.length > 0 && (
                    <optgroup label="消除负债">
                      {targets.liabilities.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}（{KIND_META[a.kind]?.label}）</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>
              <Field label="金额">
                <input className="input num" type="number" step="0.01" value={allocDraft.amount || ""}
                  onChange={(e) => setAllocDraft({ ...allocDraft, amount: e.target.value })} />
              </Field>
              <Field label="备注">
                <input className="input" placeholder="可留空" value={allocDraft.note}
                  onChange={(e) => setAllocDraft({ ...allocDraft, note: e.target.value })} />
              </Field>
            </div>
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={() => addAllocation()}>记入</button>
              <button className="btn btn-sm" onClick={() => setAllocDraft(null)}>取消</button>
            </div>
          </div>
        )}

        {flow.allocations.length > 0 ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>去向</th><th>类型</th><th className="ta-r">金额</th><th>对照</th><th></th></tr>
              </thead>
              <tbody>
                {flow.allocations.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="dot" style={{ background: KIND_META[a.account?.kind]?.color || "#8A9A8F" }} />
                        {a.account ? a.account.name : <span className="faint">账户已删除</span>}
                      </span>
                      {a.note ? <div className="tiny faint">{a.note}</div> : null}
                    </td>
                    <td className="tiny">{a.side === "liability" ? "消除负债" : a.side === "asset" ? "转化为资产" : "—"}</td>
                    <td className="ta-r num nowrap">{formatMoney(a.amount, ccy)}</td>
                    <td className="tiny faint nowrap">
                      {a.recorded === null ? "—" : Math.abs(a.recorded - a.amount) < 0.005
                        ? <span className="pos">与台账一致</span>
                        : <>台账记录 {formatMoney(a.recorded, ccy)}</>}
                    </td>
                    <td><button className="btn-icon" onClick={() => removeAllocation(a.id)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tiny faint">这个月还没有分配记录。</div>
        )}

        {flow.allocations.some((a) => a.recorded !== null && Math.abs(a.recorded - a.amount) >= 0.005) && (
          <div className="tiny faint">
            「对照」这一列拿的是该贷款账户在本月实际记到的还款额。两个数字对不上不一定是错 ——
            比如月供是从 CPF 扣的、并没有占用你这个月的现金结余。
          </div>
        )}
      </Card>

      {/* ---- trend ---- */}
      {series.length >= 2 ? (
        <Card>
          <div className="card-title">月度走势</div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9DE" vertical={false} />
                <XAxis dataKey="label" fontSize={11} stroke="#8A9A8F" />
                <YAxis fontSize={11} stroke="#8A9A8F" width={46}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip formatter={(v) => formatMoney(v, ccy)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="收入" fill="#3D8361" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="expense" name="支出" fill="#C1502E" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="toAssets" name="转化为资产" fill="#35618F" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="toLiabilities" name="消除负债" fill="#6E5A9E" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : months.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="还没有可以结算的月份"
            subtitle="导入一份对账单，或在上面手动补一笔收入，这个月就会出现在这里。"
          />
        </Card>
      ) : null}
    </div>
  );
}
