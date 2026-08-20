import React, { useState } from "react";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { Card, ConfirmBar } from "../components/ui.jsx";
import { uid, catName, INCOME_PALETTE, EXPENSE_PALETTE } from "../lib/model.js";

export default function Categories({ data, setData }) {
  const [draft, setDraft] = useState({ income: "", expense: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const usage = (id) => data.transactions.filter((t) => t.categoryId === id).length;

  function addCategory(direction) {
    const name = draft[direction].trim();
    if (!name) return;
    const palette = direction === "income" ? INCOME_PALETTE : EXPENSE_PALETTE;
    setData((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [direction]: [...prev.categories[direction], {
          id: uid(), name, color: palette[prev.categories[direction].length % palette.length],
        }],
      },
    }));
    setDraft({ ...draft, [direction]: "" });
  }

  function removeCategory(direction, id) {
    setData((prev) => ({
      ...prev,
      categories: { ...prev.categories, [direction]: prev.categories[direction].filter((c) => c.id !== id) },
      // Transactions using the deleted category fall back into the review queue
      // rather than silently losing their classification.
      transactions: prev.transactions.map((t) =>
        t.categoryId === id ? { ...t, categoryId: null, needsReview: true } : t),
      rules: prev.rules.filter((r) => r.categoryId !== id),
    }));
    setConfirmDelete(null);
  }

  return (
    <div className="stack narrow">
      <div className="grid-2">
        {["income", "expense"].map((direction) => (
          <Card key={direction} className="stack-sm">
            <div className="card-title">{direction === "income" ? "收入分类" : "支出分类"}</div>
            {data.categories[direction].map((c) => (
              <div className="legend-row" key={c.id}>
                <span className="dot" style={{ background: c.color }} />
                <span style={{ flex: 1 }}>{c.name}</span>
                <span className="tiny faint">{usage(c.id)} 笔</span>
                <button className="btn-icon"
                  onClick={() => setConfirmDelete({ direction, id: c.id, name: c.name })}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <div className="row" style={{ flexWrap: "nowrap", marginTop: 4 }}>
              <input className="input" placeholder="新增分类名称" value={draft[direction]}
                onChange={(e) => setDraft({ ...draft, [direction]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addCategory(direction)} />
              <button className="btn btn-primary" onClick={() => addCategory(direction)}><Plus size={13} /></button>
            </div>
          </Card>
        ))}
      </div>

      {confirmDelete && (
        <ConfirmBar
          text={`删除分类「${confirmDelete.name}」？使用它的 ${usage(confirmDelete.id)} 笔交易会退回待确认。`}
          confirmLabel="删除"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => removeCategory(confirmDelete.direction, confirmDelete.id)}
        />
      )}

      <Card className="stack-sm">
        <div className="card-title">自动分类规则</div>
        <div className="tiny faint">
          描述中包含关键词时自动归类。规则按顺序匹配，第一条命中即生效。在「待确认」里确认交易时会自动生成新规则。
        </div>
        {data.rules.length === 0 ? (
          <div className="small faint">暂无规则</div>
        ) : (
          data.rules.map((r) => (
            <div className="legend-row" key={r.id}>
              <span className="tiny" style={{ background: "#F0F2EC", padding: "2px 6px", borderRadius: 4, color: "var(--ink-soft)" }}>
                {r.direction === "income" ? "收入" : "支出"}
              </span>
              <span className="mono-inline">{r.pattern}</span>
              <ChevronRight size={12} className="faint" />
              <span style={{ flex: 1 }}>{catName(data.categories, r.direction, r.categoryId)}</span>
              <button className="btn-icon"
                onClick={() => setData((prev) => ({ ...prev, rules: prev.rules.filter((x) => x.id !== r.id) }))}>
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
