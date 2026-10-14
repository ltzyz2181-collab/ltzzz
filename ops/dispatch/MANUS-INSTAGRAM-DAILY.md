# Manus 每日Instagram发布任务
此任务替代旧每周单平台任务及MANUS-IG-CLOSEOUT-20261013，owner已授权每天发布，无需再要求逐条确认。仅账号@ltzyz2181。
每天制作和检验由GPT自动流程完成，豆包后续提供创意；你只下载现成视频并发布一个Reel，不制作视频，不处理公众号、抖音、视频号。
入口：videos/instagram/latest.json；成片https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/videos/instagram/latest.mp4；文案同目录latest-caption.txt。
1. 查latest.json日期（America/Tijuana）、就绪状态、sha256及caption；下载后二次计算SHA256，与manifest匹配。不用截图拼视频。
2. 查该日期/sha256是否有成功发布回执；已有则不重发。若远端尚未存回执但平台已发，核对账号帖子后补回执，不重复上传。
3. 在现有登录会话确认@ltzyz2181。上传完整MP4，选Reel，使用英文caption，保留产品链接和内部积分说明；检查预览音频、竖屏、文字可读，再发布。没有登录则blocked，不切换其他账号。
4. 回读正式permalink，保存发布时间、media_id（页面可得才写）、source_sha256、视频/文案路径、截图路径、账号到results/publishing/instagram-YYYY-MM-DD.json。没有正式链接则published=false。
5. 每天一个Reel；不补发多日积压。最新成片缺失/校验失败/只是昨日文件，则跳过并记blocked。
接单回执ops/dispatch/接单回执-MANUS-INSTAGRAM-DAILY.md；本文件落盘是assigned，不等于你的远端定时计划已开启。收到后在Manus启用每日计划，按本人账号America/Tijuana上午10点发布；回报实际启用状态。登录受阻时不反复耗费额度。
