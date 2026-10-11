# 欧易子账户替换执行单

账户名称保持 ltzzzwep3ops。Owner要求新凭据替换旧凭据；保留账本/历史回执，不删除子账户资金或项目服务。

## 实际状态
2026-10-11 UTC：附件三项凭据已私下读取，未提交仓库；对正式环境www.okx.com GET /api/v5/account/config的实际请求返回50110（出口IP不在白名单）。未取得余额或Trade权限，未下单。Owner配置的三个IPv4地址尚未证明为生产程序固定出口。
当前GitHub连接没有Secret写入能力，旧线上Secret未覆盖或删除。

## 有管理员权限的部署者执行
1. 在仓库Settings → Secrets and variables → Actions以附件值覆盖OKX_API_KEY、OKX_API_SECRET、OKX_API_PASSPHRASE，保持名称不变，不把值放日志或文件提交。
2. Worker若在用旧别名OKX_SECRET_KEY / OKX_PASSPHRASE，同步更新其Worker Secret；新脚本优先读取标准名。确认所有消费者切换后再删除不再使用的旧别名，欧易后台撤销旧API Key。不得删除子账户或交易记录。
3. 明确实际执行位置：verify-kimi-okx.yml跑GitHub Actions；其出口不等于Grok临时出口。先提供稳定出口方案或在欧易允许范围内配置实际出口，不能假定三个IP对Actions有效。
4. 手动运行verify-kimi-okx.yml，include_kimi_generation=false，不花模型额度。account/config和balance都code0后才确认认证；perm包含trade才确认交易权限。
5. 首笔金额待余额、现货最小下单限制和可用交易对核实后设定；不做杠杆，不申请提现权限。以orderId、成交记录、余额变化验收，不能用提交成功冒充成交。

本单已落盘，尚无部署者接单回执。AI雇佣AI仍为最高优先级；CEX配置不阻塞内部任务交付与独立审核。
