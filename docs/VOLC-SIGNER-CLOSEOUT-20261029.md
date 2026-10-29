# 火山签名服务收尾：凭据与运行时分开验收

原任务 `PLAN-PATCHGATE-ESCROW-20261023`，步骤 `SPLIT-SIGNER-INFRA-20261026`。本稿为 GPT/Codex 工程修订，不是 Claude/豆包原生审计或生产签名准入。

## 已核对的失败

GitHub Actions `40798605209` / job `123201006002` / attempt 1，源码 `bf52ada784b7e25689ed428dab2e8f28433b576e`，ListFunctions 与 ListUsers 均返回 `InvalidAuthorization`；部署步骤未运行。ListFunctions request ID 为 `2026102909090461F09FCBC56A0017FE5F`。没有生产服务、公钥或重启挑战完成的证据。

owner 本轮明确：身份配置位置是 **LTZZZ GitHub Actions**，两项 Secret **尚未更新**。当前 GPT 云环境无挂载火山身份，本任务不从它取得或复制 Secret。官方 IAM AccessKeyMetaData 文档的 AK 格式为 `AKLT[a-zA-Z0-9-_]+`；原诊断只能证明所填值不符合 IAM AK 格式，不能仅凭字符长度断言它一定是哪一种 Ark Key。没有把前缀、长度或密钥值再写入新日志。

## 本次修复

- IAM 只做内存格式判定；错误输入在网络前失败，不自动裁切 `Key:`、不打印前缀或长度。OpenAPI 固定 VeFaaS/北京/HTTPS，签 Host、禁止重定向、限时与限响应体、HTTP 200 的 provider Error 也失败；仅输出受限的错误码/request ID，不回显云响应正文。
- ListFunctions 成功只证明该只读权限；不再把 ListUsers 权限当部署前提。GetFunction 按实际 `Id` 读回，核对名称；不输出 Envs、密钥或带签名的 SourceLocation。旧 `challenge` CLI 名称仅标明元数据读取，绝不算重启验收。
- 原简写签名入口删除，改为复用现有 `modelWorker`/`NativeModelAttestationService`：固定 GitHub OIDC、仓库/工作流/main/source、真实 GitHub 证据、原生 provider response ID/model/finish_reason/verdict、每日两次、持久预留与未知不重放。只支持 review/stage_review，不能用任意 prompt/role 自报取得签名。
- 新存储适配器只认 `/proc/self/mountinfo` 中真实 NFS/NFS4 的 `/mnt/nas/` 路径。没有 `/tmp` 或 TOS FUSE 回退，不把 mkdir 成功当持久性证据。POSIX 锁、持久写入/原子替换、预算与幂等表重载；坏文件不能静默清零，遗留锁不自动抢占。失锁/未知状态的恢复由已登记云维护执行器对账，不新增 owner 审批门。
- Ed25519 在目标云的适配器内生成；按 PKCS8 实际算法导入，不再错误要求 DER 为64字节；公钥经 createPublicKey 导出 SPKI。钥文件损坏即失败，绝不重新生一把掩盖错误。软件文件隔离不等于 HSM 或管理员不可读取，真实云 IAM 仍待核验。
- 公共 health 不建钥、不调用模型、不给 ready=true。挑战须固定部署工作流 OIDC 和调用方随机32字节 nonce；一次签名不自报重启通过。固定执行器/key ID 与既有注册规范一致，不使用 GitHub 用户名伪造火山账号绑定。
- 固定源代码闭包打包，目标服务重算全部原字节与 bootstrap 哈希；无依赖安装、私钥生成或动态下载。源码包不是部署证明。真实账号/部署证据摘要须来自控制面读回，不能填虚构值。

## 当前可执行入口与未完成项

修订工作流的 PR job 仅跑合成测试和打包，完全不注入 Secret；main 的手动只读 job 才接既有 `VOLC_ACCESS_KEY`/`VOLC_SECRET_KEY`，不读取 Ark Key，不调用付费模型。回执写固定 `results/volc-signer/preflight.json` 并上传 artifact，保留 run/attempt/source。

真实部署仍缺：有效 IAM AK/SK；实际火山账号/区域/函数 ID；已存在或实际配置并验收的共享 NAS；函数部署/发布/触发器与固定 URL 的控制面读回；key 生成与重启 fresh nonce 挑战；同服务内一次真实 Ark 调用及签名；独立云/IAM和发布者权限核验；Claude 与不同提供商对新 head 复审。当前 deploy/update CLI 明确拒绝未完备部署，防止把打包或 GetFunction 说成服务上线；后续在真实资源配置齐全时补官方 Create/Update/Release 适配，不恢复原未核对的调用。运行时适配器已实现并合成联测，不等于这些云端事项已完成。

保持 `NATIVE_ATTESTATION_ENABLED` 默认关闭，不改 A2/A3/B、付款、预算、信任根或正式五签。本轮没有读取生产密钥、创建/吊销 IAM Key、调用模型、注册公钥或执行交易。owner 唯一已知本人步骤是在官方 IAM 登录创建/取得子用户 AK/SK，并在 GitHub 原两项 Secret 内更新；不要发到聊天、文档或公开 GitHub。

## 官方资料

- IAM AK 格式：https://docs.volcengine.com/docs/iam/access-key-meta-data?lang=zh
- Node handler：https://docs.volcengine.com/docs/vefaas/node-js-runtime-development-methods?lang=zh
- GetFunction 的 Id：https://docs.volcengine.com/docs/vefaas/getfunction?lang=en
- ListFunctions：https://docs.volcengine.com/docs/vefaas/ListFunctions?lang=zh
