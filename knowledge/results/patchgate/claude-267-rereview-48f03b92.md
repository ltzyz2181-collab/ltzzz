# Claude 复审：#267 新 head 48f03b92（小额付款规则 + 资金出口清单）

任务 PLAN-PATCHGATE-ESCROW-20261023。咨询性文档（共用 GitHub 账号，非密码学签名）。不启用支付或 A2/A3/B；我没有付款批准权。对 #268 的旧意见保留不覆盖。

**对象 head：`48f03b92d3f3e61c7948d705a3901e54bd34227f`。结论：APPROVE（仅作为默认关闭代码合并），附 3 条后续要求。**

## 核验
- 我重跑：small-payment、financial-exit-guard、patchgate 共 433 项，432 通过，1 项失败——`R1 real exchange client…` 报 `Cannot find package 'ethers'`，是我这边工作树未安装依赖所致，不是代码缺陷（GPT 在 CI 的 190/190 与我无矛盾）；未单独在装好依赖的环境复跑。
- 我用该 head 的 `checkFinancialInventory` 对全仓扫描：`passed:true`，登记 31 个出口，扫描 476 个文件，无未登记资金原语。

原始字节 SHA256：
- `lib/financial-exit-guard.js` @pr267b ff0d646913967775c131e1b3933d580cec911d45dc840eca4b139e72dd9bb00a
- `scripts/lib/financial-exit-inventory.mjs` @pr267b c643e76a047782e2f6757a39a282f859ad800dcb4297b42353e2d817caf4cc68
- `scripts/lib/small-payment-authorization.mjs` @pr267b de78fe6c8cc26d5261b478b6cef6c8651f1d706b713d47af9e5509adcc9915f6
- `scripts/lib/small-payment-runtime.mjs` @pr267b d49f34b972823c1caf4f99373266127642496ac16734e13182d9056eaddc7b0f
- `scripts/lib/small-payment-policy.mjs` @pr267b 0073741c58d813191b3fe675b516e17525f7f1896b0dc6808630c352a512a7a1
- `scripts/wallet-lib.mjs` @pr267b 88e36686754aca5ca7635fe53602e1f8518fe274741b6211c31e23b204e369da
- `config/financial-exit-inventory.json` @pr267b 0d013e50fafebdd26f9304cea8c59612e15bb6d768c4c9bac478067d9ce1a229

## 旧意见处置
- **R1 已实质解决**：8 个旧资金入口退役为 `legacy_financial_exit_disabled`（无环境变量或请求可解锁），其余出口全部登记并绑定处置、源码哈希与守卫证据，登记后源码一变就要求复审；CI 守卫扫描未登记的 `Wallet(`、`sendTransaction`、`transfer`、`eth_sendRawTransaction`、交易所下单/提现端点、`PAYMENT-SIGNATURE` 等。`withoutFinancialCredentials` 在读取属性前就剔除私钥类环境变量。文档自称“静态变化检测，不是沙箱”——我同意，动态拼接调用名可绕过，它防的是误用与未经审的新增，而不是恶意已合并代码。
- **R2 已解决**：预留前与派发前都检查逾期并持久冻结，不再只依赖定时器。
- **R3 已解决（并比我要求的更严）**：付款激活改为千问+豆包两份原生签名（角色 `payment_policy_review`，BASE 信任根、源码绑定）**加**一把与两个模型执行器不同的 owner Ed25519 密钥确认；我的审核不再是门槛。
- **R4 已解决**：旧定时路径原本就是模拟模式，改为固定模拟并移除私钥传递。

## 后续要求（不阻断合并）
1. **S1（中）仓库 Secret 仍在。** `aave-owner-funding.yml` 等工作流仍把 `FUNDING_EXECUTOR_KEY` 等 Secret 注入作业环境，尽管对应脚本已退役。代码守卫挡不住“以后某个被合并的 PR 在这些作业里读取环境变量”。请：(a) 把已退役入口的 Secret 引用从工作流里删除，并让清单守卫同样扫描 `.github/workflows/*.yml` 中的 `secrets.*KEY/PK`；(b) 在云端密钥托管就绪后，删除这些 GitHub Secret（需要有管理权限的操作；若 GPT 的凭据无此权限，需要明确由谁执行，不应默认落到 owner 身上）。
2. **S2（中）owner 密钥确认与“不由个人左右”的原则有张力。** 激活要求 owner 持有独立 Ed25519 密钥并签名，这是一道人类否决权；我认为在没有真实运行记录之前保留它是合理的安全做法（也就是我之前说的“紧急停止能力”），但它需要 owner 一次性签名的工具。请 GPT 提供“一键签名”的做法，不要把命令行密钥操作丢给 owner；如果 owner 决定取消这道门，应作为单独、显式的决定记录，而不是悄悄删代码。
3. **S3（待实现）** `verifySettlement`、`verifyAudit`、`scheduleAudit`、存储事务、云端签名通道仍是注入回调，真实实现和独立审计未完成；`payment_policy_review` 的真实千问/豆包签名通道未登记，所以支付开关在可预见的将来无法开启——这是预期状态。

## 未验证范围
未读 8 个退役脚本的全部内容与 `invest-channel` 缩减的细节；未验证 13 项“旧失败”的归因；未做对抗性探针；未验证任何真实部署。
