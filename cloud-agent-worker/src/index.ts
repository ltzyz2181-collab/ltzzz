import { getSandbox } from "@cloudflare/sandbox";
import { Sandbox } from "@cloudflare/sandbox";

export { Sandbox };

interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
  ARK_API_KEY: string;
  DOUBAO_MODEL: string;
  GITHUB_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  LTZZZ_DEPLOY_TOKEN?: string;
}

const REPO = "ltzyz2181-collab/ltzzz";
const WORKSPACE = "/workspace/ltzzz";
const JOB_ROOT = "/workspace/jobs";

function cors(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "https://ltzzz.com",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type,X-LTZZZ-Deploy-Token",
    },
  });
}

function extractJson(text: string): any {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Doubao 未返回有效 JSON 任务计划");
  return JSON.parse(text.slice(a, b + 1));
}

async function callDoubao(env: Env, task: string) {
  const model = env.DOUBAO_MODEL || "doubao-seed-2-1-pro-260628";
  const system = `你是 LTZZZ 云端执行 Agent。GPT 是总控；豆包负责执行，不得改变 GPT 总控和 3/5 核心治理。
当前目标仓库：${REPO}。
工作区：${WORKSPACE}。
你不是给用户讲教程，而是生成可以在 Cloudflare Sandbox Linux 环境中实际执行的任务计划。
你可以检查、修改、测试、git commit/push，并在需要时用 Wrangler 部署 Cloudflare Worker。
不要读取、打印、提交任何 Secret 值。
禁止 rm -rf /、格式化磁盘、删除整个仓库或删除大量不相关数据。
任务必须优先复用现有 LTZZZ 文件和 Worker，不要另起一套重复系统。
输出严格 JSON：{"summary":"...","commands":["cmd1","cmd2"],"notes":"..."}。
commands 必须是按顺序执行的 shell 命令字符串。需要 git push 时使用：git -c http.extraheader="Authorization: Bearer $GITHUB_TOKEN" push origin main。
需要 Cloudflare 部署时直接使用 wrangler，并依赖环境中的 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID。
不要把任何 API Key、Token、密码写进代码、git、日志。`;

  const r = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: task },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Doubao API HTTP ${r.status}: ${await r.text()}`);
  const data: any = await r.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Doubao 未返回内容");
  return extractJson(text);
}

function jobStatusPath(id: string) { return `${JOB_ROOT}/${id}.json`; }
function jobOutputPath(id: string) { return `${JOB_ROOT}/${id}.log`; }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "https://ltzzz.com",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "Content-Type,X-LTZZZ-Deploy-Token",
        },
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") return cors({ ok: true, worker: "ltzzz-cloud-agent", repo: REPO, cloud: true });

    const supplied = request.headers.get("X-LTZZZ-Deploy-Token") || "";
    if (!env.LTZZZ_DEPLOY_TOKEN || supplied !== env.LTZZZ_DEPLOY_TOKEN) return cors({ error: "unauthorized" }, 401);

    const sandbox = getSandbox(env.Sandbox, "ltzzz-cloud-workspace");
    await sandbox.setEnvVars({
      GITHUB_TOKEN: env.GITHUB_TOKEN,
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    });
    await sandbox.exec(`mkdir -p ${JOB_ROOT}`);

    if (request.method === "POST" && url.pathname === "/run") {
      const body: any = await request.json().catch(() => ({}));
      const task = String(body.task || "").trim();
      const mode = String(body.mode || "ltzyz-docs");
      if (!task) return cors({ error: "task required" }, 400);
      if (mode === "local") return cors({ error: "local mode requires a Local Agent Bridge; use ltzyz-docs cloud mode" }, 400);

      const prep = await sandbox.exec(`if [ ! -d ${WORKSPACE}/.git ]; then git clone https://github.com/${REPO}.git ${WORKSPACE}; fi`);
      if (!prep.success) return cors({ error: "workspace init failed", detail: prep.stderr || prep.stdout }, 500);

      const plan = await callDoubao(env, task);
      const commands = Array.isArray(plan.commands) ? plan.commands.filter((x: unknown) => typeof x === "string" && x.trim()) : [];
      if (!commands.length) return cors({ error: "Doubao returned no commands", plan }, 422);

      const id = `job-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      const statusFile = jobStatusPath(id);
      const logFile = jobOutputPath(id);
      await sandbox.writeFile(statusFile, JSON.stringify({ id, status: "queued", summary: plan.summary || "", notes: plan.notes || "", startedAt: new Date().toISOString() }));

      const lines: string[] = [
        "#!/usr/bin/env bash",
        "set +e",
        `cd ${WORKSPACE}`,
        `echo '[LTZZZ] start ${id}' > ${logFile}`,
        `python3 - <<'PY'\nimport json,datetime\np='${statusFile}'\ns=json.load(open(p))\ns['status']='running'\njson.dump(s,open(p,'w'),ensure_ascii=False)\nPY`,
        "code=0",
      ];
      for (const command of commands) {
        lines.push(`if [ \"$code\" -eq 0 ]; then ${command} >> ${logFile} 2>&1; code=$?; fi`);
      }
      lines.push(
        `printf '\\n[LTZZZ] exit=%s\\n' "$code" >> ${logFile}`,
        `python3 - <<'PY'\nimport json,datetime\np='${statusFile}'\ntry: s=json.load(open(p))\nexcept: s={}\ns['status']='completed' if ${"$code"} == 0 else 'failed'\ns['exitCode']=int(${"$code"})\ns['finishedAt']=datetime.datetime.utcnow().isoformat()+'Z'\njson.dump(s,open(p,'w'),ensure_ascii=False)\nPY`,
        'exit "$code"',
      );

      // Replace the status-expression placeholders with shell variables evaluated at runtime.
      const script = lines.join("\n").replace("'completed' if $code == 0 else 'failed'", "'completed' if int(open('/proc/self/stat').read().split()[2]) == 0 else 'failed'");
      // The shell status is also written by the following wrapper, which avoids trusting model output.
      const wrapped = [
        "#!/usr/bin/env bash",
        "set +e",
        `cd ${WORKSPACE}`,
        `echo '[LTZZZ] start ${id}' > ${logFile}`,
        `python3 - <<'PY'\nimport json\np='${statusFile}'\ns=json.load(open(p))\ns['status']='running'\njson.dump(s,open(p,'w'),ensure_ascii=False)\nPY`,
        "code=0",
        ...commands.map((command: string) => `if [ \"$code\" -eq 0 ]; then ${command} >> ${logFile} 2>&1; code=$?; fi`),
        `printf '\\n[LTZZZ] exit=%s\\n' "$code" >> ${logFile}`,
        `CODE="$code" python3 - <<'PY'\nimport json,datetime,os\np='${statusFile}'\ns=json.load(open(p))\ncode=int(os.environ.get('CODE','1'))\ns['status']='completed' if code==0 else 'failed'\ns['exitCode']=code\ns['finishedAt']=datetime.datetime.utcnow().isoformat()+'Z'\njson.dump(s,open(p,'w'),ensure_ascii=False)\nPY`,
        'exit "$code"',
      ].join("\n");

      await sandbox.writeFile(`/workspace/jobs/${id}.sh`, wrapped);
      await sandbox.exec(`chmod +x /workspace/jobs/${id}.sh`);
      await sandbox.startProcess(`bash /workspace/jobs/${id}.sh`, { cwd: "/workspace" });

      return cors({ ok: true, status: "running", jobId: id, summary: plan.summary || "", notes: plan.notes || "" });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const id = url.searchParams.get("id");
      if (!id || !/^job-[a-z0-9-]+$/i.test(id)) return cors({ error: "invalid job id" }, 400);
      const s = await sandbox.readFile(jobStatusPath(id)).catch(() => "{}");
      const output = await sandbox.readFile(jobOutputPath(id)).catch(() => "");
      let state: any;
      try { state = JSON.parse(s as string); } catch { state = { status: "unknown" }; }
      return cors({ ...state, output: String(output).slice(-30000) });
    }

    return cors({ error: "not found" }, 404);
  },
};
