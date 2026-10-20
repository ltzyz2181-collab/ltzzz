# 当前DID与席位登记

类型：事实登记。当前岗位唯一源：[seat-registry.json](../seat-registry.json)；当前端点证据唯一源：[endpoint-status.json](../endpoint-status.json)；[生成的席位表](../SEATS.md)。钱包唯一源：[wallet/addresses.md](../../wallet/addresses.md)。

11份DID文件包含8个AI岗位和3份治理/人类记录，不能当作11条模型通道。Microsoft暂时除名，保留历史文件；Claude在任，职责为独立审计＋规划。GPT为总控，千问代行总控并具同等工程运维权限。

Grok首选健康地址是api-xai.ltzzz.com，10-09绑定见ops/接单回执与审计意见-20261009.md。豆包首选为ltzzz-doubao-proxy.ltzyz2181.workers.dev。别名失败不代表正式Worker或原生模型失败，实际DNS/HTTP观察必须保留时间与来源。

每个AI岗位的JSON名片为https://ltzzz.com/api/agents/{id}/card.json；旧/card路径保留兼容文件。名片只提供元数据，不冒充A2A RPC服务。Pages与Worker的真实上线状态以部署/探测回执为准。

Claude的HTTP健康与名片由零模型调用的元数据Worker承载。原厂API余额不足与Claude免费外部仓库工作是不同状态；#161的外部审计交付已合并。国内模型代执行只能署实际提供商，不能叫原生Claude。

DID签名公钥不是API Key。无效占位公钥已从认证方法移除，状态明确为未配置签名身份；未生成私钥、未签署DID、未改Safe owners，也未完成链上Agent注册。岗位治理任命与资金签名权分别核验。
