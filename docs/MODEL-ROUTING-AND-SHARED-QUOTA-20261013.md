# 实际模型路由与六文件讨论
用户已授权提高DeepSeek/豆包模型能力，邀请Claude回到外部记忆讨论。
- 新工作流model-memory-discussion.yml读取六文件全文与SHA256；本轮四席真实调用，后续每周一DeepSeek、二豆包、三国内Kimi、四Claude，UTC11:20；不重复每日生成同样讨论。
- 模型先查询账号可用模型目录，DeepSeek优先pro/思考模型reasoner，豆包优先seed pro，Claude优先Sonnet；失败如实记录。不得把推荐模型当作已可调用。
- 有输出的实际model与本轮状态写data/model-routing/latest.json，日课与雇佣客户端复用；高能力模型输出预算8192，Claude3000，国内Kimi6000。空输出或截断不能当完整交付。
- GitHub Secrets只注入执行环境。兼容ARK_API_KEY；DOUBAO_BASE_URL从Vars/Secrets读取；模型参数使用公开Vars或实际路由文件，不需要每天找Key。
- 豆包AET-00024实际报fetch failed，未知网络/上游原因，不改写为“Key坏了”或“模型错了”。IPv4 DNS优先和真实调用验收不能替代上游可用性证明。
- Claude旧日课撤席和钱包权限继续不变；本次只允许六文件讨论。余额不足则记录失败、不恢复签名席。
## 国内Kimi Tier1
owner提供：并发15、TPM2000000、RPM100、TPD无限制。此为账号请求上限，不是免费token或可供其他厂商调用的通用硬件。
国内MOONSHOT_API_KEY_CN→api.moonshot.cn；国外Key不同账号/端点，不通用。
现有Cloudflare共享租约网关已上线，health实测concurrency1/min_interval_ms21000；只约束走这个网关的请求，其他通道绕过网关仍占同账号供应商总额度。
本轮沿用该网关，不为充值再次生成多把Key，不虚报已经升级至15并发。Kimi充值后能否正常调用以本轮generation结果为准。
共享的是LTZZZ任务调度、记忆与同账号限速，不是把DeepSeek/豆包/Claude硬件或免费额度合并给Kimi。多Key不会让同一账号获得几倍Tier1限额。
