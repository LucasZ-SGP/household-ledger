// English strings for src/views/Settings.jsx, keyed by their Chinese source text.
export default {
  "语言": "Language",
  "切换界面语言，你自己填写的分类名称、备注等内容不会被翻译。":
    "Switch the interface language. Content you typed yourself — category names, notes and so on — is never translated.",

  "GitHub 同步": "GitHub sync",
  "账本以一个 JSON 文件的形式存在你的私有仓库里，每次保存是一次 commit。Token 只保存在这台设备的浏览器里，不会上传到任何地方。":
    "The ledger lives as a single JSON file in your private repo — every save is a commit. The token only lives in this device's browser and is never uploaded anywhere.",
  "GitHub 用户名": "GitHub username",
  "仓库名": "Repository name",
  "文件路径": "File path",
  "分支": "Branch",
  "检查中…": "Checking…",
  "验证并保存": "Verify and save",
  "从 GitHub 重新加载": "Reload from GitHub",
  "查看历史版本": "View history",
  "已连接 {repo}（私有）": "Connected to {repo} (private)",
  "已连接 {repo}（公开 — 建议改成私有仓库）": "Connected to {repo} (public — you should make this repo private)",
  "Token 请用 fine-grained 类型，Repository access 只勾选这一个仓库，权限只给":
    "Use a fine-grained token, scope Repository access to just this one repo, and grant only",
  "这样即使泄露，影响也仅限于这个账本仓库。": "That way, even if it leaks, the blast radius is limited to this one ledger repo.",

  "行情数据源（股票价格）": "Market data source (stock prices)",
  "「资产负债」页里的持仓靠这个自动取价。因为整个应用没有后端，请求是从你的浏览器直接发出去的 —— 行情源必须允许跨域访问才能用。取不到也不影响记账：可以在持仓里直接手填价格。":
    "Holdings on the Balance Sheet page price themselves automatically through this. Since the app has no backend, requests go straight from your browser — the provider has to allow cross-origin access. If it can't fetch a price, that's fine: type it in by hand on the holding.",
  "净资产页的币种换算固定使用 Finnhub 的汇率接口，用的就是这里填的 Key —— 如果行情源选的不是 Finnhub，请确保这个 Key 依然是 Finnhub 的。":
    "Currency conversion on the Net Worth page always goes through Finnhub's rate endpoint, using the key entered here — if the stock provider below isn't Finnhub, make sure this key is still a Finnhub key.",
  "行情源": "Provider",
  "粘贴 API Key": "Paste API key",
  "去申请免费 Key": "Get a free key",
  "代理地址（可选）": "Proxy URL (optional)",
  "只有在行情源被浏览器以跨域为由拦下时才需要。写成": "Only needed when the browser blocks the provider as cross-origin. Written as",
  "会把目标地址编码后填进": "the target URL gets encoded into",
  "；不带占位符则直接当前缀拼接。注意代理方能看到你查了哪些股票代码，最好用自己部署的。":
    "; without a placeholder it's used as a plain prefix instead. Note the proxy operator can see which symbols you look up, so a proxy you run yourself is best.",
  "测试中…": "Testing…",
  "用 QQQ 测一下": "Test with QQQ",
  "API Key 和 GitHub Token 一样只存在这台设备的浏览器里，不会写进账本文件、也不会提交到仓库。":
    "Like the GitHub token, the API key only lives in this device's browser — it's never written into the ledger file or committed to the repo.",
  "取到 {symbol} = {price}{ccy}（{when}）": "Got {symbol} = {price}{ccy} ({when})",
  "刚刚": "just now",

  "通货膨胀率（年化 %）": "Inflation rate (annualized %)",
  "用于总览页的「通胀调整」开关，把历史金额折算成今日购买力。": "Used by the \"inflation-adjust\" toggle on Overview to restate historical amounts in today's purchasing power.",

  "币种管理": "Currencies",
  "已有交易记录的币种不能删除。": "A currency already used by a transaction can't be removed.",
  "新增币种代码，如 JPY": "Add a currency code, e.g. JPY",
  "添加": "Add",

  "本地备份": "Local backup",
  "GitHub 已经保留了每次保存的历史版本，这里的导出主要用于离线留档或迁移到别处。":
    "GitHub already keeps a history of every save — export here is mainly for an offline copy or moving to somewhere else.",
  "导出 JSON": "Export JSON",
  "导入 JSON": "Import JSON",
  "清空本地数据": "Clear local data",
  "清空当前浏览器里的账本数据。GitHub 上已保存的版本不受影响，可以重新加载回来。":
    "Clears the ledger data in this browser. Versions already saved on GitHub are unaffected and can be reloaded.",
  "确认清空": "Clear it",
  "文件不是合法的 JSON，无法导入。": "That file isn't valid JSON and can't be imported.",

  // Quote-provider registry (src/lib/quotes.js), shown wherever a provider is listed.
  "手动输入": "Manual entry",
  "Stooq（无需 Key）": "Stooq (no key needed)",
  "Yahoo Finance（无需 Key）": "Yahoo Finance (no key needed)",
  "不联网。价格由你自己填，适合行情源都被浏览器拦住的情况。": "No network calls — you type prices in yourself. Good for when every provider gets blocked by the browser.",
  "免费额度 60 次/分钟，浏览器可直接调用。美股代码直接填 AAPL、QQQ。": "Free tier: 60 calls/minute, callable directly from the browser. US tickers go in as-is, e.g. AAPL, QQQ.",
  "免费额度 800 次/天。会返回报价币种，适合非美股（如 D05.SI）。": "Free tier: 800 calls/day. Returns the quote currency, which suits non-US tickers like D05.SI.",
  "免费额度很小（约 25 次/天），持仓少时够用。": "Free tier is small (~25 calls/day) — fine if you don't hold many symbols.",
  "不用注册，但通常需要配一个代理才能在浏览器里调用。美股代码要加 .us，如 qqq.us。": "No signup, but usually needs a proxy to work from the browser. US tickers need a .us suffix, e.g. qqq.us.",
  "覆盖最全，但几乎一定需要配代理。代码同 Yahoo 网站，如 QQQ、D05.SI。": "Widest coverage, but a proxy is almost always required. Symbols match the Yahoo Finance website, e.g. QQQ, D05.SI.",
  "当前行情源是「手动输入」，请到设置里选一个行情源，或直接在持仓里填价格。":
    "The current provider is \"Manual entry\" — pick a provider in Settings, or just type the price on the holding.",
  "还没填 API Key，请到设置里补上。": "No API key yet — add one in Settings.",
  "未知的行情源。": "Unknown provider.",
  "当前环境不支持网络请求。": "This environment doesn't support network requests.",
};
