# context-mode 接入与公众号资料交接
派给：豆包电脑执行席；GPT负责工程接入。
## GPT实际完成
当前云执行环境已安装 context-mode1.0.169；MCP initialize、tools/list、ctx_stats实测成功，SQLite FTS5可用。未接入当前聊天的自动工具路由/hooks；当前环境无Codex CLI。不能宣称手机豆包已安装。
## 豆包接入
仓库根目录执行 bash scripts/context-mode-install.sh。MCP客户端新增context-mode，command=bash，args=["/实际仓库绝对路径/scripts/context-mode-server.sh"]。重启客户端，ctx stats验证。手机豆包App若没有自定义MCP入口，不能装该插件，改由电脑执行席提供文件检索结果。不得把安装MCP说成增加免费模型额度。
## 公众号协作
用户报告《醒梦与时代场域》已在服务号草稿箱；该报告尚未由GPT独立登录核验。浏览器执行席无需新密钥，继续既有账号会话，补封面并核对草稿标题/正文；最终发表由owner执行。
资料入口：ltzzz-memory/六文件；content/daily-articles/已归档文章；results/publishing/实际发布回执。公开仓库读文件不需要新授权；草稿正文未在仓库时，创建content/approved/wechat-waking-dream.md并保存确切正文与来源，不得凭标题重写冒充原文。保存实际草稿ID（若页面可得）、账号名称、标题、保存时间、封面状态至results/publishing/。平台登录和GitHub读权限互不替代。
公众号官方接口已有ltzzz-wechat-publisher-worker.js及部署工作流，使用现有Secret；无需owner另发AppSecret。现有IP白名单等阻塞未消除前，优先已登录浏览器草稿路径。
抖音/视频号：只有制作任务不等于发布授权。沿用MANUS-CN-DAILY-PUBLISH.md，一周最多一次且一次一个平台；无对应登录会话就记录blocked，不另报成功。
## 55U资金操作卡
最终收款：0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d；用于投资的资产网络必须为Base主网原生USDC。
若狐狸头55U为Ethereum USDT，不能按Base直接转。豆包核验页面后：充值至owner现有OKX本人账户的USDT Ethereum充值地址（由OKX当时页面提供，不猜），保留付款所需Ethereum ETH；兑换USDC；OKX提现网络明确选Base，再提至上述新金库。先2USDC到账核验后再余款；费用以页面为准。不要把Ethereum/Arbitrum转账报成Base投资充值。现有金库39.013125USDC和0.002Base ETH，无需赶着充值才能修复试投。
