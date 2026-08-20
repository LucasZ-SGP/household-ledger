# 家账 · 家庭收支台账

多币种家庭收支与净资产记账应用。纯前端，无后端服务器 —— 数据以一个 JSON 文件的形式存在你自己的 GitHub 私有仓库里。

- **托管**：GitHub Pages（免费）
- **数据**：你的私有仓库里的 `ledger.json`，每次保存 = 一次 commit，自带版本历史
- **同步**：手机和电脑打开同一个网址，都从同一个仓库读写
- **成本**：0

---

## 一、准备两个仓库

### 1. 代码仓库（公开）

放这份代码，用来跑 GitHub Pages。里面没有任何密钥，公开没问题。

假设叫 `household-ledger`。

### 2. 数据仓库（**必须私有**）

只放你的账本 JSON。**建仓库时一定要选 Private。**

假设叫 `ledger-data`。建好后不用往里放任何东西，应用第一次保存时会自动创建 `ledger.json`。

---

## 二、部署代码仓库

```bash
# 在这个项目目录里
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/<你的用户名>/household-ledger.git
git push -u origin main
```

然后在这个仓库的网页上：

**Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。

选完之后，回到 **Actions** 标签页，会看到 workflow 正在跑（第一次可能需要手动点一下 "Run workflow"）。跑完之后网址是：

```
https://<你的用户名>.github.io/household-ledger/
```

之后你每次 `git push`，Actions 会自动跑测试 + 构建 + 部署。测试不过就不会部署。

---

## 三、创建 Token

打开 https://github.com/settings/personal-access-tokens/new （Fine-grained tokens）

按这个填：

| 项目 | 填什么 |
|---|---|
| Token name | 随便，例如 `ledger-app` |
| Expiration | 建议 1 年，到期后重新生成再填一次 |
| Repository access | **Only select repositories** → 只勾 `ledger-data` |
| Permissions → Repository permissions → **Contents** | **Read and write** |

其他权限一个都不要给。生成后复制那串 `github_pat_...`，**只显示这一次**。

> 为什么这样配：这个 Token 存在你浏览器的 localStorage 里，只在你自己的设备上。即使某天泄露了，它能碰的也只有 `ledger-data` 这一个仓库的文件内容 —— 碰不到你其他仓库，也改不了任何设置。

---

## 四、连接

打开部署好的网址 → **设置** → GitHub 同步：

- GitHub 用户名：`<你的用户名>`
- 仓库名：`ledger-data`
- 文件路径：`ledger.json`
- 分支：`main`
- Token：刚才复制的那串

点 **验证并保存**。看到「已连接 xxx（私有）」就成功了。

如果显示「（公开 — 建议改成私有仓库）」，说明数据仓库建错成 public 了，去 GitHub 上改成 private。

### 手机上

用手机浏览器打开同一个网址，同样在设置里填一次（Token 要重新填，因为存在各自设备上）。

然后：
- **iOS Safari**：分享 → 添加到主屏幕
- **Android Chrome**：菜单 → 添加到主屏幕

之后就是一个全屏应用的样子，没有地址栏。

---

## 五、日常使用

1. 银行账单出来 → **导入账单** → 上传 PDF（OCBC）或 CSV/Excel
2. PDF 会自动识别版式并做对账校验；CSV/Excel 需要选一下哪列是日期、哪列是金额
3. 预览确认无误 → 导入。已存在的交易会自动跳过，同一份账单重复导入不会产生重复记录
4. 认不出来的交易进 **待确认**，按描述自动分组，一次确认整组
5. 确认时可以直接 **+ 新建分类**，不用局限于预设的类别
6. 勾选「记住规则」，下次同样的商户自动归类 —— 用得越久，需要手动确认的越少
7. **点右上角「保存到 GitHub」** ← 这一步不能省，否则换设备看不到

> 保存是手动的，因为每次保存都是一次 git commit。如果自动保存，敲一个字就会产生一次提交，历史记录会没法看。

---

## 六、几个要知道的点

**关于冲突**：如果手机和电脑都改了同一份账本，后保存的一方会被拒绝，应用会弹出选择：用本地覆盖远端，还是丢弃本地重新拉取。两份内容都在 GitHub 的提交历史里，事后能找回。

**关于版本历史**：设置页有「查看历史版本」链接，能看到每次保存的 diff —— 哪天改了什么一目了然。误操作了可以在 GitHub 上回滚。

**关于 CSV 格式**：如果金额里的千分位逗号没有加引号（`-2,500.00` 而不是 `"-2,500.00"`），列会错位，金额会变成 `-2`。应用会检测到并挡下来要求你确认。碰到这种情况，最简单是用 Excel 打开另存一次，或者直接上传 .xlsx。

**关于 PDF**：支持 OCBC 的 Statement of Account，纯本地解析（pdf.js），不需要 API key、不联网、文件不上传。

解析后会用账单自身的数据做三重校验：逐笔 running balance 必须连续、期初±收支必须等于期末、汇总必须等于账单打印的 Total。三项全过才允许一键导入；任何一项不过会明确告诉你哪几行对不上，并要求你逐笔核对后才能继续。

其他银行需要先看样本再写适配（`src/lib/statements/` 下加一个模块即可）。想验证自己的账单，可以本地跑：

```bash
node tests/realpdf.mjs ~/Downloads/statement.pdf
```

会打印交易笔数和对账结果，不写入任何数据。

---

## 七、本地开发

```bash
npm install
npm run dev     # 本地预览
npm test        # 跑测试（90 个）
npm run build   # 构建
```

测试分三层，共 120 个：
- `tests/run.mjs` —— 98 个单元测试：日期/金额解析、分类规则、去重签名、UTF-8 base64 往返、GitHub API 错误码映射，以及 OCBC PDF 解析（列定位、跨行描述拼接、流水号剥离、跨年推断、跨页交易、对账校验能否抓出金额读错/方向反了/漏读/重复）
- `tests/integration.mjs` —— 22 个集成测试：jsdom 里挂载真实应用配一个假 GitHub 仓库，走完整流程（导入 → 确认分类 → 新建分类 → 保存 → 冲突 → 换设备重新加载）
- `tests/realpdf.mjs` —— 本地手动跑，拿真实 PDF 验证解析与对账（不进 CI，仓库里不放任何真实账单）
