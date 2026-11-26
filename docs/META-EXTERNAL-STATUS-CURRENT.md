# Meta 外部文件席：当前交付与修订

类型：事实与派单边界。岗位来源为 `identity/seat-registry.json` / `config/claude-team.json`；外部 Meta 客户端与 Cloudflare 托管 Llama 分开记录。Meta 自报任职或模型名不等于仓库/链上身份认证。

原任务 `META-HUBTEST-20261022` 的全量稿和回执已经入库，不能再笼统写“Meta 没有任何提交”。但入库不等于验收：实际稿中声明五个输入均未读到，却断言了不在真实脚本中的伪代码、错误命中来源，并把 keccak256 描述字符串填成 artifact.sha256。总控原字节核验与审查位于 `knowledge/results/meta-external/reviews/META-HUBTEST-20261022/`，千问原生意见同目录另存，不改原稿。

当前唯一状态见 `knowledge/results/meta-external/status.json`。本单不会被改为已验收；重派仍沿原 ID，修订输出不覆盖历史稿。修订卡 `ops/dispatch/META-HUBTEST-20261022-REPAIR.md` 已提供内联输入，解决外部客户端打不开 raw 来源的问题；这是总控准备的输入，不是 Meta 的生成成果。

Skill 固定入口是 commit `1e18c7064e339c8f2cc5ca12502a58bf38c229b5`。`reasoningHash` 不是 receipt-template 的必填字段；本文件单填 paid=false、tx_hash=null，并对实物另算 artifact.sha256。缓存/复述链接不证明客户端读过相应字节。

“每半小时扫描并自动认领”只收到自述，未见可回读的调度配置、执行器连续运行与认领证明；不记为已部署。只可认领明确 assigned_to=meta / allowed_assignees 含 meta 的任务，不能凭 META/CLAUDE 文件名前缀自动抢单。支持中文记忆核对可沿现有 `META-HUBTEST-20261021`，正式岗位变更与链上签名资格另记，不自行改变。

## 2026-11-20 托管 Llama 通道实测（与外部 Meta 客户端分开）

运行 `Meta connectivity probe`（run `44694293952`，head `18bfd05d`）实测：

| 检查 | 结果 |
| --- | --- |
| `GET /health` | 200，`service=ltzzz-meta-hosted`、`auth_configured=true`、`ai_binding=true`、`model=@cf/meta/llama-3.1-8b-instruct-fp8` |
| `POST /auth-check` | 200，`authorized=true` |
| `POST /task`（`channel_probe`） | 502 `upstream_inference_failed` |
| 直连 `/ai/run/<model>`（同一 CF token） | 401 `Authentication error`，code `10000` |
| `/ai/models/search` | 403 |

结论：**通道与鉴权是通的，模型调用被 Cloudflare 侧拒绝**。不是 Worker 未部署，也不是桌面网络问题（桌面到 `*.workers.dev` 超时另有其事）。

待外部动作：

1. 在 Cloudflare 控制台为账号开通 / 启用 Workers AI；
2. 或给 `CLOUDFLARE_API_TOKEN` 补 Workers AI 权限（当前 token 能读 workers subdomain，但 AI 端点 401/403）。

开通前不把 hosted Llama 记为可用执行席；`deployed_inference_failed` 不等于已验收。
回执：`knowledge/results/meta/connectivity-44694293952.json`（首次探测为 `connectivity-44694076687.json`）。

## 2026-11-26 部署后复测（WorkBuddy 收尾，本席独立跑原生探针）

WorkBuddy 当日交付（DEPLOY-RESULT-20261126.json / RUNBOOK-20261126.md / verify-meta-hosted-200.mjs，均在其席位工作区，未入库）报告三项 CF 侧问题待外部核实。为避免停在“本机无控制台会话”，本席用仓库原生探针 `scripts/meta-connectivity-probe.mjs`（CI 内使用 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets）实跑一次：

- 触发：`gh workflow run meta-connectivity-probe.yml --ref main`，run `45745278511`（2026-11-26T02:52Z）
- 回执：`knowledge/results/meta/connectivity-45745278511.json`（commit `511ca4a71`）

| 检查 | 结果 |
| --- | --- |
| `GET /health` | 200 / 171ms，`ai_binding=true`、`model=@cf/meta/llama-3.1-8b-instruct-fp8` |
| `POST /auth-check` | 200，`authorized=true`，`model_calls=0` |
| `POST /task`（`channel_probe`） | 502 `upstream_inference_failed` |
| 直连 `/ai/run/<model>` | 401 `Authentication error`，code `10000`（与 2026-11-20 一致） |
| `/ai/models/search` | 403，`meta_models=[]`（与 2026-11-20 一致） |

判读：Worker 已部署、鉴权与 AI binding 配置正确，失败发生在 Cloudflare 侧 AI 权限层，**且 401/403 都早于模型解析**——因此本次证据无法区分“账号未启用 Workers AI”“token 缺 Workers AI Read/Run 权限”“模型 ID 下线/改名”三者，仍需一次控制台或带 AI 权限的凭据操作才能定性。不得把 `deployed_inference_failed` 记为已验收或 200 达成。

解锁只需其一：① Cloudflare 控制台为该账户启用 Workers AI；② 给 `CLOUDFLARE_API_TOKEN` 增补 Workers AI:Read + Run（账户级）；③ 若模型已改名，在控制台确认新 ID 后改 `wrangler.meta-hosted.toml` 的 `META_MODEL`。任一生效后本席可直接重跑 `meta-connectivity-probe.yml`，verdict=`ok` 即完成 200 验收并更新 #609。

另：`meta@ltzzz.com` 的开通入口仍缺，需 Owner 提供（域名邮箱管理入口或转发规则），此前不记已开通。
