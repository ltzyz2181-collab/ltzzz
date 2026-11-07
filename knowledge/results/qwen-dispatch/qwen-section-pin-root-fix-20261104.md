# 千问日课缺段根修：固定【派单监督】段名 + workflow 默认 qwen-max（2026-11-04）

## 背景（一手核验）
- 11-04 日课千问工件第四次同源被拒：data/results/2026-11-04.json → qianwen.status=missing_required_section、missing_sections=["【派单监督】"]、finish_reason=stop、delivery_integrity.accepted=false。历史：10-30/11-02/11-03/11-04 四次。
- 11-04 条目存在 assignment（source=pulse_direct_assignment、task_id=DAILY-2026-11-04-qianwen、claim_verified=true）；roleTask 优先取 assignment.instruction（run-daily-tasks.mjs L140），因此只改 daily-channels.mjs 的 task 字段会被覆盖、不生效——这是此前"改了职责文字仍被拒"的真正机制。

## 根因（代码级）
1. run-daily-tasks.mjs L151 通用短格式模板只列【读后感】【观】【行深】【不确定】【角色产出】，**从不含【派单监督】**；
2. 门禁 delivery-integrity.mjs requiredSectionsForAgent('qianwen')=['【派单监督】'] 按字面段名检查；
3. prompt 与门禁段名不一致 → 模型按模板输出 → 必缺【派单监督】段。
（千问自审"11-03 修复卡没给字面行"属实，但更深的坑是模板层缺失 + assignment 覆盖 task 文本。）

## 改动（commit 1a78cf0e，本地 VS Code 凭据推送，含 workflow 文件）
1. .github/workflows/qwen-dispatch.yml L22：'qwen-plus' → 'qwen-max'（dispatch 兜底默认值）。
2. scripts/run-daily-tasks.mjs：新增 qianwen 专用 prompt 行【硬性输出要求】——角色产出必须包含以【派单监督】为标题的一段（标题独占一行），写明当日 GPT 总控与 Claude 监督结论与漏单判定；缺失视为交付不完整。（此改动拼入 prompt 数组，无论 roleTask 来自 assignment 还是 task 定义均生效——治本落点。）
3. scripts/lib/daily-channels.mjs：qianwen task 末尾追加【派单监督】段要求（task 级双保险；段名与门禁一致，未引入千问建议中的【lessons核对】等非门禁段名）。

## 通道
- 用户 VPN 到期、GitHub 网页登录不了；经本地 VS Code 仓库（C:\Users\李天柱\Desktop\ltzzz-repo）git 凭据推送成功（**凭据带 workflow scope**，千问判断正确）——workflow 文件不再被 403 拦。
- 推送：da6e5a64..1a78cf0e main -> main。

## 验证
- 远端回读：workflow L22='qwen-max'、daily-channels 含【派单监督】、run-daily-tasks 含硬性输出要求行，均确认。
- 本地测试：qwen-native/qwen-dispatch/dispatch-oversight/daily-assignment 41/42（1 失败为本地 Windows 环境 node --import Windows 路径问题，git stash 对比证明与本次改动无关，VM/CI 无此问题）。
- CI（commit 1a78cf0e）：Daily Agent Tasks、LTZZZ Skill review and integration、Small payment policy、Daily Pulse lineage regression 全部 completed success。
- 观察：明日 08:00 后读 data/results/2026-11-05.json 断言 qianwen.missing_sections 为空；连续 11-05~11-07 三日达标才算根治。

## 遗留/待办
- 11-04 model:None、generation_verified:false（日课链 provider_response 回执缺失）——千问自审第 2 条属实，需在日课链补 provider_response 模型回执（独立跟进）。
- 11-04 与 11-03 工件开头同质化嫌疑——待对比两天完整工件确认是否 entry 回灌（独立跟进）。
- finance/ 下 qwen 用量月账无监控行——下次巡检加。
- 完成判定四标准：11-05~07 三日 missing_sections=[]；health generation_verified=true；至少一份工件 accepted=true（待 owner 定评审承接方）；Sentinel 11-10 无新失败。

## 2026-11-06 GPT接续处置（保留上文历史）

上文四标准中的health.generation_verified=true不适用：health只做无生成探活，实际生成由对应原生回执验收。改用原Task/原hash/真实provider_response与finish、非空产物。11-05与11-06四段结构已用当前校验器读原工件确认，11-07仍待观察。三日观察是修复效果标准，不是owner已授千问评审/副协调的任职前提。

当前稿的真实内容审核与原生生成分开，不保证指定审方即接受；Dispatch Sentinel自己的窗口也不与新continuity服务观察混同。准确字段及窗口处置见docs/EVIDENCE-FIELD-DICTIONARY.md。
