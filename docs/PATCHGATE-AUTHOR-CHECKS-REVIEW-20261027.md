# 事实：作者与确定性检查签名生产端候选（仅库，默认关闭）

原任务：PLAN-PATCHGATE-ESCROW-20261023；承接 Claude #264、#265。实现者是 OpenAI/Codex 工程协作者，不冒称豆包、千问或 Claude。本文不赋予云平台或资金权限。

## 入口与授权边界

`createAuthorChecksProducer` 只接收受审部署内注入的云签名 capability：`descriptor()` 与 `sign({key_id, canonical_bytes, operation_id})`，没有 privateKey 或 export 接口。描述符包含 `source_sha256 / cloud_account_binding / deployment_evidence_sha256`，须和 BASE executor 登记完全一致，并且 `source_deployment_verified=true`、`allowed_signer_source_sha256` 含该源码哈希；生产配置还须固定 `expected_signer_source_sha256`。默认配置不启用，未登记真实 key、来源与部署证据时不调用 signer。

这只是来源绑定与准入规则，**源码哈希或 signer 自报描述符本身不是远程运行完整性证明**。云账号 IAM、实际部署源码读回、KMS 非导出与独立操作权限仍须由相应云端真实验收；本库不能把同一管理员管理的两朵云宣称为两个独立运营者。

## Author

- 保留现有 A2 两家必需复核提供商 `aliyun_dashscope` 与 `volcengine_ark`，不得把作者同提供商的意见算成独立复核。因此作者必须是**已单独登记的第三原生提供商**：DeepSeek / xAI / OpenAI / Anthropic / Moonshot；强制不在 `A2_MODEL_SIGNERS` 中。后续优先已有资金的 DeepSeek，但本补丁没有配置或调用任何真实 API。千问与豆包作者会在读 ledger、签名前被拒绝，未弱化双复核门槛。

- 公共调用只提供 `generation_id`，不接受用户提交一份自称原生的模型 response。
- 受管 `generationStore.get` 必须从该签名服务自己持久化的原生生成 ledger 取回真实 provider/model/request ID/finish_reason=stop、时间、输出哈希；provider/executor 与登记一致。
- 生成输出须是完整文档 `files[{path,content}]`，与同服务 publisher 后续发布的这份候选 HEAD 一一绑定。生成必须早于发布；发布记录绑定 generation、BASE、HEAD 与工件摘要。
- 独立 HEAD 读取器回读每个文档原字节，逐字节和原生输出比较；只允许普通 L0 docs/README，不修改约束检查。缺 ledger、旧 GPT 内容、模型自报、文档不一致、错 HEAD 或伪造时间均拒签。
- 输出 `author` attestation 使用现有 subjectFor；包含实际原生元数据、输出与工件哈希、来源哈希及部署证据哈希，并立即用 BASE 公钥与既有 authenticate 验签。

**真实原生生成与 publisher 的云部署尚未接上本库**，因此这里不是“可以替已有 GPT 补丁补作者票”的后门。当前仓库的旧 GPT 补丁没有该受管生成/发布记录，不能据此倒签为千问或豆包原创。

## Checks

- 只允许 `github_actions` 基础设施 executor，不能把模型席位改名成确定性检查者。
- 模块内部直接调用既有 `collectTrustedChecks`，从只读 HTTP 核对真实 check App、workflow、run、job、attempt、PR HEAD/BASE、实际 BASE marker、检查定义原字节、完成状态与新鲜度。不存在接收调用方 `passed:true` collection 的公共入口。
- 签 `checks` payload，绑定 subject、checker_base_sha 与实际 check_runs 摘要。既有 merger 仍重新收集并比对；此模块不会替换 BASE 检查策略。

## 验证与剩余项

针对性测试使用本地一次性 Ed25519 **测试夹具**与替代 GitHub HTTP transport；未读取凭证、未生成或操作生产私钥、未触发部署/模型调用/资金。本库无自动重试、自动合并、信任根写入或生产注册副作用。

第三提供商作者服务尚未部署，亦无真实原生生成/发布验收；它不能由库或测试夹具替代。

待独立审：受管 ledger/publisher 是否实际由同服务产生、云签名 capability 与源代码/部署证据的真实绑定、检查签名独立执行器、云端 IAM 以及线上真实签名验收。A2/A3/B、资金保持关闭；代码与 fixture 通过不代表这些验收完成。
