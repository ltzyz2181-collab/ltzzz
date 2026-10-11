# 公众号草稿不可见根因 · 2026-10-11 UTC
只读真实回执：results/publishing/wechat-diagnostics-38102511246.json。
owner确认后台AppID尾号413f33；Worker Secret WECHAT_APP_ID尾号9e04f8。app_id_matches=false。
微信draft/get成功，修订稿仍存在，标题“一天烧了48次提交，真实付款是0…”；它属于Worker当前配置的旧账号，不能称为owner当前服务号已有草稿。
已加入owner确认账号约束：配置不匹配时publish/cron禁止新增草稿或发表，不改变旧草稿。
修复缺口：在Cloudflare ltzzz-wechat-publisher中配套设置正确WECHAT_APP_ID与该号WECHAT_APP_SECRET；回调WECHAT_TOKEN也需与此号后台一致。不得只替换AppID复用另一号AppSecret，不在Hub/聊天贴Secret。
新号权限必须重新测试，旧号freepublish/submit 48001不能直接归到新号。
日志上传是微信编辑器日志上报，不是文章上传、草稿同步或凭证设置，当前不需依靠它解决账号不一致。
YouTube独立轨道：38085038656已有旧豆包成片公开上传回执，video_id=nTZ44tD_Izw。该成功不证明每天已自动发布；仓库YouTube上传workflow仍只有手动触发。
