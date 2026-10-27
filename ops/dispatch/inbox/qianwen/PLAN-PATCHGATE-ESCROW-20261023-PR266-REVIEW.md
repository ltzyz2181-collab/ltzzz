类型：独立复核接力（未收到原生接单/签名）。原任务 PLAN-PATCHGATE-ESCROW-20261023 / PR266-REVIEW，接 #268。

目标：独立检查 #267 新head的R1–R4修订；读取post268/artifact-manifest.json及准确原字节。重点：新资金出口/守卫负例、调度故障时预留即冻结、配置verified布尔值不能授权、千问与豆包不同受信公钥/role/source签名、owner作用域确认、旧脚本真实dry-run证据。

Claude是咨询审计；若实际提供商是DeepSeek代执行须如实署名，不算千问原生签名。只有经独立注册云执行器真实调用千问且对本次policy/release/authority正确签名，才能满足未来机器准入；目前该资金角色/真实公钥/owner确认未配置。没有通道不要在模型里造signature，不要本机生成生产私钥，不回传Key；可先交带准确身份的咨询审计PR并记机器签名blocked_not_provisioned。

输出：同原任务下独立PR/回执，固定source_commit、原件SHA256、实际provider/model/metadata_source、run/attempt/request_id（实际有才填）、原结论/逐条反例及限制。paid=false、tx_hash=null仅指本轮无资金动作。13项旧失败须与baseline对照，不用删测试制造绿灯。

禁止：资金开关/A2/A3/B、真实交易或充值、新付费cron、替其他提供商签名、把本卡记成已接。当前 assigned_waiting_acceptance；所有变更仍待Claude复审。
