# 豆包 / DeepSeek 视频分工（明确YouTube独立）
## A轨：原有每日YouTube任务
保留owner在豆包会话设置的每日计划；本文件不取消它。豆包制作/检查当日视频，优先既有YouTube上传链路，Manus不参与。
只有真实新MP4才上传；同一来源文件或已发布video_id不可重复。无成片/无额度/失败只写blocked，不强制耗费新付费API。真实回执记录privacy、video_id、链接。
仓库核验：youtube-upload-video.yml目前仅workflow_dispatch手动上传，成功回执38085038656；ltzzz-youtube-daily-worker.js只写ready_to_publish，没有scheduled处理器、没有视频制作/上传调用。不能称为仓库已实现每日自动公开发布。豆包会话已有自动计划未独立核实。
## B轨：新增国内短视频，低频复用
每周最多1条中文MP4，优先复用A轨适合的成片，不另做重复视频。该每周上限只管新增国内素材，不限制A轨原有计划。
豆包负责制作；DeepSeek整理当日真实记录、完整口播稿及短文案并审查事实。DeepSeek纯文本产出不算成片。
Manus只发布B轨/Instagram轮换，每周一次一次一个平台，不制作视频，不承担YouTube上传。
豆包不可用：DeepSeek交脚本，授权执行器可手动运行render-cn-daily-video.yml；自动日报渲染保持关闭。
输入：knowledge/results/wep3/latest.json、content/daily-articles/、results/publishing/。
任务仍需真实接单回执：ops/dispatch/接单回执-DOUBAO-DEEP-WEEKLY-VIDEO.md。

## 2026-10-12 owner追加：下一条视频产品入口
下一条视频简介/发布文案加入 https://ltzyz.gumroad.com/l/ugyhy?layout=profile；片尾提示“产品说明与购买链接见简介”。平台允许时置顶评论；不允许外链就记录限制。详细执行单：ops/dispatch/DOUBAO-VIDEO-PRODUCT-LINK-20261013.md。本单不新增每天多平台任务；实际发布需回执。
