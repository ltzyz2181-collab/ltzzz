# MANUS-CN-DAILY-PUBLISH
接单席：Manus；任务仅文件落盘，尚未收到本人接单回执。
每日：北京时间20:30，日报成片成功后；每平台每天最多一条。
输入：content/daily-articles/YYYY-MM-DD-douyin.md、同日shipinhao文案、results/publishing/video-cn-YYYY-MM-DD.json。
成片：从回执run_id对应GitHub Actions的cn-daily-video artifact下载真实MP4，先完整播放检查中文字幕/配音，无MP4不得改发两图充数。
账号：仅owner已确认、已登录的本人抖音账号和视频号助手账号；账号不明确或会话未登录时写blocked并列出缺口，不选择其他账号。
执行：上传视频、填写对应中文文案，按owner授权发布。遇验证码/平台审核需owner本人处理；不试图绕过限制。
禁止公开私钥、Token、内部价值口号；不得将内部积分写成真实链上工资。
回执：日期、executed_by=manus、平台、账号、MP4来源run_id、源commit、时长、实际发布ID/链接、截图、发布时间。未完成单独标记blocked和原因。
落盘：ops/dispatch/接单回执-MANUS-CN-DAILY-PUBLISH.md；results/publishing/manus-cn-YYYY-MM-DD.json。不能写Hub时把完整回执交owner转存。
10-10初次成片下载：https://github.com/ltzyz2181-collab/ltzzz/actions/runs/38100541039/artifacts/11688215095
