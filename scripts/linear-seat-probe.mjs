import fs from 'node:fs';
import path from 'node:path';
import {readLinearBoard} from './lib/linear-read.mjs';

export const SEATS = ['deepseek', 'doubao', 'qianwen', 'kimi', 'grok', 'gpt', 'claude'];
export const RESULT_DIR = 'knowledge/results/linear';
export const SCHEMA = 'ltzzz.linear-seat-readback.v1';

/**
 * 让一个席位读一次 Linear，并把结果写成可回读的回执。
 * 只做读取：不创建、不评论、不改状态。
 * 凭据只从调用方传入的 key 取，不写入回执、不回显。
 */
export async function probeSeat({seat, key, resultDir = RESULT_DIR, fetcher = fetch, clock = Date.now} = {}) {
  if (!SEATS.includes(seat)) throw Error('unknown_seat');
  if (typeof key !== 'string' || !key.trim()) throw Error('linear_key_not_configured');

  const board = await readLinearBoard({key, fetcher, seat, clock});
  const record = {
    schema: SCHEMA,
    seat,
    ok: board.ok,
    http: board.http ?? null,
    error: board.ok ? null : board.error,
    graphql_errors: board.graphql_errors ?? null,
    viewer_name: board.viewer?.name ?? null,
    organization: board.organization ?? null,
    issue_count: board.issue_count ?? null,
    issue_identifiers: board.ok ? board.issues.map((i) => i.identifier) : null,
    issue_states: board.ok
      ? board.issues.map((i) => ({identifier: i.identifier, state: i.state, priority: i.priority}))
      : null,
    response_sha256: board.response_sha256 ?? null,
    // 读到的内容与凭据分离：回执里没有 key，也没有评论全文。
    source_type: board.ok ? 'native_linear_api_read' : 'failed_read',
    credential_binding: 'LINEAR_API_KEY_actions_secret',
    read_at_utc: board.read_at_utc,
    writes_performed: false,
  };

  fs.mkdirSync(resultDir, {recursive: true});
  const file = path.join(resultDir, `${seat}-readback.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', 'utf8');

  return {record, file, board};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seat = process.argv[2];
  const key = process.env.LINEAR_API_KEY;
  if (!seat) {
    console.error(JSON.stringify({error: 'usage: node scripts/linear-seat-probe.mjs <seat>'}));
    process.exit(2);
  }
  probeSeat({seat, key})
    .then(({record, file}) => {
      console.log(JSON.stringify({
        seat: record.seat,
        ok: record.ok,
        http: record.http,
        error: record.error,
        viewer: record.viewer_name,
        org: record.organization?.url_key ?? null,
        issue_count: record.issue_count,
        identifiers: record.issue_identifiers,
        sha256: record.response_sha256,
        receipt: file,
        read_at_utc: record.read_at_utc,
      }));
      process.exit(record.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error(JSON.stringify({error: String(e?.message || e)}));
      process.exit(3);
    });
}
