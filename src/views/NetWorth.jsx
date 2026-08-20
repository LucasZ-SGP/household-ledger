import React, { useState, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Trash2 } from "lucide-react";
import { Card, Field, Note, Chip, ConfirmBar } from "../components/ui.jsx";
import { sumBy } from "../lib/agg.js";
import { formatMoney, uid, accentFor } from "../lib/model.js";

export default function NetWorth({ data, setData }) {
  const [ccy, setCcy] = useState(data.currencies[0]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10),
    currency: data.currencies[0], type: "asset", name: "", amount: "",
  });

  const entries = useMemo(
    () => data.netWorthEntries.filter((e) => e.currency === ccy),
    [data.netWorthEntries, ccy]
  );

  const series = useMemo(() => {
    const dates = Array.from(new Set(entries.map((e) => e.date))).sort();
    return dates.map((d) => {
      const rows = entries.filter((e) => e.date === d);
      const assets = sumBy(rows.filter((r) => r.type === "asset"), (r) => r.amount);
      const liabilities = sumBy(rows.filter((r) => r.type === "liability"), (r) => r.amount);
      return { date: d, assets, liabilities, net: assets - liabilities };
    });
  }, [entries]);

  const latest = series[series.length - 1];

  function add() {
    const amt = parseFloat(f.amount);
    if (!f.name.trim() || !amt) return;
    setData((prev) => ({
      ...prev,
      netWorthEntries: [...prev.netWorthEntries, {
        id: uid(), date: f.date, currency: f.currency,
        type: f.type, name: f.name.trim(), amount: Math.abs(amt),
      }],
    }));
    setF({ ...f, name: "", amount: "" });
  }

  function remove(id) {
    setData((prev) => ({ ...prev, netWorthEntries: prev.netWorthEntries.filter((e) => e.id !== id) }));
    setConfirmDelete(null);
  }

  return (
    <div className="stack narrow">
      <Note>
        建议每月记一次快照：把当时的现金、投资账户、房产等资产，以及房贷余额等负债各记一条，
        就能看到净资产随时间的变化曲线。
      </Note>

      <div className="row">
        {data.currencies.map((c) => (
          <Chip key={c} color={accentFor(c)} active={ccy === c} onClick={() => setCcy(c)}>{c}</Chip>
        ))}
      </div>

      {latest && (
        <div className="grid-4">
          <Card>
            <div className="metric-label">最新资产</div>
            <div className="metric-value num pos">{formatMoney(latest.assets, ccy)}</div>
          </Card>
          <Card>
            <div className="metric-label">最新负债</div>
            <div className="metric-value num neg">{formatMoney(latest.liabilities, ccy)}</div>
          </Card>
          <Card>
            <div className="metric-label">净资产（{latest.date}）</div>
            <div className="metric-value num">{formatMoney(latest.net, ccy)}</div>
          </Card>
          <Card>
            <div className="metric-label">快照次数</div>
            <div className="metric-value num">{series.length}</div>
          </Card>
        </div>
      )}

      {series.length >= 2 && (
        <Card>
          <div className="card-title">净资产走势</div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9DE" vertical={false} />
                <XAxis dataKey="date" fontSize={11} stroke="#8A9A8F" />
                <YAxis fontSize={11} stroke="#8A9A8F" width={46}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip formatter={(v) => formatMoney(v, ccy)} />
                <Line type="monotone" dataKey="net" name="净资产" stroke={accentFor(ccy)}
                  strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="stack-sm">
        <div className="card-title">添加快照记录</div>
        <div className="grid-form">
          <Field label="日期">
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="币种">
            <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="类型">
            <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="asset">资产</option>
              <option value="liability">负债</option>
            </select>
          </Field>
          <Field label="名称">
            <input className="input" placeholder="例如：IBKR 投资账户 / 房贷余额"
              value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="金额">
            <input className="input" type="number" step="0.01" value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={add}>添加</button>
        </div>
      </Card>

      {entries.length > 0 && (
        <Card className="flush">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>日期</th><th>类型</th><th>名称</th><th className="ta-r">金额</th><th></th></tr>
              </thead>
              <tbody>
                {entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
                  <tr key={e.id}>
                    <td className="num nowrap">{e.date}</td>
                    <td className={e.type === "asset" ? "pos" : "neg"}>{e.type === "asset" ? "资产" : "负债"}</td>
                    <td className="td-clip">{e.name}</td>
                    <td className="ta-r num nowrap">{formatMoney(e.amount, e.currency)}</td>
                    <td>
                      <button className="btn-icon" onClick={() => setConfirmDelete(e.id)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {confirmDelete && (
        <ConfirmBar text="删除这条快照记录？" confirmLabel="删除"
          onCancel={() => setConfirmDelete(null)} onConfirm={() => remove(confirmDelete)} />
      )}
    </div>
  );
}
