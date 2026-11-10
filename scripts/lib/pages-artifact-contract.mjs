// Pages artifact 契约：一个 workflow run 内，名为 github-pages 的 artifact
// 必须恰好一份，且 deploy-pages 消费的就是那一份。
//
// 失败 run 42765758716 的实际形态：同一个 job 被重跑（run_attempt=2），
// attempt 1 在 06:01:53 上传了一份 github-pages，attempt 2 在 06:02:52 又上传一份，
// GitHub 不清理前一 attempt 的 artifact，于是该 run 里出现两份同名 artifact，
// deploy-pages 无法判定该用哪一份，直接报
//   Multiple artifacts named "github-pages" were unexpectedly found ... count is 2.
//
// 契约因此拆成两道：
//   pre-upload  上传前看本 run 是否已有 github-pages：没有则上传；已有一份则复用
//               （重跑场景，同一 head commit 同一份内容）；多于一份立即失败。
//   pre-deploy  部署前断言恰好一份，否则失败并给出诊断，绝不静默选一个。
//
// 注意：这里刻意不做"删除多余 artifact"来让报错消失 —— 那是掩盖，不是修复。

export const PAGES_ARTIFACT_NAME = 'github-pages';

const ids = (rows) => rows.map((r) => r.id).filter((v) => v !== undefined && v !== null);

export function analyzePagesArtifacts(rawArtifacts, {mode = 'pre-upload'} = {}) {
  if (!Array.isArray(rawArtifacts)) throw Error('pages_artifact_list_invalid');
  if (mode !== 'pre-upload' && mode !== 'pre-deploy') throw Error('pages_artifact_mode_invalid');

  const pages = rawArtifacts.filter((a) => a && typeof a === 'object' && a.name === PAGES_ARTIFACT_NAME);
  const count = pages.length;

  if (count > 1) {
    // 两个 mode 下这都是契约已被破坏的硬失败，必须人工诊断而不是绕过。
    return {
      ok: false,
      action: 'fail',
      reason: 'multiple_pages_artifacts',
      count,
      artifact_ids: ids(pages),
    };
  }

  if (mode === 'pre-upload') {
    if (count === 0) return {ok: true, action: 'upload', reason: 'no_pages_artifact', count: 0};
    return {ok: true, action: 'reuse', reason: 'existing_pages_artifact_reused', count: 1, artifact_ids: ids(pages)};
  }

  // pre-deploy
  if (count === 0) {
    return {ok: false, action: 'fail', reason: 'no_pages_artifact', count: 0};
  }
  return {ok: true, action: 'deploy', reason: 'exactly_one_pages_artifact', count: 1, artifact_ids: ids(pages)};
}

export function renderDiagnostics(result, context = {}) {
  const lines = [
    `pages_artifact_contract: ${result.ok ? 'ok' : 'violated'}`,
    `mode=${context.mode ?? 'unknown'} action=${result.action} reason=${result.reason} count=${result.count}`,
  ];
  if (context.repository) lines.push(`repository=${context.repository}`);
  if (context.run_id) lines.push(`run_id=${context.run_id}`);
  if (context.run_attempt) lines.push(`run_attempt=${context.run_attempt}`);
  if (result.artifact_ids?.length) lines.push(`artifact_ids=${result.artifact_ids.join(',')}`);
  if (!result.ok && result.reason === 'multiple_pages_artifacts') {
    lines.push(
      'diagnosis: 同一 run 内出现多份 github-pages。最常见成因是该 run 被重跑（run_attempt>1），',
      '前一 attempt 的 artifact 未被清理。本契约的修法是让重跑复用已有 artifact、并在部署前断言唯一，',
      '不是删除多余 artifact。',
    );
  }
  return lines.join('\n');
}
