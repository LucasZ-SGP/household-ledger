import React, { useState, useRef } from "react";
import { X, Download, FileUp, RefreshCw, CheckCircle2, Loader2, History } from "lucide-react";
import { Card, Field, Note, ConfirmBar } from "../components/ui.jsx";
import { accentFor, freshState, normalizeState } from "../lib/model.js";
import { verifyAccess, historyUrl } from "../lib/github.js";

export default function Settings({ data, setData, cfg, setCfg, onReload }) {
  const [form, setForm] = useState(cfg);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [newCcy, setNewCcy] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  async function saveConnection() {
    setChecking(true);
    setCheckResult(null);
    try {
      const info = await verifyAccess(form);
      setCfg(form);
      setCheckResult({
        ok: true,
        message: `已连接 ${info.fullName}${info.private ? "（私有）" : "（公开 — 建议改成私有仓库）"}`,
      });
    } catch (e) {
      setCheckResult({ ok: false, message: e.message });
    } finally {
      setChecking(false);
    }
  }

  function addCurrency() {
    const c = newCcy.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c) || data.currencies.includes(c)) return;
    setData((prev) => ({
      ...prev,
      currencies: [...prev.currencies, c],
      inflationRates: { ...prev.inflationRates, [c]: 2 },
    }));
    setNewCcy("");
  }

  function removeCurrency(c) {
    const inUse = data.transactions.some((t) => t.currency === c)
      || data.netWorthEntries.some((e) => e.currency === c);
    if (inUse || data.currencies.length <= 1) return;
    setData((prev) => ({ ...prev, currencies: prev.currencies.filter((x) => x !== c) }));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setData(normalizeState(JSON.parse(String(reader.result))));
      } catch {
        alert("文件不是合法的 JSON，无法导入。");
      }
    };
    reader.readAsText(file);
  }

  const currencyInUse = (c) =>
    data.transactions.some((t) => t.currency === c) || data.netWorthEntries.some((e) => e.currency === c);

  return (
    <div className="stack narrow">
      <Card className="stack-sm">
        <div className="card-title">GitHub 同步</div>
        <div className="tiny faint">
          账本以一个 JSON 文件的形式存在你的私有仓库里，每次保存是一次 commit。
          Token 只保存在这台设备的浏览器里，不会上传到任何地方。
        </div>
        <div className="grid-form">
          <Field label="GitHub 用户名">
            <input className="input" value={form.owner} placeholder="your-username"
              onChange={(e) => setForm({ ...form, owner: e.target.value.trim() })} />
          </Field>
          <Field label="仓库名">
            <input className="input" value={form.repo} placeholder="ledger-data"
              onChange={(e) => setForm({ ...form, repo: e.target.value.trim() })} />
          </Field>
          <Field label="文件路径">
            <input className="input" value={form.path} placeholder="ledger.json"
              onChange={(e) => setForm({ ...form, path: e.target.value.trim() })} />
          </Field>
          <Field label="分支">
            <input className="input" value={form.branch} placeholder="main"
              onChange={(e) => setForm({ ...form, branch: e.target.value.trim() })} />
          </Field>
        </div>
        <Field label="Fine-grained Personal Access Token">
          <input className="input" type="password" value={form.token} placeholder="github_pat_..."
            onChange={(e) => setForm({ ...form, token: e.target.value.trim() })} />
        </Field>
        <div className="row">
          <button className="btn btn-primary" onClick={saveConnection}
            disabled={checking || !form.owner || !form.repo || !form.token}>
            {checking ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />}
            {checking ? "检查中…" : "验证并保存"}
          </button>
          {cfg.owner && cfg.repo && (
            <>
              <button className="btn" onClick={onReload}><RefreshCw size={13} />从 GitHub 重新加载</button>
              <a className="btn" href={historyUrl(cfg)} target="_blank" rel="noreferrer">
                <History size={13} />查看历史版本
              </a>
            </>
          )}
        </div>
        {checkResult && <Note tone={checkResult.ok ? "info" : "error"}>{checkResult.message}</Note>}
        <Note tone="warn">
          Token 请用 fine-grained 类型，Repository access 只勾选这一个仓库，
          权限只给 <b>Contents: Read and write</b>。这样即使泄露，影响也仅限于这个账本仓库。
        </Note>
      </Card>

      <Card className="stack-sm">
        <div className="card-title">通货膨胀率（年化 %）</div>
        <div className="tiny faint">用于总览页的「通胀调整」开关，把历史金额折算成今日购买力。</div>
        {data.currencies.map((c) => (
          <div className="row" key={c}>
            <span className="num" style={{ width: 52, color: accentFor(c) }}>{c}</span>
            <input className="input" type="number" step="0.1" style={{ width: 100 }}
              value={data.inflationRates[c] ?? 0}
              onChange={(e) => setData((prev) => ({
                ...prev,
                inflationRates: { ...prev.inflationRates, [c]: parseFloat(e.target.value) || 0 },
              }))} />
            <span className="small faint">%</span>
          </div>
        ))}
      </Card>

      <Card className="stack-sm">
        <div className="card-title">币种管理</div>
        <div className="row">
          {data.currencies.map((c) => (
            <span key={c} className="chip" style={{ cursor: "default" }}>
              {c}
              {!currencyInUse(c) && data.currencies.length > 1 && (
                <button className="btn-icon" style={{ padding: 0 }} onClick={() => removeCurrency(c)}>
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="tiny faint">已有交易记录的币种不能删除。</div>
        <div className="row" style={{ flexWrap: "nowrap", maxWidth: 320 }}>
          <input className="input" maxLength={3} placeholder="新增币种代码，如 JPY"
            value={newCcy} onChange={(e) => setNewCcy(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCurrency()} />
          <button className="btn btn-primary" onClick={addCurrency}>添加</button>
        </div>
      </Card>

      <Card className="stack-sm">
        <div className="card-title">本地备份</div>
        <div className="tiny faint">
          GitHub 已经保留了每次保存的历史版本，这里的导出主要用于离线留档或迁移到别处。
        </div>
        <div className="row">
          <button className="btn" onClick={exportJson}><Download size={13} />导出 JSON</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><FileUp size={13} />导入 JSON</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
          <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
            <RefreshCw size={13} />清空本地数据
          </button>
        </div>
        {confirmReset && (
          <ConfirmBar
            text="清空当前浏览器里的账本数据。GitHub 上已保存的版本不受影响，可以重新加载回来。"
            confirmLabel="确认清空"
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => { setData(freshState()); setConfirmReset(false); }}
          />
        )}
      </Card>
    </div>
  );
}
