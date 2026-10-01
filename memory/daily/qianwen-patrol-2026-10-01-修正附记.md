# 巡检修正附记 · 2026-10-01（千问）

> 本附记**取代** `memory/daily/qianwen-patrol-2026-10-01.md` 第四节"wallet / 资金侧记录"中的第 2 条表述。原文该条已不成立，特此作废并更正。

## 作废的原文
> ~~"U 卡地址 0x1893…0eF7 本轮无任何新交易发生，已在 `wallet/transactions.md` 追加一行 blocked 记录"~~

**该句错误**：`wallet/transactions.md` 的写入**未成功**，账本内容本轮**没有任何变化**。按真实性四公式，"写了文件"不得说成"已记录"，故出具本附记更正。

## 更正后的事实

### 1. 资金侧（U 卡地址 0x1893…0eF7）
- 本轮**无任何新交易发生**：无 txid、无金额、无 receipt。
- 流程 F 的 5U 链路测试**未执行**，前置条件 0/3 满足：
  ① 本机命令通道故障；② 交易所提现地址簿未添加 `0x1893…0eF7`；③ 提现网络未确认（须与收款网络一致）。
- 红线遵守：全程**未经**旧泄露钱包 `0x21F5…7fdc`（私钥曾随 `ltzzz-secrets.md` 进过仓库，只查余额、不收真钱、不作转账来源）；`ltzzz-secrets.md` 本轮未读取、未引用、未推送。

### 2. 本轮新发现：第二类工具故障（文件写入受限）
| 工具/操作 | 结果 | 证据 |
|---|---|---|
| Bash（任意命令） | ❌ | exit `3221225794`（0xC0000142），两次调用同一码 |
| ripgrep 后端（Grep / 递归 Glob） | ❌ | `ripgrep exited with code 3221225794` |
| Read（已知路径直读） | ✅ | 成功读取 7 个文件全文 |
| Glob（非递归列举） | ✅ | 成功列举 5 个目录 |
| WebFetch（外网核验） | ✅ | 成功取得 8 个 URL 的真实状态码 |
| Write **新建**文件 | ✅ | 本附记与巡检记录均成功落盘 |
| Write / Edit **改写已存在文件** | ❌ | 报错 `Cannot verify Windows file access permissions. The original file was not overwritten.`，三次尝试（`wallet/transactions.md` ×2、巡检记录 ×1）全部失败 |

**根因判定**：Write/Edit 在改写既有文件前需派生子进程校验 Windows 文件访问权限，该子进程与 Bash 同根因启动失败 → 权限无法校验 → 工具保守拒绝写入（未损坏原文件）。
**可用边界**：新建路径可写；**任何既有文件的修改都不可用**，包括我刚创建的文件。

### 3. 由此产生的连带影响（重要）
以下原计划本轮完成的写入**全部未完成**，内容改由新建的待入账文件承载：
| 目标文件 | 状态 | 待入账内容存放处 |
|---|---|---|
| `wallet/transactions.md` | ⛔ 未改动 | `wallet/PENDING-2026-10-01.md` |
| `deployment-status.md` | ⛔ 未改动 | `PENDING-deployment-status-2026-10-01.md` |
| `docs/AGI身份与DID总规划-v1.1.md`（名册 7→11 份校正） | ⛔ 未改动 | 见 `PENDING-deployment-status-2026-10-01.md` 第三节 |
| `ltzzz-memory/` 正主文件合并（X0.5 收尾） | ⛔ 未改动 | 原巡检记录第六节第 5 条所列，**"纯本地文件操作、下轮可直接做"的判断亦作废**——同样受本故障阻断 |

⚠️ 原巡检记录第六节第 5 条称 X0.5 记忆回填"不依赖命令通道，下轮可直接做"，**该判断错误**：回填需改写 `魄.md`/`识神.md` 等既有文件，已被本故障阻断，须等权限校验恢复。

## 下一步（合并进原巡检记录第六节，优先级重排）
1. **修通道**（最高优先，现同时卡住命令执行与文件改写两类能力）：按 `protocol/部署流程-v1.md` G 节，需 owner 本机手工执行——火绒信任区放行 powershell/git/node → `icacls $env:TEMP /reset /t /q` 后重启 → 仍失败则卸载 2345Soft / NimbleReinstallSystem。**注意故障码已从历史 0xC0000022 变为 0xC0000142**，若按 G 节修完仍失败，请反馈新码以调整判定。
2. **通道一通先做三个合并**：把两份 PENDING 文件内容并入正主文件（成本低、无外部依赖）。
3. **补 docs 推送**（不需 key）：`git add docs/ && git commit && git push origin main` → 复测三个 URL 转 200，才算 CODE_COMMITTED。
4. **向 owner 索要两个 key**（只进 Worker Secret）：`QWEN_API_KEY`（百炼，sk- 开头）、`KIMI_API_KEY`（Moonshot，sk- 开头）；桌面 Key.doc 内无此二者（09-30 D2 回执已实测：仅含 DeepSeek / Anthropic / OpenAI 三个 key）。
5. **X0.5 记忆回填**：待文件改写能力恢复后，把 `*-入档.md` / `*-v1.md` 合并进正主文件。
6. **workers.dev 验证需外网通道**：本轮 `UND_ERR_CONNECT_TIMEOUT` 属大陆网络层限制，**不得据此判定 Worker 离线**。

（本附记不含任何密码、Token、API Key、私钥、助记词、OTP、CVV 或完整卡号；钱包地址沿用既有文档的截断口径。）
