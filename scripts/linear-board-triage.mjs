import fs from "node:fs";
import path from "node:path";

// 唯一允许写入的范围：Linear 自带入门模板 + 已完成使命的连通性测试。其他任何标识符一律拒绝。
export const ALLOWED_ISSUES = Object.freeze(["LTZ-1", "LTZ-2", "LTZ-3", "LTZ-4", "LTZ-9"]);
export const DEFAULT_ENDPOINT = "https://api.linear.app/graphql";

const ISSUE_QUERY = `query LtzzzTriageIssue($id:String!){
  issue(id:$id){
    id identifier title
    team{ key states{ nodes{ id name type position } } }
    state{ id name type }
  }
}`;

const MARK_DONE = `mutation LtzzzMarkDone($id:String!,$stateId:String!){
  issueUpdate(id:$id,input:{stateId:$stateId}){ success issue{ identifier state{ name type } } }
}`;

const ARCHIVE = `mutation LtzzzArchiveIssue($id:String!){
  issueArchive(id:$id){ success }
}`;

export function parseIssueList(value) {
  const list = String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) throw Error("issues_required");
  const bad = list.filter((id) => !ALLOWED_ISSUES.includes(id));
  if (bad.length) throw Error("not_allowlisted:" + bad.join(","));
  return [...new Set(list)];
}

export function pickDoneState(states) {
  const done = (states || []).find((s) => s.type === "completed");
  if (!done) throw Error("no_completed_state");
  return done;
}

async function graphql({ key, query, variables, fetcher, endpoint }) {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload || payload.errors || !payload.data) {
    return { ok: false, http: response.status, errors: (payload?.errors || []).map((e) => String(e?.message || e)).slice(0, 5) };
  }
  return { ok: true, http: response.status, data: payload.data };
}

export async function triageIssues({ key, issues, action = "done", confirm = false, fetcher = fetch, endpoint = DEFAULT_ENDPOINT, clock = Date.now }) {
  if (typeof key !== "string" || !key.trim()) throw Error("linear_key_required");
  if (!["done", "archive"].includes(action)) throw Error("invalid_action");
  const list = parseIssueList(issues);
  const results = [];
  for (const identifier of list) {
    const read = await graphql({ key: key.trim(), query: ISSUE_QUERY, variables: { id: identifier }, fetcher, endpoint });
    if (!read.ok) { results.push({ identifier, ok: false, step: "read", http: read.http, errors: read.errors }); continue; }
    const issue = read.data.issue;
    if (!issue) { results.push({ identifier, ok: false, step: "read", error: "issue_not_found" }); continue; }
    let planned;
    try {
      planned = action === "done" ? { state_name: pickDoneState(issue.team?.states?.nodes).name } : { archive: true };
    } catch (err) {
      results.push({ identifier, ok: false, step: "plan", error: String(err.message) });
      continue;
    }
    if (!confirm) { results.push({ identifier, ok: true, step: "dry_run", planned, before: issue.state?.name ?? null }); continue; }
    const write = action === "done"
      ? await graphql({ key: key.trim(), query: MARK_DONE, variables: { id: issue.id, stateId: pickDoneState(issue.team?.states?.nodes).id }, fetcher, endpoint })
      : await graphql({ key: key.trim(), query: ARCHIVE, variables: { id: issue.id }, fetcher, endpoint });
    results.push({
      identifier,
      ok: write.ok && Boolean(write.data?.issueUpdate?.success ?? write.data?.issueArchive?.success),
      step: "write",
      before: issue.state?.name ?? null,
      after: write.ok ? (write.data?.issueUpdate?.issue?.state?.name ?? (action === "archive" ? "archived" : null)) : null,
      http: write.http,
      errors: write.ok ? null : write.errors,
    });
  }
  return { ok: results.every((r) => r.ok), action, confirmed: confirm, results, finished_at_utc: new Date(clock()).toISOString() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (name, fallback = null) => {
    const i = args.indexOf("--" + name);
    return i > -1 ? args[i + 1] : fallback;
  };
  try {
    const issues = parseIssueList(get("issues", ALLOWED_ISSUES.join(",")));
    const action = get("action", "done");
    const confirm = args.includes("--confirm");
    const out = get("out");
    triageIssues({ key: process.env.LINEAR_API_KEY, issues, action, confirm })
      .then((report) => {
        if (out) {
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
        }
        console.log(JSON.stringify(report));
        process.exit(report.ok ? 0 : 1);
      })
      .catch((err) => { console.error(JSON.stringify({ ok: false, error: String(err?.message || err) })); process.exit(2); });
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: String(err.message) }));
    process.exit(2);
  }
}
