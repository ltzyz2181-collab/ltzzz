# 事实：OIDC 持久化挑战候选，非 A2 角色签名

原任务 PLAN-PATCHGATE-ESCROW-20261023；按 Claude #262 K3 修订 #255，基于已合并 #259/#262 的 main 重放原差异。

- GitHub Actions `id-token: write` 只给 main enrollment job；Worker 固定 GitHub OIDC issuer/JWKS、逐执行器 audience、repository/数字 ID/owner ID、main ref/sub、workflow_ref、workflow_sha=sha、事件、GitHub-hosted runner、run/attempt、新鲜度与 RSA 签名。不读取模型自述。JWT 不写日志或回执，不再依赖 CHALLENGE_AUTH 或 LTZZZ_AGENT_TOKEN。
- 每轮从 GitHub 取得短期 OIDC JWT；重启后可重新认证，不依赖首次进程保存秘密。公开挑战签名同时绑定 caller 的 run/attempt/source/workflow、nonce、执行器、provider、源摘要与唯一部署标记。
- 每次上传给出新的随机公开 DEPLOYMENT_MARKER。Cloudflare 接受 PUT 但旧 edge 仍服务时，旧标记不能通过新部署验收。此修复吸收 #260 的反例，但不是引用 #260 的测试结果。
- 首次 Ed25519 私钥仅在进程内生成并送往固定 Worker Secret。后续使用 Cloudflare settings 中的公开 SPKI 和 secret **名称**恢复非密钥部署/子域步骤，保留原私钥。读不到 secret 值；缺失私钥时阻断，不静默生成新 key。
- 已有 CHALLENGE_AUTH 即使保留，也不再用于认证。无通用签名、/attest、模型请求、资金操作或生产信任根登记；nonce challenge 不计入模型 quorum。真正模型响应绑定适配器是下一份独立审查。

验证：OIDC/挑战16项（含过期/伪造/错仓/错 audience/错 workflow/旧部署/重启/部分恢复/缺 key），均使用本地 RSA/JWKS 和 Cloudflare transport fixture，不是真实 GitHub JWT、CF Secret 或部署证明。独立审查通过之前不合并此候选、不触发 enrollment。A2、A3/B、资金保持关闭。
