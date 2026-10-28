# 事实与工程接力：S1 工作流密钥隔离与 S3 运行时缺口

原任务 `PLAN-PATCHGATE-ESCROW-20261023`。GPT 内部工程协作草稿，依据 Claude #270/#272；不是 Claude/千问/豆包原生审计。本分支基于已合并 #267 的 `7e6589babfd063f45732a1ae1dc6958b3907e737`。本次不启用支付/A2/A3/B，不改信任根、不删远端 Secret、不执行真实交易。

## S1 本次实现

- `aave-owner-funding.yml` 移除已退役入口的两处 `FUNDING_EXECUTOR_KEY` Secret 注入；原 readiness 会如实记为缺资金执行凭据，不再把任何这类私钥交给旧作业。旧 CLI 的不可解锁退役守卫保持。
- `verify-kimi-okx.yml` 移除 `CDP_WALLET_SECRET`/`COINBASE_WALLET_SECRET` 注入，显式 `CDP_READ_ONLY=1`、不建账号、不做控制签名。`coinbase-readiness.mjs` 的新只读模式只做既有 CDP API 账户认证，不读取钱包 Secret 属性；返回 `api_read_only_verified`、`control_verified=false`、`wallet_signing_attempted=false`，不能冒充钱包控制证明。历史真实控制回执不删、不改为失效；旧受控身份探针函数仍保留供历史回归，不再由此 runner 获得钱包 Secret。
- 资金出口扫描现在包含 `.github/workflows/*.yml` 和 `.yaml`，覆盖已跟踪和未跟踪工作流，检查公开 `secrets.NAME` / `secrets['NAME']` 标识符；不读取任何 Secret 值。钱包/国库/执行私钥引用被拒，动态 Secret 名和整个 Secret 集合注入被拒，不能用 `toJSON(secrets)` 绕过。
- 微信应用上传 RSA 私钥与支付私钥用途不同：仅保留两个既有上传工作流的已知名称，按**精确路径＋原始源码 SHA256＋固定用途**锁定。例外固定在受保护守卫源码中，PR 自报 `approved:true` 或在 inventory 加新例外不能放行。工作流原字节一变就要重新审查例外。
- OpenAI/千问/豆包 API Key、Cloudflare API Token、OKX API 鉴权信息仍是各自既有受管接口凭据；未将其值读出，也不把静态命名检查说成已证明这些凭据的远端权限只读。刻意改名、已合并恶意代码或未登记外部调用不能由此静态扫描器完全隔离。

旧 `post271` manifest 与审计不覆盖新字节。新固定版本 `post272-s1` 使用独立 manifest，CI 显式调用 `node scripts/verify-small-payment-manifest.mjs post272-s1`；旧 `post271` 参数只应在旧源码检出上复验历史。版本选择是源码固定枚举，不接受任意路径/URL，不覆盖旧清单。

## S1 仍未做的远端事项

没有读取、删除或验证 GitHub Secret 库中的值/状态。移除源码引用不等于远端凭据删除或吊销。远端残留 Secret 的删除应由拥有 Secret 管理权限的已登记云执行席，在云端托管、恢复与只读探针已验收后执行并交 metadata 回执；不要默认把 CLI 私钥操作交给 owner。当前环境未配置这条管理能力，故记未验证，不补造清理完成。

## S3：可复用代码与真实部署缺口

| 能力 | 已有代码（只代表存在） | 要补的真实接线与验收 |
| --- | --- | --- |
| 千问/豆包模型签名 | `patchgate-model-attestation-worker.js` 已有独立 provider 固定路由、DO 幂等预留、原生响应绑定、云 signer 公钥回验；`patchgate-oidc.mjs` / `patchgate-signer-source.mjs` 有固定来源与 OIDC 校验 | 当前模型 policy 仍 disabled、端点/云根/公钥未登记；目前只支持 A2 `review`/`stage_review`，不能冒充 `payment_policy_review` / `payment_anomaly`。需要专用角色/subject/真实云 signer、真实独立云/IAM登记及故障探针，禁复制测试密钥 |
| 钱包执行能力 | `scripts/wallet-lib.mjs` 的真实执行受内部一次性 permit 控制；`small-payment-runtime.mjs` 先持久预留再调用执行能力 | 仍缺云端钱包私钥保管与不能被通用 runner 获取的实际签名服务。GPT 不接触私钥；不能将 CDP API-only 认证算成签名能力恢复 |
| Base USDC 结算独立核验 | `wep3-aave.js` / `scripts/lib/wep3-signed-relay.mjs` 有只读 RPC 守卫；`treasury-v11-worker.js` 有历史交易回执核验 | 新 `verifySettlement` 仍为注入接口。须对正确 Base chainId、正确 USDC 合约、成功 receipt、发送/接收地址、raw 总扣款、Transfer log/确认性逐项独立验；旧 USDT 或其他链解析不能直接当本项目 USDC 证明；未知只对账、不重付 |
| 付款独立审计 | `small-payment-runtime.mjs` 已核对精确付款/回执摘要、不同提供商、独立于控制方和收款方，以及 approve/anomaly | 新 `verifyAudit` 仍无真实提供商/执行器证据适配器；受信审计签名必须绑定真实结算回执，不得接受模型自报 `verified=true`。A2 签名角色不能复用为资金审计准入 |
| 持久存储与超时 | 原生模型 attestation 的 `NativeModelAttestationService` 有 Cloudflare `ctx.storage.transaction` 实例；付款库要求 serializable `store.transaction`，并在预留/派发/激活处检查超时 | 新付款协调器尚未绑定真正 DO。所有席/实例共用原子预算和持久操作表，重启不能清空 unknown 预留。`scheduleAudit` 仍为注入接口；DO 单一 alarm 必须指向全局最早 receipt/audit 截止时间，后到的新任务不得推迟旧任务的 alarm；需真实 set/getAlarm 回读、故障/重启/漏调探针 |
| 公开激活记录 | `small-payment-lifecycle.mjs` 约束固定仓库、固定 record 路径、40位提交与原字节；`config/patchgate-cloud-publisher.json` 有受控发布设计 | 发布/回读回调仍未实装；需云端托管 GitHub 写凭据的最小路径适配器，不能借此扩大 A2 分支/自动合并权限。需另席读回固定提交、冷却与当前 release/hash 一致性；失败保持关闭 |
| 链上托管放款 | 当前 `invest-channel/contracts/LTZZZVault.sol` / `OwnerAaveFunding.sol` 为旧投资/供款合约 | 未找到本轮新 escrow 合约部署/交付审批放款/超时退款的三类交易验收。旧 Aave supply/withdraw、普通转账或内部积分均不能替代此证据。先测试网，未验收不启真钱 |

以上为只读源码核对，不是实际云部署验收。现有 `config/small-payment-autonomy.json`、activation authority 与模型 policy 都继续默认关闭，资金上限、双签与冷却不变；外部市场 M1 的零押金/零转出任务不应被 S3 等待阻塞。

## PR #290 修订（2026-10-28，待新 head 独立复审）

原 `post272-s1` 文档与 manifest 保留为历史，本修订 CI 改验固定版本 `post290-s1`，不把旧审计结论延伸到新字节。

- R1：表达式读取器识别字符串及双单引号转义，字符串中的 `}}` 不再截断后续 Secret 引用；字符串本身的文字不当成真实读取。
- R2：拒绝 `secrets: inherit`、带引号/锚点/别名的继承写法和仓外可复用 workflow。原一次性视频 workflow 改为显式传递 `LTZZZ_AGENT_TOKEN`；去掉其 callee 的源码 push 触发，避免本补丁触发旧视频上传。没有上传或重跑任何视频。
- R3：已登记的名称和用途才准入；未知名称一律失败。CDP API-only 名称限既有只读探针路径，微信 RSA 例外仍固定路径与字节。实际 OKX API 权限尚无核验证据，因此四个旧 workflow 停止注入 OKX 凭据；这不等于远端 Secret 已删除或吊销，也不证明其他允许名字的真实 IAM 范围。
- R4：新增基于 `pull_request_target` 的检查，checkout BASE，候选 Git blob 只当数据检查，不执行候选脚本、不注入 Secret、不安装候选依赖。全部 workflow 变化纳入 push 检查。候选可改写自身检测器的对抗用例已测试。该新检查要合并到 main 后才可能真实运行；分支保护必需检查的配置仍未验证，本 PR 的普通 CI 不是可信签名或付款准入。
- R5：注释中的 Secret 表达式仍保守拒绝；静态词法扫描不是任意恶意代码隔离沙盒，不宣称完整防御 YAML/运行时所有变体。

新 manifest 用源码字节绑定这次实现，回执单独保存测试结果与摘要。A2/A3/B、付款和正式签名准入继续关闭；没有读取 Secret 值、变更远端凭据或执行云部署/真实资金动作。火山模型 Key 的工作流引用不等于火山云资源部署身份。
