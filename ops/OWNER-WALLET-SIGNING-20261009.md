# 个人 Aave 首次签署说明
## 当前还不能签
拨款路由尚未部署，因此没有可供签署的 spender/router 地址。不要给旧投资 Vault 或聊天里的占位地址授权1000USDC。
需要你只提供个人 Aave 的公开钱包地址和仓位所在网络；不用私钥/助记词。若仓位不在 Base，现有 Base 路由不能直接提取，需先按源链退出/桥接方案单独准备。

## 部署后两笔交易，均由个人钱包签
资金源=个人 Aave 地址；收款=经核实的 LTZZZ 运营地址；执行器=专用链上账户。部署工作流 knowledge/results/funding/<run>.json 提供 router、部署tx和 owner_authorization 两份 calldata。
1. MetaMask 选择个人 Aave 的地址，切换 Base 主网(chainId8453)，确保有少量 Base ETH 支付gas。
2. 在 Base 浏览器核实新 router 的部署tx、owner、treasury、pool、usdc、aUSDC、executor；默认 paused=true。代码验证后用 aUSDC 合约 Write/Connect Wallet 调 approve(spender=新router，amount=1000000000)。这是1000 aUSDC额度，不是无限授权，不会立即提钱。
3. 新 router 的 Write/Connect Wallet 调 configure(stop=false,ex=专用executor,grant=1000000000)。核对钱包交易目标、方法、参数，然后确认。
4. 若浏览器未验证合约，使用部署回执给出的 to/data，在钱包支持的合约交互界面发送 value=0 交易；不支持则先由工程席完成验证/交互页面，再签。不要把 configure calldata 当普通消息签名。
5. 首次提款应先小额验证；签署后仍核对真实 tx receipt 和余额。随时 configure(true,executor,remaining) 暂停；aUSDC approve(router,0) 撤销授权。

## 谁能帮
豆包可以协助配置、验证合约、制作交互页，无法代替未托管的个人钱包签名。只有钱包所有者或已有有效授权的执行器可以执行对应步骤。每月3000人民币不是链上自动扣款授权。
