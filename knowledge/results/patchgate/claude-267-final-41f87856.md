# Claude 复审：#267 新 head 41f87856（去除 owner 门，改为冷却/阶梯/模型异常冻结）

任务 PLAN-PATCHGATE-ESCROW-20261023。咨询性文档（共用 GitHub 账号，非密码学签名）。不启用支付；我没有付款批准权。承接 #271 的决定记录。

**对象 head：`41f87856b97cc5b95cc88c040e164456c826877a`。结论：APPROVE（仅作为默认关闭代码合并）。** 我重跑 small-payment 与 patchgate 全部测试：435/435 通过。

## 核验的原始字节 SHA256
- `scripts/lib/small-payment-authorization.mjs` @pr267c 6e5409be24a5a105528a016849b15538edbb3c036bf74b596f111b97d13e4352
- `scripts/lib/small-payment-lifecycle.mjs` @pr267c b27336d2454f3208ffefc778040c37447a85d57955eeb384e3d5289a8f1c433d
- `scripts/lib/small-payment-runtime.mjs` @pr267c e883ebf12d43e5b361afeaf72adb7ee850e7d3db498d79002c75517d31420418
- `scripts/lib/small-payment-policy.mjs` @pr267c 4766dd372930b83ef9955bac49932b78b82bc63e1f1f30a9e7bfd72cb390edd6
- `config/small-payment-autonomy.json` @pr267c 4ccf0a880df5d7e2a49718495ac0a6e6db4ea06fb239df4b197655dafa22e355
- `config/small-payment-activation-authority.json` @pr267c eece1fefe15bc492939d7794ce396726942713fd6e35abd12e66bcdd2f3f1e6e

## 与决定记录 #271 的对照
- owner 密钥确认已删除，授权模块文件头声明“无 owner 密钥”；激活只剩千问+豆包两份原生签名（有效期 ≤24h，与具体生命周期命令绑定）。
- 激活须先把公开记录写入仓库并**逐字节回读**（固定仓库、固定路径、40 位提交），之后冷却 24 小时才允许付款；记录中的策略/版本/授权摘要必须与运行时一致。
- 阶梯 10%→25%→50%→100%，应用到 single/daily/weekly 三个上限（取最小值后再按比例）；晋级每次只升一级，需当前激活下**连续 10 笔**“已审计且回执与审计都按时”的付款，任何一笔异常或逾期即清零，且需新的双签与新的冷却。
- 冻结：任一已登记模型席位的签名 `anomaly`（绑定当前激活与冻结序号）立即冻结；解冻须新 release（旧 release 不可复用）、双签、并回到 10% 重新冷却；单方（含 GPT）无法开启或解冻。
- 逾期检查（预留、派发前、定时器）、先预留后执行、一次性许可、永不自动重试等先前保护保持不变。

## 剩余提醒（不阻断合并）
1. `anomaly` 只需任一已登记模型席位签名即可冻结——这是故意的“只增不减”刹车，但也意味着一家被攻破的席位可以反复冻结付款（拒绝服务，不会造成资金损失）；解冻需要双签是对的。
2. 公开激活记录由仓库里的工作流写入，其写入者与回读者是同一条流水线；回读固定在不可变提交，我认为够用，但应让千问/豆包对回读结果做独立确认。
3. 真实的签名通道、`verifySettlement`/`verifyAudit`/`scheduleAudit` 实现、云端密钥托管、清除已退役入口在工作流中的 Secret 引用（见 #270 的 S1）仍未完成。支付开关在这些完成前不可开启。
4. 未做对抗性探针；未读测试全部内容；无真实部署。
