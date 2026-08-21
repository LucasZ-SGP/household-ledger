// English strings for src/App.jsx, src/lib/github.js's static error messages,
// and other app-wide chrome, keyed by their Chinese source text.
export default {
  // Nav
  "总览": "Overview",
  "导入账单": "Import",
  "待确认": "Review",
  "交易记录": "Transactions",
  "月度结算": "Monthly Close",
  "资产负债": "Balance Sheet",
  "净资产": "Net Worth",
  "分类与规则": "Categories",
  "设置": "Settings",

  // Brand / chrome
  "家账": "Household Ledger",
  "多币种家庭收支 · 净资产台账": "Multi-currency household ledger & net worth tracker",

  // Sync pill / save button
  "未连接": "Not connected",
  "保存中…": "Saving…",
  "有未保存的修改": "Unsaved changes",
  "已同步": "Synced",
  "加载中…": "Loading…",
  "保存到 GitHub": "Save to GitHub",
  "请先在设置里配置 GitHub": "Set up GitHub in Settings first",

  "还没连接 GitHub，数据目前只存在这台设备上。": "GitHub isn't connected yet — data only lives on this device for now.",
  "去设置": "Go to Settings",

  "冲突处理：用本地这份覆盖远端，还是丢弃本地改动、重新拉取远端？": "Conflict: keep this device's version and overwrite the remote, or discard local changes and re-pull the remote?",
  "用本地覆盖远端": "Overwrite remote with local",
  "取消 = 丢弃本地改动并重新加载远端。两份都保留在 GitHub 历史里，事后可以在提交记录中找回。":
    "Cancel = discard local changes and reload the remote. Both versions stay in GitHub history and can be recovered later.",

  // Banner messages set by App.jsx
  "仓库里还没有账本文件。点「保存到 GitHub」即可创建第一版。": "There's no ledger file in the repo yet. Click \"Save to GitHub\" to create the first version.",
  "已从 GitHub 加载最新账本。": "Loaded the latest ledger from GitHub.",
  "本地有未保存的修改，暂未从 GitHub 拉取。保存后或在设置里手动重新加载。":
    "There are unsaved local changes, so nothing was pulled from GitHub. Save, or reload manually in Settings.",
  "已保存到 GitHub。": "Saved to GitHub.",
  "远端已被其他设备修改，这次保存被拒绝了。请选择保留哪一份。":
    "The remote was changed by another device — this save was rejected. Choose which version to keep.",

  // github.js static error strings
  "Token 无效或已过期，请到设置里重新填写。": "The token is invalid or expired — re-enter it in Settings.",
  "GitHub API 调用频率超限，请稍后再试。": "GitHub API rate limit hit — try again shortly.",
  "Token 权限不足。请确认它对该仓库有 Contents 读写权限。": "The token doesn't have enough permission — make sure it has read/write access to Contents on this repo.",
  "找不到该仓库或路径。请检查设置里的仓库名和分支。": "Couldn't find that repo or path — check the repo name and branch in Settings.",
  "版本冲突：远端已被其他设备修改。": "Version conflict: the remote was changed by another device.",
  "无法连接 GitHub，请检查网络。": "Couldn't reach GitHub — check your network connection.",
  "设置里的路径指向一个目录，请填写具体的文件名，例如 ledger.json。": "The path in Settings points to a directory — enter a specific file name, e.g. ledger.json.",
  "远端文件不是合法的 JSON，无法读取。可以在 GitHub 上查看该文件的历史版本恢复。":
    "The remote file isn't valid JSON and couldn't be read. You can recover an earlier version from the file's history on GitHub.",
  "这个 Token 只有读权限，无法保存。请授予 Contents 的读写权限。": "This token is read-only and can't save — grant it read/write access to Contents.",
};
