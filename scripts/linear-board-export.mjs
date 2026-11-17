import fs from "node:fs";
import path from "node:path";
import {readLinearBoard} from "./lib/linear-read.mjs";

export const OUT_PATH = "ops/dispatch/inbox/gpt/linear-board-latest.json";
export const SCHEMA = "ltzzz.linear-board-export.v1";

const PRIORITY_NAMES = ["No priority", "Urgent", "High", "Medium", "Low"];

export function priorityName(value) {
  return Number.isInteger(value) && value >= 0 && value < PRIORITY_NAMES.length
    ? PRIORITY_NAMES[value]
    : null;
}

// 纯函数：把一次成功读取映射成可提交的看板快照。失败读取必须拒绝，不能产出空看板。
export function buildBoardExport(board, {clock = Date.now, reader = "ltzzz-deploy-seat"} = {}) {
  if (!board || board.ok !== true || !Array.isArray(board.issues)) {
    throw Error("board_read_not_ok");
  }
  const nowIso = new Date(clock()).toISOString();
  return {
    schema: SCHEMA,
    source: "native_linear_api_read",
    reader,
    credential_binding: "LINEAR_API_KEY_actions_secret",
    workspace: {
      name: board.organization?.name ?? null,
      url_key: board.organization?.url_key ?? null,
      url: board.organization?.url_key ? `https://linear.app/${board.organization.url_key}` : null,
    },
    viewer: board.viewer?.name ?? null,
    read_started_at_utc: board.read_at_utc ?? null,
    read_finished_at_utc: nowIso,
    snapshot_semantics: "atomic_single_query",
    status: "verified_snapshot",
    stale_after_seconds: 86400,
    writes_performed: false,
    response_sha256: board.response_sha256 ?? null,
    issue_count: board.issues.length,
    issues: board.issues.map((n) => ({
      id: n.identifier,
      title: n.title,
      status: n.state,
      status_type: n.state_type ?? null,
      priority: {value: n.priority ?? null, name: priorityName(n.priority)},
      updated_at: n.updated_at ?? null,
      linear_url: n.url ?? null,
      comments: (n.comments || []).map((c) => ({id: c.id, created_at: c.created_at, excerpt: c.excerpt})),
    })),
    public_redaction: {
      full_comment_bodies: false,
      customer_inputs: false,
      author_profiles: false,
      credentials: false,
      oauth_links_or_codes: false,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    console.error(JSON.stringify({error: "linear_key_not_configured", wrote: false}));
    process.exit(2);
  }
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex > -1 ? process.argv[outIndex + 1] : OUT_PATH;
  readLinearBoard({key, first: 100})
    .then((board) => {
      const snapshot = buildBoardExport(board);
      fs.mkdirSync(path.dirname(outPath), {recursive: true});
      fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
      console.log(JSON.stringify({
        ok: true,
        out: outPath,
        issue_count: snapshot.issue_count,
        read_at_utc: snapshot.read_finished_at_utc,
        writes_performed: false,
      }));
    })
    .catch((err) => {
      console.error(JSON.stringify({ok: false, error: String(err?.message || err), wrote: false}));
      process.exit(1);
    });
}