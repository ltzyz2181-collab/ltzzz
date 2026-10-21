# Instagram 每日发布派单回执

账号范围：仅 `@ltzyz2181`；每日最多一条 Reel；Manus 仅发布仓库现有 MP4，不制作或剪辑；自动计划状态以 `manus-config schedule status` 实测为准。实际发布结果记录在 `results/publishing/instagram-YYYY-MM-DD.json`。

## 2026-10-15｜已发布

发布 Reel：<https://www.instagram.com/reel/DegfCDxiIEr/>，media_id `18166995589478101`，时间 `2026-10-15T08:04:04Z`，账号 `@ltzyz2181`。结果记录在 `results/publishing/instagram-2026-10-15.json`，截图为 `results/publishing/screenshots/instagram-2026-10-15.webp`。成功发布回执中的视频 SHA-256 为 `ba709dfc8346e8b220bf5e04832660c9c565a209ee329224839a151c67c7e17e`。

## 2026-10-16｜未发布

结果为 `blocked_no_eligible_unique_video`，见 `results/publishing/instagram-2026-10-16.json`。当时的候选 `videos/instagram/2026-10-15/video.mp4`（SHA `1b11309df830bdee27fa38f1a7a266b995f7f7568047ef476ed5546de1dbbb8c`）按 owner 要求排除，等待不同的未使用视频。另一支 10/16 候选 SHA `9582fd67463128ad4db6d88f94fc3652e81efb8da44efd1d44ab3135801adb83` 已公开到 YouTube 且画面文字越界；其他库存不符合时长、配音或公开状态要求。当天没有新 Reel。

## 2026-10-17｜未发布

最新 manifest 指向 10/16 候选 SHA `5d8af7541d5cebf5344bc12a17659ff8eebc3278dca889f41a8d62f32d068e54`。该视频与 10/15 被 owner 要求替换的未发布候选使用相同分镜、镜头与屏幕文字，仅日期标记不同，因此不当作新内容发布。此前回执曾把未发布候选与 10/15 真正已发 Reel 混淆；已依据成功发布记录和匹配哈希的原始视频更正。结果见 `results/publishing/instagram-2026-10-17.json`。

## 2026-10-18｜未发布

10/17 成片 SHA `933b943cf294d9d54b3cc06540b8022311135718d3e1f5958b58289894c9b2bb` 已由 YouTube 公开发布，视频 ID `xO8jmKy_120`。因此没有跨发 Instagram。详情见 `results/publishing/instagram-2026-10-18.json`。

## 2026-10-19｜未发布；owner 覆盖后复验

上午首次检查时，latest 指向 10/18 SHA `ba7a5063616325300f170eeb4734b2e455f201745f1a5a9c2b2ffca7ef051ed8`，已由 YouTube 公开为 `vLF1cBUaQLQ`。下午盘点了远端 10 个和本地 3 个 MP4，并扫描 58 份发布回执。发现最新包已更新为 `videos/instagram/2026-10-19/video.mp4`，SHA `80a3608fcc70225f7c63b23c5ac9f0ec8547e1f3f05500c76569245900fb5153`，YouTube 日更流程已将它公开为 <https://www.youtube.com/watch?v=YzwjWpdlirc>。owner 提供的 <https://youtube.com/shorts/1Mb0_QBy9nc?si=PU9WbyorUGQ6OmLz> 是另一支公开视频，SHA `7d5e1809507e3cf80c581ab3cbf267b77412703ff1a913d63ddabfa782674a65`，仓库没有对应 MP4。

收到 owner “就发布最新这条”后，按该指示覆盖此前“不跨发已公开素材”的排除决定，并下载最新 MP4 做了发布前复验。SHA 与 manifest 一致；视频为 30 秒、720×1280、H.264/AAC，平均音量 −22.8 dB，完整解码通过，抽样画面文字可读且未越界。Instagram 账号核验为 `@ltzyz2181`，帖子列表有 5 条，最新一条为 10/15，没有今日 Reel。

链上事实复核（更正此前错误结论）：视频显示的是余额快照，不是支付承诺。正确 Base 主网 USDC 合约为 `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`；正确金库地址为 `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`。BaseScan 在 2026-10-19 17:21 Tijuana 显示该地址余额 `210.872201 USDC`。此前的 `0 USDC` 是因地址转录多写一位 `7` 且漏掉末尾 `d`，查询错地址，现撤回。10/18 视频清单拍摄时间为 10:26:58 Tijuana；之后的 Aave supply 交易 `0xd2be95b35b37004bfd5cce4168361b9a7ebab9c0b38904e17132936ec6e7a47c` 在 10/19 06:27:53 Tijuana 转出 32.042444 USDC，因此 `210.872201 + 32.042444 = 242.914645`，与 10/18 画面完全吻合。10/17 视频于 10:21:33 Tijuana 拍摄；其后 10/17 22:17:19、22:17:45 Tijuana 的 Aave supply 分别为 32.490856 与 4.496788 USDC，再加后续 32.042444，反推 `279.902289`，也与 10/17 画面一致。10/19 视频于 13:01:45 Tijuana 拍摄，在 06:27:53 的 32.042444 交易之后，余额仍为 `210.872201`。交易证据：[32.042444](https://basescan.org/tx/0xd2be95b35b37004bfd5cce4168361b9a7ebab9c0b38904e17132936ec6e7a47c)、[4.496788](https://basescan.org/tx/0x9b274424ace3329c2dfda53a3f86e7b61a49b09a5e1f47865e4f197c5d9e0db2)、[32.490856](https://basescan.org/tx/0x1bc13415fd0de4841f724700161ed00945e3d1afbdd23175172846e0a4c9cce4)；[正确地址持仓页](https://basescan.org/token/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913?a=0x5df57a78e0a13df2ae983bdad69cfcbd3dd7a32d)。manifest 的 `paid=false`/`tx_hash=null` 只表示没有记录本次内容制作的支付交易；视频明确写着内部积分，不是链上工资或收益。

旧素材已找到并复核：选用 10/18 YouTube 已公开视频 `https://www.youtube.com/watch?v=vLF1cBUaQLQ`，仓库素材 `videos/instagram/2026-10-18/video.mp4`，SHA-256 `ba7a5063616325300f170eeb4734b2e455f201745f1a5a9c2b2ffca7ef051ed8`，与远端 MP4 实际下载哈希一致；`source_commit=0477ea2b68d4ba42019c3b817e5dd48e1184c88e`。检查为 30 秒、720×1280、H.264/AAC、完整解码通过、平均音量 −22.8 dB；抽查四段英文画面，并转写确认有英语旁白，含“internal credits … not an on-chain wage payment”。这支视频在 10/15 已发 Reel 的五帖核对中未出现，SHA 不同；属于相同系列模板的独立日更余额快照，依 owner 指令允许跨平台复用。


17:26 PDT 再次搜索 78 个 MCP 工具：Instagram 只有 `instagram/create_instagram` 写入能力，该工具会生成需用户确认的发布卡；无无需点击确认的直发工具。为遵守 owner 的免点击偏好，没有创建确认卡、没有上传/创建媒体容器、没有发布 Reel。链上与素材校验均通过，但实际发布仍被工具限制；无 permalink、media_id 或发布截图。

## 2026-10-19 17:29 PDT｜更正与最终状态

更正前文错误的零余额判断：因地址抄录错误，先前查询并非项目金库。正确地址当前余额与 10/17、10/18、10/19 视频内快照分别由 BaseScan 转账时间线精确吻合，详情见 `results/publishing/instagram-2026-10-19.json`。10/18 素材已选定，SHA/媒体规格/完整解码/英语旁白均通过；但 Instagram 实际发布未完成，且没有发布回执。

回执（任务ID|文件路径|验证方法|未完成项）：

- `ro8cDRW4zoF56gRKpYx6bX|results/publishing/instagram-2026-10-19.json|jq 校验、SHA256、ffprobe/ffmpeg、语音转写、BaseScan 当前余额与三笔交易时间线|Instagram 未发布；缺 permalink、media_id、发布后截图。`
- `ro8cDRW4zoF56gRKpYx6bX|ops/dispatch/接单回执-MANUS-INSTAGRAM-DAILY.md|逐项核对 Instagram MCP 工具能力、GitHub 视频清单、SHA256、媒体与链上证据|Instagram 直发工具仍需确认卡；遵循免点击偏好未创建卡。`


## 2026-10-20 10:05 PDT｜例行扫描初始结果：无合格唯一素材

执行时间：计划执行记录 `2026-10-20T17:05:23.249Z`（Tijuana 10:05）。账号复查时间：`2026-10-20T10:18:44-07:00`。Instagram 帖子数仍为 5，最新 Reel 是 <https://www.instagram.com/reel/DegfCDxiIEr/>（10/15），今日无 Reel；滚动 24 小时发布额度为 `0/100`。

检查 `videos/instagram/latest.json` 后发现它仍指向 10/19，而非 10/20 成片。匹配视频 `videos/instagram/2026-10-19/video.mp4`、目录 `manifest.json` 与英文 `caption.txt` 已下载核验：视频 SHA-256 `80a3608fcc70225f7c63b23c5ac9f0ec8547e1f3f05500c76569245900fb5153` 与 latest 和 manifest 一致；caption 与 latest-caption 字节一致。视频为 30 秒、720×1280（9:16）、H.264/AAC、24fps，AAC 平均音量 −22.8 dB；完整解码通过。抽查 3、10、18、26 秒画面，字幕可读、未被视频边缘裁切；固定页脚接近 Reels 底部覆盖区，安全区未作平台叠层级别的完全认证。

该素材已按 SHA 在 YouTube 公开发布，不能跨平台重用：`results/publishing/youtube-daily-2026-10-19.json` 记录视频 ID `YzwjWpdlirc`，URL <https://www.youtube.com/watch?v=YzwjWpdlirc>，状态 published/verified public。扫描远端 `results/publishing/` 下 68 份 JSON 回执及全部 10 个 MP4，未发现既满足 20–45 秒、格式/音轨/文案要求，又未公开或排队、且不违反 owner 不复用指示的回退候选。

候选排除摘要：10/18（SHA `ba7a5063…`）及 10/17（`933b943c…`）已分别公开到 YouTube（`vLF1cBUaQLQ`、`xO8jmKy_120`），且属于 owner 刚明确拒绝的日期/余额文字卡片类型；10/16（`5d8af754…`）虽回执显示未发布、未上传，却是 owner 先前排除的 10/15 同故事板/画面/屏幕文字日期变体；10/15 仓库候选（`1b11309d…`）已被 owner 设置为不再使用。10/14 品牌片 60 秒超时长；10/12 金库片与 10/05 审计片均约 15.07 秒不足 20 秒；另一个 10/15 日更片（`ff7a539e…`）已公开到 YouTube `B_F6YC0GeBA` 且不足 20 秒。详细 SHA、来源 commit、媒体检查及回执路径见 JSON。

初始 10:05 扫描结果：`blocked_no_eligible_unique_video`。当时未上传、未调用发布工具、未重试、未换账号；当时无 permalink、media_id、发布时间或发布后截图。此为例行扫描阶段状态，已由下节 19:03 owner 指定素材发布记录更新；每日 10:00 计划保持不变。

回执（任务ID|文件路径|验证方法|未完成项）：

- `ro8cDRW4zoF56gRKpYx6bX|results/publishing/instagram-2026-10-20.json|jq 校验、GitHub main MP4 SHA256、ffprobe/ffmpeg 全片解码、音量检测、抽帧、caption/manifest 对照、68 份发布JSON和10个MP4跨平台去重、Instagram 账号/限额复查|仅记录 10:05 初始扫描为 blocked；最终发布结果见本文件下一节。`


## 2026-10-20 19:03 PDT｜owner 指定的 10/05 豆包视频已发布

10:05 的每日扫描最初因没有合格唯一素材而记为 `blocked_no_eligible_unique_video`。之后 owner 明确选择仓库中标注豆包制作的 `videos/2026-10-05-audit-transparency.mp4`，并明确豁免 20–45 秒及 H.264 两项要求。owner 先前要求将 YouTube 视频改发 Instagram，现由 owner 指定该支素材作为本次 Instagram 一次性跨发；其 SHA 已在 YouTube 于 10/10 公开，视频 ID `nTZ44tD_Izw`，<https://www.youtube.com/watch?v=nTZ44tD_Izw>。此例外仅用于本次，不改变每日 10:00 计划或扩展到其他平台。

发布素材 SHA-256：`b8b21435953b05c0dbb418b60488738454b908d7359f312d5809060ac98cd2c0`；源码提交：`dc17966c90c1398b9f545e2451f1f7147d19a354`。复核结果：15.071995 秒，720×1280（9:16），HEVC 视频与 AAC 音轨，完整解码通过，音轨平均音量 −15.9 dB、峰值 −1.2 dB。英语旁白转写通过；抽帧可见 “AI AUDIT”“Right token matters”“Evidence first. No receipt, no success.” 等英文画面字样。画面不是逐字完整旁白字幕；这项没有被 owner 豁免，作为本次已发布素材的限制如实记录。未制作或剪辑视频。

事实核验：同日脚本 `knowledge/video-scripts/2026-10-05-audit-transparency.md` 与 `knowledge/results/EXP-005-invest-vault-testnet.md` 说明所述水龙头事件发生于 Base Sepolia 测试网，到账 2 枚测试 USDC，合约 `0x036CbD53842c5426634e7929541eC2318f3dCF7e` 与 Aave Sepolia 储备 `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` 不同，T6 因币种合约不匹配而阻塞。发布文案明确标注 Base Sepolia 测试网演练，不把它表述为主网投资、AI 管理主网资金或收益证明。

Instagram 写入工具返回发布成功。账号回读 `@ltzyz2181` 帖子数由 5 增至 6，最新帖子与本次媒体 ID、caption、链接及时间匹配。发布时间为 2026-10-20 19:03:11 America/Tijuana（`2026-10-21T02:03:11Z`），媒体 ID `17998465452042546`，Reel permalink：<https://www.instagram.com/reel/Deu5GykCZDF/>。公开页面截图：`results/publishing/screenshots/instagram-2026-10-20.webp`。今日不再上传或重试。

回执（任务ID|文件路径|验证方法|未完成项）：

- `ro8cDRW4zoF56gRKpYx6bX|results/publishing/instagram-2026-10-20.json|jq、SHA256、ffprobe/ffmpeg 全片解码与音量、英文旁白转写及抽帧、Base Sepolia 来源记录、Instagram get_post_list/account_info、公开 permalink 和截图|发布已完成；素材只有英文旁白与短英文画面文字，没有逐字完整旁白字幕，已记录且不重发。`
- `ro8cDRW4zoF56gRKpYx6bX|ops/dispatch/接单回执-MANUS-INSTAGRAM-DAILY.md|核对上述 JSON、Instagram 帖子回读和公开页面截图|本次发布已完成；无其他待发布平台。`
