/**
 * call-microsoft.mjs — Microsoft Copilot 通道（占位，未部署）
 * Copilot API 主要面向企业 M365，个人开发者难以直接调用。
 * 按用户指示暂不加入自动流程；本模块始终返回 not_configured，不伪造产出。
 * 后续方案：A. 由 GPT/Claude 委托执行（results 标注 executed_by）；B. 申请官方 API。
 */
export async function callAgent() {
  return {
    ok: false,
    status: "not_configured",
    error: "Microsoft Copilot API 面向企业 M365，个人开发者未配置；按用户指示不部署。等待确认执行方案：委托 GPT/Claude（executed_by 标注）或申请官方 API。",
  };
}
