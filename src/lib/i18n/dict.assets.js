// English strings for src/views/Assets.jsx (and shared account-kind/loan-entry
// labels from src/lib/assets.js that it renders), keyed by their Chinese source text.
export default {
  // KIND_META labels (from src/lib/assets.js, rendered here as data)
  "现金 / 活期": "Cash / checking",
  "银行定期": "Fixed deposit",
  "股票账户": "Brokerage account",
  "CPF 公积金": "CPF",
  "房产": "Property",
  "汽车": "Vehicle",
  "其他资产": "Other asset",
  "房贷": "Mortgage",
  "其他贷款": "Other loan",

  // subtitleOf
  "未设到期日": "No maturity date set",
  "已于 {date} 到期": "Matured on {date}",
  "{date} 到期 · 还有 {days} 天": "Matures {date} · {days} days left",
  "{n} 个持仓": "{n} holdings",
  " · 现金 {cash}": " · cash {cash}",
  "OA/SA/MA/RA 合计 {total}": "OA/SA/MA/RA total {total}",
  "年利率 {rate}% · 每月 {day} 号计息 · {count} 条记录 · 下次 {next}":
    "Rate {rate}% · interest posts on day {day} · {count} entries · next {next}",
  "年利率 {rate}%": "Rate {rate}%",

  // AccountForm fields
  "名称": "Name",
  "机构（可选）": "Institution (optional)",
  "币种": "Currency",
  "余额": "Balance",
  "年利率 %": "Annual rate %",
  "本金": "Principal",
  "起息日": "Start date",
  "存期（月）": "Term (months)",
  "到期日": "Maturity date",
  "计息方式": "Interest method",
  "到期一次性付息（单利）": "Paid at maturity (simple interest)",
  "按月复利": "Compounded monthly",
  "闲散资金（现金）": "Idle cash",
  "估值": "Valuation",
  "放款金额（本金）": "Loan amount (principal)",
  "放款日": "Disbursement date",
  "每月计息日": "Interest posting day",
  "月供（可选）": "Monthly payment (optional)",
  "备注（可选）": "Note (optional)",
  "CPF 账户固定按 SGD 计。建好之后展开账户，把 OA / SA / MA / RA 的余额填进去。":
    "CPF accounts are always in SGD. After creating it, expand the account and fill in the OA / SA / MA / RA balances.",
  "填「放款金额」和「放款日」，之后每月计息日的利息会自动往上加。有银行的 Statement of Account 的话，建好账户后展开它、点「导入对账单」整段粘贴进去，历史记录一次就补齐了 —— 比手敲快得多，而且会用对账单自己的期末余额校验一遍。":
    "Fill in \"loan amount\" and \"disbursement date\" and interest will be added automatically on the posting day each month. If you have a bank Statement of Account, expand the account after creating it and click \"Import statement\" to paste the whole thing in — history is filled in at once, much faster than typing it by hand, and it's checked against the statement's own closing balance.",
  "房产和汽车只记名字和说明，不记金额，也不计入资产合计 —— 它们会以名字的形式列在总览里。":
    "Property and vehicles are recorded by name and description only, with no amount, and are not included in the asset total — they're listed by name in the overview.",

  // Main component
  "已归档": "Archived",
  "取消": "Cancel",
  "编辑": "Edit",
  "取消归档": "Unarchive",
  "归档": "Archive",
  "保存修改": "Save changes",
  "备注：": "Note: ",
  "资产": "Assets",
  "负债": "Liabilities",
  "净值": "Net",
  "还没有任何资产或负债": "No assets or liabilities yet",
  "把银行定期、股票账户、CPF、房贷登记进来，它们的利息、市值和欠款会自动往前算。":
    "Add fixed deposits, brokerage accounts, CPF, mortgages — their interest, market value, and balances are calculated automatically.",
  "添加第一个账户": "Add your first account",
  "实物资产": "Physical assets",
  "只登记名字，不计入上面的资产合计。": "Recorded by name only — not included in the asset totals above.",
  "显示已归档": "Show archived",
  "生成净资产快照": "Snapshot net worth",
  "行情": "Quotes",
  "{count} 个代码": "{count} tickers",
  " · 最后更新 {time}": " · last updated {time}",
  " · 还没取过价": " · not fetched yet",
  " · {count} 个待更新": " · {count} pending update",
  " · 今天已更新": " · updated today",
  "换行情源": "Change quote source",
  "当前行情源是手动输入": "Current quote source is manual entry",
  "取价中 {index}/{total}": "Fetching {index}/{total}",
  "刷新行情": "Refresh quotes",
  "当前是「手动输入」模式，不会联网取价 —— 在持仓行里点铅笔图标手填价格即可。想自动更新的话，到":
    "Currently in \"manual entry\" mode — prices aren't fetched online. Click the pencil icon on a holding row to type a price by hand. To enable auto-updates, go to",
  "设置": "Settings",
  "里选一个行情源。": " and pick a quote source.",
  "取价没有全部成功：": "Some prices could not be fetched:",
  "如果提示被浏览器拦下，多半是行情源不支持跨域，换一个行情源或在设置里配代理；也可以直接手填价格。":
    "If the browser blocked the request, the quote source likely doesn't support cross-origin calls — try a different source, set up a proxy in Settings, or just type the price by hand.",
  "还缺价格：": "Missing prices: ",
  "新增：{kind}": "New: {kind}",
  "添加账户": "Add account",
  "删除这个账户？它的持仓、还款记录会一起删掉，已经生成的净资产快照不受影响。":
    "Delete this account? Its holdings and repayment history will be deleted too; existing net-worth snapshots are unaffected.",
  "删除": "Delete",
  "已把今天的资产负债写入净资产快照（{count} 条）。": "Today's assets and liabilities were written to the net-worth snapshot ({count} entries).",
};
