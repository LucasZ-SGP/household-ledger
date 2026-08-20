import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { PieChart as PieIcon, ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
import { Card, EmptyState, Chip } from "../components/ui.jsx";
import { groupBy, sumBy } from "../lib/agg.js";
import {
  accentFor, formatMoney, monthKey, yearOf, catName, catColor,
  realValue, CURRENCY_META,
} from "../lib/model.js";

function CategoryBreakdown({ items, total, currency }) {
  if (!items.length) return <div className="muted small" style={{ padding: "24px 0", textAlign: "center" }}>暂无数据</div>;
  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
      <div style={{ width: 168, height: 168, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="name" innerRadius={44} outerRadius={77} paddingAngle={1.5} isAnimationActive={false}>
              {items.map((d, i) => <Cell key={i} fill={d.color} stroke="#fff" strokeWidth={1} />)}
            </Pie>
            <Tooltip formatter={(v) => formatMoney(v, currency)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: 1, minWidth: 200 }} className="stack-sm">
        {items.map((d, i) => (
          <div className="legend-row" key={i}>
            <span className="dot" style={{ background: d.color }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
            <span className="num">{formatMoney(d.value, currency)}</span>
            <span className="num faint" style={{ width: 38, textAlign: "right" }}>
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ data }) {
  const currencies = data.currencies;
  const [ccy, setCcy] = useState(currencies[0]);
  const [year, setYear] = useState("全部");
  const [real, setReal] = useState(false);

  useEffect(() => {
    if (!currencies.includes(ccy)) setCcy(currencies[0]);
  }, [currencies, ccy]);

  const years = useMemo(() => {
    const set = new Set(data.transactions.filter((t) => t.currency === ccy).map((t) => yearOf(t.date)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [data.transactions, ccy]);

  const txns = useMemo(
    () => data.transactions.filter((t) => t.currency === ccy && (year === "全部" || yearOf(t.date) === year)),
    [data.transactions, ccy, year]
  );

  const today = new Date().toISOString().slice(0, 10);
  const val = useMemo(
    () => (t) => (real ? realValue(t.amount, t.date, t.currency, data.inflationRates, today) : t.amount),
    [real, data.inflationRates, today]
  );

  const totalIncome = useMemo(() => sumBy(txns.filter((t) => t.direction === "income"), val), [txns, val]);
  const totalExpense = useMemo(() => sumBy(txns.filter((t) => t.direction === "expense"), val), [txns, val]);
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : null;

  const byCat = (direction) => {
    const grouped = groupBy(txns.filter((t) => t.direction === direction), (t) => t.categoryId || "none");
    return Object.entries(grouped)
      .map(([id, list]) => {
        const realId = id === "none" ? null : id;
        return {
          name: catName(data.categories, direction, realId),
          value: sumBy(list, val),
          color: catColor(data.categories, direction, realId),
        };
      })
      .sort((a, b) => b.value - a.value);
  };

  const incomeByCat = useMemo(() => byCat("income"), [txns, val, data.categories]);
  const expenseByCat = useMemo(() => byCat("expense"), [txns, val, data.categories]);

  const months = useMemo(() => {
    const grouped = groupBy(txns, (t) => monthKey(t.date));
    return Object.keys(grouped).sort().map((mk) => ({
      label: mk.slice(2),
      income: sumBy(grouped[mk].filter((t) => t.direction === "income"), val),
      expense: sumBy(grouped[mk].filter((t) => t.direction === "expense"), val),
    }));
  }, [txns, val]);

  return (
    <div className="stack">
      <div className="row-between">
        <div className="row">
          {currencies.map((c) => (
            <Chip key={c} color={accentFor(c)} active={ccy === c} onClick={() => setCcy(c)}>
              {c} <span className="chip-sub">{CURRENCY_META[c]?.label || ""}</span>
            </Chip>
          ))}
        </div>
        <div className="row">
          <select className="select w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="全部">全部年份</option>
            {years.map((y) => <option key={y} value={y}>{y} 年</option>)}
          </select>
          <label className="check" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", background: "#fff" }}>
            <input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} />
            通胀调整
          </label>
        </div>
      </div>

      {txns.length === 0 ? (
        <Card>
          <EmptyState
            icon={PieIcon}
            title={`还没有 ${ccy} 的交易数据`}
            subtitle="先到「导入账单」上传对账单，或在「交易记录」里手动添加一笔。"
          />
        </Card>
      ) : (
        <>
          <div className="grid-4">
            <Card>
              <div className="metric-label"><ArrowUpRight size={12} color="#2F8558" />总收入</div>
              <div className="metric-value num pos">{formatMoney(totalIncome, ccy)}</div>
            </Card>
            <Card>
              <div className="metric-label"><ArrowDownRight size={12} color="#B5502E" />总支出</div>
              <div className="metric-value num neg">{formatMoney(totalExpense, ccy)}</div>
            </Card>
            <Card>
              <div className="metric-label">净现金流</div>
              <div className={`metric-value num ${net >= 0 ? "pos" : "neg"}`}>{formatMoney(net, ccy, { forceSign: true })}</div>
            </Card>
            <Card>
              <div className="metric-label">储蓄率</div>
              <div className="metric-value num">{savingsRate === null ? "—" : `${savingsRate}%`}</div>
            </Card>
          </div>

          <Card>
            <div className="card-title">月度收支趋势</div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={months} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E9DE" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} stroke="#8A9A8F" />
                  <YAxis fontSize={11} stroke="#8A9A8F" width={46}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                  <Tooltip formatter={(v) => formatMoney(v, ccy)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="收入" fill="#3D8361" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="expense" name="支出" fill="#C1502E" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid-2">
            <Card>
              <div className="card-title">收入构成 <span className="tiny faint">工资 / 资本利得 / 其他</span></div>
              <CategoryBreakdown items={incomeByCat} total={totalIncome} currency={ccy} />
            </Card>
            <Card>
              <div className="card-title">支出构成</div>
              <CategoryBreakdown items={expenseByCat} total={totalExpense} currency={ccy} />
            </Card>
          </div>

          {real && (
            <div className="row tiny faint">
              <Info size={12} />
              按设置中的 {ccy} 年通胀率 {data.inflationRates[ccy] ?? 0}% 折算为今日购买力，仅供参考。
            </div>
          )}
        </>
      )}
    </div>
  );
}
