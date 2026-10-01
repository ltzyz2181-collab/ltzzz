// LTZZZ Economy Worker（ltzzz-economy）
// 推理证明（Proof-of-Reasoning）：输入支出要素 → SHA-256 reasoning_hash → 存 KV 台账
// 与 anchor-reasoning.mjs 的 reasoningHash() 完全同构，任何人可用同一字段重算核对。
// WebCrypto（crypto.subtle.digest），零依赖。

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return "0x" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 与 scripts/anchor-reasoning.mjs 的 reasoningHash 字段顺序完全一致
export async function reasoningHash(fields) {
  const payload = JSON.stringify({
    agent: fields.agent,
    amount_usdc: Number(fields.amount_usdc),
    recipient: fields.recipient,
    purpose: fields.purpose,
    hypothesis: fields.hypothesis,
    success_criteria: fields.success_criteria,
    experiment_id: fields.experiment_id,
  });
  return await sha256Hex(payload);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }

    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id");
      if (id && env.REASONING_KV) {
        const rec = await env.REASONING_KV.get(`reasoning:${id}`);
        if (rec) return json({ ok: true, record: JSON.parse(rec) });
        return json({ ok: true, record: null });
      }
      return json({ ok: true, name: "ltzzz-economy", message: "LTZZZ Economy Worker", endpoints: ["GET /?id=x", "POST {agent,amount_usdc,recipient,purpose,hypothesis,success_criteria,experiment_id}"] });
    }

    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
      const { agent, amount_usdc, recipient, purpose, hypothesis, success_criteria, experiment_id } = body;
      if (!agent || !amount_usdc || !recipient) return json({ ok: false, error: "need agent + amount_usdc + recipient" }, 400);
      const hash = await reasoningHash({ agent, amount_usdc, recipient, purpose: purpose || "", hypothesis: hypothesis || "", success_criteria: success_criteria || "", experiment_id: experiment_id || null });
      const id = "txn_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      const rec = { id, reasoning_hash: hash, agent, amount_usdc: Number(amount_usdc), recipient, purpose, hypothesis, success_criteria, experiment_id, ts: new Date().toISOString() };
      if (env.REASONING_KV) await env.REASONING_KV.put(`reasoning:${id}`, JSON.stringify(rec));
      return json({ ok: true, id, reasoning_hash: hash, note: "任何人可用同字段重算核对（proof-of-reasoning）" });
    }

    return json({ ok: false, error: "method not allowed" }, 405);
  },
};
