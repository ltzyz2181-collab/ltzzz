// LTZZZ · Microsoft 席"对话交接转发器" — Cloudflare Worker
// 槽位：did:ltzzz:microsoft（微软席，西方文化对照 / 文明研究）
// 声明：本 Worker 是【交接转发器，非模型代理】——Microsoft Copilot 无公开的个人开发者
//      聊天 API，无法直连调用；因此 POST 收任务 → 生成结构化任务卡 → 供人类/AI 转交
//      给可执行席（如 Claude/GPT 代执行，results 标注 executed_by）。
//      待 Copilot API（企业版）可用后再切换为真实模型代理。
//
// 健康检查：GET /health → {ok, service, did, has_key:false, mode:"handoff-forwarder", planned}
// 调用：POST /  { agent, task, context?, expected_output? } → 返回任务卡 + receipt 记录

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: cors() });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'microsoft-proxy',
        did: 'did:ltzzz:microsoft',
        mode: 'handoff-forwarder',
        has_key: false,
        planned: false,
        note: '非模型代理：Copilot 无公开个人 API，任务转交可执行席代执行（executed_by 标注）',
        time: new Date().toISOString()
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'POST only', hint: 'Use GET /health to test deployment.' }, 405);
    }

    try {
      const body = await request.json();
      if (!body.task) {
        return json({ error: 'task is required', stage: 'request_validation' }, 400);
      }

      // 生成任务卡（交接文本，供可执行席/人类转交）
      const taskId = 'ms_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const card = {
        task_id: taskId,
        agent: body.agent || 'microsoft',
        executed_by: body.executed_by || 'pending', // claude/gpt 代执行时标注
        task: body.task,
        context: body.context || '',
        expected_output: body.expected_output || '',
        created_at: new Date().toISOString(),
        receipt_endpoint: '/receipt'
      };

      // 回执记录端点（内存态；正式持久化由总控写 ltzzz-memory）
      const receipts = (env.RECEIPTS_STORE || {});
      const receipt = {
        task_id: taskId,
        status: 'handed_off',
        received_at: new Date().toISOString(),
        note: '本记录为转交凭据；执行结果由执行席写回 ltzzz-memory/重要事件 + results/'
      };

      return json({ ok: true, mode: 'handoff-forwarder', card, receipt }, 200);
    } catch (e) {
      return json({ error: String(e?.message || e), stage: 'worker_runtime' }, 500);
    }
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json; charset=utf-8' }
  });
}
