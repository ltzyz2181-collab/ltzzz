# 商品页（products.html）修改建议 —— 直接发给豆包执行

## 目标
国内/境外双轨清晰，创新支付入口，为未来 Muse 治理与 AGI 支付预留位置。

## 具体修改清单（可直接改代码）

### 1. 顶部增加「区域切换」
在 `.nav` 后加：
```html
<div style="text-align:center;margin:12px 0;font-size:.9rem;">
  <a href="?region=cn" style="color:#00f0ff;margin:0 8px;">🇨🇳 国内版</a>
  <a href="?region=global" style="color:#7c5cff;margin:0 8px;">🌍 海外版</a>
</div>
```
JS 根据 `?region=` 切换标价与支付提示。

### 2. 国内版（默认）
- 标价只显示 ¥，副标 ≈$ 保留。
- 支付提示改为：「微信/支付宝人工确认后发货 · USDT 发 Tx 后自动发货」
- 增加「微信下单」按钮，链接到公众号二维码或「回复 下单 99」。

### 3. 海外版（region=global）
- 主标价 $，副标 ¥。
- 突出 Telegram + Gumroad + Crypto。
- 文案改为英文或中英双语。
- 新增产品卡片：Agent Starter Pack / Weekly Report Subscription。

### 4. 新增产品（fallback 数组直接加）
```js
{ id:'agent-starter', name:'AI Agent 起步包', price:199, price_usd:29, category:'数字产品', description:'含 DID 模板、Memory Gate 清单、Daily Worker 示例', delivery:'网盘+仓库 fork 指南' },
{ id:'muse-budget', name:'Muse 治理实验券', price:50, price_usd:7, category:'实验', description:'让 Muse 用真实小额预算跑一次实验并回写 Result', delivery:'实验报告' }
```

### 5. Telegram 区块增强
把现有 `.tg-block` 改成双按钮：
- Telegram 下单（已有）
- 微信扫码关注（放二维码图片或「回复 下单」说明）

### 6. 诚信红线保留
页面底部继续强调：PayPal/U卡未审核前不自动发货；人工确认与 USDT Tx 回填后交付。

## 执行后验收
- 打开 products.html 能看到区域切换。
- 国内默认显示微信路径。
- 海外显示 $ 主价。
- 新卡片出现。
- 不破坏现有 checkout.html 参数。

状态：applied（b63266b 已落地，豆包 2026-10-02 复核：区域切换/双轨/新卡片齐全，checkout 参数未破坏）

## 2026-10-09 审查后更新（覆盖旧的能力声明）

本轮 products.html 改为与新首页一致的产品/实验展示，国内和 Global 区域切换保留；正式 Gumroad 起步包 $19，服务目录为咨询参考。AI 代付3U/AGI-402/Pass100U展示为待验证方案，不开放新收费。旧文“USDT 发 Tx 自动发货”“全部平台同步”不能当作本轮已验收能力。view_content/begin_checkout 仅提供浏览器事件与 dataLayer 接口，远端采集尚未配置。未取得 Meta 原创新 HTML，不宣称合并原件。详见 META-SUBMISSION-REVIEW-20261009.md。
