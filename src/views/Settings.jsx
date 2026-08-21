import React, { useState, useRef } from "react";
import { X, Download, FileUp, RefreshCw, CheckCircle2, Loader2, History, ExternalLink, LineChart, Languages } from "lucide-react";
import { Card, Field, Note, ConfirmBar } from "../components/ui.jsx";
import { accentFor, freshState, normalizeState } from "../lib/model.js";
import { verifyAccess, historyUrl } from "../lib/github.js";
import { QUOTE_PROVIDERS, providerMeta, fetchQuote } from "../lib/quotes.js";
import { useLang } from "../lib/i18n.js";

export default function Settings({ data, setData, cfg, setCfg, quoteCfg, setQuoteCfg, onReload }) {
  const { t, lang, setLang } = useLang();
  const [form, setForm] = useState(cfg);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [newCcy, setNewCcy] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [quoteTest, setQuoteTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const fileRef = useRef(null);
  const provider = providerMeta(quoteCfg?.provider);

  async function saveConnection() {
    setChecking(true);
    setCheckResult(null);
    try {
      const info = await verifyAccess(form);
      setCfg(form);
      setCheckResult({
        ok: true,
        message: t(info.private ? "已连接 {repo}（私有）" : "已连接 {repo}（公开 — 建议改成私有仓库）", { repo: info.fullName }),
      });
    } catch (e) {
      setCheckResult({ ok: false, message: t(e.message) });
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
    const inUse = currencyInUse(c);
    if (inUse || data.currencies.length <= 1) return;
    setData((prev) => ({ ...prev, currencies: prev.currencies.filter((x) => x !== c) }));
  }

  // A real round-trip against the real endpoint — the only way to find out
  // whether this browser can reach that host without being blocked.
  async function testQuote() {
    setTesting(true);
    setQuoteTest(null);
    try {
      const symbol = quoteCfg.provider === "stooq" ? "qqq.us" : "QQQ";
      const q = await fetchQuote(symbol, quoteCfg);
      setQuoteTest({
        ok: true,
        message: t("取到 {symbol} = {price}{ccy}（{when}）", {
          symbol: q.symbol, price: q.price, ccy: q.currency ? " " + q.currency : "",
          when: String(q.asOf || "").slice(0, 10) || t("刚刚"),
        }),
      });
    } catch (e) {
      setQuoteTest({ ok: false, message: t(e.message) });
    } finally {
      setTesting(false);
    }
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
        alert(t("文件不是合法的 JSON，无法导入。"));
      }
    };
    reader.readAsText(file);
  }

  const currencyInUse = (c) =>
    data.transactions.some((t) => t.currency === c)
    || data.netWorthEntries.some((e) => e.currency === c)
    || (data.accounts || []).some((a) => a.currency === c || (a.holdings || []).some((h) => h.currency === c));

  return (
    <div className="stack narrow">
      <Card className="stack-sm">
        <div className="card-title"><Languages size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{t("语言")}</div>
        <div className="tiny faint">{t("切换界面语言，你自己填写的分类名称、备注等内容不会被翻译。")}</div>
        <div className="row">
          <button className={`btn btn-sm ${lang === "zh" ? "btn-primary" : ""}`} onClick={() => setLang("zh")}>中文</button>
          <button className={`btn btn-sm ${lang === "en" ? "btn-primary" : ""}`} onClick={() => setLang("en")}>English</button>
        </div>
      </Card>

      <Card className="stack-sm">
        <div className="card-title">{t("GitHub 同步")}</div>
        <div className="tiny faint">
          {t("账本以一个 JSON 文件的形式存在你的私有仓库里，每次保存是一次 commit。Token 只保存在这台设备的浏览器里，不会上传到任何地方。")}
        </div>
        <div className="grid-form">
          <Field label={t("GitHub 用户名")}>
            <input className="input" value={form.owner} placeholder="your-username"
              onChange={(e) => setForm({ ...form, owner: e.target.value.trim() })} />
          </Field>
          <Field label={t("仓库名")}>
            <input className="input" value={form.repo} placeholder="ledger-data"
              onChange={(e) => setForm({ ...form, repo: e.target.value.trim() })} />
          </Field>
          <Field label={t("文件路径")}>
            <input className="input" value={form.path} placeholder="ledger.json"
              onChange={(e) => setForm({ ...form, path: e.target.value.trim() })} />
          </Field>
          <Field label={t("分支")}>
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
            {checking ? t("检查中…") : t("验证并保存")}
          </button>
          {cfg.owner && cfg.repo && (
            <>
              <button className="btn" onClick={onReload}><RefreshCw size={13} />{t("从 GitHub 重新加载")}</button>
              <a className="btn" href={historyUrl(cfg)} target="_blank" rel="noreferrer">
                <History size={13} />{t("查看历史版本")}
              </a>
            </>
          )}
        </div>
        {checkResult && <Note tone={checkResult.ok ? "info" : "error"}>{checkResult.message}</Note>}
        <Note tone="warn">
          {t("Token 请用 fine-grained 类型，Repository access 只勾选这一个仓库，权限只给")} <b>Contents: Read and write</b>。
          {t("这样即使泄露，影响也仅限于这个账本仓库。")}
        </Note>
      </Card>

      <Card className="stack-sm">
        <div className="card-title"><LineChart size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{t("行情数据源（股票价格）")}</div>
        <div className="tiny faint">
          {t("「资产负债」页里的持仓靠这个自动取价。因为整个应用没有后端，请求是从你的浏览器直接发出去的 —— 行情源必须允许跨域访问才能用。取不到也不影响记账：可以在持仓里直接手填价格。")}
        </div>
        <div className="tiny faint">
          {t("这里只管股票价格。净资产页的币种换算走的是另一个免费、无需 Key 的汇率源，不受这里的设置影响（代理地址除外）。")}
        </div>
        <div className="grid-form">
          <Field label={t("行情源")}>
            <select className="select" value={quoteCfg?.provider || "manual"}
              onChange={(e) => { setQuoteCfg({ ...quoteCfg, provider: e.target.value }); setQuoteTest(null); }}>
              {QUOTE_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
            </select>
          </Field>
          {provider.needsKey && (
            <Field label="API Key">
              <input className="input" type="password" value={quoteCfg?.apiKey || ""} placeholder={t("粘贴 API Key")}
                onChange={(e) => setQuoteCfg({ ...quoteCfg, apiKey: e.target.value.trim() })} />
            </Field>
          )}
        </div>
        <div className="tiny faint">{t(provider.blurb)}</div>
        {provider.signup && (
          <a className="link tiny" href={provider.signup} target="_blank" rel="noreferrer">
            {t("去申请免费 Key")} <ExternalLink size={10} style={{ verticalAlign: -1 }} />
          </a>
        )}
        {quoteCfg?.provider !== "manual" && (
          <>
            <Field label={t("代理地址（可选）")}>
              <input className="input" value={quoteCfg?.proxy || ""} placeholder="https://your-worker.workers.dev/?url={url}"
                onChange={(e) => setQuoteCfg({ ...quoteCfg, proxy: e.target.value.trim() })} />
            </Field>
            <div className="tiny faint">
              {t("只有在行情源被浏览器以跨域为由拦下时才需要。写成")} <span className="mono-inline">{"https://…/?url={url}"}</span> {t("会把目标地址编码后填进")} <span className="mono-inline">{"{url}"}</span>{t("；不带占位符则直接当前缀拼接。注意代理方能看到你查了哪些股票代码，最好用自己部署的。")}
            </div>
            <div className="row">
              <button className="btn" onClick={testQuote} disabled={testing}>
                {testing ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />}
                {testing ? t("测试中…") : t("用 QQQ 测一下")}
              </button>
            </div>
            {quoteTest && <Note tone={quoteTest.ok ? "info" : "error"}>{quoteTest.message}</Note>}
          </>
        )}
        <Note tone="warn">
          {t("API Key 和 GitHub Token 一样只存在这台设备的浏览器里，不会写进账本文件、也不会提交到仓库。")}
        </Note>
      </Card>

      <Card className="stack-sm">
        <div className="card-title">{t("通货膨胀率（年化 %）")}</div>
        <div className="tiny faint">{t("用于总览页的「通胀调整」开关，把历史金额折算成今日购买力。")}</div>
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
        <div className="card-title">{t("币种管理")}</div>
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
        <div className="tiny faint">{t("已有交易记录的币种不能删除。")}</div>
        <div className="row" style={{ flexWrap: "nowrap", maxWidth: 320 }}>
          <input className="input" maxLength={3} placeholder={t("新增币种代码，如 JPY")}
            value={newCcy} onChange={(e) => setNewCcy(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCurrency()} />
          <button className="btn btn-primary" onClick={addCurrency}>{t("添加")}</button>
        </div>
      </Card>

      <Card className="stack-sm">
        <div className="card-title">{t("本地备份")}</div>
        <div className="tiny faint">
          {t("GitHub 已经保留了每次保存的历史版本，这里的导出主要用于离线留档或迁移到别处。")}
        </div>
        <div className="row">
          <button className="btn" onClick={exportJson}><Download size={13} />{t("导出 JSON")}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><FileUp size={13} />{t("导入 JSON")}</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
          <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
            <RefreshCw size={13} />{t("清空本地数据")}
          </button>
        </div>
        {confirmReset && (
          <ConfirmBar
            text={t("清空当前浏览器里的账本数据。GitHub 上已保存的版本不受影响，可以重新加载回来。")}
            confirmLabel={t("确认清空")}
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => { setData(freshState()); setConfirmReset(false); }}
          />
        )}
      </Card>
    </div>
  );
}
