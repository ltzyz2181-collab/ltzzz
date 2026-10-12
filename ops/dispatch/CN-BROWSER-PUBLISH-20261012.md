# 国内发布执行单：绕开 R2 上传与公众号 API 动态 IP 阻塞
日期：2026-10-12；总控GPT；执行优先GPT已登录浏览器，否则Manus，豆包备用。
状态：登录交接入口已生成；尚未登录、未上传、未发布。浏览器通道不等于无人值守发布已经完成。
额度：每周一次视频、一次一个平台；本次优先视频号。公众号仅存草稿，沿用owner自行发布约定，不自动群发。

## 素材已经具备
视频：https://github.com/ltzyz2181-collab/ltzzz/blob/main/videos/2026-10-05-audit-transparency.mp4
直接下载：https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/videos/2026-10-05-audit-transparency.mp4
实测15.07秒、720×1280、有音频；SHA256 b8b21435953b05c0dbb418b60488738454b908d7359f312d5809060ac98cd2c0。
视频短文案：LTZZZ AI协作实验：交付、独立审计、记录真实结果。持续把想法变成可核验的行动。
文章：https://github.com/ltzyz2181-collab/ltzzz/blob/main/content/daily-articles/2026-10-12.md
下载GitHub素材，不依赖尚未成功的R2上传，不把两张图片当成视频。

## 登录及实际执行
### 视频号（本次视频首选）
1. 打开 https://channels.weixin.qq.com/ ，账号管理员微信扫码；核对登录账号确属LTZZZ。
2. 下载上述MP4到执行浏览器可上传的本地文件；打开内容发布，选择视频，上传完整MP4。
3. 输入短文案，检查视频预览与声音，完成平台要求的封面等必填项；不得凭空补造素材。
4. owner已授权本次视频发布，账号匹配后执行发布；读取内容管理实际发布状态，保存视频ID/链接、截图和时间。审核中写submitted_pending_review，不写published。
5. 每个平台用视频SHA256+账号做去重；输入或登录缺失一次报告阻塞，不进行付费反复试探。

### 抖音（本周不重复发布；作为下一次备用通道）
1. 打开 https://creator.douyin.com/ ，账号管理员扫码登录，核对LTZZZ账号。
2. 发布视频→上传同样经过验收的MP4→短文案与封面→预览→发布。
3. 作品管理读取实际状态/作品ID，审核中另列；只有成功结果可记published。
4. 不使用不匹配的API Key，也不推断其他AI的浏览器登录状态。

### 公众号（本次只推草稿）
1. 打开 https://mp.weixin.qq.com/ ，管理员微信扫码；核对目标AppID尾号413f33，不进另一公众号账号。
2. 内容/草稿相关入口新建图文，读取当天文章，填写标题、正文和来源；必填封面必须取可用素材，不假造已上传。
3. 预览检查后保存草稿，不群发；重新打开草稿证明保存成功，记录草稿标题、链接/ID（页面提供则记录）和截图。
4. 此浏览器操作不调用Worker token接口，因此不依赖该API出口白名单；不是修好了原API白名单。
5. 不碰“日志上传”入口；那个入口不能创建草稿。

## 自动续跑边界
TinyFish profile prof_ffec95ffc4074389 当前没有任何已保存登录网站。登录交接页面需用户扫码并点击Save profile，只有保存后可用use_profile=true复用。
交接凭据不提交到公开仓库；不要求用户发送密码或验证码。
登录过期/平台要求重新扫码不能靠新代码替代；常驻定时发布尚未验收。当前Hourly Hub sentinel只是派单巡检，不是平台发布器。
Manus接单先写ops/dispatch/接单回执-MANUS-CN-DAILY-PUBLISH.md；无接单不能写“已交给Manus执行成功”。

## 回执模板
execution_id:
platform:
account:
source_video_sha256:
source_commit:
status: blocked_login | uploaded | submitted_pending_review | published | draft_saved | failed
post_id:
url:
screenshot_path:
actual_time:
error:
不得上传Cookie、密码或登录交接token。
