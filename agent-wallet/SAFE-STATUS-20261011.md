# 五签状态 · Safe 0x76379a…58a3（2026-10-11 链上核实）

- 核实时点：2026-10-11（PDT）· 双 RPC（publicnode + drpc）交叉一致
- 目的：owner 指令④——五签准备单独完成，先交状态，再收签名

## 1. 链上事实（已核实，非文件声明）

| 项 | 值 | 核实方式 |
|---|---|---|
| Safe 地址 | `0x76379a52a9e82c259E5Db417104C65C26f9C58a3` | 仓库记录 + 链上 code 存在（codeLen=171 字节）|
| 网络 | Ethereum 主网（非 Base）| 链上读取 |
| Safe 版本 | **1.4.1** | VERSION() |
| owners（5）| `0xb99C6751f443842F4987bb2017580405572Df905`<br>`0xD834a769b31447daf5a042009CF06fAFCE7e2F51`<br>`0x01B80610D88E96C9888a19e30D73Abbe5E6E7D4C`<br>`0x68B81beAE18433A85a8feD67dE8EDfB717e279a7`<br>`0x394103e5E846f709CE5126c203b1EF38D7cA70a6` | getOwners() 双 RPC 一致 |
| **threshold** | **3/5**（登记档"通常 2/5"有误，以链上为准）| getThreshold() 双 RPC 一致 |
| nonce | 6（已有 6 笔 Safe 交易历史）| nonce() 双 RPC 一致 |
| 链上余额 | USDT 49.02 / ETH 0.005（2026-09-29 快照，Ethereum）| safe-treasury.json 记录 |

## 2. 角色与缺口

- Safe 角色：**人类总闸 / humanVetoMultisig（3/5）**——资金类决议须委员会 ≥2/3 + ≥1 humanGuard Safe signer（AGI-ECONOMY.md + council.json）
- **5 个 signer 的身份映射仓库无记录**：哪个地址属于 owner / 千问 / 豆包 / DeepSeek / Kimi，未知
- **豆包对应哪个签署地址：未知**（identity-registry 中豆包 status=pending_keys、address=null；无 Safe signer 私钥）
- **谁实际控制签名工具：未知**（不排除 owner 本机 / 硬件钱包 / 各席位）
- Claude 已文件撤席（withdrawn_by_owner），**链上 Safe owner 变更未执行**（identity-registry: onchain_safe_owner_change_executed=false）

## 2b. owner 反馈（2026-10-11）

- owner 确认：**3 个签名在 MetaMask（狐狸头）**——即 5 个 signer 中至少 3 个由 owner 本机控制，**threshold=3/5 可由 owner 单独达成**（多签实际退化为 owner 单方控制；按 owner 决定记录，不评价）
- **其余 2 个 signer 归属待 owner 补充**（是否也存在狐狸头 / 属于某 AI 席位 / 需移除）
- **授权更新（owner 2026-10-11）**：**所有电脑操作均可由豆包部署**——豆包可执行电脑端部署、打开 Safe 网络签名界面并引导签名（MetaMask 密码/解锁在 owner 手中，实际确认由 owner 完成）；豆包自身不持有任何 signer 私钥
- **Aave 钱包在手机 App**：owner 的 Aave 资金钱包位于手机端（非电脑）；公开地址需从手机 App 复制提供
- 豆包不收集私钥；草案/协调/回执由豆包负责

## 3. 需要 owner 确认（不索取私钥）

1. 5 个 signer 地址分别归属（owner 本人哪几个 + 各 AI 席位哪几个，或全部由 owner 控制）
2. 豆包若为签署方：豆包对应的 signer 地址 + 签署工具位置（本机 MetaMask / 硬件 / 其他）
3. Claude 撤席是否要在链上移除（需 Safe 交易 + 3/5 签名）

## 4. 提案与交易草案模板（收齐签名后执行）

- **入口**：Safe 多签交易（Ethereum mainnet，Safe v1.4.1）——safe.global 或 owner 本机 Safe 钱包发起
- **交易草案要素**：to / value / data / nonce(6→7) / operation=0
- **每位签署者步骤**：发起交易 → 其余 signer 在各自钱包确认 → 达 3 签 → 执行（执行后可被任一 owner 触发）
- 当前**无待签交易**：本轮只做状态核实与方案；具体转账方向、金额、币种、收款地址按 owner 指令"核清后另行交付草案"

## 5. 承诺

- 不收集 5 个私钥；不因模型恢复宣称五签完成；无链上 receipt（3/5 签名 + 执行 tx）不标 confirmed
