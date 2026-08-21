import React, { useState, useMemo, useEffect, useRef } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Trash2, RefreshCw, Loader2, Home } from "lucide-react";
import { Card, Field, Note, Chip, ConfirmBar } from "../components/ui.jsx";
import { sumBy } from "../lib/agg.js";
import { formatMoney, uid, accentFor } from "../lib/model.js";
import { physicalAssets, KIND_META } from "../lib/assets.js";
import { fetchFxRates, convertAmount, fxPairKey } from "../lib/fx.js";
import { useLang } from "../lib/i18n.js";

export default function NetWorth({ data, setData, quoteCfg }) {
  const { t } = useLang();
  const [ccy, setCcy] = useState(data.currencies[0]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fxErrors, setFxErrors] = useState([]);
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10),
    currency: data.currencies[0], type: "asset", name: "", amount: "",
  });

  const entries = data.netWorthEntries;
  const fxRates = data.fxRates || {};
  const physical = useMemo(() => physicalAssets(data.accounts || []), [data.accounts]);

  // Every currency an entry is recorded in, other than the one we're converting to.
  const neededBases = useMemo(
    () => Array.from(new Set(entries.map((e) => e.currency))).filter((c) => c !== ccy),
    [entries, ccy]
  );
  const today = new Date().toISOString().slice(0, 10);
  const staleBases = useMemo(
    () => neededBases.filter((b) => {
      const r = fxRates[fxPairKey(b, ccy)];
      return !r || String(r.fetchedAt || r.asOf || "").slice(0, 10) !== today;
    }),
    [neededBases, fxRates, ccy, today]
  );

  async function refreshFx(only) {
    const bases = only && only.length ? only : neededBases;
    if (!bases.length) return;
    setRefreshing(true);
    setFxErrors([]);
    try {
      const { rates, errors } = await fetchFxRates(bases, ccy, quoteCfg?.apiKey);
      if (Object.keys(rates).length) {
        setData((prev) => ({ ...prev, fxRates: { ...(prev.fxRates || {}), ...rates } }));
      }
      setFxErrors(errors);
    } finally {
      setRefreshing(false);
    }
  }

  // Fetch on arrival, at most once per mount, only when something is missing.
  const autoFetched = useRef(false);
  useEffect(() => {
    autoFetched.current = false;
  }, [ccy]);
  useEffect(() => {
    if (autoFetched.current || !staleBases.length || !quoteCfg?.apiKey) return;
    autoFetched.current = true;
    refreshFx(staleBases);
  }, [staleBases, quoteCfg?.apiKey]);

  // Converts one entry into the display currency; null when the rate is missing.
  const toDisplay = (amount, currency) => convertAmount(amount, currency, ccy, fxRates);

  const missingRateCurrencies = neededBases.filter((b) => !fxRates[fxPairKey(b, ccy)]);

  const series = useMemo(() => {
    const dates = Array.from(new Set(entries.map((e) => e.date))).sort();
    return dates.map((d) => {
      const rows = entries.filter((e) => e.date === d);
      let assets = 0, liabilities = 0, incomplete = false;
      for (const r of rows) {
        const converted = toDisplay(r.amount, r.currency);
        if (converted === null) { incomplete = true; continue; }
        if (r.type === "asset") assets += converted; else liabilities += converted;
      }
      return { date: d, assets, liabilities, net: assets - liabilities, incomplete };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, ccy, fxRates]);

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
        {t("建议每月记一次快照：把当时的现金、投资账户、房产等资产，以及房贷余额等负债各记一条，就能看到净资产随时间的变化曲线。")}
      </Note>

      <div>
        <div className="tiny faint" style={{ marginBottom: 6 }}>{t("换算为")}</div>
        <div className="row">
          {data.currencies.map((c) => (
            <Chip key={c} color={accentFor(c)} active={ccy === c} onClick={() => setCcy(c)}>{c}</Chip>
          ))}
        </div>
      </div>

      {neededBases.length > 0 && (
        <Card className="stack-sm">
          <div className="row-between">
            <div>
              <div className="card-title" style={{ margin: 0 }}>{t("汇率")}</div>
              <div className="tiny faint">
                {t("其他币种按 Finnhub 实时汇率自动折算为 {ccy}。", { ccy })}
                {staleBases.length ? t(" · {n} 个待更新", { n: staleBases.length }) : t(" · 今天已更新")}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => refreshFx()} disabled={refreshing || !quoteCfg?.apiKey}
              title={quoteCfg?.apiKey ? "" : t("请先在设置里填 Finnhub API Key")}>
              {refreshing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
              {refreshing ? t("换算中…") : t("刷新汇率")}
            </button>
          </div>
          {!quoteCfg?.apiKey && (
            <Note tone="warn">{t("还没配置行情源的 API Key（需要是 Finnhub 的 Key），到设置里填一下即可自动换算。")}</Note>
          )}
          {fxErrors.length > 0 && (
            <Note tone="warn">
              <div>{t("有几个币种没换算成功：")}</div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {fxErrors.slice(0, 6).map((e, i) => <li key={i}>{e.pair}：{t(e.message)}</li>)}
              </ul>
            </Note>
          )}
          {missingRateCurrencies.length > 0 && !refreshing && (
            <div className="tiny faint">
              {t("还缺汇率：{list}，这些币种的记录暂不计入下面的合计。", { list: missingRateCurrencies.join("、") })}
            </div>
          )}
        </Card>
      )}

      {latest && (
        <div className="grid-4">
          <Card>
            <div className="metric-label">{t("最新资产")}</div>
            <div className="metric-value num pos">{formatMoney(latest.assets, ccy)}</div>
          </Card>
          <Card>
            <div className="metric-label">{t("最新负债")}</div>
            <div className="metric-value num neg">{formatMoney(latest.liabilities, ccy)}</div>
          </Card>
          <Card>
            <div className="metric-label">{t("净资产（{date}）", { date: latest.date })}</div>
            <div className="metric-value num">{formatMoney(latest.net, ccy)}</div>
            {latest.incomplete && <div className="tiny faint">{t("部分记录缺汇率，未计入")}</div>}
          </Card>
          <Card>
            <div className="metric-label">{t("快照次数")}</div>
            <div className="metric-value num">{series.length}</div>
          </Card>
        </div>
      )}

      {series.length >= 2 && (
        <Card>
          <div className="card-title">{t("净资产走势")}</div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9DE" vertical={false} />
                <XAxis dataKey="date" fontSize={11} stroke="#8A9A8F" />
                <YAxis fontSize={11} stroke="#8A9A8F" width={46}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip formatter={(v) => formatMoney(v, ccy)} />
                <Line type="monotone" dataKey="net" name={t("净资产")} stroke={accentFor(ccy)}
                  strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {physical.length > 0 && (
        <Card>
          <div className="card-title" style={{ marginBottom: 8 }}>{t("实物资产")}</div>
          <div className="row" style={{ gap: 14 }}>
            {physical.map((p) => (
              <span key={p.id} className="row" style={{ gap: 6 }}>
                <span className="dot" style={{ background: KIND_META[p.kind]?.color }} />
                <strong>{p.name}</strong>
                <span className="tiny faint">{t(KIND_META[p.kind]?.label || "")}{p.description ? ` · ${p.description}` : ""}</span>
              </span>
            ))}
          </div>
          <div className="tiny faint" style={{ marginTop: 8 }}>
            <Home size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
            {t("只记名字，不折算金额，也不计入上面的净资产合计。")}
          </div>
        </Card>
      )}

      <Card className="stack-sm">
        <div className="card-title">{t("添加快照记录")}</div>
        <div className="grid-form">
          <Field label={t("日期")}>
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t("币种")}>
            <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
              {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label={t("类型")}>
            <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="asset">{t("资产")}</option>
              <option value="liability">{t("负债")}</option>
            </select>
          </Field>
          <Field label={t("名称")}>
            <input className="input" placeholder={t("例如：IBKR 投资账户 / 房贷余额")}
              value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t("金额")}>
            <input className="input" type="number" step="0.01" value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={add}>{t("添加")}</button>
        </div>
      </Card>

      {entries.length > 0 && (
        <Card className="flush">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("日期")}</th><th>{t("类型")}</th><th>{t("名称")}</th>
                  <th className="ta-r">{t("金额")}</th><th className="ta-r">{t("折算为 {ccy}", { ccy })}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {entries.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => {
                  const converted = toDisplay(e.amount, e.currency);
                  return (
                    <tr key={e.id}>
                      <td className="num nowrap">{e.date}</td>
                      <td className={e.type === "asset" ? "pos" : "neg"}>{e.type === "asset" ? t("资产") : t("负债")}</td>
                      <td className="td-clip">{e.name}</td>
                      <td className="ta-r num nowrap">{formatMoney(e.amount, e.currency)}</td>
                      <td className="ta-r num nowrap faint">{converted === null ? "—" : formatMoney(converted, ccy)}</td>
                      <td>
                        <button className="btn-icon" onClick={() => setConfirmDelete(e.id)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {confirmDelete && (
        <ConfirmBar text={t("删除这条快照记录？")} confirmLabel={t("删除")}
          onCancel={() => setConfirmDelete(null)} onConfirm={() => remove(confirmDelete)} />
      )}
    </div>
  );
}
