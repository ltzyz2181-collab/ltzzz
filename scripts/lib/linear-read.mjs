import {createHash} from 'node:crypto';

export const DEFAULT_ENDPOINT = 'https://api.linear.app/graphql';

// 只读查询：只取看板与评论摘要，不含任何 mutation。
const BOARD_QUERY = `query LtzzzBoard($first:Int!){
  viewer{name email}
  organization{name urlKey}
  issues(first:$first,orderBy:updatedAt){
    pageInfo{hasNextPage}
    nodes{
      identifier title priority updatedAt url
      state{name type}
      comments(first:3){nodes{id body createdAt}}
    }
  }
}`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * 读取 LTZZZ Linear 看板。凭据只经参数或调用方环境传入，不写盘、不回显。
 * 只读：任何失败都返回可判别错误，不静默当成空看板。
 */
export async function readLinearBoard({
  key,
  fetcher = fetch,
  endpoint = DEFAULT_ENDPOINT,
  first = 30,
  seat = null,
  clock = Date.now,
} = {}) {
  if (typeof key !== 'string' || !key.trim()) throw Error('linear_key_required');
  if (!Number.isInteger(first) || first < 1 || first > 100) throw Error('invalid_page_size');

  const body = JSON.stringify({query: BOARD_QUERY, variables: {first}});
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {Authorization: key.trim(), 'Content-Type': 'application/json'},
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });

  const http = response.status;
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  // 上游 200 但带 errors，或非 2xx，都不能当作"读到了"。
  if (!response.ok || !payload || payload.errors || !payload.data) {
    return {
      ok: false,
      http,
      error: 'linear_graphql_failed',
      graphql_errors: (payload?.errors || []).map((e) => String(e?.message || e)).slice(0, 5),
      seat,
      read_at_utc: new Date(clock()).toISOString(),
    };
  }

  const data = payload.data;
  const nodes = (data.issues?.nodes || []).map((n) => ({
    identifier: n.identifier,
    title: n.title,
    priority: n.priority ?? null,
    state: n.state?.name ?? null,
    state_type: n.state?.type ?? null,
    updated_at: n.updatedAt ?? null,
    url: n.url ?? null,
    // 评论只留去敏摘要与 ID/时间，不搬全文。
    comments: (n.comments?.nodes || []).map((c) => ({
      id: c.id,
      created_at: c.createdAt ?? null,
      excerpt: String(c.body || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    })),
  }));

  return {
    ok: true,
    http,
    seat,
    viewer: {name: data.viewer?.name ?? null, email: data.viewer?.email ?? null},
    organization: {name: data.organization?.name ?? null, url_key: data.organization?.urlKey ?? null},
    issue_count: nodes.length,
    has_next_page: Boolean(data.issues?.pageInfo?.hasNextPage),
    issues: nodes,
    response_sha256: sha256(JSON.stringify(nodes)),
    read_at_utc: new Date(clock()).toISOString(),
  };
}
