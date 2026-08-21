// ---------------------------------------------------------------------------
// i18n. Every string in the app is written in Chinese first; English is a
// lookup table keyed by the exact Chinese source string, not by an invented
// id. That keeps the two in sync by construction — a string with no English
// entry just falls back to Chinese instead of rendering a missing-key label.
//
// Interpolation uses {name}-style placeholders so a template and its
// translation can reorder words around a variable.
// ---------------------------------------------------------------------------

import React, { createContext, useContext, useState, useCallback } from "react";

import core from "./i18n/dict.core.js";
import ui from "./i18n/dict.ui.js";
import dashboard from "./i18n/dict.dashboard.js";
import upload from "./i18n/dict.upload.js";
import review from "./i18n/dict.review.js";
import transactions from "./i18n/dict.transactions.js";
import monthly from "./i18n/dict.monthly.js";
import assetsDict from "./i18n/dict.assets.js";
import accountDetail from "./i18n/dict.accountdetail.js";
import loanLedger from "./i18n/dict.loanledger.js";
import networth from "./i18n/dict.networth.js";
import categories from "./i18n/dict.categories.js";
import settings from "./i18n/dict.settings.js";

const LANG_KEY = "ledger.lang";

const DICT = Object.assign(
  {},
  core, ui, dashboard, upload, review, transactions, monthly,
  assetsDict, accountDetail, loanLedger, networth, categories, settings
);

export function readLang() {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

function interpolate(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function translate(lang, zh, vars) {
  const template = lang === "en" ? (DICT[zh] || zh) : zh;
  return interpolate(template, vars);
}

const LangContext = createContext({
  lang: "zh",
  setLang: () => {},
  t: (s, vars) => interpolate(s, vars),
});

// Deliberately built with createElement rather than JSX: this file is a .js
// module, and the test harness only turns the JSX loader on for .jsx.
export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readLang);
  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode */ }
  }, []);
  const t = useCallback((zh, vars) => translate(lang, zh, vars), [lang]);
  return React.createElement(LangContext.Provider, { value: { lang, setLang, t } }, children);
}

export function useLang() {
  return useContext(LangContext);
}
