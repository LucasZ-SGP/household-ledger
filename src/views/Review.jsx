import React, { useState, useMemo } from "react";
import { CheckCircle2, Check } from "lucide-react";
import { Card, EmptyState } from "../components/ui.jsx";
import { groupBy, sumBy } from "../lib/agg.js";
import { formatMoney, uid, INCOME_PALETTE, EXPENSE_PALETTE } from "../lib/model.js";

const NEW_CAT = "__new__";

export default function Review({ data, setData }) {
  const pending = useMemo(() => data.transactions.filter((t) => t.needsReview), [data.transactions]);

  const groups = useMemo(() => {
    const g = groupBy(pending, (t) => `${t.direction}::${t.description.trim().toLowerCase()}`);
    return Object.values(g).sort((a, b) => b.length - a.length);
  }, [pending]);

  const [picks, setPicks] = useState({});

  const keyOf = (group) => `${group[0].direction}::${group[0].description.trim().toLowerCase()}`;

  const pickFor = (group) =>
    picks[keyOf(group)] || { categoryId: "", makeRule: true, pattern: group[0].description.trim(), newName: "" };

  const update = (group, patch) => {
    const k = keyOf(group);
    setPicks((p) => ({ ...p, [k]: { ...pickFor(group), ...patch } }));
  };

  function applyGroup(group) {
    const pick = pickFor(group);
    const direction = group[0].direction;
    let categoryId = pick.categoryId;
    let newCategory = null;

    if (categoryId === NEW_CAT) {
      const name = (pick.newName || "").trim();
      if (!name) return;
      const palette = direction === "income" ? INCOME_PALETTE : EXPENSE_PALETTE;
      newCategory = {
        id: uid(),
        name,
        color: palette[data.categories[direction].length % palette.length],
      };
      categoryId = newCategory.id;
    }
    if (!categoryId) return;

    const ids = new Set(group.map((t) => t.id));
    setData((prev) => {
      const categories = newCategory
        ? { ...prev.categories, [direction]: [...prev.categories[direction], newCategory] }
        : prev.categories;

      const rules = (pick.makeRule && (pick.pattern || "").trim())
        ? [...prev.rules, { id: uid(), pattern: pick.pattern.trim(), categoryId, direction }]
        : prev.rules;

      // Applying a rule here also sweeps up any other still-pending transaction
      // that matches it, so confirming once can clear several groups at a time.
      const pat = (pick.pattern || "").trim().toLowerCase();
      const transactions = prev.transactions.map((t) => {
        if (ids.has(t.id)) return { ...t, categoryId, needsReview: false };
        if (pick.makeRule && pat && t.needsReview && t.direction === direction
            && t.description.toLowerCase().includes(pat)) {
          return { ...t, categoryId, needsReview: false };
        }
        return t;
      });

      return { ...prev, categories, rules, transactions };
    });

    setPicks((p) => {
      const next = { ...p };
      delete next[keyOf(group)];
      return next;
    });
  }

  if (!pending.length) {
    return (
      <Card>
        <EmptyState
          icon={CheckCircle2}
          title="没有待确认的交易"
          subtitle="已导入的交易都分类完毕了。导入新账单后，关键词规则匹配不到的交易会出现在这里。"
        />
      </Card>
    );
  }

  return (
    <div className="stack narrow">
      <div className="small muted">
        {pending.length} 笔待确认，按相同描述归为 {groups.length} 组。确认一组会套用到该组全部交易。
      </div>

      {groups.map((group) => {
        const k = keyOf(group);
        const pick = pickFor(group);
        const direction = group[0].direction;
        const options = data.categories[direction];
        const total = sumBy(group, (t) => t.amount);
        const canConfirm = pick.categoryId && (pick.categoryId !== NEW_CAT || (pick.newName || "").trim());

        return (
          <Card key={k} className="stack-sm">
            <div className="row-between" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{group[0].description}</div>
                <div className="tiny faint" style={{ marginTop: 2 }}>
                  {group.length} 笔 · {direction === "income" ? "收入" : "支出"} · 合计 {formatMoney(total, group[0].currency)} · {group[0].currency}
                </div>
              </div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <select
                  className="select w-auto"
                  value={pick.categoryId}
                  onChange={(e) => update(group, { categoryId: e.target.value })}
                >
                  <option value="">选择分类…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  <option value={NEW_CAT}>+ 新建分类…</option>
                </select>
                {pick.categoryId === NEW_CAT && (
                  <input
                    className="input w-auto"
                    style={{ width: 130 }}
                    placeholder="新分类名称"
                    value={pick.newName}
                    onChange={(e) => update(group, { newName: e.target.value })}
                  />
                )}
                <button className="btn btn-primary" disabled={!canConfirm} onClick={() => applyGroup(group)}>
                  <Check size={13} />确认
                </button>
              </div>
            </div>

            <label className="check tiny" style={{ color: "var(--ink-soft)" }}>
              <input type="checkbox" checked={pick.makeRule} onChange={(e) => update(group, { makeRule: e.target.checked })} />
              记住规则：以后描述包含
              <input
                className="input"
                style={{ width: 150, padding: "2px 6px", fontSize: 11 }}
                value={pick.pattern}
                onChange={(e) => update(group, { pattern: e.target.value })}
              />
              的交易自动归入此类
            </label>
          </Card>
        );
      })}
    </div>
  );
}
