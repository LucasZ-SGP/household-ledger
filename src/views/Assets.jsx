import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, Loader2,
  Landmark, Archive, ArchiveRestore, Camera,
} from "lucide-react";
import { Card, Field, Note, EmptyState, ConfirmBar } from "../components/ui.jsx";
import { formatMoney, accentFor, uid } from "../lib/model.js";
import { useLang } from "../lib/i18n.js";
import {
  ASSET_KINDS, LIABILITY_KINDS, KIND_META, newAccount, valueAccount,
  summarizeAccounts, heldSymbols, snapshotFromAccounts, accountAlerts,
  addMonthsISO, todayISO, sideOf, cpfTotal, valueFixedDeposit, loanTimeline,
  isPhysical, physicalAssets, cashOf,
} from "../lib/assets.js";
import { fetchQuotes, mergeQuotes, providerMeta } from "../lib/quotes.js";
import AccountDetail from "./AccountDetail.jsx";

const ALL_KINDS = [...ASSET_KINDS, ...LIABILITY_KINDS];

// The one number that answers "what is this position worth today", per kind.
function headlineOf(acc, quotes, asOf) {
  // Physical things carry no amount, so the headline is words, not money.
  if (isPhysical(acc.kind)) return { text: "", side: "asset" };
  const v = valueAccount(acc, { asOf, quotes });
  const parts = Object.entries(v.byCurrency).filter(([, amt]) => amt);
  if (!parts.length) return { text: formatMoney(0, acc.currency), side: v.side };
  return { text: parts.map(([c, amt]) => formatMoney(amt, c)).join(" + "), side: v.side };
}

function subtitleOf(acc, quotes, asOf, accounts = [], t) {
  if (acc.kind === "fixed_deposit") {
    const v = valueFixedDeposit(acc, asOf);
    if (!v.maturityDate) return t("未设到期日");
    return v.matured
      ? t("已于 {date} 到期", { date: v.maturityDate })
      : t("{date} 到期 · 还有 {days} 天", { date: v.maturityDate, days: v.daysToMaturity });
  }
  if (acc.kind === "brokerage") {
    const n = (acc.holdings || []).length;
    const cash = Object.entries(cashOf(acc)).map(([c, amt]) => formatMoney(amt, c)).join(" + ");
    return t("{n} 个持仓", { n }) + (cash ? t(" · 现金 {cash}", { cash }) : "");
  }
  if (acc.kind === "cpf") return t("OA/SA/MA/RA 合计 {total}", { total: formatMoney(cpfTotal(acc), acc.currency) });
  if (isPhysical(acc.kind)) return acc.description || "";
  if (acc.kind === "mortgage" || acc.kind === "loan") {
    const tl = loanTimeline(acc, asOf);
    return t("年利率 {rate}% · 每月 {day} 号计息 · {count} 条记录 · 下次 {next}", {
      rate: tl.rate, day: acc.accrualDay || 1, count: tl.rows.length, next: tl.nextAccrualDate || "—",
    });
  }
  if (acc.kind === "cash" && acc.annualRate) return t("年利率 {rate}%", { rate: acc.annualRate });
  return "";
}

// ---------------------------------------------------------------------------

function AccountForm({ draft, setDraft, currencies }) {
  const { t } = useLang();
  const set = (patch) => setDraft({ ...draft, ...patch });
  // Keep the maturity date in step with the term unless it was set by hand.
  const setTerm = (months) => {
    const m = parseInt(months, 10);
    set({ termMonths: months, maturityDate: Number.isFinite(m) && draft.startDate ? addMonthsISO(draft.startDate, m) : draft.maturityDate });
  };
  const setStart = (startDate) => {
    const m = parseInt(draft.termMonths, 10);
    set({ startDate, maturityDate: Number.isFinite(m) && startDate ? addMonthsISO(startDate, m) : draft.maturityDate });
  };

  return (
    <div className="stack-sm">
      <div className="grid-form">
        <Field label={t("名称")}>
          <input className="input" autoFocus value={draft.name} placeholder={t(KIND_META[draft.kind]?.label)}
            onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t("机构（可选）")}>
          <input className="input" value={draft.institution || ""} placeholder="OCBC / IBKR / DBS"
            onChange={(e) => set({ institution: e.target.value })} />
        </Field>
        {draft.kind !== "cpf" && !isPhysical(draft.kind) && (
          <Field label={t("币种")}>
            <select className="select" value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}

        {draft.kind === "cash" && (
          <>
            <Field label={t("余额")}>
              <input className="input num" type="number" step="0.01" value={draft.balance}
                onChange={(e) => set({ balance: e.target.value })} />
            </Field>
            <Field label={t("年利率 %")}>
              <input className="input num" type="number" step="0.01" value={draft.annualRate}
                onChange={(e) => set({ annualRate: e.target.value })} />
            </Field>
          </>
        )}

        {draft.kind === "fixed_deposit" && (
          <>
            <Field label={t("本金")}>
              <input className="input num" type="number" step="0.01" value={draft.principal}
                onChange={(e) => set({ principal: e.target.value })} />
            </Field>
            <Field label={t("年利率 %")}>
              <input className="input num" type="number" step="0.01" value={draft.annualRate}
                onChange={(e) => set({ annualRate: e.target.value })} />
            </Field>
            <Field label={t("起息日")}>
              <input className="input" type="date" value={draft.startDate} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label={t("存期（月）")}>
              <input className="input num" type="number" value={draft.termMonths}
                onChange={(e) => setTerm(e.target.value)} />
            </Field>
            <Field label={t("到期日")}>
              <input className="input" type="date" value={draft.maturityDate || ""}
                onChange={(e) => set({ maturityDate: e.target.value })} />
            </Field>
            <Field label={t("计息方式")}>
              <select className="select" value={draft.compounding} onChange={(e) => set({ compounding: e.target.value })}>
                <option value="simple">{t("到期一次性付息（单利）")}</option>
                <option value="monthly">{t("按月复利")}</option>
              </select>
            </Field>
          </>
        )}

        {draft.kind === "brokerage" && (
          <Field label={t("闲散资金（现金）")}>
            <input className="input num" type="number" step="0.01" value={draft.cash}
              onChange={(e) => set({ cash: e.target.value })} />
          </Field>
        )}

        {draft.kind === "other_asset" && (
          <Field label={t("估值")}>
            <input className="input num" type="number" step="0.01" value={draft.value}
              onChange={(e) => set({ value: e.target.value })} />
          </Field>
        )}

        {(draft.kind === "mortgage" || draft.kind === "loan") && (
          <>
            <Field label={t("放款金额（本金）")}>
              <input className="input num" type="number" step="0.01" value={draft.principal}
                onChange={(e) => set({ principal: e.target.value })} />
            </Field>
            <Field label={t("年利率 %")}>
              <input className="input num" type="number" step="0.01" value={draft.annualRate}
                onChange={(e) => set({ annualRate: e.target.value })} />
            </Field>
            <Field label={t("放款日")}>
              <input className="input" type="date" value={draft.startDate}
                onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field label={t("每月计息日")}>
              <input className="input num" type="number" min="1" max="28" value={draft.accrualDay}
                onChange={(e) => set({ accrualDay: e.target.value })} />
            </Field>
            <Field label={t("月供（可选）")}>
              <input className="input num" type="number" step="0.01" value={draft.monthlyPayment}
                onChange={(e) => set({ monthlyPayment: e.target.value })} />
            </Field>
          </>
        )}
      </div>
      <Field label={t("备注（可选）")}>
        <input className="input" value={draft.note || ""} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      {draft.kind === "cpf" && (
        <div className="tiny faint">{t("CPF 账户固定按 SGD 计。建好之后展开账户，把 OA / SA / MA / RA 的余额填进去。")}</div>
      )}
      {(draft.kind === "mortgage" || draft.kind === "loan") && (
        <div className="tiny faint">
          {t("填「放款金额」和「放款日」，之后每月计息日的利息会自动往上加。有银行的 Statement of Account 的话，建好账户后展开它、点「导入对账单」整段粘贴进去，历史记录一次就补齐了 —— 比手敲快得多，而且会用对账单自己的期末余额校验一遍。")}
        </div>
      )}
      {isPhysical(draft.kind) && (
        <div className="tiny faint">
          {t("房产和汽车只记名字和说明，不记金额，也不计入资产合计 —— 它们会以名字的形式列在总览里。")}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function Assets({ data, setData, quoteCfg, goToSettings }) {
  const { t } = useLang();
  const asOf = todayISO();
  const [expanded, setExpanded] = useState({});
  const [adding, setAdding] = useState(null);   // draft account
  const [editing, setEditing] = useState(null); // draft account
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [quoteErrors, setQuoteErrors] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState(null);

  const accounts = data.accounts || [];
  const quotes = data.quotes || {};
  const summary = useMemo(() => summarizeAccounts(accounts, { asOf, quotes }), [accounts, quotes, asOf]);
  const alerts = useMemo(() => accountAlerts(accounts, { asOf, quotes }), [accounts, quotes, asOf]);
  const symbols = useMemo(() => heldSymbols(accounts), [accounts]);
  const physical = useMemo(() => physicalAssets(accounts), [accounts]);
  const provider = providerMeta(quoteCfg.provider);

  const visible = accounts.filter((a) => showArchived || !a.archived);
  const assets = visible.filter((a) => sideOf(a.kind) === "asset");
  const liabilities = visible.filter((a) => sideOf(a.kind) === "liability");

  const lastQuoteAt = useMemo(() => {
    const stamps = Object.values(quotes).map((q) => q?.fetchedAt || q?.asOf).filter(Boolean).sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }, [quotes]);

  function upsert(acc) {
    setData((prev) => {
      const list = prev.accounts || [];
      const exists = list.some((a) => a.id === acc.id);
      return { ...prev, accounts: exists ? list.map((a) => (a.id === acc.id ? acc : a)) : [...list, acc] };
    });
  }
  const patchAccount = (id, patch) =>
    setData((prev) => ({ ...prev, accounts: (prev.accounts || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const removeAccount = (id) => {
    setData((prev) => ({ ...prev, accounts: (prev.accounts || []).filter((a) => a.id !== id) }));
    setConfirmDelete(null);
  };
  const setQuote = (symbol, quote) =>
    setData((prev) => ({ ...prev, quotes: { ...(prev.quotes || {}), [symbol]: quote } }));

  // Symbols whose cached price is missing or from an earlier day. Prices only
  // move once a day for our purposes, so this settles down after one fetch.
  // A hand-typed price counts for the day it was typed and no longer: once a
  // provider is configured it should take over rather than being blocked by a
  // number someone entered as a stopgap weeks ago.
  const staleSymbols = useMemo(
    () => symbols.filter((sym) => {
      const q = quotes[sym];
      if (!q) return true;
      return String(q.fetchedAt || q.asOf || "").slice(0, 10) !== asOf;
    }),
    [symbols, quotes, asOf]
  );

  // Fetch on arrival rather than making someone press a button to see today's
  // number. Runs at most once per mount, and only when something is actually out
  // of date — a page visit should not burn a free-tier call for nothing.
  const autoFetched = useRef(false);
  useEffect(() => {
    if (autoFetched.current) return;
    if (quoteCfg.provider === "manual" || !staleSymbols.length) return;
    autoFetched.current = true;
    refreshQuotes(staleSymbols);
  }, [quoteCfg.provider, staleSymbols]);

  async function refreshQuotes(only) {
    const symbols = only && only.length ? only : heldSymbols(accounts);
    if (!symbols.length) return;
    setRefreshing(true);
    setQuoteErrors([]);
    setProgress({ index: 0, total: symbols.length });
    try {
      const { quotes: fetched, errors } = await fetchQuotes(symbols, quoteCfg, {
        onProgress: (p) => setProgress(p),
      });
      if (Object.keys(fetched).length) {
        setData((prev) => ({ ...prev, quotes: mergeQuotes(prev.quotes || {}, fetched) }));
      }
      setQuoteErrors(errors);
    } finally {
      setRefreshing(false);
      setProgress(null);
    }
  }

  function makeSnapshot() {
    const rows = snapshotFromAccounts(accounts, { asOf, quotes });
    if (!rows.length) return;
    setData((prev) => ({
      ...prev,
      // Replace any auto rows already written for today so pressing twice
      // doesn't double-count the same day.
      netWorthEntries: [
        ...prev.netWorthEntries.filter((e) => !(e.date === asOf && String(e.name).includes("（自动）"))),
        ...rows,
      ],
    }));
    setSnapshotNote(t("已把今天的资产负债写入净资产快照（{count} 条）。", { count: rows.length }));
  }

  function startAdd(kind) {
    const draft = newAccount(kind, data.currencies[0]);
    setAdding(draft);
    setEditing(null);
  }

  function commitAdd() {
    if (!adding) return;
    const acc = { ...adding, name: adding.name.trim() || t(KIND_META[adding.kind].label), id: adding.id || uid() };
    upsert(acc);
    setExpanded((p) => ({ ...p, [acc.id]: true }));
    setAdding(null);
  }

  const accountCard = (acc) => {
    const open = !!expanded[acc.id];
    const head = headlineOf(acc, quotes, asOf);
    const meta = KIND_META[acc.kind] || {};
    const isEditing = editing && editing.id === acc.id;
    return (
      <Card key={acc.id} className="stack-sm">
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn-icon" style={{ color: "var(--ink-mid)" }}
                onClick={() => setExpanded((p) => ({ ...p, [acc.id]: !open }))}>
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <span className="dot" style={{ background: meta.color }} />
              <strong>{acc.name}</strong>
              <span className="tiny faint">{t(meta.label)}{acc.institution ? ` · ${acc.institution}` : ""}</span>
              {acc.archived && <span className="tiny faint">· {t("已归档")}</span>}
            </div>
            <div className="tiny faint" style={{ marginLeft: 33 }}>{subtitleOf(acc, quotes, asOf, accounts, t)}</div>
          </div>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <span className={`metric-value num ${head.side === "liability" ? "neg" : ""}`}>{head.text}</span>
            <button className="btn btn-sm" onClick={() => { setEditing(isEditing ? null : { ...acc }); setAdding(null); }}>
              {isEditing ? t("取消") : t("编辑")}
            </button>
            <button className="btn-icon" title={acc.archived ? t("取消归档") : t("归档")}
              onClick={() => patchAccount(acc.id, { archived: !acc.archived })}>
              {acc.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            </button>
            <button className="btn-icon" onClick={() => setConfirmDelete(acc.id)}><Trash2 size={14} /></button>
          </div>
        </div>

        {isEditing && (
          <div className="stack-sm" style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
            <AccountForm draft={editing} setDraft={setEditing} currencies={data.currencies} />
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={() => { upsert(editing); setEditing(null); }}>{t("保存修改")}</button>
              <button className="btn btn-sm" onClick={() => setEditing(null)}>{t("取消")}</button>
            </div>
          </div>
        )}

        {open && !isEditing && (
          <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
            <AccountDetail
              account={acc} quotes={quotes} asOf={asOf} currencies={data.currencies}
              accounts={accounts}
              patch={(p) => patchAccount(acc.id, p)} setQuote={setQuote}
            />
            {acc.note ? <div className="tiny faint" style={{ marginTop: 8 }}>{t("备注：")}{acc.note}</div> : null}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="stack">
      {/* ---- per-currency totals ---- */}
      {summary.currencies.length > 0 ? (
        <div className="grid-2">
          {summary.currencies.map((c) => {
            const row = summary.byCurrency[c];
            return (
              <Card key={c}>
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <div className="card-title" style={{ margin: 0, color: accentFor(c) }}>{c}</div>
                  <div className="tiny faint">{asOf}</div>
                </div>
                <div className="grid-4">
                  <div>
                    <div className="metric-label">{t("资产")}</div>
                    <div className="metric-value num pos">{formatMoney(row.assets, c)}</div>
                  </div>
                  <div>
                    <div className="metric-label">{t("负债")}</div>
                    <div className="metric-value num neg">{formatMoney(row.liabilities, c)}</div>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <div className="metric-label">{t("净值")}</div>
                    <div className={`metric-value num ${row.net >= 0 ? "" : "neg"}`}>{formatMoney(row.net, c)}</div>
                  </div>
                </div>
                <div className="row tiny faint" style={{ marginTop: 8 }}>
                  {Object.entries(row.byKind).map(([kind, amt]) => (
                    <span key={kind} className="row" style={{ gap: 4 }}>
                      <span className="dot" style={{ background: KIND_META[kind]?.color, width: 7, height: 7 }} />
                      {t(KIND_META[kind]?.label)} {formatMoney(amt, c)}
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Landmark}
            title={t("还没有任何资产或负债")}
            subtitle={t("把银行定期、股票账户、CPF、房贷登记进来，它们的利息、市值和欠款会自动往前算。")}
            action={<button className="btn btn-primary" onClick={() => startAdd("cash")}><Plus size={13} />{t("添加第一个账户")}</button>}
          />
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
                <span className="tiny faint">{t(KIND_META[p.kind]?.label)}{p.description ? ` · ${p.description}` : ""}</span>
              </span>
            ))}
          </div>
          <div className="tiny faint" style={{ marginTop: 8 }}>{t("只登记名字，不计入上面的资产合计。")}</div>
        </Card>
      )}

      {alerts.map((a, i) => <Note key={i} tone={a.tone}>{a.message}</Note>)}

      {/* ---- toolbar ---- */}
      <div className="row-between">
        <div className="row">
          {ALL_KINDS.map((k) => (
            <button key={k} className="btn btn-sm" onClick={() => startAdd(k)}>
              <Plus size={12} />{t(KIND_META[k].label)}
            </button>
          ))}
        </div>
        <div className="row">
          {accounts.some((a) => a.archived) && (
            <label className="check tiny">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              {t("显示已归档")}
            </label>
          )}
          {summary.currencies.length > 0 && (
            <button className="btn btn-sm" onClick={makeSnapshot}><Camera size={13} />{t("生成净资产快照")}</button>
          )}
        </div>
      </div>

      {snapshotNote && <Note>{snapshotNote}</Note>}

      {/* ---- quotes ---- */}
      {symbols.length > 0 && (
        <Card className="stack-sm">
          <div className="row-between">
            <div>
              <div className="card-title" style={{ margin: 0 }}>{t("行情")}</div>
              <div className="tiny faint">
                {provider.label} · {t("{count} 个代码", { count: symbols.length })}
                {lastQuoteAt
                  ? t(" · 最后更新 {time}", { time: String(lastQuoteAt).slice(0, 16).replace("T", " ") })
                  : t(" · 还没取过价")}
                {quoteCfg.provider !== "manual" && (staleSymbols.length
                  ? t(" · {count} 个待更新", { count: staleSymbols.length })
                  : lastQuoteAt ? t(" · 今天已更新") : "")}
              </div>
            </div>
            <div className="row">
              <button className="btn btn-sm" onClick={goToSettings}>{t("换行情源")}</button>
              <button className="btn btn-primary btn-sm" onClick={() => refreshQuotes()}
                disabled={refreshing || quoteCfg.provider === "manual"}
                title={quoteCfg.provider === "manual" ? t("当前行情源是手动输入") : ""}>
                {refreshing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                {refreshing
                  ? t("取价中 {index}/{total}", { index: (progress?.index ?? 0) + 1, total: progress?.total ?? symbols.length })
                  : t("刷新行情")}
              </button>
            </div>
          </div>
          {quoteCfg.provider === "manual" && (
            <Note>
              {t("当前是「手动输入」模式，不会联网取价 —— 在持仓行里点铅笔图标手填价格即可。想自动更新的话，到")}
              <button className="btn btn-sm" style={{ margin: "0 4px" }} onClick={goToSettings}>{t("设置")}</button>
              {t("里选一个行情源。")}
            </Note>
          )}
          {quoteErrors.length > 0 && (
            <Note tone="warn">
              <div>{t("取价没有全部成功：")}</div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {quoteErrors.slice(0, 6).map((e, i) => <li key={i}>{e.message}</li>)}
              </ul>
              <div className="tiny" style={{ marginTop: 4 }}>
                {t("如果提示被浏览器拦下，多半是行情源不支持跨域，换一个行情源或在设置里配代理；也可以直接手填价格。")}
              </div>
            </Note>
          )}
          {summary.missingQuotes.length > 0 && !refreshing && (
            <div className="tiny faint">{t("还缺价格：")}{summary.missingQuotes.join("、")}</div>
          )}
        </Card>
      )}

      {/* ---- add form ---- */}
      {adding && (
        <Card className="stack-sm">
          <div className="row-between">
            <div className="card-title" style={{ margin: 0 }}>{t("新增：{kind}", { kind: t(KIND_META[adding.kind].label) })}</div>
            <select className="select w-auto" style={{ width: "auto" }} value={adding.kind}
              onChange={(e) => setAdding(newAccount(e.target.value, adding.currency))}>
              {ALL_KINDS.map((k) => <option key={k} value={k}>{t(KIND_META[k].label)}</option>)}
            </select>
          </div>
          <AccountForm draft={adding} setDraft={setAdding} currencies={data.currencies} />
          <div className="row">
            <button className="btn btn-primary" onClick={commitAdd}>{t("添加账户")}</button>
            <button className="btn" onClick={() => setAdding(null)}>{t("取消")}</button>
          </div>
        </Card>
      )}

      {/* ---- lists ---- */}
      {assets.length > 0 && (
        <>
          <div className="card-title" style={{ marginBottom: -4 }}>{t("资产")}</div>
          {assets.map(accountCard)}
        </>
      )}
      {liabilities.length > 0 && (
        <>
          <div className="card-title" style={{ marginBottom: -4 }}>{t("负债")}</div>
          {liabilities.map(accountCard)}
        </>
      )}

      {confirmDelete && (
        <ConfirmBar
          text={t("删除这个账户？它的持仓、还款记录会一起删掉，已经生成的净资产快照不受影响。")}
          confirmLabel={t("删除")}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => removeAccount(confirmDelete)}
        />
      )}
    </div>
  );
}
