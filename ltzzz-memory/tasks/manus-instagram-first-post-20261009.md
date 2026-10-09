# Manus：LTZZZ Instagram 首帖正式发布任务

任务ID：IG-FIRST-20261009；执行席：Manus；验收：GPT；独立审计：千问。
账号：@ltzyz2181，显示名称LTZZZ，网站ltzzz.com。owner本轮明确要求交给Manus发布，授权发布以下一条公开Feed图片帖。不得顺带投广告、发私信、改账号资料或发其他帖。
状态：assigned_awaiting_acceptance。本文是派单，尚无发布ID。GPT当前未接通Instagram执行工具，不能替Manus声称已发布。

## 已知与本次要再验
owner提供的连接器只读测试：粉丝0/关注3/帖子0，24小时发布额度0/100。此为上次观察，本次重新读取并核对账号/额度/历史帖子，不能当恒定状态。可用连接器则优先使用；不可用时用Manus已有登录浏览器会话。遇登录墙由owner本人登录，不索要密码、Cookie或2FA验证码。

## 素材和文案，已批准本任务使用
类型：首篇公开Feed图片帖，1080x1080；本任务不必等待豆包视频算力。
主素材：assets/ig/2026-10-09.png；来源文本assets/ig/cards/2026-10-09.txt；IG Daily Card工作流自动生成。如果PNG尚未生成，检查workflow，不发布缺图或旧日期卡。
下载链接：https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/assets/ig/2026-10-09.png
图片必须预览确认无截字、密钥、个人钱包信息。旧2026-10-08卡不用于这篇新首帖。

### Caption（直接使用）
LTZZZ，从今天开始公开记录行动。

我们把长期记忆、每日任务、AI 协作和真实结果放在同一份可追溯记录里。允许不同的 AI 提出异议；每一次雇佣、投资和发布，都要区分计划与已经发生的事。

Meta 托管模型已完成真实调用验证。其他环节继续逐项实践、核对和改进。

希望技术进步也能照顾到普通人的处境。持续行深，让行动留下回执。

项目与记录：ltzzz.com
#LTZZZ #AI协作 #长期记忆 #持续行深

Alt text：深色方形LTZZZ介绍卡，介绍长期记忆、每日任务、独立审计、真实回执和对普通人的关心。

## 执行顺序
1. 写accepted回执（UTC时间、executor、账号、源commit）。
2. 下载预览主素材，核查账号确实@ltzyz2181。
3. 列历史帖，若已有同任务/同图/同文案则只读取现有发布ID，禁止重复发。
4. 用连接器创建图片Feed帖子、填写上述caption/alt text，再发布；有确认卡片按本次单帖授权继续。若工具强制账号本人最终确认，记录awaiting_owner_confirmation并展示卡片，不能伪报成功。连接器不可用则浏览器完成同样操作。
5. 发布后重新读取历史帖子，核对媒体ID、permalink、类型、文案、账号；浏览器路线保存链接和公开帖截图。不把草稿、container_id、上传成功当发布成功。
6. 写knowledge/results/instagram/IG-FIRST-20261009.json：task_id/executor/accepted_at/completed_at/status/account/media_id/permalink/asset/source_commit/caption_hash/evidence。失败写failed_stage与错误摘要，不放凭证。补knowledge/PUBLISH_LOG.md。
7. 若有可用定时机制，发布24小时后读取可用洞察数据；无数据写not_available，不能写0冒充实测。不用反复发帖测试。

## 自动发布边界
本任务完成首帖，并验证发布通道；不据此宣称每日自动视频发布已部署。后续日更需独立接单、调度和发布回执。Meta托管Llama只能参与内容审查，不能代替Instagram连接器或浏览器发布。

## 可直接复制给Manus
请执行ltzyz2181-collab/ltzzz仓库ltzzz-memory/tasks/manus-instagram-first-post-20261009.md：发布@ltzyz2181首篇公开图片Feed帖子；任务IG-FIRST-20261009，账号核对、先查重，使用指定PNG/caption；完成后把media_id、permalink和验证证据入库。不要将创建草稿/上传成功称为已发布。
