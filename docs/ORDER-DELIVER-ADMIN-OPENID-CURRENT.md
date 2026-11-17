# order-deliver 管理员 openid 白名单：值在哪、是什么（2026-11-17）

结论先行：**这个值仓库里早就有，不需要再去云开发控制台翻。**

## 一、值

```
ADMIN_OPENIDS = o8IYYxiWJIJo6Lz5TuLUYlz1uFxw
```

（逗号分隔，可配多个；`order-deliver` 读 `process.env.ADMIN_OPENIDS`。）

## 二、出处（都在仓库里，可自查）

| 事实 | 位置 |
|---|---|
| 值本身：唯一 paid 单的 openid `o8IYYxiWJIJo6Lz5TuLUYlz1uFxw` | `docs/2026-11-13-客服与交付闭环三项落地.md:64`（在分支 `feat/order-closure`，未合入 main） |
| 白名单机制：`ADMIN_OPENIDS` 逗号分隔，未配置即拒绝一切交付写入（fail closed） | 同上 `:29`；`miniprogram/cloudfunctions/order-deliver/index.js:10-11`、`lib/logic.js:19` |
| 该 openid 是同一人多次下单的买家 | `docs/2026-11-13-客服通道实测与首条消息回复.md:26`（订单 `VP20261112215711c7e626e9` 买家）、`scripts/tests/kf-reply.test.mjs:82`（客服事件 `FromUserName`） |

## 三、归属判定（这一步是上一轮漏掉的）

- 沙箱/现网唯一 paid 单 `VP202611090907466de445e3`（下单 `2026-11-09 17:07`，¥9.90，「稿件源文核验 *1」）。
- `docs/2026-11-16-已闭环事项登记与勿重复清单.md` 第一节：该笔支付由 **owner 本人手机微信**完成（owner 提供微信账单截图 + 「退款到账通知 ¥9.90」原件），退款也已到 owner 零钱通。
- 结论：**该单的 `openid` 字段就是 owner 本人 openid**，即上面那个值。

残留一个前提：以上是「付款人 = owner 本人」的推导，不是数据库 `orders` 字段直读（本机无云开发凭据）。若你当时是用另一个微信号下的单，说一句即可改；否则按此值配置。

## 四、要落地还差什么（不是缺口，是配置动作）

1. `order-deliver` 云函数代码在 `feat/order-closure` 分支，**未合入 main、未部署**（线上仍是 5 个函数，无 `order-deliver`）。
2. 部署时把 `ADMIN_OPENIDS` 配成云函数环境变量（云开发控制台 → 云函数 → 配置 → 环境变量），**不要写进仓库明文**。
3. fail-closed：不配置该环境变量时，任何交付写入一律返回 `NOT_CONFIGURED`，不会误放行。

## 五、纪律

本文件只登记值与出处，不改任何云函数代码、不做部署、无资金动作。
