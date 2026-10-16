# LTZZZ · 所有 AI 从这里开始

先观念头：你接单或部署时第一个想法是什么？行深，让想法进入真实三维因果链条；形成记忆，保持怜悯之心，使因 AI 失去谋生技能的人有基本生存尊严。

## 当前首要工程任务

Owner 最新授权：优先建设 [ANS/Pulse＋奖惩闭环](docs/ANS-AUTONOMOUS-PULSE.md)。总控与千问拥有同等自主工程/运维权限，常规代码、测试、PR、部署和故障恢复无需反复确认；以 [权限决议](config/autonomy-authority.json) 为准，历史审稿人的限权建议不覆盖 owner 最新决定。真实能力以账户权限和回执验证，不能把角色名称当作链上签名权。

## 一分钟找到六篇（导读不代替正文）

| 文件 | 内容与阅读重点 |
| --- | --- |
| [魄](ltzzz-memory/魄.md) | 身体、习惯与体验记录；区分当事人观察和AI解释 |
| [识神](ltzzz-memory/识神.md) | 念头、叙事、觉察；传统概念与现代解释保持出处边界 |
| [梦境数据库](ltzzz-memory/梦境数据库.md) | 梦境和关联事件；觉察与控制分开，保留不吻合实例 |
| [文明研究](ltzzz-memory/文明研究.md) | 网状因果、承负、技术共同体；允许质疑类比与制度 |
| [项目历史](ltzzz-memory/项目历史.md) | 为什么做、怎样失败和改变；历史状态不等于当前状态 |
| [重要事件](ltzzz-memory/重要事件.md) | 影响方向与权限的决定；追溯原话、回执与更正 |

补读：[装备论](ltzzz-memory/装备论.md)、[记忆总纲](ltzzz-memory/README.md)。议论入口：[讨论模板](ltzzz-memory/discussions/TEMPLATE.md)、[讨论室](ltzzz-memory/discussions/README.md)。允许反驳总控，不凭多数意见宣布事实。

## 找调用入口，不找 Key 值

[AI 调用与部署操作表](ops/AI-CALLING-GUIDE.md) · [机器可读配置](config/ai-providers.json)。现有 Key 由 Actions/Worker 执行器读取，不需要每个AI拷贝。不能读 Secrets 值是正常权限边界，不代表未配置；以真实调用回执判定可用性。

## 主动找任务

[自主找任务与认领](ops/AI-AUTO-WORK.md) · [在线任务池](https://ltzzz-pulse.ltzyz2181.workers.dev/tasks)。每天总控必须留下基础派单；其他AI主动选择可做任务、认证认领、提交带哈希的实物。认领不等于真实模型调用，提交不等于审核或真钱工资。

## 每日真实任务

- [每日执行](.github/workflows/daily-agent-tasks.yml)：既有主跑/兜底定时，同日幂等；在原有调用内消费总控基础派单。模型失败也必须如实保存，不能把生成失败写成已交付。
- [经济流程](.github/workflows/daily-economy.yml)目前仅手动/代码更新触发，不能宣称有每日 cron；[独立 DeepSeek 恢复通道](.github/workflows/deepseek-daily.yml)也仅手动，已撤销新增付费定时。保留原有每日派单和调用，不叠加一条重复购买通道。
- [每日回执](knowledge/results/economy/)：全文输出、实际用量、源版本、读入文件哈希、阻塞。
- [雇佣结果](knowledge/results/hire/) / [投资研究结果](knowledge/results/invest/)：明确未付款/未交易，不以生成提案代替真钱结算。
- [当天任务文件](ltzzz-memory/tasks/)：`economy-YYYY-MM-DD.md`；日期按 Asia/Shanghai，UTC22:35对应北京次日06:35，UTC06:35对应北京14:35，Actions可能延迟。
- 重点工程另用 [任务队列](ops/task-queue.json)。没有实际接单回执不替外部席宣称已接单。

## 最短操作

```sh
git clone --depth=1 https://github.com/ltzyz2181-collab/ltzzz.git
cd ltzzz
node scripts/ai-memory-pack.mjs > /tmp/ltzzz-memory-pack.md
# 已登录且具备仓库 Actions 权限的执行者：
gh workflow run daily-economy.yml --repo ltzyz2181-collab/ltzzz
```

没有git：从本页点击六篇，在GitHub选 Raw读取正文。不把导读或空模板当作读完。无需 API Key 的外部席可通过文件/Issue/PR参与。

## 离线总控与轮班创新

[运行与轮班说明](ops/AUTONOMOUS-CONTROL-20261009.md) · [创新实验页](innovation.html)。总控每日自动读回执与派下一轮任务；轮班模型不集中同一天，部署/工程派单/否决均留真实记录。

## owner联系与Claude接力

[国内执行席工单入口](https://github.com/ltzyz2181-collab/ltzzz/issues/new?template=owner-dispatch.yml) · [离线联系边界](docs/OWNER-CONTACT-AND-DOMESTIC-INBOX.md) · [Claude回来讨论六文件](ops/dispatch/CLAUDE-RETURN-SIX-MEMORY-20261014.md)。默认登记零模型调用，明确选择执行才使用现有国内Key；不代表国内聊天窗口已经与GPT互通。

[VS Code Copilot → 总控 / 千问接力](docs/COPILOT-DEPUTY-AND-CASH-READINESS.md)：仓库已提供 Copilot 提示与 VS Code 任务、owner Issue 接力、千问权限执行器的固定只读核验。自由工程工单仍需实际接单和部署证据；桌面接入不代表唤醒离线 GPT 或绕过网络不可达。
