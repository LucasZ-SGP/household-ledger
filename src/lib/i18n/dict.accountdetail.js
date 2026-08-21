// English strings for src/views/AccountDetail.jsx, keyed by their Chinese source text.
export default {
  "余额": "Balance",
  "年利率": "Annual rate",
  "一年利息（估）": "Est. interest / year",
  "更新于": "Updated",

  "本金": "Principal",
  "已计利息": "Accrued interest",
  "按月复利": "Monthly compounding",
  "单利": "Simple interest",
  "当前价值": "Current value",
  "已到期": "Matured",
  "到期日": "Maturity date",
  "利息已停止计算": "Interest has stopped accruing",
  "还有 {days} 天": "{days} days left",
  "存期 {months} 个月 · 已过 {elapsed} 天 · 到期本息合计 {maturityValue}":
    "{months}-month term · {elapsed} days elapsed · Value at maturity {maturityValue}",
  "这笔定期已经到期了。转存之后，把开始日期和期限改成新的一期，或者新建一笔。":
    "This fixed deposit has matured. If it was rolled over, update the start date and term to the new period, or add a new entry.",

  "闲散资金（各币种分开记，不换算）": "Idle cash (tracked separately per currency, not converted)",
  "还没记任何现金。": "No cash recorded yet.",
  "删除 {ccy}": "Remove {ccy}",

  "代码": "Symbol",
  "数量": "Quantity",
  "币种": "Currency",
  "现价": "Price",
  "市值": "Market value",
  "保存价格": "Save price",
  "手动改价": "Edit price manually",
  "手填": "Manual",
  "偏旧": "Stale",
  "还没有持仓": "No holdings yet",
  "添加持仓": "Add holding",
  "{c} 合计 ": "{c} total ",
  "还没有 {list} 的价格，这几笔暂时不计入合计。点上面的「刷新行情」，或用铅笔图标手填一个价。":
    "No price yet for {list} — these are excluded from the total for now. Use \"Refresh quotes\" above, or the pencil icon to enter a price manually.",
  "行情源返回的币种和你填的不一致，已按行情源的币种计算。":
    "The quote source's currency doesn't match what you entered; the calculation uses the quote source's currency.",

  "普通账户 OA": "Ordinary Account OA",
  "特别账户 SA": "Special Account SA",
  "保健储蓄 MA": "Medisave Account MA",
  "退休账户 RA": "Retirement Account RA",
  "出生年份（用于额外利息档位）": "Birth year (for extra-interest tiers)",
  "{code} 年利率 %": "{code} annual rate %",
  "计入额外利息（55 岁以下：首 6 万 +1%；55 岁及以上：首 3 万 +2%、次 3 万 +1%；其中 OA 最多算 2 万）":
    "Include extra interest (under 55: first $60k +1%; 55 and above: first $30k +2%, next $30k +1%; OA counts up to $20k of that)",
  "合计余额": "Total balance",
  "基础利息（年）": "Base interest / year",
  "额外利息（年）": "Extra interest / year",
  "预计年利息": "Est. interest / year",
  "填了出生年份才能判断档位": "Enter a birth year to determine the tier",
  "按 {age} 岁{senior}计算": "Calculated at age {age}{senior}",
  "（55+）": " (55+)",
  "CPF 没有面向个人的公开 API —— 余额只在 Singpass Myinfo 里，而那是要企业签约、按次收费的服务器端接口， 纯前端的页面拿不到也存不住那种凭证。所以余额需要你从 CPF App 抄进来，能自动算的是利息部分。 这里给的是按当前余额估的一年利息；CPF 实际按每月最低余额计息、每年 1 月 1 日入账，真实数字会略有出入。":
    "CPF has no public API for individuals — balances live only in Singpass Myinfo, a server-side interface that requires a corporate agreement and per-call fees; a pure front-end page can't obtain or store that kind of credential. So you need to copy the balances in from the CPF app yourself; the part that can be automated is the interest. What's shown here is a year's interest estimated from the current balance; CPF actually computes interest on the lowest monthly balance and credits it every January 1st, so the real number will differ slightly.",

  "说明": "Notes",
  "例如：本田 CR-V，COE 2032 年到期": "e.g. Honda CR-V, COE expires 2032",
  "例如：Punggol 四房，2024 年入伙": "e.g. Punggol 4-room flat, moved in 2024",
  "这里只记名字和说明，不记金额 —— 房子和车的「现值」本来就只是个估计， 一旦写进净资产合计，过几个月就会变成一个没人记得更新、却看起来很确定的数字。 真要估值的时候，用「其他资产」记一笔就好。":
    "This only records a name and a note, not an amount — the \"current value\" of a house or car is just an estimate anyway, and once it's baked into the net-worth total it turns, within a few months, into a number nobody remembers to update but that still looks authoritative. If you do want to value it, add an entry under \"Other assets\" instead.",
};
