# VeFaaS 签名服务 · /health 入口回执（2026-10-29）

状态：**入口已通**（未断言"签名服务全部就绪"——持久存储/源码核验/重启验签未完成）

## 访问地址（实测精确值）

```
https://sfvi0b8oule5k2u0shhcs.apigateway-cn-beijing.voiceapi.com
```

来源：Chrome 浏览器地址栏（触发器详情页"访问地址"跳转后的实际 URL）。
注意：域名后缀为 `voiceapi.com`（非 volces.com）；控制台 OCR 中 l/i 混淆以本地址栏实测为准。

## GET /health 测试

- 方法：GET
- 路径：/health（前缀匹配，仅 GET）
- 状态码：**200 OK**（Chrome 实测；浏览器正常渲染 JSON 响应）
- 响应正文：

```json
{"ok":true,"service":"ltzzz-signer-volc-attest","boot_at":"2026-10-29T07:34:55.945Z","key_store":"/tmp","key_persisted":true}
```

- 本机 PowerShell（Invoke-WebRequest / .NET HttpClient / curl.exe）对该域名 TLS 握手被出口拦截（`SSL connection could not be established`），无法 CLI 复测；以 Chrome 浏览器实测为准（浏览器通道正常）。

## 资源 ID（华北2 · 北京）

| 资源 | 名称 | ID |
|---|---|---|
| 函数（veFaaS） | ltzzz-signer-volc-attest | jt247vfx |
| Serverless 网关 | ltzzz-gw | gdbhecqcjrh7nk4i51ag0 |
| 网关服务 | ltzzz-signer | sg7prtoeqj46pbi3v6j6 |
| 触发器（API 网关） | ltzzz-signer-volc-attest-t…（完整名待回读） | 创建时间 2026-10-29 00:32:38 |

触发器配置：Path=/health（前缀匹配）、请求方法 GET、权重 100%、超时未启用、跨域未启用、网关实例 ltzzz-gw。

## 计费规格（控制台实测）

- Serverless 网关：配置费 **¥0.009/时** + 流量 **¥0.8/GB**，公网带宽上限 200 Mbps，规格固定 1c2g×2 节点，仅支持 FaaS 后端。
- 函数（veFaaS）：按量计费，不执行不收费（0.5 vCPU / 1 GiB，超时 30s）。
- 账户可用余额：¥115.63；2026-10 账单 ¥4.37（函费用）。

## 路由/关联说明

- 触发器创建成功时，API 网关侧自动生成 Upstream 与指向该 Upstream 的路由（控制台提示第 3 条）。
- 触发器列表曾短暂显示"运行异常 / 网关实例待创建"，详情页显示"运行 / 网关实例 ltzzz-gw"——异步状态滞后，以详情页与浏览器实测为准。
- API 网关侧手动"创建路由"表单（Path=/、多方法）未提交即取消，未产生路由；本次生效路由为触发器创建（/health、GET、100%）。

## 已审源码部署核验（2026-10-29 追加）

**结论：核验不通过——线上部署源码与仓库已审源码不一致。**

证据链：
1. 线上 /health 实测响应 `{"ok":true,...,"boot_at":"...","key_store":"/tmp","key_persisted":true}`——含 `boot_at`/`key_persisted` 字段。
2. 仓库 `cloud/signer-volc-attest/runtime.mjs`（HEAD 3091a145 / 远程 origin/main 0107f7d3）的 /health 返回 `{service,ready:false,signing_enabled,model_calls:0,status:...}`——无 boot_at/key_persisted。
3. 仓库 `storage.cjs` 明确拒绝 /tmp（`TOS FUSE and /tmp are deliberately unsupported`，要求 /mnt/nas/ NFS 挂载）；线上 key_store=/tmp 且持久化成功——策略相反。
4. `git log --all -S "key_persisted"` 与 `-S "boot_at"` 全历史无命中——线上代码不在仓库任何提交。
5. 本地构建 `node scripts/build-volc-signer-release.mjs`（HEAD 3091a145）得 source_sha256=fa671aec…b6e（28 files）；函数环境变量 SIGNER_SOURCE_SHA256=b2f9bc6c…（截断）——不一致。
6. 部署通道：仓库 deploy-signer-volc.yml 为只读探针（list/get/detail），signer-volc-deploy.mjs 仅只读白名单；无部署 workflow/脚本——线上函数为控制台手动上传（10-28 19:48 更新）。

**阻塞**：重新部署仓库已审版本需要 VeFaaS 上传通道（VOLC_* 管理面凭据或控制台手动上传）；桌面执行端当前无部署凭据（secrets 未配置于本机）。

**处置建议**：以仓库已审版本（cloud/signer-volc-attest + bootstrap 打包产物）重新部署后，再执行重启验签与 trust registry 登记；在重新部署前，勿将"签名服务全部就绪"写入任何登记。

## 持久存储（NAS）配置进展与阻塞（2026-10-29 晚追加）

**已创建资源（华北2 · 北京，均为本任务依赖）：**

| 资源 | 名称 | ID / 关键值 |
|---|---|---|
| NAS 文件系统（极速型） | ltzzz-signer-nas | enas-cnbjd0cc4e306ea6c4（可用区 D，100GiB，按量计费 ¥0.25/时，运行中，创建 2026-10-29 01:29:54，订单 Order2778000110532557442） |
| VPC | ltzzz-signer-vpc | vpc-3hikcevgbokxs3nkipjhteneq（192.168.0.0/16，创建 2026-10-29 01:38:39） |
| 子网 | ltzzz-signer-subnet | 可用区 D，192.168.0.0/24（可用 IP 253） |
| NAS 挂载点 | ltzzz-signer-mnt | mount-c2ded…（运行中，域名 cnbjd0cc4e306ea6c4.vpc-3hikcevgbokxs3nkipjhteneq.nas.ivolces.com，IP 192.168.0.207） |

**函数网络配置已保存（待发布生效）：** 私有网络启用（ltzzz-signer-vpc / 子网 ltzzz-signer-subnet / 安全组 Default），默认网卡访问公网启用；页面提示"函数配置有更新，更新部分需发布才能生效"，函数更新时间 2026-10-29 02:00:24。

**存储（NAS 挂载）保存被拒：**
- 控制台「编辑存储配置」自动填充：文件系统 ltzzz-signer-nas、挂载点 ltzzz-signer-mnt、远端目录 `/`、本地目录 `/mnt/nas`（与仓库已审 storage.cjs 的 /mnt/nas/ 断言一致）。
- 点保存报错：**`account is not allowed to enable NAS storage`**（logid 20261029170436785A9E1E9C4B6C49D6EE，service: vefaas）。
- 判定：**账号级白名单限制**（非配置错误、非角色缺失）；已确认 ServiceRoleForVeFaaS 服务角色授权完成（用户确认，无需重复授权）；NAS 实例/VPC/挂载点配置正确（同地域、VPC 一致、极速型受支持——函数服务发布记录 2025-11-13 支持 NAS 极速型）。
- **阻塞：需提火山工单/客服开通"函数服务 NAS 挂载"功能**（自助无法开通）。开通前无法保存存储配置，已审版 storage.cjs 启动断言（/proc/self/mountinfo 存在 nfs 挂载于 /mnt/nas/ 下）无法满足，故暂不部署已审版代码（部署即启动失败）。
- **开通申请已提交（2026-10-29 02:23 UTC-7）**：火山工单 **T-2026102917230001**，状态「处理中」，已分派工程师（预计 5-120 分钟同步进展）；归属产品「函数服务-事件函数」，问题类型「问题排查」，问题描述：vefaas 挂载 NAS 报错 account is not allowed to enable NAS storage，申请开通 NAS 挂载功能。火山助手诊断确认：账号侧未开通 veFaaS NAS 挂载能力（前提条件均已满足：veFaaS 已开通、NAS 文件系统/挂载点/VPC 已创建且 VPC 一致）。

**费用提示：** NAS 按量计费 ¥0.25/时（约 ¥6/天）随开随停。当前 0MiB/100GiB 无数据。若开通等待超 1-2 天，建议先删除 NAS 止损、开通后再重建（删除动作需 owner 确认）。

**开通后的剩余步骤：** ① 存储保存（NAS 挂载 /mnt/nas）→ ② 控制台上传已审版 ZIP（volc-signer-deploy-bundle.zip，28 文件哈希已核验，source_commit=3091a145 祖先，与 PR #294 后代码一致）→ ③ 发布新版本 → ④ /health 回读（应变为已审版响应，无 boot_at/key_persisted）→ ⑤ 重启验签（/challenge 公钥稳定 + 全新 nonce 真实签名）→ ⑥ /attest 接通 → ⑦ 保存发布版本/公钥/源码哈希/存储与重启验签回执，交 GPT 核验后登记 trust registry。

## 后续待办（未完成，勿记"全部就绪"）

1. 持久存储：线上当前 key_store=/tmp（非仓库已审 NFS 策略）；重新部署仓库版后需挂载共享存储（/mnt/nas/）并按 SIGNER_STORE_DIR 配置。
2. 已审源码部署核验：**不通过**（见上），需重新部署仓库已审版本。
3. 重启验签：重新部署后发布新版本触发实例重启 → /challenge 确认公钥不变（/challenge 需在持久化与核验通过后接通）。
4. /challenge、/attest 接通后交 GPT 按验收流程接续（挑战/验签/信任登记）。

支付、A2/A3/B 开关保持关闭（未改动）。
