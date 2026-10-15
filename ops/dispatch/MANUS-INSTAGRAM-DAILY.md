# Manus 每日Instagram发布任务
此任务替代旧每周单平台任务及MANUS-IG-CLOSEOUT-20261013，owner已授权每天发布，无需再要求逐条确认。仅账号@ltzyz2181。
每日独立工作流instagram-daily-package.yml制作、校验并提交可下载成片，不依赖YouTube上传或R2；你只下载现成视频并发布一个Reel，不制作视频，不处理公众号、抖音、视频号。
入口：videos/instagram/latest.json。先读取当日ops/dispatch/MANUS-INSTAGRAM-YYYY-MM-DD.md（日期按America/Tijuana），按manifest中的固定日期video_url/caption_url下载，不硬编码可变latest.mp4。每个日期的材料不替换；可直接发布完整MP4，不是两张图片。
1. 查latest.json日期（America/Tijuana）、就绪状态、sha256及caption；下载后二次计算SHA256，与manifest匹配。不用截图拼视频。
2. 查该日期/sha256是否有成功发布回执；已有则不重发。若远端尚未存回执但平台已发，核对账号帖子后补回执，不重复上传。
3. 在现有登录会话确认@ltzyz2181。上传完整MP4，选Reel，使用英文caption，保留产品链接和内部积分说明；检查预览音频、竖屏、文字可读，再发布。没有登录则blocked，不切换其他账号。
4. 回读正式permalink，保存发布时间、media_id（页面可得才写）、source_sha256、视频/文案路径、截图路径、账号到results/publishing/instagram-YYYY-MM-DD.json。没有正式链接则published=false。
5. 每天一个Reel；不补发多日积压。最新成片缺失/校验失败/只是昨日文件，则跳过并记blocked。
接单回执ops/dispatch/接单回执-MANUS-INSTAGRAM-DAILY.md；本文件落盘是assigned，不等于你的远端定时计划已开启。收到后在Manus启用每日计划，按本人账号America/Tijuana上午10点发布；回报实际启用状态。登录受阻时不反复耗费额度。

部署状态：GitHub每日14:25 UTC自动备料并生成当日任务；有现有MANUS_API_KEY或MANUS_ACCESS_TOKEN时会调用官方v2接口推送lite发布任务，未配置则保存blocked_manus_api_not_configured，不冒充已送达。首次接单时请回报你的实际每日计划是否启用；没有定时能力需如实说明。不要再开启另一个发布者。
