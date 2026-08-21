import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import { Upload as UploadIcon, CheckCircle2, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, Field, Note } from "../components/ui.jsx";
import { rowsToDrafts, categorize, txnSignature } from "../lib/parse.js";
import { formatMoney, uid } from "../lib/model.js";
import { useLang } from "../lib/i18n.js";

// A row with more fields than headers almost always means an unquoted comma
// inside a value — typically a thousands separator like -2,500.00. Left alone
// this silently imports 2.00 instead of 2500.00, so it must be surfaced loudly
// rather than tolerated.
function inspectCsv(parsed) {
  const bad = (parsed.errors || []).filter(
    (e) => e.code === "TooManyFields" || e.code === "TooFewFields"
  );
  if (!bad.length) return null;
  const rowNumbers = Array.from(new Set(bad.map((e) => (e.row ?? 0) + 2))).sort((a, b) => a - b);
  return {
    kind: bad[0].code,
    rowNumbers,
    count: rowNumbers.length,
  };
}

// Shows the arithmetic verification of a PDF parse. This is the main defence
// against silently importing a misread amount: the statement's own running
// balances and printed totals must agree with what we extracted.
function ReconciliationPanel({ recon, currency, t }) {
  if (!recon || !recon.checked) {
    return <Note tone="warn">{t("这份账单没有可用的期初余额，无法做对账校验，请自行抽查金额。")}</Note>;
  }
  if (recon.ok) {
    return (
      <div className="note note-info" style={{ borderColor: "#BFD9C7", background: "#F2F8F3" }}>
        <ShieldCheck size={15} color="#2F8558" />
        <div>
          <b style={{ color: "#2F8558" }}>{t("对账校验通过")}</b>
          <div className="tiny" style={{ marginTop: 3, lineHeight: 1.6 }}>
            {t("逐笔余额连续无误 · 期初 {opening} ＋ 存入 {deposits} － 支出 {withdrawals} ＝ 期末 {closing}", {
              opening: formatMoney(recon.opening, currency),
              deposits: formatMoney(recon.sumDeposits, currency),
              withdrawals: formatMoney(recon.sumWithdrawals, currency),
              closing: formatMoney(recon.closing, currency),
            })}
            {recon.totalsOk ? t(" · 与账单打印的合计金额一致") : ""}
          </div>
        </div>
      </div>
    );
  }
  return (
    <Note tone="error">
      <b>{t("对账校验未通过")}</b>
      <div className="tiny" style={{ marginTop: 4, lineHeight: 1.6 }}>
        {recon.rowMismatches.length > 0 && (
          <div>{t("有 {count} 行的余额对不上，例如：", { count: recon.rowMismatches.length })}
            {recon.rowMismatches.slice(0, 3).map((m, i) => (
              <div key={i} style={{ marginLeft: 8 }}>
                {m.date} {m.description}
                {t("：算出 {expected}，账单印的是 {printed}", {
                  expected: formatMoney(m.expected, currency),
                  printed: formatMoney(m.printed, currency),
                })}
              </div>
            ))}
          </div>
        )}
        {recon.closingOk === false && <div>{t("期末余额对不上（算出与账单打印值不一致）。")}</div>}
        {recon.totalsOk === false && <div>{t("支出/存入合计与账单打印的 Total 不一致。")}</div>}
      </div>
    </Note>
  );
}

export default function UploadView({ data, setData, goToReview }) {
  const { t } = useLang();
  const [step, setStep] = useState("select"); // select | map | preview | done
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [summary, setSummary] = useState(null);
  const [issues, setIssues] = useState(null);
  const [ackIssues, setAckIssues] = useState(false);
  const [pdfResult, setPdfResult] = useState(null);
  const [ackRecon, setAckRecon] = useState(false);

  const [mapping, setMapping] = useState({
    dateCol: 0, descCol: 1, amountMode: "single", amountCol: 2,
    debitCol: 2, creditCol: 3, reverseSign: false, dayFirst: true,
    currency: data.currencies[0], account: data.lastAccount || "",
  });

  function resetAll() {
    setStep("select"); setHeaders([]); setRows([]);
    setError(""); setPasteText(""); setSummary(null);
    setIssues(null); setAckIssues(false);
    setPdfResult(null); setAckRecon(false);
  }

  function ingest(hdrs, rws, structuralIssues = null) {
    if (!hdrs.length || !rws.length) {
      setError(t("没有解析到任何数据，请确认文件第一行是表头，且下面有数据行。"));
      return;
    }
    setIssues(structuralIssues);
    setAckIssues(false);
    setHeaders(hdrs);
    setRows(rws);
    setMapping((m) => ({
      ...m,
      dateCol: 0,
      descCol: Math.min(1, hdrs.length - 1),
      amountCol: Math.min(2, hdrs.length - 1),
      debitCol: Math.min(2, hdrs.length - 1),
      creditCol: Math.min(3, hdrs.length - 1),
    }));
    setError("");
    setStep("map");
  }

  async function handleFile(file) {
    setError("");
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        const hdrs = parsed.meta.fields || [];
        ingest(hdrs, parsed.data.map((obj) => hdrs.map((h) => String(obj[h] ?? ""))), inspectCsv(parsed));
      } else if (ext === "xlsx" || ext === "xls") {
        // xlsx is ~400kB; only pull it down when an Excel file is actually used.
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
        const hdrs = (aoa[0] || []).map((h) => String(h));
        const body = aoa.slice(1)
          .filter((r) => r.some((c) => String(c).trim() !== ""))
          .map((r) => hdrs.map((_h, i) => String(r[i] ?? "")));
        ingest(hdrs, body);
      } else if (ext === "pdf") {
        setStep("pdf-parsing");
        // pdf.js and the statement parsers are code-split: only fetched when a
        // PDF is actually opened.
        const [{ extractPages }, { detectParser }] = await Promise.all([
          import("../lib/pdf/extract.js"),
          import("../lib/statements/index.js"),
        ]);
        const pages = await extractPages(await file.arrayBuffer());
        const parser = detectParser(pages);
        if (!parser) {
          setError(t("这份 PDF 的版式还不认识。目前支持 OCBC 的 Statement of Account；其他银行需要我先看过样本再加适配。"));
          setStep("select");
          return;
        }
        const result = parser.parse(pages, { currency: mapping.currency });
        if (!result.transactions.length) {
          setError(t("识别到了账单版式，但没有解析出任何交易。请把这份 PDF 反馈一下，可能是版式有变化。"));
          setStep("select");
          return;
        }
        setPdfResult({ ...result, parserName: parser.name });
        setAckRecon(false);
        setMapping((m) => ({
          ...m,
          currency: result.currency || m.currency,
          account: m.account || (result.accountNumber ? `OCBC ${result.accountNumber.slice(-4)}` : ""),
        }));
        setStep("pdf-preview");
      } else {
        setError(t("暂不支持这个格式。请上传 PDF、CSV 或 Excel（.xlsx/.xls）。"));
      }
    } catch (e) {
      const detail = e && e.message ? e.message : t("请确认文件未损坏后重试。");
      setError(t("解析文件时出错：{detail}", { detail }));
      setStep("select");
    }
  }

  function handlePaste() {
    const parsed = Papa.parse(pasteText.trim(), { header: true, skipEmptyLines: true });
    const hdrs = parsed.meta.fields || [];
    ingest(hdrs, parsed.data.map((obj) => hdrs.map((h) => String(obj[h] ?? ""))), inspectCsv(parsed));
  }

  const drafts = useMemo(
    () => (step === "map" || step === "preview" ? rowsToDrafts(rows, mapping) : []),
    [rows, mapping, step]
  );

  function commit(sourceDrafts, source = "import") {
    const list = sourceDrafts || drafts;
    const seen = new Set(data.transactions.map((t) => txnSignature(t)));
    let added = 0, skipped = 0, autoCategorized = 0, needsReview = 0;
    const fresh = [];

    for (const d of list) {
      const sig = txnSignature(d, mapping.currency);
      if (seen.has(sig)) { skipped++; continue; }
      seen.add(sig);
      const categoryId = categorize(d.description, d.direction, data.rules);
      if (categoryId) autoCategorized++; else needsReview++;
      fresh.push({
        id: uid(),
        date: d.date,
        description: d.description,
        amount: d.amount,
        currency: mapping.currency,
        direction: d.direction,
        categoryId,
        account: mapping.account || t("未命名账户"),
        note: d.card ? t("卡号 {card}", { card: d.card }) : "",
        needsReview: !categoryId,
        source,
      });
      added++;
    }

    setData((prev) => ({
      ...prev,
      transactions: [...prev.transactions, ...fresh],
      lastAccount: mapping.account,
    }));
    setSummary({ added, skipped, autoCategorized, needsReview });
    setStep("done");
  }

  const colOptions = headers.map((h, i) => <option key={i} value={i}>{h || t("列 {n}", { n: i + 1 })}</option>);

  return (
    <div className="stack narrow">
      <Note>
        {t("支持 ")}<b>PDF</b>{t(" 对账单（目前适配 OCBC），以及 ")}<b>CSV</b>{t(" / ")}<b>Excel</b>{t("。")}
        {t("PDF 在本机解析，不上传任何服务器；解析后会用账单自带的余额和合计做一次对账校验。")}
        {t("重复的交易会自动跳过，同一份账单导入两次不会产生重复记录。")}
      </Note>

      {error && <Note tone="error">{error}</Note>}

      {step === "select" && (
        <Card>
          <label className="dropzone">
            <UploadIcon size={24} color="#5B6B60" />
            <div style={{ fontWeight: 500 }}>{t("点击选择文件")}</div>
            <div className="tiny faint">{t("支持 .pdf / .csv / .xlsx / .xls")}</div>
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,.txt"
              style={{ display: "none" }}
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            />
          </label>
          <div style={{ marginTop: 14 }}>
            <div className="tiny faint" style={{ marginBottom: 5 }}>{t("或者直接粘贴表格内容（第一行为表头）：")}</div>
            <textarea
              className="input"
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Date,Description,Amount\n2026-07-01,Salary,8000\n2026-07-03,NTUC Fairprice,-52.30"}
            />
            <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={!pasteText.trim()} onClick={handlePaste}>
              {t("解析粘贴内容")}
            </button>
          </div>
        </Card>
      )}

      {step === "map" && (
        <Card className="stack">
          <div className="card-title">{t("对应列与币种")}</div>
          <div className="grid-form">
            <Field label={t("日期列")}>
              <select className="select" value={mapping.dateCol} onChange={(e) => setMapping({ ...mapping, dateCol: +e.target.value })}>{colOptions}</select>
            </Field>
            <Field label={t("摘要 / 描述列")}>
              <select className="select" value={mapping.descCol} onChange={(e) => setMapping({ ...mapping, descCol: +e.target.value })}>{colOptions}</select>
            </Field>
            <Field label={t("金额格式")}>
              <select className="select" value={mapping.amountMode} onChange={(e) => setMapping({ ...mapping, amountMode: e.target.value })}>
                <option value="single">{t("单一金额列（正负号区分收支）")}</option>
                <option value="split">{t("借方 / 贷方分列")}</option>
              </select>
            </Field>
            {mapping.amountMode === "single" ? (
              <Field label={t("金额列")}>
                <select className="select" value={mapping.amountCol} onChange={(e) => setMapping({ ...mapping, amountCol: +e.target.value })}>{colOptions}</select>
              </Field>
            ) : (
              <>
                <Field label={t("支出（借方）列")}>
                  <select className="select" value={mapping.debitCol} onChange={(e) => setMapping({ ...mapping, debitCol: +e.target.value })}>{colOptions}</select>
                </Field>
                <Field label={t("收入（贷方）列")}>
                  <select className="select" value={mapping.creditCol} onChange={(e) => setMapping({ ...mapping, creditCol: +e.target.value })}>{colOptions}</select>
                </Field>
              </>
            )}
            <Field label={t("币种")}>
              <select className="select" value={mapping.currency} onChange={(e) => setMapping({ ...mapping, currency: e.target.value })}>
                {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t("账户名称")}>
              <input className="input" value={mapping.account} placeholder={t("例如：DBS 活期 / 招行储蓄卡")}
                onChange={(e) => setMapping({ ...mapping, account: e.target.value })} />
            </Field>
          </div>

          <label className="check">
            <input type="checkbox" checked={mapping.dayFirst}
              onChange={(e) => setMapping({ ...mapping, dayFirst: e.target.checked })} />
            {t("日期是「日/月/年」格式（美国账单请取消勾选）")}
          </label>
          {mapping.amountMode === "single" && (
            <label className="check">
              <input type="checkbox" checked={mapping.reverseSign}
                onChange={(e) => setMapping({ ...mapping, reverseSign: e.target.checked })} />
              {t("这份账单支出为正数、收入为负数（符号相反）")}
            </label>
          )}

          <div className="row">
            <button className="btn" onClick={resetAll}>{t("重新选择")}</button>
            <button className="btn btn-primary" onClick={() => setStep("preview")}>{t("下一步：预览")}</button>
          </div>
        </Card>
      )}

      {step === "preview" && (
        <Card className="stack">
          <div className="card-title">{t("预览 — 识别出 {n} 笔有效交易（原始 {total} 行）", { n: drafts.length, total: rows.length })}</div>
          {drafts.length === 0 && (
            <Note tone="warn">{t("一笔都没识别出来，通常是列对应错了或日期格式没被认出。返回上一步检查日期列和金额列。")}</Note>
          )}

          {issues && (
            <Note tone="error">
              <b>{t("这份文件有 {count} 行的列数对不上", { count: issues.count })}</b>
              {t("（第 {rows} 行）。", {
                rows: issues.rowNumbers.slice(0, 8).join("、") + (issues.rowNumbers.length > 8 ? t(" 等") : ""),
              })}
              {t("最常见的原因是金额里的千分位逗号没有加引号，例如")} <span className="mono-inline">-2,500.00</span> {t("会被当成两列，")}
              {t("金额就变成")} <span className="mono-inline">-2</span>{t("。")}
              <div style={{ marginTop: 6 }}>
                {t("建议先修好再导入：把 CSV 用 Excel 打开另存一次（会自动加引号），或直接上传 .xlsx 文件。")}
              </div>
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={ackIssues} onChange={(e) => setAckIssues(e.target.checked)} />
                {t("我已核对上面的预览金额无误，仍要导入")}
              </label>
            </Note>
          )}
          <div className="table-wrap" style={{ border: "1px solid var(--border-soft)", borderRadius: 10 }}>
            <table className="tbl">
              <thead>
                <tr><th>{t("日期")}</th><th>{t("描述")}</th><th>{t("方向")}</th><th className="ta-r">{t("金额")}</th></tr>
              </thead>
              <tbody>
                {drafts.slice(0, 8).map((tx, i) => (
                  <tr key={i}>
                    <td className="num nowrap">{tx.date}</td>
                    <td className="td-clip">{tx.description}</td>
                    <td className={tx.direction === "income" ? "pos" : "neg"}>{tx.direction === "income" ? t("收入") : t("支出")}</td>
                    <td className="ta-r num nowrap">{formatMoney(tx.amount, mapping.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {drafts.length > 8 && <div className="tiny faint">{t("仅显示前 8 行，其余 {n} 笔一并导入。", { n: drafts.length - 8 })}</div>}
          <div className="row">
            <button className="btn" onClick={() => setStep("map")}>{t("返回修改")}</button>
            <button className="btn btn-primary" disabled={!drafts.length || (issues && !ackIssues)} onClick={() => commit()}>
              {t("确认导入 {n} 笔", { n: drafts.length })}
            </button>
          </div>
        </Card>
      )}

      {step === "pdf-parsing" && (
        <Card>
          <div className="empty">
            <Loader2 size={22} className="spin" color="#2F6F5E" />
            <div style={{ marginTop: 10, fontWeight: 500 }}>{t("正在读取 PDF 对账单…")}</div>
            <p className="tiny">{t("全部在本机完成，文件不会上传到任何服务器。")}</p>
          </div>
        </Card>
      )}

      {step === "pdf-preview" && pdfResult && (
        <Card className="stack-sm">
          <div className="card-title">
            {pdfResult.parserName} · {t("识别出 {n} 笔交易", { n: pdfResult.transactions.length })}
          </div>
          <div className="tiny faint">
            {t("账号 {account}", { account: pdfResult.accountNumber || "—" })}
            {pdfResult.period ? t(" · 账期 {start} 至 {end}", { start: pdfResult.period.start, end: pdfResult.period.end }) : ""}
            {t(" · 共 {n} 个交易页", { n: pdfResult.statementPages })}
          </div>

          <ReconciliationPanel recon={pdfResult.reconciliation} currency={mapping.currency} t={t} />

          {pdfResult.warnings.length > 0 && (
            <Note tone="warn">
              <b>{t("解析提示")}</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {pdfResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Note>
          )}

          <div className="grid-form">
            <Field label={t("币种")}>
              <select className="select" value={mapping.currency}
                onChange={(e) => setMapping({ ...mapping, currency: e.target.value })}>
                {data.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t("账户名称")}>
              <input className="input" value={mapping.account} placeholder={t("例如：OCBC 储蓄")}
                onChange={(e) => setMapping({ ...mapping, account: e.target.value })} />
            </Field>
          </div>

          <div className="table-wrap" style={{ border: "1px solid var(--border-soft)", borderRadius: 10, maxHeight: 320, overflowY: "auto" }}>
            <table className="tbl">
              <thead>
                <tr><th>{t("日期")}</th><th>{t("描述")}</th><th className="ta-r">{t("金额")}</th><th className="ta-r">{t("余额")}</th></tr>
              </thead>
              <tbody>
                {pdfResult.transactions.map((tx, i) => (
                  <tr key={i}>
                    <td className="num nowrap">{tx.date}</td>
                    <td className="td-clip" title={tx.raw}>{tx.description}</td>
                    <td className={`ta-r num nowrap ${tx.direction === "income" ? "pos" : "neg"}`}>
                      {tx.direction === "income" ? "+" : "-"}{formatMoney(tx.amount, mapping.currency)}
                    </td>
                    <td className="ta-r num nowrap faint">{tx.balance != null ? formatMoney(tx.balance, mapping.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!pdfResult.reconciliation.ok && (
            <Note tone="error">
              {t("对账校验没有通过，说明至少有一笔金额被读错了。")}<b>{t("不建议直接导入。")}</b>
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={ackRecon} onChange={(e) => setAckRecon(e.target.checked)} />
                {t("我已逐笔核对上面的明细，确认无误，仍要导入")}
              </label>
            </Note>
          )}

          <div className="row">
            <button className="btn" onClick={resetAll}>{t("重新选择")}</button>
            <button
              className="btn btn-primary"
              disabled={!pdfResult.reconciliation.ok && !ackRecon}
              onClick={() => commit(pdfResult.transactions, "import-pdf")}
            >
              {t("确认导入 {n} 笔", { n: pdfResult.transactions.length })}
            </button>
          </div>
        </Card>
      )}

      {step === "done" && summary && (
        <Card className="stack">
          <div className="card-title pos" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={17} />{t("导入完成")}
          </div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>{t("新增 ")}<b>{summary.added}</b>{t(" 笔交易（跳过 {skipped} 笔重复）", { skipped: summary.skipped })}</li>
            <li>{t("自动分类 ")}<b>{summary.autoCategorized}</b>{t(" 笔")}</li>
            <li>{t("需要你确认 ")}<b>{summary.needsReview}</b>{t(" 笔")}</li>
          </ul>
          <Note tone="warn">{t("数据还在本机。记得点右上角的「保存到 GitHub」，否则换设备看不到。")}</Note>
          <div className="row">
            <button className="btn" onClick={resetAll}>{t("继续导入下一份")}</button>
            {summary.needsReview > 0 && (
              <button className="btn btn-amber" onClick={goToReview}>{t("去确认这 {n} 笔", { n: summary.needsReview })}</button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
