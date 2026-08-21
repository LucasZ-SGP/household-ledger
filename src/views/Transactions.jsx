import React, { useState, useMemo } from "react";
import { List, Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, Field, ConfirmBar } from "../components/ui.jsx";
import { formatMoney, uid } from "../lib/model.js";
import { useLang } from "../lib/i18n.js";

function AddForm({ data, setData, onDone }) {
  const { t } = useLang();
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "", amount: "", currency: data.currencies[0],
    direction: "expense", categoryId: "", account: "现金",
  });

  function submit() {
    const amt = parseFloat(f.amount);
    if (!f.date || !f.description.trim() || !amt || amt <= 0) return;
    setData((prev) => ({
      ...prev,
      transactions: [...prev.transactions, {
        id: uid(),
        date: f.date,
        description: f.description.trim(),
        amount: Math.abs(amt),
        currency: f.currency,
        direction: f.direction,
        categoryId: f.categoryId || null,
        account: f.account || "现金",
        note: "",
        needsReview: !f.categoryId,
        source: "manual",
      }],
    }));
    onDone();
  }

  return (
    <Card className="stack-sm">
      <div className="grid-form">
        <Field label={t("日期")}>
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label={t("描述")}>
          <input className="input" placeholder={t("例如：给妈妈生活费")} value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label={t("金额")}>
          <input className="input" type="number" step="0.01" value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label={t("币种")}>
          <select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={t("方向")}>
          <select className="select" value={f.direction}
            onChange={(e) => setF({ ...f, direction: e.target.value, categoryId: "" })}>
            <option value="expense">{t("支出")}</option>
            <option value="income">{t("收入")}</option>
          </select>
        </Field>
        <Field label={t("分类")}>
          <select className="select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">{t("待确认")}</option>
            {data.categories[f.direction].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label={t("账户")}>
          <input className="input" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} />
        </Field>
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={submit}>{t("添加交易")}</button>
        <button className="btn" onClick={onDone}>{t("取消")}</button>
      </div>
    </Card>
  );
}

export default function Transactions({ data, setData }) {
  const { t } = useLang();
  const [ccy, setCcy] = useState("全部");
  const [dir, setDir] = useState("全部");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.transactions
      .filter((t) => ccy === "全部" || t.currency === ccy)
      .filter((t) => dir === "全部" || t.direction === dir)
      .filter((t) => !needle || t.description.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [data.transactions, ccy, dir, q]);

  const patch = (id, changes) =>
    setData((prev) => ({
      ...prev,
      transactions: prev.transactions.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }));

  const remove = (id) => {
    setData((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));
    setConfirmDelete(null);
  };

  return (
    <div className="stack">
      <div className="row-between">
        <div className="row">
          <select className="select w-auto" value={ccy} onChange={(e) => setCcy(e.target.value)}>
            <option value="全部">{t("全部币种")}</option>
            {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select w-auto" value={dir} onChange={(e) => setDir(e.target.value)}>
            <option value="全部">{t("收入与支出")}</option>
            <option value="income">{t("仅收入")}</option>
            <option value="expense">{t("仅支出")}</option>
          </select>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 8, top: 9, color: "var(--ink-faint)" }} />
            <input className="input" style={{ paddingLeft: 26, width: 170 }} placeholder={t("搜索描述…")}
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
          <Plus size={13} />{t("手动添加")}
        </button>
      </div>

      {showAdd && <AddForm data={data} setData={setData} onDone={() => setShowAdd(false)} />}

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={List} title={t("没有符合条件的交易")} subtitle={t("调整筛选条件，或先去导入一份账单。")} />
        </Card>
      ) : (
        <Card className="flush">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("日期")}</th><th>{t("描述")}</th><th>{t("分类")}</th><th>{t("账户")}</th><th className="ta-r">{t("金额")}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="num nowrap">{tx.date}</td>
                    <td className="td-clip" title={tx.description}>{tx.description}</td>
                    <td>
                      <select
                        className="select"
                        style={{
                          fontSize: 12, padding: "3px 6px", width: "auto",
                          borderColor: tx.needsReview ? "#E9C888" : "var(--border)",
                          color: tx.needsReview ? "var(--amber)" : "var(--ink)",
                        }}
                        value={tx.categoryId || ""}
                        onChange={(e) => patch(tx.id, { categoryId: e.target.value || null, needsReview: !e.target.value })}
                      >
                        <option value="">{t("待确认")}</option>
                        {data.categories[tx.direction].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </td>
                    <td className="tiny muted nowrap">{tx.account}</td>
                    <td className={`ta-r num nowrap ${tx.direction === "income" ? "pos" : "neg"}`}>
                      {tx.direction === "income" ? "+" : "-"}{formatMoney(tx.amount, tx.currency)}
                    </td>
                    <td>
                      <button className="btn-icon" title={t("删除")} onClick={() => setConfirmDelete(tx.id)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {confirmDelete && (
        <ConfirmBar
          text={t("删除这笔交易？保存到 GitHub 之前仍可以刷新页面撤销。")}
          confirmLabel={t("删除")}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete)}
        />
      )}
    </div>
  );
}
