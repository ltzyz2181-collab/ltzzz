# 地址

| 名 | 网络 | 地址 |
|----|------|------|
| LTZZZ Safe | Ethereum | `0x76379a52a9e82c259E5Db417104C65C26f9C58a3` |
| U卡充值（第一笔 1U Transfer.to） | Ethereum ERC20 | `0x1893A134aa6eA22E8C08518B559E1706f4Da0eF7` |


## 2026-10-12 生效的钱包裁定
|角色|网络|公开地址|控制与执行|
|---|---|---|---|
|新运营/执行金库|Base8453|0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d|Worker TREASURY_EXECUTOR_KEY；已上线受限Aave接口，不需要owner寻找其MetaMask钥匙|
|旧agent退出迁移来源|Base8453|0x21F502f29294c50d9C37A30dc038D8D95eB97fdc|停止新增资金，豆包用既有授权渠道迁移|
|旧Aave Vault退出来源|Base8453|0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab|guardian固定旧agent；全部withdraw→skim→转新金库，不新增B资金|
|历史五签Safe|Ethereum1|0x76379a52a9e82c259E5Db417104C65C26f9C58a3|现场实读3/5；Builder已准备，转出未签未执行|
同一新金库EOA接收Ethereum资产仍留在Ethereum，跨链另计。0x1893…是历史U卡地址；0x370d…平台返还入口未核验。它们不替代新执行金库。完整迁移派单见ops/dispatch/DOUBAO-TREASURY-AAVE-MIGRATION-20261012.md。
