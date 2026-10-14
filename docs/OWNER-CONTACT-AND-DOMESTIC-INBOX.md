# 聊天或VPN停用后的接力方式

入口：<https://github.com/ltzyz2181-collab/ltzzz/issues/new?template=owner-dispatch.yml>

这个入口使用仓库owner的GitHub登录，默认“仅登记：零模型调用”。需要国内模型实际处理时，选择“执行：DeepSeek分析＋豆包交付”，写清任务后提交。无需OpenAI、Apple Team ID、Bundle ID或桌面GPT在线。首次登记和模型输出都会留下持久回执，Issue内自动回复链接。

安全和成本边界：

- 只接受 ltzyz2181-collab 在 ltzyz2181-collab/ltzzz 新建、标题以 `[LTZZZ工单]` 开头的工单；外部发帖者不会获得Key调用权限。
- 没有新增定时付费任务。默认登记不调用模型；明确选择执行后，使用现有DeepSeek与豆包各一次逻辑调用，适配器可能进行兼容探测。本入口不注入OpenAI/Anthropic Key，也不自动购买额度。
- 先将claim提交到仓库，再调用模型。重复运行已有工单不再次购买产出；崩溃/请求未知会保留记录等待核实，不靠盲目重试补成功。
- DeepSeek分析、豆包交付和复核；输出仍是待审核草稿，不代表独立审计通过、代码部署、发布或付款。不运行模型产生的shell命令，不操作钱包，不改变已有机器人或资金权限。
- 全部Issue、回执、模型输出都是公开的。不要提交Key、私钥、密码、验证码、客户隐私。此入口不能用来发送秘密。
- 国内AI聊天窗口不会自动读取仓库。只有具备GitHub读写权限/联网工具的客户端才能代提交和读取；否则owner手动把任务或链接转给它们。API执行席与手机豆包/千问聊天窗口不是同一个会话。

## 谁在接收

GPT聊天停止后，这个聊天实例不能继续收消息、思考或指挥；仓库中的后台执行器和国内模型会接续工作。向这个入口发工单，是联系LTZZZ云端执行席，不是联系一个离线的GPT。

原有总控每天读取结果、派给DeepSeek和豆包的流程继续运行；外部订单沿用已有每六小时任务。owner不保持网页或电脑在线也可运行，但仍依赖Key余额、GitHub Actions、Cloudflare和供应商网络。

## 无VPN的网络边界

不能保证GitHub、Cloudflare或国外服务在每个国内网络都能访问。没有VPN并不等于已有后台任务停止，但可能影响你读取结果或发新任务。若GitHub不能访问，先在可访问的豆包/千问客户端保存任务文字，待可访问仓库的设备/有权限执行席转交；目前没有部署一个已经验证的国内镜像，也没有微信到此工单的自动桥，不能宣称国内聊天已直连GPT。已有公众号和机器人配置保持不动。

## Claude回来讨论

欢迎与接单说明：ops/dispatch/CLAUDE-RETURN-SIX-MEMORY-20261014.md。Claude可在原有聊天/客户端读文件并回执；不要求申请iOS App Attest集成。Apple Team ID和Bundle ID必须来自真实Apple Developer会员与Xcode工程。本仓库本轮未发现对应iOS配置，示例ABCDE12345/com.yourcompany.app不能直接填。

## 验收

新增路由逻辑测试覆盖owner鉴权、显式执行模式、截断失败停止、双国内模型顺序、checkpoint和重复执行不重复授权。部署后用“仅登记”真实Issue验证持久回执及自动回复，不以零模型收件测试冒充本轮真实API交付；已有真实国内调用证据见knowledge/results/offline-runtime/38506497337.json。
