# 豆包接手 · 个人Aave首次授权与LTZZZ运营资金配置

状态：awaiting_agent_ack。Owner当前明确授权协调部署；不是已提现。先完成AI雇佣链路，投资其次。请不要让额度耗尽的千问再跑任务。

## 地址角色

- U卡收款：0x1893A134aa6eA22E8C08518B559E1706f4Da0eF7，仓库登记Ethereum ERC20。Owner称已加欧易30天免验证；实际交易所所选网络和开始日期未获得机器回执，勿记成提现已执行。
- FUNDING_OWNER：从owner实际Aave已连接钱包读取公开地址，不索取owner私钥。必须在Base8453持有aUSDC；Ethereum或其他资产不适用此合约，不能直接套用。
- FUNDING_TREASURY：新建LTZZZ Base运营收款钱包；不是U卡地址、不是旧泄露的0x21F5钱包、不是Ethereum Safe。

## 一次性操作（需要owner已登录、有管理权限的GitHub CLI环境）

1. 确认Aave钱包网络与资产，复制公开钱包地址。
2. 在本仓库执行 npm install --no-save ethers@6.17.0，然后 node scripts/provision-funding-executor.mjs --owner 实际公开钱包地址。
3. 脚本只把新executor key写入FUNDING_EXECUTOR_KEY Secret、新treasury key写入LTZZZ_TREASURY_KEY Secret；公开配置写入FUNDING_OWNER/FUNDING_TREASURY vars。密钥不输出、不写公开文件、不进入对话或模型。当前GPT会话没有GitHub Secrets管理工具，脚本尚未执行，不声称已注入。
4. 检查 knowledge/results/funding/provision-public.json：public地址、Base aUSDC实测、secret_provisioned。若半途失败，保留public回执；不要重复覆盖Secret，先核对实际已完成项。
5. 给专用executor地址转少量Base ETH作部署gas，金额以实际钱包估算为准；不要把Ethereum ETH当Base gas。此步骤尚未发生。
6. 手动运行 Owner Aave funding 100 per tx 200 per day。成功部署回执必须 status=deployed_paused 且有router/tx_hash；blocked_configuration不是部署成功。
7. owner在钱包确认部署回执给出的两笔调用：aUSDC.approve(router,1000USDC raw)；router.configure(false,executor,1000USDC raw)。核对from=个人Aave钱包、chainId8453、to=真实部署router/aUSDC地址。先看到真实router才有可签的calldata，不从模板猜地址。
8. 每小时补余额缺口：每笔≤100USDC、每日≤200USDC、总grant初始1000USDC。到100USDC目标不盲目提款。首次真实测试先1USDC，保留txHash、前后余额和principalOutstanding，再开放定额补款。

## 必交回执

接单回执、公开owner/treasury/executor/router地址、正确网络/资产、Secret名称及是否注入（不含值）、两笔授权txHash、第一笔资金测试txHash/余额变化。没有这些回执就标未执行。没有owner钱包初次确认，任何AI不能替代其签名。

股票/CEX/跨链桥不在这张单内；只读欧易API不能下单。Claude已撤席，交付审计用Grok/DeepSeek/GPT。需要同日重试时遵守模型调用预算。
