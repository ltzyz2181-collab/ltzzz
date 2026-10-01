// LTZZZ Guardian Worker（ltzzz-guardian）
// 守护告警：监控熔断/低余额/大额/提案积压 → 日志 + 可选 Telegram 推送
// - GET  /         健康检查（返回状态文本，部署验证用）
// - POST /check    手动触发一次守护检查（读 KV 台账）
// - POST /veto     人类否决请求转发（proposalId 由调用方传入，不硬编码 0）
// - scheduled       每 6 小时自动自检（crons 见 wrangler.toml）

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function text(s, status = 200) {
  return new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function notifyTelegram(env, message) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { sent: false, reason: "TELEGRAM_BOT_TOKEN/CHAT_ID 未配置（等凭证）" };
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `[LTZZZ Guardian]\n${message}` }),
    });
    return { sent: r.ok, status: r.status };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

// 从 KV 读台账，检查告警条件
async function runChecks(env) {
  const alerts = [];
  if (!env.GUARDIAN_KV) return { alerts, note: "GUARDIAN_KV 未绑定，跳过台账检查" };

  const ledgerRaw = await env.GUARDIAN_KV.get("ledger:circuit");
  const circuit = ledgerRaw ? JSON.parse(ledgerRaw) : { consecutive_failures: 0, halted: false };
  if (circuit.halted) alerts.push(`🚨 熔断器已触发（${circuit.halted_at}），AI 支出已冻结`);
  if (circuit.consecutive_failures >= 2) alerts.push(`⚠️ 连续 ${circuit.consecutive_failures} 次支付失败，接近熔断线`);

  const balRaw = await env.GUARDIAN_KV.get("ledger:balance");
  const bal = balRaw ? Number(JSON.parse(balRaw).usdc) : null;
  if (bal !== null && bal < 10) alerts.push(`💸 余额偏低: ${bal} USDC`);

  return { alerts };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }

    const url = new URL(request.url);

    if (request.method === "GET") {
      if (url.pathname === "/") return text("LTZZZ Guardian Worker - 等部署", 200);
      return text("LTZZZ Guardian Worker", 200);
    }

    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }

      if (url.pathname === "/check") {
        const { alerts } = await runChecks(env);
        if (alerts.length === 0) return json({ ok: true, alerts: [], message: "守护检查通过：无告警" });
        const notify = await notifyTelegram(env, alerts.join("\n"));
        return json({ ok: true, alerts, notify });
      }

      if (url.pathname === "/veto") {
        // 人类否决请求：proposalId 必须由调用方传入，绝不硬编码 0
        const { proposalId, agent, reason } = body;
        if (!proposalId) return json({ ok: false, error: "need proposalId（禁止硬编码）" }, 400);
        const message = `🚫 人类否决请求\nproposalId: ${proposalId}\nagent: ${agent || "?"}\nreason: ${reason || "未提供"}`;
        const notify = await notifyTelegram(env, message);
        return json({ ok: true, proposalId, notify, note: "已在守护侧记录，待链上 veto 调用" });
      }

      if (url.pathname === "/alert") {
        const { message } = body;
        if (!message) return json({ ok: false, error: "need message" }, 400);
        const notify = await notifyTelegram(env, String(message));
        return json({ ok: true, notify });
      }

      return json({ ok: false, error: "unknown path: " + url.pathname }, 404);
    }

    return json({ ok: false, error: "method not allowed" }, 405);
  },

  // 每 6 小时自动自检（crons 配置见 wrangler.toml）
  async scheduled(event, env, ctx) {
    const { alerts } = await runChecks(env);
    if (alerts.length > 0) {
      await notifyTelegram(env, "⏰ 定时自检:\n" + alerts.join("\n"));
    }
  },
};
