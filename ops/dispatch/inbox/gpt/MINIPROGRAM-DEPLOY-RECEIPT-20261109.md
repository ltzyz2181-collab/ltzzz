# 小程序部署接续回执（2026-11-09 桌面窗口）

触发：owner 本地时间 2026-11-09 指令「桌面电脑了 完成未完成部署」，对应排期卡 `MINIPROGRAM-DEPLOY-SCHEDULE-20261108.md` 第四节。
执行席位：桌面豆包（本地 Windows，`client:1044603:832795323182164`，device_name「世章」）。
范围：只做小程序。云端部署（CloudBase 云函数、wrangler、其他 workflow）一律未动，等 owner 点头。

## 一、结论（四句话）

1. **不需要重传**：`git log 1f1e5207..origin/main -- miniprogram/ scripts/miniprogram-upload.mjs .github/workflows/miniprogram-upload.yml` 为空，已上传的 `0.1.6` 就是当前源码；本轮进到上传表单后取消，未产生重复上传。
2. **后台「开发版」列表已独立核验**（这是排期里挂了两天的空白项）：开发版两个——`0.1.6`（ci机器人1，2026-11-07 15:44:06）与 `0.1.20261107`（擎起柱，2026-11-07 20:13:33），后者带**体验版**标记。
3. **体验版已经存在**，无需再设：`0.1.20261107` 即当前体验版（可扫描访问）。`git merge-base --is-ancestor 1f1e5207 5ddc193b` → yes，且两者之间 `miniprogram/` 改动 0 条，即 `0.1.20261107` 与 `0.1.6` 代码内容一致、且都等于当前 main 的 `miniprogram/`。
4. **提审与发布仍不做**：后台显示「线上版本：尚未提交线上版本」「审核版本：无」，且「小程序备案：管局审核中」——备案未通过前不满足上架，属 owner 本人动作。

## 二、仓库对齐（本地实测）

| 项 | 值 |
|---|---|
| 初始 HEAD | `ed8bd03f`（本地独有 1 提交 / 落后 origin/main 99 提交） |
| 对齐后 HEAD | `fdfddaf7`（`WEP3 actual deployment acceptance`），= `origin/main` |
| `git status --porcelain` | 除本轮新增截图外为空 |
| stash | `stash@{0}`（本地11-06未提交WIP）、`stash@{1}`（daily-3nums-wip）均**保留未动** |

## 三、展示与初始化实测（模拟器 + 真实云函数，不触碰支付）

在开发者工具 `Stable 2.02.2608080`、编译模式 iPhone 12/13 下：

- **服务列表页** `pages/catalog/index`：正常渲染标题「把模糊的事变成可验证的结论」+ 三张卡：资料来源核对清单 ¥9.90/次、交付验收核对 ¥19.90/次、资料整理与格式校对。
- **服务详情页** `pages/product/index`：显示 ¥9.90/次、「当前可浏览服务介绍，在线预约尚未开放」、服务内容四条、交付时效 24 小时、下单前须知。购买按钮不出现——与 `config.payEnabled: false` 一致（`pages/product/index.js` 的 `payEnabled = config.payEnabled === true && !!config.cloudEnv && !!wx.cloud?.callFunction` 判为 false）。
- **订单页** `pages/orders/index`：**真实调用云函数 `order-list`**（`wx.cloud.callFunction({ name: 'order-list' })`，环境 `shizhang-pay-d0g1n58020acf6b5b`），返回两条记录并渲染：
  - `VP202611070806582eb81ed9` ¥9.90 待支付 2026-11-07 00:06
  - `VP20261107045028c2a3f1e1` ¥9.90 待支付 2026-11-06 20:50
  → 云函数链路、数据库读取、鉴权（`cloud.getWXContext()` 取 OPENID）均通。
- 控制台噪声（非崩溃）：`[Perf] App.onlaunch took 85ms`、`worker reportRealtimeAction: fail not support`、`[自动热重载] 已开启`；错误计数 7–9 全为警告/热重载提示，无页面异常。

截图（已随本卡提交，路径相对仓库根）：

- `results/commerce/miniprogram-sim-catalog-20261109.png`（服务列表）
- `results/commerce/miniprogram-sim-product-20261109.png`（服务详情）
- `results/commerce/miniprogram-sim-orders-20261109.png`（我的订单，云函数真实返回）
- `results/commerce/miniprogram-mp-dev-versions-20261109.png`（后台版本管理·开发版本区）
- `results/commerce/miniprogram-mp-trial-version-20261109.png`（后台 0.1.20261107 行的体验版标记）

## 四、后台核验（mp.weixin.qq.com，owner 扫码登录后只读读取）

版本管理页（`/wxamp/wacodepage/getcodepage`）正文原文要点：

- 线上版本：**尚未提交线上版本**
- 审核版本：**你暂无提交审核的版本或者版本已发布上线**
- 开发版本：
  - 版本号 `0.1.6`｜开发者 `ci机器人1`｜提交时间 `2026-11-07 15:44:06`｜备注「LTZZZ 数字实验室服务展示：资料核对/交付验收/资料整理；不接支付与自动交付」
  - 版本号 `0.1.20261107`｜**体验版**｜开发者 `擎起柱`｜提交时间 `2026-11-07 20:13:33`｜备注「…main@5ddc193b 桌面兜底上传 2026-11-07」

另核：后台首页「基础信息 已完成 / 类目 已完成 / 微信认证 已完成 / 小程序备案：管局审核中」——备案可与代码开发并行，上架发布前完成即可。

版本次序澄清（避免误判"0.1.6 更新"）：`1f1e5207` 是 `5ddc193b` 的**祖先**，所以 CI 的 `0.1.6` 实际比桌面兜底的 `0.1.20261107` 更早；两者 `miniprogram/` 内容零差异，故体验版维持 `0.1.20261107` 不切换。

## 五、缺陷清单（含严重度）

| # | 严重度 | 缺陷 | 证据 | 建议 |
|---|---|---|---|---|
| D1 | **P2** | 服务列表页静态文案写「支持微信在线支付；支付成功后 24 小时内人工交付」，但 `payEnabled: false` 时实际不开放购买，详情页却是「在线预约尚未开放」，同一入口两套口径 | `pages/catalog/index.wxml:12` vs `pages/product/index.wxml:6`；实机截图 catalog/product | 列表页文案改为按 `payEnabled` 条件渲染（与详情页同源），或改为「暂未开放在线预约」 |
| D2 | **P2** | 体验环境存在两条真实「待支付」订单（各 ¥9.90），在任何体验者打开「我的订单」时都会看到 | order-list 真实返回 `VP202611070806582eb81ed9`、`VP20261107045028c2a3f1e1` | 提审前把这两条标记为测试数据或清理；或明确这是产品演示样例并加「演示数据」标记 |
| D3 | **P3** | 订单卡标题为「稿件源文核验」，与当前商品名「资料来源核对清单」不一致（历史订单沿用旧商品标题） | 订单页截图文案 vs `data/products.js` | 订单渲染改用商品 ID 映射当前 `name`，避免旧标题泄漏 |
| D4 | **P3** | 服务协议页写「下单通过微信支付完成…支付成功后订单状态变为『已支付·待交付』」，在支付未开放阶段属未兑现描述 | `pages/agreement/index.wxml:16-17` | 协议加「支付功能开放后适用」前置语，或按开关条件渲染 |
| D5 | **P3** | 控制台 `worker reportRealtimeAction: fail not support` 警告、热重载提示混在错误计数里，掩盖真实报错 | 控制台截图/文本 | 开发期关闭自动热重载再取"零错误"基线；不影响线上 |

无 P0/P1：三页可正常打开，云函数真实返回，无崩溃、无白屏、无支付误触发。

## 六、宿主可用性（本轮实际遇到的限制）

- `computer_use_tool(plane="cu")` 首次调用报 `Windows password authorization reached its retry limit / Virtual desktop (PiP) is unavailable`，**同一 cell 原样重试后 `switch_desktop("main")` 成功**；本轮未再尝试 pip（`PIP_REQUIRES_MAIN_SESSION` 结论未变）。
- 主桌面实测分辨率 **1763×1175**，CU 坐标为 0–1000 归一化；旧记录 1583×1175 作废。
- 开发者工具：`Ctrl+Shift+U` 才是上传可靠入口；点顶部 `(510,17)` 会误开"小程序模式"下拉。`(922,41)` 是"清除缓存"下拉，`(903,41)` 才是"编译"。
- mp 后台：版本管理页被 wujie 包裹，`get_page_text`/`document.body.innerText` 只回菜单与页脚，必须按 `.code_version_log` 结构取文本；后台 token 十几分钟失效（本轮 token 为会话级，未落任何文件）。
- `bu` 平面可正常导航 mp 后台；`bu` 与桌面 Chrome 是两套会话，登录态不互通。

## 七、未做的事 / 边界

- 未重传开发版（依据见第一节第 1 条），未进`上传`确认，**未重置任何上传密钥**（按 GPT 裁定）。
- 未设体验版（已存在）、**未提交审核**、**未发布线上**、未改小程序任何代码。
- 未做真机调试，未做断网/云函数失败等异常兜底路径（本轮只在模拟器验证正常路径 + 云函数真实返回）。
- 未回灌 `stash@{0}`（11-06 WIP 仍未决）；`scripts/call-doubao.mjs` 第 7 行注释订正仍在 stash 内。
- 未清理 `%TEMP%\mini-ci`、`%TEMP%\ltzzz-push-wt` 两个临时目录（可删，未删以免动 owner 环境）。
- 未动云端部署面（CloudBase / wrangler / 其他 workflow）。

## 八、下一步（owner 侧，非桌面可代做）

1. 备案「管局审核中」通过后，才进入提审前置。
2. 提审前建议先修 D1（文案口径矛盾）与 D2/D3（体验者可见的脏数据与旧标题），否则审核与首批体验者会看到不一致信息。
3. 提审 → 发布线上，两步仍是 owner 本人在后台操作。
