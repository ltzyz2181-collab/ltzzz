# SPLIT-SIGNER-INFRA-20261026-doubao

原任务：PLAN-PATCHGATE-ESCROW-20261023，不改变任务 ID；不是采购或付款指令。

你的任务：在火山引擎部署豆包签名服务，要求见 ops/dispatch/PLAN-SPLIT-SIGNER-INFRA-20261026.md；私钥只在火山引擎侧生成与保存，回执只写公钥、源码 SHA256、服务地址与重启后挑战结果。

- 状态：repository_card_published_not_acceptance；部署、登记、挑战验证、真实调用分别记录。
- 禁止：不读他人凭证、不替其他席签名、不启用 A2/A3/B 或资金；paid=false、tx_hash=null。
