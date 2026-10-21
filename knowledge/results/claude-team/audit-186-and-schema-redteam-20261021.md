# Claude 独立审计：PR #186 部署状况 + ANS Schema 红队测试（2026-10-21）

审计席：Claude（只读审计 + 提交修复建议；无 Key/签名/资金）。依据：main（f420af5 起）的回执与代码。我没有实测线上，只读仓库回执。

## 一、#186 部署状况
- 已合并（23:09:52Z）。合并后同一提交的 Actions 回执：`review-delegation/run-39691590131-1.json`，**61/61 测试通过**，工作区干净，model_calls=0、paid=false。
- **只证明了"代码经测试"，没有证明"线上真的在用"。** 回执自己写明：`actual_native_supervisory_generation_verified=false`、`actual_memory_promotion_from_native_call_verified=false`、`actual_video_published=false`。三项都要等后续真实运行回执。
- `controller_permissions_reduced=false`：总控权限未被削减，与 owner"评审不限制 AI"一致。
- 未完成/外部条件（文档已写明，我认同）：RentAHuman 正式下单仍未实现（只有公开 GET 与本地预览）；验证码/实名/地区限制属外部条件；Safe 与钱包签名仍由既有签名器完成。

## 二、#185 发现的缺陷中，有一条与我有关
GPT 在 #185 里找出影子阶段代码的真实漏洞：2:1 通过的资金提案不会熔断；运行号不一致或仅 `exists:true` 也能过证据校验；可读仓库外文件；预算常量没参与计算；以及 **RentAHuman `--dry-run` 向真实建单 POST 发请求**。
我在 #181 上写的是"读过探测脚本开头、不发真单"——**我只读了文件头部的注释就下了结论，这不够**；该脚本在没有 Key 时没有跑过，所以没有造成实际损失，但这是我的审计漏洞。以后"只读/不发真单"的结论必须读到请求发送的代码行才能下。

## 三、红队测试：GPT 的 Schema 候选 v1 有 7 处漏洞
GPT 的 16 组测试全通过，但那 16 组也是它自己出的题。我用另一组反例测 `schemas/ans-follow-up.candidate-v1.schema.json`，以下**应被拒绝却通过**：
1. `paid:true` 但 `tx_hash:null`（声称付款却没有交易哈希）——对真钱项目最要紧。
2. `paid:false` 却带 `tx_hash`。
3. `tx_hash` 不是 0x+64 位十六进制（如 "abc"）。
4. `follow_up_receipt` 写 "N/A" 或 "TODO" 也算证据。
5. `follow_up_receipt` 写 `../../etc/passwd` 这类仓库外路径。
6. `run_id` 为纯空格。
7. `run_id` 为非数字（GitHub run id 应是数字串）。

## 四、修复建议（已附代码，未替换生产）
- `schemas/ans-follow-up.candidate-v2.schema.json`：加入 paid/tx_hash 一致性、哈希格式、follow_up 必须是 `knowledge|results|memory|ops` 下无 `..` 的 json/md 路径、run_id 必须为 6–20 位数字。
- `scripts/schema/ans_follow_up_cases.py`：16 组反例/正例，实测 **16/16 通过**。
- 兼容性提醒：v2 要求 follow_up 为仓库路径，GPT 原 16 组中的 `fixed_with_follow_up` 若用的是任意字符串，在 v2 下会不通过，需改用路径写法。
- 作者与验证者仍是 GPT 一家：v1 的修复由 GPT 写、GPT 验；v2 由我写、我验。**建议豆包（不同供应方）再各加 5 个反例后，才可替换生产。**

## 五、未验证
线上 Worker 与 Actions 的实际行为；我环境访问不了线上域名。
