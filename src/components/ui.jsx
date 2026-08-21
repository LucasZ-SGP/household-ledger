import React from "react";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import { useLang } from "../lib/i18n.js";

export function Card({ children, className = "", ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function Field({ label, children }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={21} color="#5B6B60" /></div>
      <h3 className="heading">{title}</h3>
      <p>{subtitle}</p>
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

export function Note({ tone = "info", children }) {
  const Icon = tone === "error" ? AlertCircle : tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={`note note-${tone}`}>
      <Icon size={15} />
      <div>{children}</div>
    </div>
  );
}

export function ConfirmBar({ text, confirmLabel, tone = "danger", onConfirm, onCancel }) {
  const { t } = useLang();
  return (
    <div className="note note-warn" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <AlertTriangle size={15} />
        <div>{text}</div>
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button className="btn btn-sm" onClick={onCancel}>{t("取消")}</button>
        <button className={`btn btn-sm ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
          {confirmLabel || t("确认")}
        </button>
      </div>
    </div>
  );
}

export function Chip({ children, color, active, onClick }) {
  return (
    <button
      className="chip"
      onClick={onClick}
      style={active ? { background: color, borderColor: color, color: "#fff" } : undefined}
    >
      {children}
    </button>
  );
}
