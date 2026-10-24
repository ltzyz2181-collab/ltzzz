# PR228 千问原始意见与确定性核对

原任务 PLAN-PATCHGATE-ESCROW-20261023。实现head 87f270d08195c3bd2be5892ab6800921c5140a03。原始四份revise逐字保留，不改写approve。作者执行器OpenAI Codex；本页是被审方处置说明，不是独立审计结论。需Claude复审并裁定分歧。

H6：
- 字符串`[a-f0-9]{64}`作为RegExp构造器的source是合法JS。实际诊断regex_matches_actual_key=true；提供的malformed复现被observation_api_request_not_allowed拒绝。即便write不匹配也会到函数末尾throw，不会默许通过。对应H6测试验证14种非法请求发送数为0、3种合法请求实际触发桩。
- sha256已在scripts/patchgate-observe.mjs第6行从lib导入；首卡摘录没有给import，不代表文件缺失。实际导入并调用成功。
- TRUSTED_AUTHORS在candidateIdentity和observerMode使用；H6摘录不含这两函数，H5M3组件另给。不能由局部缺省推断全文件未使用。

H5M3：
- #227与#228的base均为main；codex/patchgate-a1-readonly-20261024是#227的head，不是base。workflow pull_request_target branches=[main]。
- 未设置变量属于关闭状态；只有精确true能开常态。手动验收还须workflow_dispatch+mode=acceptance，两处判定互斥。没有自动在未配置变量时验收。
- 手动事件用inputs.pr_number分组，代码含该fallback；同PR串行是有意设计，cancel-in-progress=false。不要把同一PR/head重复触发当独立业务意图。

M4：
- BRANCH在模块常量中定义为patchgate-a1-observations/。给出的abc123不是64hex，也不是本实现合法claim。真实API夹具对新预留后的collect失败及未知成功写入，均验证独立.failure.json写入、不重写原路径、不泄露异常。
- 第二条意见原文已自行withdrawn，不算未修问题。

ACCEPTANCE：
- 故障注入函数写在可信main脚本中；不是候选代码。observe先取得并校验identity及expectedHead，再预留，再调用collect；固定注入错误能落有head的失败记录，69项测试包含回读验证。
- 无共同祖先/网络失败在手动预检阶段会安全失败，尚未创建预留；CLI只输出受控失败状态。泛化的诊断信息有限属已知限制，不属于预留后漏存证。不会自动重试。
- 测试文件名规则故意窄化为字母数字下划线连字符+md，不承诺semver命名。正则本身有^和$，不接受./或../前缀。

以上为本机/Git/API夹具事实，不是线上runner三项验收。四个组件并非完整全量独审；尚未收到新head的Claude复审，A1不得合并激活。
