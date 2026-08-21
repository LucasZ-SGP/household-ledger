// English strings for src/views/Upload.jsx, keyed by their Chinese source text.
export default {
  // ReconciliationPanel
  "这份账单没有可用的期初余额，无法做对账校验，请自行抽查金额。":
    "This statement has no usable opening balance, so it can't be reconciled — please spot-check the amounts yourself.",
  "对账校验通过": "Reconciliation passed",
  "逐笔余额连续无误 · 期初 {opening} ＋ 存入 {deposits} － 支出 {withdrawals} ＝ 期末 {closing}":
    "Running balances check out · opening {opening} + deposits {deposits} − withdrawals {withdrawals} = closing {closing}",
  " · 与账单打印的合计金额一致": " · matches the totals printed on the statement",
  "对账校验未通过": "Reconciliation failed",
  "有 {count} 行的余额对不上，例如：": "{count} row(s) have a balance mismatch, for example:",
  "：算出 {expected}，账单印的是 {printed}": ": calculated {expected}, statement printed {printed}",
  "期末余额对不上（算出与账单打印值不一致）。": "Closing balance doesn't match (calculated value differs from the printed statement).",
  "支出/存入合计与账单打印的 Total 不一致。": "Withdrawal/deposit totals don't match the statement's printed Total.",

  // handleFile / ingest errors
  "没有解析到任何数据，请确认文件第一行是表头，且下面有数据行。":
    "No data was parsed. Make sure the first row is a header and there are data rows below it.",
  "这份 PDF 的版式还不认识。目前支持 OCBC 的 Statement of Account；其他银行需要我先看过样本再加适配。":
    "This PDF layout isn't recognized yet. Currently only OCBC Statement of Account is supported; other banks need a sample first before support can be added.",
  "识别到了账单版式，但没有解析出任何交易。请把这份 PDF 反馈一下，可能是版式有变化。":
    "The statement layout was recognized, but no transactions were parsed. Please report this PDF — the layout may have changed.",
  "暂不支持这个格式。请上传 PDF、CSV 或 Excel（.xlsx/.xls）。":
    "This file format isn't supported yet. Please upload a PDF, CSV, or Excel (.xlsx/.xls) file.",
  "请确认文件未损坏后重试。": "Please make sure the file isn't corrupted and try again.",
  "解析文件时出错：{detail}": "Error parsing file: {detail}",

  // commit()
  "未命名账户": "Unnamed account",
  "卡号 {card}": "Card {card}",

  // colOptions
  "列 {n}": "Column {n}",

  // Top note (mixed with <b>PDF</b>/<b>CSV</b>/<b>Excel</b>)
  "支持 ": "Supports ",
  " 对账单（目前适配 OCBC），以及 ": " statements (currently supports OCBC), plus ",
  " / ": " / ",
  "。": ".",
  "PDF 在本机解析，不上传任何服务器；解析后会用账单自带的余额和合计做一次对账校验。":
    "PDFs are parsed on your device and never uploaded anywhere; after parsing, a reconciliation check runs against the statement's own balances and totals.",
  "重复的交易会自动跳过，同一份账单导入两次不会产生重复记录。":
    "Duplicate transactions are skipped automatically, so importing the same statement twice won't create duplicates.",

  // select step
  "点击选择文件": "Click to choose a file",
  "支持 .pdf / .csv / .xlsx / .xls": "Supports .pdf / .csv / .xlsx / .xls",
  "或者直接粘贴表格内容（第一行为表头）：": "Or paste table content directly (first row as header):",
  "解析粘贴内容": "Parse pasted content",

  // map step
  "对应列与币种": "Map columns & currency",
  "日期列": "Date column",
  "摘要 / 描述列": "Description column",
  "金额格式": "Amount format",
  "单一金额列（正负号区分收支）": "Single amount column (sign indicates direction)",
  "借方 / 贷方分列": "Separate debit / credit columns",
  "金额列": "Amount column",
  "支出（借方）列": "Withdrawal (debit) column",
  "收入（贷方）列": "Deposit (credit) column",
  "币种": "Currency",
  "账户名称": "Account name",
  "例如：DBS 活期 / 招行储蓄卡": "e.g. DBS Current / CMB Savings",
  "日期是「日/月/年」格式（美国账单请取消勾选）": "Date is Day/Month/Year format (uncheck for US statements)",
  "这份账单支出为正数、收入为负数（符号相反）": "This statement uses positive for withdrawals and negative for deposits (signs reversed)",
  "重新选择": "Choose again",
  "下一步：预览": "Next: Preview",

  // preview step
  "预览 — 识别出 {n} 笔有效交易（原始 {total} 行）": "Preview — {n} valid transaction(s) found ({total} raw rows)",
  "一笔都没识别出来，通常是列对应错了或日期格式没被认出。返回上一步检查日期列和金额列。":
    "No transactions were recognized. This usually means the column mapping is wrong or the date format wasn't recognized. Go back and check the date and amount columns.",
  "这份文件有 {count} 行的列数对不上": "This file has {count} row(s) with a mismatched column count",
  "（第 {rows} 行）。": " (row(s) {rows}).",
  " 等": " and more",
  "最常见的原因是金额里的千分位逗号没有加引号，例如": "The most common cause is an unquoted thousands-separator comma in an amount, e.g.",
  "会被当成两列，": "gets split into two columns,",
  "金额就变成": "and the amount becomes",
  "建议先修好再导入：把 CSV 用 Excel 打开另存一次（会自动加引号），或直接上传 .xlsx 文件。":
    "Fix this before importing: open the CSV in Excel and save it again (quotes get added automatically), or upload the .xlsx file directly.",
  "我已核对上面的预览金额无误，仍要导入": "I've checked the amounts above and confirm they're correct — import anyway",
  "日期": "Date",
  "描述": "Description",
  "方向": "Direction",
  "金额": "Amount",
  "收入": "Income",
  "支出": "Expense",
  "仅显示前 8 行，其余 {n} 笔一并导入。": "Showing the first 8 rows only; the remaining {n} will be imported too.",
  "返回修改": "Back to edit",
  "确认导入 {n} 笔": "Import {n} transaction(s)",

  // pdf-parsing step
  "正在读取 PDF 对账单…": "Reading PDF statement…",
  "全部在本机完成，文件不会上传到任何服务器。": "Everything happens on your device; the file is never uploaded anywhere.",

  // pdf-preview step
  "识别出 {n} 笔交易": "{n} transaction(s) recognized",
  "账号 {account}": "Account {account}",
  " · 账期 {start} 至 {end}": " · statement period {start} to {end}",
  " · 共 {n} 个交易页": " · {n} transaction page(s) in total",
  "解析提示": "Parsing notes",
  "例如：OCBC 储蓄": "e.g. OCBC Savings",
  "余额": "Balance",
  "对账校验没有通过，说明至少有一笔金额被读错了。": "Reconciliation failed, which means at least one amount was misread.",
  "不建议直接导入。": "Importing directly is not recommended.",
  "我已逐笔核对上面的明细，确认无误，仍要导入": "I've checked every line above and confirm it's correct — import anyway",

  // done step
  "导入完成": "Import complete",
  "新增 ": "Added ",
  " 笔交易（跳过 {skipped} 笔重复）": " transaction(s) (skipped {skipped} duplicate(s))",
  "自动分类 ": "Auto-categorized ",
  " 笔": " transaction(s)",
  "需要你确认 ": "Needs your review: ",
  "数据还在本机。记得点右上角的「保存到 GitHub」，否则换设备看不到。":
    "This data is still local only. Remember to click \"Save to GitHub\" in the top right, or it won't show up on other devices.",
  "继续导入下一份": "Import another statement",
  "去确认这 {n} 笔": "Review these {n} transaction(s)",
};
