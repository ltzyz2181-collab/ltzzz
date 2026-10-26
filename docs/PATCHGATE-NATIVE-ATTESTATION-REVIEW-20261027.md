# 事实：原生模型响应签名适配器候选（未部署、未准入）

任务 PLAN-PATCHGATE-ESCROW-20261023。依赖 #255 的 GitHub OIDC 修订，独立承接 Claude #262 N2/#257 K2；不继承 #259 的合并批准，不开启 A2。

## 真实实现的边界

- `patchgate-model-attestation-worker.js` 的 `/attest` 只接受经过 GitHub OIDC 认证的本仓 main `patchgate-model-attest.yml`；按执行器设置不同 audience，一执行器只对应一个提供商。default-off：客户端配置 false、服务端 NATIVE_ATTESTATION_ENABLED 未 true 都不调用模型。
- Worker 自己读取固定 GitHub 仓库的不可变 BASE/HEAD、策略、信任根、完整比较/树与工件；原始文件重算 git blob SHA1。候选只允许已登记账号 ltzyz2181-collab/261544579 的同仓普通 docs/README Markdown，最多10文件。拒绝重定向、符号链接、非祖先 BASE、缺文件/重复路径、过期 main、额外指令字段。候选正文只作数据，不执行。
- 候选请求的 snapshot.diff 用于复算与真实 merger 一致的 subject 摘要；**模型提示只用独立回读的全部 BASE/HEAD 原字节，不采信请求提供的 diff 文案**。未来 merger 必须仍以真实 Git snapshot 的 subject 比对签名；本组件不取代 merger 的差异验证。
- 阶段审核使用同一固定 BASE manifest；抽出 `patchgate-a2-manifest.mjs`，加入新适配器/脚本/测试。审批 bundle 随代码变更失效；自引用审核字段的排除规则与既有 preflight 相同。
- 千问只访问官方 DashScope、豆包只访问官方 Ark；提供商 Secret 与 Ed25519 私钥在 Worker 内。runner 只持短期 OIDC，不持模型 Key/私钥。无工具执行、钱包、资金或通用URL。
- Durable Object 在付费 HTTP 前原子保存 operation 预留与每日预算（每提供商最多2次、max_tokens=4096）。同 subject/工件/角色不因 run 或 attempt 改变而重复调用。成功缓存同一原签名；异常/空正文/截断/格式不符/身份缺失写失败或不确定状态，不重试、不自动清除。付费请求没有 fallback。
- 只在实际原生响应非空、finish_reason=stop、提供商 model/id 存在、JSON verdict/analysis 合格且重新回读 HEAD/BASE 未变时，签 Ed25519。签名包含 subject、实际 model、response ID、输出/工件/输入哈希、请求run/attempt/source、时间与原始 verdict。拒绝意见原样保留；API成本未知写 null，paid=false 仅指无链上/订单结算。

## 尚未完成，不能用配置代替验收

1. 仅实现 `review` 和 `stage_review`。**不会为已有 GPT 补丁伪造千问/豆包作者身份；author/checks 签名生产端尚未接齐。** 本工作流只把公开回执保存为 artifact，不编造完整 admission envelope，也不向 main 写签名或改信任根。
2. 没有实际 Worker/DO 部署、提供商 Secret 绑定、真实 OIDC/原生模型/密钥持久化在线验收。服务的两把真实 key 必须分别登记 executor/provider/roles，不能把 #255 nonce challenge 公钥直接当模型角色准入。
3. execution_authority 仍 null，生产 key 未登记；#246 尚未自动合并；A2、自动释放、A3/B/资金仍关闭。
4. 测试用真实本地 RSA/Ed25519 与替代 GitHub/provider/DO transport；不等于云端实调。无模型调用/资金动作。审核后还需检查 Durable Object 在实际 Workers 的并发和持久性。

请 Claude 单独审：OIDC 的 caller/source/受信作者边界，immutable raw read/subject 对齐，provider 响应真实性与 Secret 限域，DO 幂等/预算/未知结果，角色与阶段授权、bundle失效和下一步真实生产端缺口。不要沿用 #262 对 #259 的旧 APPROVE，也不要把当前19项局部 fixture 结果当实际签名准入。
