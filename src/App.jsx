import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  PieChart as PieIcon, Upload as UploadIcon, AlertCircle, List, Landmark,
  Coins, Settings as SettingsIcon, Menu, Cloud, CloudOff, Loader2, Wallet, CalendarDays,
  CheckCircle2, Save, RefreshCw,
} from "lucide-react";
import { Note, ConfirmBar } from "./components/ui.jsx";
import Dashboard from "./views/Dashboard.jsx";
import UploadView from "./views/Upload.jsx";
import Review from "./views/Review.jsx";
import Transactions from "./views/Transactions.jsx";
import NetWorth from "./views/NetWorth.jsx";
import Assets from "./views/Assets.jsx";
import Monthly from "./views/Monthly.jsx";
import Categories from "./views/Categories.jsx";
import Settings from "./views/Settings.jsx";
import { freshState, normalizeState } from "./lib/model.js";
import { loadLedger, saveLedger } from "./lib/github.js";
import { EMPTY_QUOTE_CFG } from "./lib/quotes.js";
import { LangProvider, useLang } from "./lib/i18n.js";

const CFG_KEY = "ledger.github.config";
const CACHE_KEY = "ledger.cache";
// The market-data key lives beside the GitHub token — on this device only,
// never in the ledger file that gets committed.
const QUOTE_CFG_KEY = "ledger.quotes.config";

const NAV = [
  { id: "dashboard", label: "总览", icon: PieIcon },
  { id: "upload", label: "导入账单", icon: UploadIcon },
  { id: "review", label: "待确认", icon: AlertCircle },
  { id: "transactions", label: "交易记录", icon: List },
  { id: "monthly", label: "月度结算", icon: CalendarDays },
  { id: "assets", label: "资产负债", icon: Wallet },
  { id: "networth", label: "净资产", icon: Landmark },
  { id: "categories", label: "分类与规则", icon: Coins },
  { id: "settings", label: "设置", icon: SettingsIcon },
];

export default function App() {
  return (
    <LangProvider>
      <AppInner />
    </LangProvider>
  );
}

const EMPTY_CFG = { owner: "", repo: "", path: "ledger.json", branch: "main", token: "" };

function readCfg() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? { ...EMPTY_CFG, ...JSON.parse(raw) } : { ...EMPTY_CFG };
  } catch {
    return { ...EMPTY_CFG };
  }
}

function readQuoteCfg() {
  try {
    const raw = localStorage.getItem(QUOTE_CFG_KEY);
    return raw ? { ...EMPTY_QUOTE_CFG, ...JSON.parse(raw) } : { ...EMPTY_QUOTE_CFG };
  } catch {
    return { ...EMPTY_QUOTE_CFG };
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { state: normalizeState(parsed.state), sha: parsed.sha || null, dirty: !!parsed.dirty };
  } catch {
    return null;
  }
}

function AppInner() {
  const { t } = useLang();
  const [tab, setTab] = useState("dashboard");
  const [drawer, setDrawer] = useState(false);

  const [cfg, setCfgState] = useState(readCfg);
  const [quoteCfg, setQuoteCfgState] = useState(readQuoteCfg);
  const cached = useRef(readCache()).current;

  const [data, setDataRaw] = useState(() => (cached ? cached.state : freshState()));
  const [sha, setSha] = useState(cached ? cached.sha : null);
  const [dirty, setDirty] = useState(cached ? cached.dirty : false);

  const [status, setStatus] = useState("idle"); // idle | loading | saving
  const [banner, setBanner] = useState(null); // {tone, message}
  const [conflict, setConflict] = useState(false);

  const configured = Boolean(cfg.owner && cfg.repo && cfg.token);

  // Any mutation through this marks the ledger dirty; saving is explicit so we
  // don't create a commit for every keystroke.
  const setData = useCallback((updater) => {
    setDataRaw((prev) => (typeof updater === "function" ? updater(prev) : updater));
    setDirty(true);
  }, []);

  const setCfg = useCallback((next) => {
    setCfgState(next);
    try { localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }, []);

  const setQuoteCfg = useCallback((next) => {
    setQuoteCfgState(next);
    try { localStorage.setItem(QUOTE_CFG_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }, []);

  // Local cache is a crash-guard only — GitHub remains the source of truth.
  useEffect(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ state: data, sha, dirty }));
    } catch { /* quota or private mode; non-fatal */ }
  }, [data, sha, dirty]);

  useEffect(() => {
    const handler = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const load = useCallback(async ({ silent } = {}) => {
    if (!configured) return;
    setStatus("loading");
    setBanner(null);
    try {
      const res = await loadLedger(cfg);
      if (res.missing) {
        setSha(null);
        setBanner({ tone: "warn", message: "仓库里还没有账本文件。点「保存到 GitHub」即可创建第一版。" });
      } else {
        setDataRaw(normalizeState(res.state));
        setSha(res.sha);
        setDirty(false);
        setConflict(false);
        if (!silent) setBanner({ tone: "info", message: "已从 GitHub 加载最新账本。" });
      }
    } catch (e) {
      setBanner({ tone: "error", message: e.message });
    } finally {
      setStatus("idle");
    }
  }, [cfg, configured]);

  // Pull on startup. If there are unsaved local edits we keep them and let the
  // person decide, rather than silently overwriting their work.
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (didInitialLoad.current || !configured) return;
    didInitialLoad.current = true;
    if (dirty) {
      setBanner({ tone: "warn", message: "本地有未保存的修改，暂未从 GitHub 拉取。保存后或在设置里手动重新加载。" });
      return;
    }
    load({ silent: true });
  }, [configured, dirty, load]);

  async function save({ force } = {}) {
    if (!configured) { setTab("settings"); return; }
    setStatus("saving");
    setBanner(null);
    try {
      const res = await saveLedger(cfg, data, force ? await currentSha() : sha);
      setSha(res.sha);
      setDirty(false);
      setConflict(false);
      setBanner({ tone: "info", message: "已保存到 GitHub。" });
    } catch (e) {
      if (e.kind === "conflict") {
        setConflict(true);
        setBanner({
          tone: "warn",
          message: "远端已被其他设备修改，这次保存被拒绝了。请选择保留哪一份。",
        });
      } else {
        setBanner({ tone: "error", message: e.message });
      }
    } finally {
      setStatus("idle");
    }
  }

  // Fetches the newest sha so a deliberate overwrite can go through.
  async function currentSha() {
    const res = await loadLedger(cfg);
    return res.sha;
  }

  const reviewCount = data.transactions.filter((t) => t.needsReview).length;

  const nav = (
    <>
      <div className="sidebar-brand">
        <h1 className="heading">{t("家账")}</h1>
        <p>{t("多币种家庭收支 · 净资产台账")}</p>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              onClick={() => { setTab(item.id); setDrawer(false); }}
            >
              <Icon size={15} />
              <span>{t(item.label)}</span>
              {item.id === "review" && reviewCount > 0 && <span className="badge">{reviewCount}</span>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <SyncPill configured={configured} status={status} dirty={dirty} />
      </div>
    </>
  );

  const saveButton = (
    <button
      className={dirty ? "btn btn-amber" : "btn"}
      onClick={() => save()}
      disabled={status !== "idle" || !dirty}
      title={configured ? "" : t("请先在设置里配置 GitHub")}
    >
      {status === "saving" ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
      {status === "saving" ? t("保存中…") : dirty ? t("保存到 GitHub") : t("已同步")}
    </button>
  );

  return (
    <div className="app">
      <aside className="sidebar">{nav}</aside>
      {drawer && (
        <>
          <div className="scrim" onClick={() => setDrawer(false)} />
          <aside className="drawer">{nav}</aside>
        </>
      )}

      <div className="main">
        <div className="topbar">
          <button className="btn btn-sm" onClick={() => setDrawer(true)}><Menu size={16} /></button>
          <strong className="heading">{t("家账")}</strong>
          {saveButton}
        </div>

        <div className="content">
          <div className="row-between" style={{ marginBottom: 14 }}>
            <h2 className="heading">{t(NAV.find((n) => n.id === tab)?.label || "")}</h2>
            <div className="row">
              <span className="hide-sm"><SyncPill configured={configured} status={status} dirty={dirty} /></span>
              {status === "loading" && (
                <span className="sync-pill faint"><Loader2 size={12} className="spin" />{t("加载中…")}</span>
              )}
              <div className="hide-sm">{saveButton}</div>
            </div>
          </div>

          {!configured && tab !== "settings" && (
            <div style={{ marginBottom: 14 }}>
              <Note tone="warn">
                {t("还没连接 GitHub，数据目前只存在这台设备上。")}
                <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setTab("settings")}>
                  {t("去设置")}
                </button>
              </Note>
            </div>
          )}

          {banner && (
            <div style={{ marginBottom: 14 }}>
              <Note tone={banner.tone}>{t(banner.message)}</Note>
            </div>
          )}

          {conflict && (
            <div style={{ marginBottom: 14 }}>
              <ConfirmBar
                text={t("冲突处理：用本地这份覆盖远端，还是丢弃本地改动、重新拉取远端？")}
                confirmLabel={t("用本地覆盖远端")}
                onCancel={() => { setConflict(false); load(); }}
                onConfirm={() => save({ force: true })}
              />
              <div className="tiny faint" style={{ marginTop: 6 }}>
                {t("取消 = 丢弃本地改动并重新加载远端。两份都保留在 GitHub 历史里，事后可以在提交记录中找回。")}
              </div>
            </div>
          )}

          {tab === "dashboard" && <Dashboard data={data} />}
          {tab === "upload" && <UploadView data={data} setData={setData} goToReview={() => setTab("review")} />}
          {tab === "review" && <Review data={data} setData={setData} />}
          {tab === "transactions" && <Transactions data={data} setData={setData} />}
          {tab === "monthly" && (
            <Monthly data={data} setData={setData} goToAssets={() => setTab("assets")} />
          )}
          {tab === "assets" && (
            <Assets data={data} setData={setData} quoteCfg={quoteCfg} goToSettings={() => setTab("settings")} />
          )}
          {tab === "networth" && <NetWorth data={data} setData={setData} quoteCfg={quoteCfg} />}
          {tab === "categories" && <Categories data={data} setData={setData} />}
          {tab === "settings" && (
            <Settings
              data={data} setData={setData} cfg={cfg} setCfg={setCfg}
              quoteCfg={quoteCfg} setQuoteCfg={setQuoteCfg} onReload={() => load()}
            />
          )}
        </div>
      </div>

      <style>{`@media (max-width: 820px) { .hide-sm { display: none; } }`}</style>
    </div>
  );
}

function SyncPill({ configured, status, dirty }) {
  const { t } = useLang();
  if (!configured) return <span className="sync-pill faint"><CloudOff size={12} />{t("未连接")}</span>;
  if (status === "saving") return <span className="sync-pill faint"><Loader2 size={12} className="spin" />{t("保存中…")}</span>;
  if (dirty) return <span className="sync-pill warn"><span className="dirty-dot" />{t("有未保存的修改")}</span>;
  return <span className="sync-pill pos"><CheckCircle2 size={12} />{t("已同步")}</span>;
}
