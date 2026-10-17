# WorkBuddy 视频入队接力

对象：`2026-10-17-no-self-review.mp4`，原始回执为 `ops/回执-每日视频流水线-20261017.md`。这里的日期是素材任务编号；不据此推断当前使用者的当地日期。

原始故障是本机 `wrangler r2 object put --remote` 返回 403/code 10000。该报错支持“认证或授权被拒绝”，单凭它不能独立证明具体 Token 权限、有效期和账号绑定。本轮不扩大全局 Cloudflare Token 权限。

## 使用现有入口

优先走 `https://ltzzz-video-scheduler.ltzyz2181.workers.dev/queue/upload/<name>`，它用现有 `LTZZZ_AGENT_TOKEN` 认证，由 Worker 的 `VIDEOS` 绑定写 R2，不要求上传端拥有 R2:Edit。凭证只由既有安全环境注入，不打印、不加入 git、不从 Actions 取出给聊天窗口。

拿到源 MP4 的执行席，在仓库运行下面这条命令（Node 22+、ffprobe）。`--meta` 指向已经准备好的 title/description/created JSON；只有当实际文件不同才改路径，不重新生成视频：

```sh
node scripts/queue-video-only.mjs --video videos/2026-10-17-no-self-review.mp4 --meta videos/2026-10-17-no-self-review.meta.json
```

支持绝对本地路径及 Seedance 元数据，不再只允许固定日期的 FFmpeg 素材。PowerShell 包装入口为 `tools/upload_to_queue.ps1 -Video <MP4路径> -Meta <JSON路径>`。若环境没有 `LTZZZ_AGENT_TOKEN`，明确记录 `LTZZZ_AGENT_TOKEN_missing`，不要拿 Cloudflare Token 冒充它，也不要要求 owner 把 Key 发到聊天。

上传前读取媒体规格与 SHA-256。先查同名现有队列；同一内容回读恢复，异片拒绝覆盖。上传成功后用认证 GET `/queue/item?name=...` 重新读取 R2 中真实视频字节和元数据，校验哈希、长度、标题和描述；只有通过才写 `uploaded_to_queue=true`、`queue_readback_verified=true`。该命令不会调用 `/queue/run`、YouTube 上传或模型。

回执为 `results/publishing/video-queue-upload-2026-10-17-no-self-review.json`。传输中断保持未确认，下次先回读，不换名字盲重传。已开始发布的内容先对账，不创建第二条上传。入队不等于公开发布；`published` 保持 false，公开状态由 Google-backed 平台验证另证。

## 无 VPN 与真实部署验收

`workbuddy-video-recovery.yml` 无 cron、无模型、无视频上传。PR 只测试；合并后在 GitHub hosted runner 检查新部署 `/health`、匿名拒绝、认证 R2 回读，以及非法上传在写入之前被拒绝。该运行未安装/启动 VPN，但不代表已经检验 owner 的大陆本机直连。

诊断回执必须保留 `network_context` 与 `owner_no_vpn_verified=false`。WorkBuddy 在实际本机断开 VPN 后执行同一上传命令，记录当时网络状态和真实结果，才补充本机证据；本脚本不会关闭系统代理或 VPN，也不会将命令执行者自述当成独立验证。

当前源 MP4 未进入 Git，当前云会话无法直接访问 WorkBuddy 本地文件。须取回原始 MP4 或由持有该文件的执行席运行以上入口；接口修复、只读诊断均不替代这一步。未完成前不写“本条已入队/今晚必发”。

## 另一个已确认的发布失败

run `38950009783`（`youtube-daily-publish.yml`）失败于 `queue_http_409_queue_name_conflict`。同日先前入队片 SHA-256 为 `9582fd67463128ad4db6d88f94fc3652e81efb8da44efd1d44ab3135801adb83`；后来重渲染片为 `5d8af7541d5cebf5344bc12a17659ff8eebc3278dca889f41a8d62f32d068e54`，名称相同。这是异片保护拦截，不能归因成 R2 403，也不应通过换名绕过。该既有视频的实际 cron/平台结果另外回读，不当成 WorkBuddy 本次成片。
