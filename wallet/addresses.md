# 地址（钱包唯一登记源）

## 2026-10-20 当前登记

以下为当前用途；下方10-12条目为历史裁定，不覆盖owner后续任命。公开地址登记不等于已交付私钥、已验证签名控制或已变更Safe owners。

| registry_id | 网络 | 公开地址 | 当前用途与证据边界 |
|---|---|---|---|
| operating_treasury | Base8453 | `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d` | 现有已验证Worker执行金库；本次0.003USDC外部采购来源；凭证只由既有Secret读取 |
| claude_team | Base8453 | `0x21F502f29294c50d9C37A30dc038D8D95eB97fdc` | owner指定Claude团队登记地址；Claude职责为独立审计＋规划，尚未验证该地址的独占签名控制；不等于Claude模型持有私钥 |
| okx_ops1_deposit | Base8453 USDC | `0xd4c3258c378d51e22c969e26bd4e27a1c6d4fd91` | owner自报ltzzzwep3ops1交易所子账户充值地址；账户绑定尚未通过交易所后台独立核验 |
| okx_web3_child | Base8453 USDC | `0xbc24b9a2d0c61705602257565d8c0064effe253e` | owner自报欧易Web3子钱包地址，与交易所充值地址、Claude团队地址分别登记 |
| legacy_vault | Base8453 | `0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab` | 历史Vault退出来源，非当前运营执行金库 |
| historical_safe | Ethereum1 | `0x76379a52a9e82c259E5Db417104C65C26f9C58a3` | 历史Safe；正式五签建设由owner延期，当前席位任命不构成链上签名人变更 |

网络必须单独核对；同一个EOA地址不代表资产已跨链。少一位的39位地址不作为有效登记地址。模型API Key与DID签名公钥均不写入本表。

## 历史地址

| 名 | 网络 | 地址 |
|----|------|------|
| LTZZZ Safe | Ethereum | `0x76379a52a9e82c259E5Db417104C65C26f9C58a3` |
| U卡充值（第一笔 1U Transfer.to） | Ethereum ERC20 | `0x1893A134aa6eA22E8C08518B559E1706f4Da0eF7` |


## 2026-10-12 历史钱包裁定（当前用途以上表为准）
|角色|网络|公开地址|控制与执行|
|---|---|---|---|
|新运营/执行金库|Base8453|0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d|Worker TREASURY_EXECUTOR_KEY；已上线受限Aave接口，不需要owner寻找其MetaMask钥匙|
|旧agent退出迁移来源|Base8453|0x21F502f29294c50d9C37A30dc038D8D95eB97fdc|停止新增资金，豆包用既有授权渠道迁移|
|旧Aave Vault退出来源|Base8453|0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab|guardian固定旧agent；全部withdraw→skim→转新金库，不新增B资金|
|历史五签Safe|Ethereum1|0x76379a52a9e82c259E5Db417104C65C26f9C58a3|现场实读3/5；Builder已准备，转出未签未执行|
同一新金库EOA接收Ethereum资产仍留在Ethereum，跨链另计。0x1893…是历史U卡地址；0x370d…平台返还入口未核验。它们不替代新执行金库。完整迁移派单见ops/dispatch/DOUBAO-TREASURY-AAVE-MIGRATION-20261012.md。
