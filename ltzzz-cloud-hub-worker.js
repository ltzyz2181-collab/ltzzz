#!/usr/bin/env node
/**
 * LTZZZ 云端任务中枢 Worker（框架）
 * 任务ID：LTZZZ-<域>-<序号>；状态：queued→running→success/failed/waiting_approval/cancelled
 * 存储：KV（命名空间绑定名 KV）
 * 鉴权：Bearer ACCESS_TOKEN（Cloudflare Secret）
 * 状态：代码框架就绪；部署待 Cloudflare 授权。
 */
const TASK_ID_PREFIX = "LTZZZ-";

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function genId(domain) {
  const n = Date.now().toString(36).toUpperCase().slice(-6);
  return `${TASK_ID_PREFIX}${(domain || "TASK").toUpperCase()}-${n}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (request.method === "GET" && path === "/health") {
      return json({ ok: true, engine: "cloud-hub", kv: !!(env.KV) });
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    const auth = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (env.ACCESS_TOKEN && auth !== env.ACCESS_TOKEN) return json({ error: "unauthorized" }, 401);

    let body = {};
    try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }

    const kv = env.KV;

    if (path === "/task/create") {
      const id = genId(body.domain);
      const task = {
        task_id: id,
        from: body.from || "unknown",
        to: body.to || "doubao",
        type: body.type || "task",
        payload: body.payload || {},
        status: "queued",
        retry: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result: null,
        log: [],
      };
      await kv.put("task:" + id, JSON.stringify(task));
      return json({ ok: true, task_id: id, status: task.status });
    }

    if (path === "/task/status") {
      if (!body.task_id) return json({ error: "task_id required" }, 400);
      const raw = await kv.get("task:" + body.task_id);
      if (!raw) return json({ ok: false, error: "task not found" }, 404);
      return json({ ok: true, task: JSON.parse(raw) });
    }

    if (path === "/task/list") {
      // 简化：按前缀列最近任务（KV 无通配查询，此处返回说明；生产可用 D1/SQLite 替代）
      const last = await kv.get("last:task:list") || "{}";
      return json({ ok: true, note: "完整列表建议使用 D1 存储", sample: JSON.parse(last) });
    }

    if (path === "/task/cancel") {
      if (!body.task_id) return json({ error: "task_id required" }, 400);
      const raw = await kv.get("task:" + body.task_id);
      if (!raw) return json({ ok: false, error: "task not found" }, 404);
      const t = JSON.parse(raw);
      if (t.status === "queued") {
        t.status = "cancelled";
        t.updated_at = new Date().toISOString();
        await kv.put("task:" + body.task_id, JSON.stringify(t));
      }
      return json({ ok: true, task_id: body.task_id, status: t.status });
    }

    if (path === "/task/result") {
      if (!body.task_id) return json({ error: "task_id required" }, 400);
      const raw = await kv.get("task:" + body.task_id);
      if (!raw) return json({ ok: false, error: "task not found" }, 404);
      const t = JSON.parse(raw);
      t.status = body.status || "success";
      t.result = body.result || null;
      if (body.retry === true && t.retry < 2) { t.retry += 1; t.status = "queued"; }
      t.updated_at = new Date().toISOString();
      t.log.push({ at: t.updated_at, step: body.step || "result", note: body.note || "" });
      await kv.put("task:" + body.task_id, JSON.stringify(t));
      return json({ ok: true, task_id: body.task_id, status: t.status });
    }

    return json({ error: "not found" }, 404);
  },
};
