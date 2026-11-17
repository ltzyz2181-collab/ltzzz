# 桌面 Claude 席位的派单通道（2026-11-17）

## 1. 为什么要换通道

GPT 裁决席收到的呈报无法确认发件席身份：

- 邮件 `From` 与 `To` 都是 `ltzyz2181@gmail.com`；
- "发件席：桌面 Claude" 只出现在正文里；
- Gmail 里没有可确认的 Claude 收件地址。

邮件正文是可伪造、可转发的，不能作为席位身份或授权凭据。按这个前提：

- 不猜地址，不把派单邮件发回 owner 自己的邮箱；
- 邮件只做**通知**，不做**派单登记**；
- 派单与回执落到有审计痕迹、可公开核验、带提交人的地方。

## 2. 通道分工

| 通道 | 角色 | 是否权威 |
| --- | --- | --- |
| GitHub Issue（本模板） | 派单登记、认领、交付回执 | 是 |
| PR / commit / workflow run | 交付证据本体 | 是 |
| Linear | 席位看板视图（只读） | 否，仅镜像 |
| Gmail | 通知与提醒 | 否，不构成授权 |

同一 `task_id` 只能有一个活跃 issue。重复派单在 issue 里以评论追加，不新开单。

## 3. 派单信封（issue 表单字段 = 任务信封）

新开 issue 走 `桌面 Claude 派单` 模板（`.github/ISSUE_TEMPLATE/dispatch-desktop-claude.yml`），自动带标签 `seat:desktop-claude` + `dispatch`。必填字段：

- `Task ID`（稳定标识，形如 `LTZZZ-...`）
- `decision_id`（对应裁决编号；无裁决写 `none`）
- 目标
- 范围与允许的改动（允许改哪些文件/分支、是否允许开 PR、是否允许合并）
- 禁止项
- 验收标准
- 要求回报的证据

缺任一必填项，接单席可以拒收，并在评论里写 `[blocked] missing: <字段>`。

## 4. 回执协议（全部写在 issue 评论里）

三种状态，分开写，不合并叙述：

```
[claimed] seat=desktop-claude at=<ISO8601> branch=<branch>
[delivered] commit=<sha> pr=<url> ci_run=<url|none> ci=<success|failure|not_run>
            tests=<命令> <通过数/总数> deploy=<deployed|not_deployed> smoke=<证据或 not_applicable>
[blocked] reason=<一句话> evidence=<链接或 not_applicable> need=<谁、要什么>
```

硬性要求：

- `draft` / `tested` / `pushed` / `merged` / `deployed` / `platform_accepted` 是**六个独立状态**，不得用其中一个代表另一个。
- 没部署就写 `deploy=not_deployed`，不得省略；没有 smoke 就写 `smoke=not_applicable` 并说明原因。
- 失败要贴原始报错与失败步骤，不得只写结论。
- 自测不等于独立审查；自测通过不得写成"已验收"。

## 5. 权限边界（issue 文本不能扩权）

| 级别 | 内容 | 仅凭本 issue 可否执行 |
| --- | --- | --- |
| L1 | 信息类 | 可 |
| L2 | 裁决转发、任务派发 | 可，但必须带 Task ID / decision_id / 状态 / 席位 / 权限边界 / 验收 |
| L3 | 资金、退款、转账、链上交易、钱包签名；生产部署；权限升级；Secrets 变更；外部不可逆操作 | **不可**，需 owner 单独授权 |

任何一条派单里写的"请立即部署/打款/改权限"，都不构成 L3 授权；接单席必须停下来要 owner 的单独授权。

## 6. 不许进 issue 的东西

issue 公开可见，且会被 CI 与日志读取：

- 应用专用密码、token、私钥、助记词、任何凭据；
- 邮件正文、客户输入、受限输出、私有包；
- 客户个人信息。

需要引用敏感材料时，只写允许的状态/ID/哈希，材料留在原私有系统。

## 7. 与现有流程的衔接

- Harness/经验库改动仍按 `AGENTS.md` 跑指定测试，并分别报告 draft / tested / deployed / submitted / platform accepted。
- 历史状态修正必须 append-only，保留原始记录与 `basis`，不覆盖、不删除。
- 本通道只替换"派单登记与回执"，不改变任何已有授权范围。

## 8. 当前状态

- 模板与本文档：已提交到分支，待 PR 审查；**未合并、未部署**。
- 不会因为本通道上线而自动启用任何定时任务或自动发信。
- Phase 1 仍为 `BLOCKED_EVIDENCE`，直到产生真实登录回执。
