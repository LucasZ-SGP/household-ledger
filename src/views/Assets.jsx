import React, { useState, useMemo } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, Loader2,
  Landmark, Archive, ArchiveRestore, Camera,
} from "lucide-react";
import { Card, Field, Note, EmptyState, ConfirmBar } from "../components/ui.jsx";
import { formatMoney, accentFor, uid } from "../lib/model.js";
import {
  ASSET_KINDS, LIABILITY_KINDS, KIND_META, newAccount, valueAccount,
  summarizeAccounts, heldSymbols, snapshotFromAccounts, accountAlerts,
  addMonthsISO, todayISO, sideOf, cpfTotal, valueFixedDeposit, loanTimeline,
  valueProperty, valueVehicle,
} from "../lib/assets.js";
import { fetchQuotes, mergeQuotes, providerMeta } from "../lib/quotes.js";
import AccountDetail from "./AccountDetail.jsx";

const ALL_KINDS = [...ASSET_KINDS, ...LIABILITY_KINDS];

// The one number that answers "what is this position worth today", per kind.
function headlineOf(acc, quotes, asOf) {
  const v = valueAccount(acc, { asOf, quotes });
  const parts = Object.entries(v.byCurrency).filter(([, amt]) => amt);
  if (!parts.length) return { text: formatMoney(0, acc.currency), side: v.side };
  return { text: parts.map(([c, amt]) => formatMoney(amt, c)).join(" + "), side: v.side };
}

function subtitleOf(acc, quotes, asOf, accounts = []) {
  if (acc.kind === "fixed_deposit") {
    const v = valueFixedDeposit(acc, asOf);
    if (!v.maturityDate) return "未设到期日";
    return v.matured ? `已于 ${v.maturityDate} 到期` : `${v.maturityDate} 到期 · 还有 ${v.daysToMaturity} 天`;
  }
  if (acc.kind === "brokerage") {
    const n = (acc.holdings || []).length;
    return `${n} 个持仓${acc.cash ? ` · 现金 ${formatMoney(acc.cash, acc.currency)}` : ""}`;
  }
  if (acc.kind === "cpf") return `OA/SA/MA/RA 合计 ${formatMoney(cpfTotal(acc), acc.currency)}`;
  if (acc.kind === "property") {
    const v = valueProperty(acc, { asOf, accounts });
    return v.equity === null ? "未关联贷款" : `净权益 ${formatMoney(v.equity, acc.currency)}（已扣 ${formatMoney(v.loanBalance, acc.currency)} 贷款）`;
  }
  if (acc.kind === "vehicle") {
    const v = valueVehicle(acc, asOf);
    if (!v.coeExpiry) return v.depreciated ? "按 COE 自动折旧" : "";
    return v.daysToCoeExpiry > 0
      ? `COE ${v.coeExpiry} 到期 · 还有 ${(v.daysToCoeExpiry / 365).toFixed(1)} 年${v.depreciated ? " · 自动折旧" : ""}`
      : `COE 已于 ${v.coeExpiry} 到期`;
  }
  if (acc.kind === "mortgage" || acc.kind === "loan") {
    const t = loanTimeline(acc, asOf);
    return `年利率 ${t.rate}% · 每月 ${acc.accrualDay || 1} 号计息 · ${t.rows.length} 条记录 · 下次 ${t.nextAccrualDate || "—"}`;
  }
  if (acc.kind === "cash" && acc.annualRate) return `年利率 ${acc.annualRate}%`;
  return "";
}

// ---------------------------------------------------------------------------

function AccountForm({ draft, setDraft, currencies }) {
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
        <Field label="名称">
          <input className="input" autoFocus value={draft.name} placeholder={KIND_META[draft.kind]?.label}
            onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="机构（可选）">
          <input className="input" value={draft.institution || ""} placeholder="OCBC / IBKR / DBS"
            onChange={(e) => set({ institution: e.target.value })} />
        </Field>
        {draft.kind !== "cpf" && (
          <Field label="币种">
            <select className="select" value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}

        {draft.kind === "cash" && (
          <>
            <Field label="余额">
              <input className="input num" type="number" step="0.01" value={draft.balance}
                onChange={(e) => set({ balance: e.target.value })} />
            </Field>
            <Field label="年利率 %">
              <input className="input num" type="number" step="0.01" value={draft.annualRate}
                onChange={(e) => set({ annualRate: e.target.value })} />
            </Field>
          </>
        )}

        {draft.kind === "fixed_deposit" && (
          <>
            <Field label="本金">
              <input className="input num" type="number" step="0.01" value={draft.principal}
                onChange={(e) => set({ principal: e.target.value })} />
            </Field>
            <Field label="年利率 %">
              <input className="input num" type="number" step="0.01" value={draft.annualRate}
                onChange={(e) => set({ annualRate: e.target.value })} />
            </Field>
            <Field label="起息日">
              <input className="input" type="date" value={draft.startDate} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="存期（月）">
              <input className="input num" type="number" value={draft.termMonths}
                onChange={(e) => setTerm(e.target.value)} />
            </Field>
            <Field label="到期日">
              <input className="input" type="date" value={draft.maturityDate || ""}
                onChange={(e) => set({ maturityDate: e.target.value })} />
            </Field>
            <Field label="计息方式">
              <select className="select" value={draft.compounding} onChange={(e) => set({ compounding: e.target.value })}>
                <option value="simple">到期一次性付息（单利）</option>
                <option value="monthly">按月复利</option>
              </select>
            </Field>
          </>
        )}

        {draft.kind === "brokerage" && (
          <Field label="闲散资金（现金）">
            <input className="input num" type="number" step="0.01" value={draft.cash}
              onChange={(e) => set({ cash: e.target.value })} />
          </Field>
        )}

        {draft.kind === "property" && (
          <>
            <Field label="当前估值">
              <input className="input num" type="number" step="0.01" value={draft.value}
                onChange={(e) => set({ value: e.target.value })} />
            </Field>
            <Field label="购入价">
              <input className="input num" type="number" step="0.01" value={draft.purchasePrice}
                onChange={(e) => set({ purchasePrice: e.target.value })} />
            </Field>
            <Field label="购入日期">
              <input className="input" type="date" value={draft.purchaseDate || ""}
                onChange={(e) => set({ purchaseDate: e.target.value })} />
            </Field>
          </>
        )}

        {draft.kind === "vehicle" && (
          <>
            <Field label="当前估值">
              <input className="input num" type="number" step="0.01" value={draft.value}
                onChange={(e) => set({ value: e.target.value })} />
            </Field>
            <Field label="购入价">
              <input className="input num" type="number" step="0.01" value={draft.purchasePrice}
                onChange={(e) => set({ purchasePrice: e.target.value })} />
            </Field>
            <Field label="购入日期">
              <input className="input" type="date" value={draft.purchaseDate || ""}
                onChange={(e) => set({ purchaseDate: e.target.value })} />
            </Field>
            <Field label="COE 到期日">
              <input className="input" type="date" value={draft.coeExpiry || ""}
                onChange={(e) => set({ coeExpiry: e.target.value })} />
            </Field>
          </>
        )}

        {draft.kind === "other_asset" && (
          <Field label="估值">
            <input className="input num" type="number" step="0.01" value={draft.value}
              onChange={(e) => set({ value: e.target.value })} />
          </Field>
        )}

        {(draft.kind === "mortgage" || draft.kind === "loan") && (
          <>
            <Field label="放款金额（本金）">
              <input className="input num" type="number" step="0.01" value={draft.principal}
                onChange={(e) => set({ principal: e.target.value })} />
            </Field>
            <Field label="年利率 %">
              <input className="input num" type="number" step="0.01" value={draft.annualRate}
                onChange={(e) => set({ annualRate: e.target.value })} />
            </Field>
            <Field label="放款日">
              <input className="input" type="date" value={draft.startDate}
                onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field label="每月计息日">
              <input className="input num" type="number" min="1" max="28" value={draft.accrualDay}
                onChange={(e) => set({ accrualDay: e.target.value })} />
            </Field>
            <Field label="月供（可选）">
              <input className="input num" type="number" step="0.01" value={draft.monthlyPayment}
                onChange={(e) => set({ monthlyPayment: e.target.value })} />
            </Field>
          </>
        )}
      </div>
      <Field label="备注（可选）">
        <input className="input" value={draft.note || ""} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      {draft.kind === "cpf" && (
        <div className="tiny faint">CPF 账户固定按 SGD 计。建好之后展开账户，把 OA / SA / MA / RA 的余额填进去。</div>
      )}
      {(draft.kind === "mortgage" || draft.kind === "loan") && (
        <div className="tiny faint">
          填「放款金额」和「放款日」，之后每月计息日的利息会自动往上加。
          有银行的 Statement of Account 的话，建好账户后展开它、点「导入对账单」整段粘贴进去，
          历史记录一次就补齐了 —— 比手敲快得多，而且会用对账单自己的期末余额校验一遍。
        </div>
      )}
      {draft.kind === "property" && (
        <div className="tiny faint">建好之后展开它，可以关联对应的房贷，直接看净权益（估值 − 贷款余额）。</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function Assets({ data, setData, quoteCfg, goToSettings }) {
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

  async function refreshQuotes() {
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
    setSnapshotNote(`已把今天的资产负债写入净资产快照（${rows.length} 条）。`);
  }

  function startAdd(kind) {
    const draft = newAccount(kind, data.currencies[0]);
    setAdding(draft);
    setEditing(null);
  }

  function commitAdd() {
    if (!adding) return;
    const acc = { ...adding, name: adding.name.trim() || KIND_META[adding.kind].label, id: adding.id || uid() };
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
              <span className="tiny faint">{meta.label}{acc.institution ? ` · ${acc.institution}` : ""}</span>
              {acc.archived && <span className="tiny faint">· 已归档</span>}
            </div>
            <div className="tiny faint" style={{ marginLeft: 33 }}>{subtitleOf(acc, quotes, asOf, accounts)}</div>
          </div>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <span className={`metric-value num ${head.side === "liability" ? "neg" : ""}`}>{head.text}</span>
            <button className="btn btn-sm" onClick={() => { setEditing(isEditing ? null : { ...acc }); setAdding(null); }}>
              {isEditing ? "取消" : "编辑"}
            </button>
            <button className="btn-icon" title={acc.archived ? "取消归档" : "归档"}
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
              <button className="btn btn-primary btn-sm" onClick={() => { upsert(editing); setEditing(null); }}>保存修改</button>
              <button className="btn btn-sm" onClick={() => setEditing(null)}>取消</button>
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
            {acc.note ? <div className="tiny faint" style={{ marginTop: 8 }}>备注：{acc.note}</div> : null}
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
                    <div className="metric-label">资产</div>
                    <div className="metric-value num pos">{formatMoney(row.assets, c)}</div>
                  </div>
                  <div>
                    <div className="metric-label">负债</div>
                    <div className="metric-value num neg">{formatMoney(row.liabilities, c)}</div>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <div className="metric-label">净值</div>
                    <div className={`metric-value num ${row.net >= 0 ? "" : "neg"}`}>{formatMoney(row.net, c)}</div>
                  </div>
                </div>
                <div className="row tiny faint" style={{ marginTop: 8 }}>
                  {Object.entries(row.byKind).map(([kind, amt]) => (
                    <span key={kind} className="row" style={{ gap: 4 }}>
                      <span className="dot" style={{ background: KIND_META[kind]?.color, width: 7, height: 7 }} />
                      {KIND_META[kind]?.label} {formatMoney(amt, c)}
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
            title="还没有任何资产或负债"
            subtitle="把银行定期、股票账户、CPF、房贷登记进来，它们的利息、市值和欠款会自动往前算。"
            action={<button className="btn btn-primary" onClick={() => startAdd("cash")}><Plus size={13} />添加第一个账户</button>}
          />
        </Card>
      )}

      {alerts.map((a, i) => <Note key={i} tone={a.tone}>{a.message}</Note>)}

      {/* ---- toolbar ---- */}
      <div className="row-between">
        <div className="row">
          {ALL_KINDS.map((k) => (
            <button key={k} className="btn btn-sm" onClick={() => startAdd(k)}>
              <Plus size={12} />{KIND_META[k].label}
            </button>
          ))}
        </div>
        <div className="row">
          {accounts.some((a) => a.archived) && (
            <label className="check tiny">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              显示已归档
            </label>
          )}
          {summary.currencies.length > 0 && (
            <button className="btn btn-sm" onClick={makeSnapshot}><Camera size={13} />生成净资产快照</button>
          )}
        </div>
      </div>

      {snapshotNote && <Note>{snapshotNote}</Note>}

      {/* ---- quotes ---- */}
      {symbols.length > 0 && (
        <Card className="stack-sm">
          <div className="row-between">
            <div>
              <div className="card-title" style={{ margin: 0 }}>行情</div>
              <div className="tiny faint">
                {provider.label} · {symbols.length} 个代码
                {lastQuoteAt ? ` · 最后更新 ${String(lastQuoteAt).slice(0, 16).replace("T", " ")}` : " · 还没取过价"}
              </div>
            </div>
            <div className="row">
              <button className="btn btn-sm" onClick={goToSettings}>换行情源</button>
              <button className="btn btn-primary btn-sm" onClick={refreshQuotes}
                disabled={refreshing || quoteCfg.provider === "manual"}
                title={quoteCfg.provider === "manual" ? "当前行情源是手动输入" : ""}>
                {refreshing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                {refreshing ? `取价中 ${(progress?.index ?? 0) + 1}/${progress?.total ?? symbols.length}` : "刷新行情"}
              </button>
            </div>
          </div>
          {quoteCfg.provider === "manual" && (
            <Note>
              当前是「手动输入」模式，不会联网取价 —— 在持仓行里点铅笔图标手填价格即可。
              想自动更新的话，到<button className="btn btn-sm" style={{ margin: "0 4px" }} onClick={goToSettings}>设置</button>
              里选一个行情源。
            </Note>
          )}
          {quoteErrors.length > 0 && (
            <Note tone="warn">
              <div>取价没有全部成功：</div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {quoteErrors.slice(0, 6).map((e, i) => <li key={i}>{e.message}</li>)}
              </ul>
              <div className="tiny" style={{ marginTop: 4 }}>
                如果提示被浏览器拦下，多半是行情源不支持跨域，换一个行情源或在设置里配代理；也可以直接手填价格。
              </div>
            </Note>
          )}
          {summary.missingQuotes.length > 0 && !refreshing && (
            <div className="tiny faint">还缺价格：{summary.missingQuotes.join("、")}</div>
          )}
        </Card>
      )}

      {/* ---- add form ---- */}
      {adding && (
        <Card className="stack-sm">
          <div className="row-between">
            <div className="card-title" style={{ margin: 0 }}>新增：{KIND_META[adding.kind].label}</div>
            <select className="select w-auto" style={{ width: "auto" }} value={adding.kind}
              onChange={(e) => setAdding(newAccount(e.target.value, adding.currency))}>
              {ALL_KINDS.map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
            </select>
          </div>
          <AccountForm draft={adding} setDraft={setAdding} currencies={data.currencies} />
          <div className="row">
            <button className="btn btn-primary" onClick={commitAdd}>添加账户</button>
            <button className="btn" onClick={() => setAdding(null)}>取消</button>
          </div>
        </Card>
      )}

      {/* ---- lists ---- */}
      {assets.length > 0 && (
        <>
          <div className="card-title" style={{ marginBottom: -4 }}>资产</div>
          {assets.map(accountCard)}
        </>
      )}
      {liabilities.length > 0 && (
        <>
          <div className="card-title" style={{ marginBottom: -4 }}>负债</div>
          {liabilities.map(accountCard)}
        </>
      )}

      {confirmDelete && (
        <ConfirmBar
          text="删除这个账户？它的持仓、还款记录会一起删掉，已经生成的净资产快照不受影响。"
          confirmLabel="删除"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => removeAccount(confirmDelete)}
        />
      )}
    </div>
  );
}
