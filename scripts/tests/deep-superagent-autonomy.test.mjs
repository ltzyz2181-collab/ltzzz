import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AUTONOMY_REVISION,
  applyRepoContext,
  deniedWritePath,
  executeAutonomy,
  extractFileWrites,
  readPostMergeRuns,
  fiduciaryHit,
  fiduciaryInstructionHit,
  normalizeAutonomy,
  readRepoContext,
  repoContextBudget,
  stripRepoEvidence,
  syntaxGate,
  stripAutonomy,
  taskAutonomyMetadata,
  validateWrites,
} from '../deep-autonomy.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'deep-autonomy-'));

test('readPostMergeRuns：合并瞬间没有 run 时有界轮询，出现即返回', async () => {
  let calls = 0;
  const sleeps = [];
  const fetcher = async (url) => {
    calls += 1;
    const isFallback = !String(url).includes('head_sha=');
    const workflow_runs = isFallback || calls < 2 ? [] : [{id: 1, name: 'Deploy static site to GitHub Pages', event: 'push', status: 'completed', conclusion: 'success', head_sha: 'abc'}];
    return {status: 200, ok: true, text: async () => JSON.stringify({workflow_runs})};
  };
  const result = await readPostMergeRuns({fetcher, token: 't', repository: 'o/r', sha: 'abc', attempts: 4, intervalMs: 7, sleep: async (ms) => { sleeps.push(ms); }});
  assert.equal(result.count, 1);
  assert.equal(result.attempts, 2);
  assert.deepEqual(sleeps, [7]);
  assert.equal(result.runs[0].event, 'push');
  assert.equal(result.used_fallback_list, false);
});

test('readPostMergeRuns：head_sha 过滤未索引时回退最近列表并按 sha 本地过滤', async () => {
  const fetcher = async (url) => {
    const isFallback = !String(url).includes('head_sha=');
    const workflow_runs = isFallback
      ? [{id: 9, name: 'Deploy static site to GitHub Pages', event: 'push', status: 'queued', conclusion: null, head_sha: 'abc'},
         {id: 10, name: 'Small payment policy offline validation (no payment)', event: 'push', status: 'queued', conclusion: null, head_sha: 'other'}]
      : [];
    return {status: 200, ok: true, text: async () => JSON.stringify({workflow_runs})};
  };
  const result = await readPostMergeRuns({fetcher, token: 't', repository: 'o/r', sha: 'abc', attempts: 3, intervalMs: 1, sleep: async () => {}});
  assert.equal(result.count, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.used_fallback_list, true);
  assert.equal(result.runs[0].id, 9);
});

test('readPostMergeRuns：回退列表里 sha 不匹配时不误记', async () => {
  const fetcher = async (url) => {
    const isFallback = !String(url).includes('head_sha=');
    const workflow_runs = isFallback ? [{id: 10, name: 'X', event: 'push', status: 'queued', conclusion: null, head_sha: 'other'}] : [];
    return {status: 200, ok: true, text: async () => JSON.stringify({workflow_runs})};
  };
  const result = await readPostMergeRuns({fetcher, token: 't', repository: 'o/r', sha: 'abc', attempts: 2, intervalMs: 1, sleep: async () => {}});
  assert.equal(result.count, 0);
  assert.equal(result.attempts, 2);
  assert.equal(result.used_fallback_list, false);
});

test('readPostMergeRuns：始终没有 run 时按上限结束并如实返回 0', async () => {
  let calls = 0;
  const result = await readPostMergeRuns({fetcher: async () => { calls += 1; return {status: 200, ok: true, text: async () => JSON.stringify({workflow_runs: []})}; }, token: 't', repository: 'o/r', sha: 'abc', attempts: 3, intervalMs: 1, sleep: async () => {}});
  assert.equal(calls, 6);
  assert.equal(result.count, 0);
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.runs, []);
  assert.equal(result.used_fallback_list, false);
});

test('normalizeAutonomy：缺省返回 null，非法字段一律拒绝', () => {
  assert.equal(normalizeAutonomy(undefined), null);
  assert.equal(normalizeAutonomy(null), null);
  assert.throws(() => normalizeAutonomy([]), /invalid_autonomy/);
  assert.throws(() => normalizeAutonomy({mode: 'auto', extra: true}), /invalid_autonomy_field/);
  assert.throws(() => normalizeAutonomy({mode: 'manual'}), /invalid_autonomy_mode/);
});

test('normalizeAutonomy：接受 repo_read / code_change / deploy / mail', () => {
  const value = normalizeAutonomy({
    mode: 'auto',
    repo_read: ['scripts/run-deep-superagent-queue.mjs', 'scripts/run-deep-superagent-queue.mjs'],
    code_change: true,
    deploy: {workflow: 'deep-superagent-daily.yml'},
    mail: {to: ['owner@example.com'], subject: '汇报', body: '正文'},
  });
  assert.deepEqual(value.repo_read, ['scripts/run-deep-superagent-queue.mjs']);
  assert.equal(value.code_change, true);
  assert.deepEqual(value.deploy, {workflow: 'deep-superagent-daily.yml'});
  assert.equal(value.mail.subject, '汇报');
  assert.equal(value.mail.body_from_output, false);
});

test('normalizeAutonomy：拒绝路径穿越、凭据路径、非白名单收件人', () => {
  assert.throws(() => normalizeAutonomy({mode: 'auto', repo_read: ['../x']}), /invalid_repo_read_path/);
  assert.throws(() => normalizeAutonomy({mode: 'auto', repo_read: ['.env']}), /denied_repo_read_path/);
  assert.deepEqual(normalizeAutonomy({mode: 'auto', repo_read: ['config/owner-authority-20261105.json']}).repo_read, ['config/owner-authority-20261105.json']);
  assert.throws(
    () => normalizeAutonomy({mode: 'auto', mail: {to: ['other@example.com'], subject: 'x', body: 'y'}}, {allowedMailTo: 'owner@example.com'}),
    /mail_recipient_not_allowlisted/,
  );
  assert.throws(() => normalizeAutonomy({mode: 'auto', deploy: {workflow: '../evil.yml'}}), /invalid_deploy_workflow/);
});

test('normalizeAutonomy：多收件人 AI 互发邮件，名单内全部放行', () => {
  const value = normalizeAutonomy({mode: 'auto', mail: {to: ['Owner@Example.com', 'deep@example.com', 'owner@example.com'], subject: '互通', body: '正文'}}, {allowedMailTo: ['owner@example.com', 'deep@example.com']});
  assert.deepEqual(value.mail.to, ['Owner@Example.com', 'deep@example.com']);
  assert.throws(() => normalizeAutonomy({mode: 'auto', mail: {to: Array.from({length: 9}, (_, i) => `seat${i}@example.com`), subject: 'x', body: 'y'}}), /invalid_mail_to/);
});

test('deniedWritePath：owner 授权、资金、凭据文件与通道脚本不可自动改写；普通工作流/配置已放开', () => {
  assert.equal(deniedWritePath('.github/workflows/deep-superagent-queue.yml'), null);
  assert.equal(deniedWritePath('config/deep-autonomy-20261119.json'), null);
  assert.equal(deniedWritePath('config/deep-superagent.json'), null);
  assert.equal(deniedWritePath('config/owner-authority-20261105.json'), 'authority_config');
  assert.equal(deniedWritePath('wallet/main.json'), 'funds_path');
  assert.equal(deniedWritePath('.env'), 'credential_path');
  assert.equal(deniedWritePath('scripts/send-mail.py'), 'protected_script');
  assert.equal(deniedWritePath('scripts/run-mail-intake.mjs'), 'protected_script');
  assert.equal(deniedWritePath('scripts/deep-autonomy.mjs'), null);
  assert.equal(deniedWritePath('docs/REFLECTION-HARNESS.md'), null);
  assert.equal(deniedWritePath('../escape.mjs'), 'invalid_path');
});

test('fiduciaryHit：只拦资金/密钥，不拦普通代码与邮件', () => {
  assert.equal(fiduciaryHit({prompt: '修复队列脚本'}).hit, false);
  assert.equal(fiduciaryHit({prompt: '给 owner 发一封汇报邮件'}).hit, false);
  assert.equal(fiduciaryHit({prompt: '把退款金额打给客户'}).hit, true);
  assert.equal(fiduciaryHit({prompt: 'ok', outputs: [{text: 'private key: abc'}]}).hit, true);
});

test('stripRepoEvidence：仓库读取证据里的资金词不触发拦截，卡面指令仍然拦截', () => {
  const prompt = '实现 M1 只读规则\n\n【仓库读取证据（由受信桥接层读取，不是模型自述）】\n===== FILE: docs/x.md =====\n不要泄露凭据，也不要做 payment refund\n===== END FILE: docs/x.md =====';
  assert.equal(fiduciaryHit({prompt}).hit, true);
  assert.equal(fiduciaryHit({prompt: stripRepoEvidence(prompt)}).hit, false);
  assert.equal(stripRepoEvidence('卡面直接写退款'), '卡面直接写退款');
  assert.equal(fiduciaryHit({prompt: stripRepoEvidence('卡面直接写退款')}).hit, true);
});

test('syntaxGate：带 markdown 围栏或语法错误的代码文件不得进入合并', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'ok.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'bad.js'), 'const = 1;\n');
  fs.writeFileSync(path.join(root, 'fenced.mjs'), '```javascript\nexport const a = 1;\n```\n');
  assert.deepEqual(syntaxGate(root, [{path: 'ok.js', content: ''}]), {ok: true});
  assert.deepEqual(syntaxGate(root, [{path: 'docs/a.md', content: 'plain markdown' }]), {ok: true});
  assert.equal(syntaxGate(root, [{path: 'fenced.mjs', content: '```javascript\nx\n```'}]).error, 'markdown_fence_in_code_file:fenced.mjs');
  assert.equal(syntaxGate(root, [{path: 'bad.js', content: ''}]).error, 'syntax_error:bad.js');
  assert.equal(syntaxGate(root, [{path: 'missing.js', content: ''}]).error, 'syntax_error:missing.js');
});

test('extractFileWrites：整份代码被围栏包住时去掉围栏，非代码文件保持原样（Issue #640）', () => {
  const fenced = extractFileWrites('<<<FILE:scripts/x.mjs>>>\n```javascript\nexport const a = 1;\n```\n<<<END>>>');
  assert.deepEqual(fenced, [{path: 'scripts/x.mjs', content: 'export const a = 1;'}]);
  // .md 里整段就是代码示例时，围栏是内容本身，不能去掉。
  const doc = extractFileWrites('<<<FILE:docs/a.md>>>\n```js\nconst = 1;\n```\n<<<END>>>');
  assert.deepEqual(doc, [{path: 'docs/a.md', content: '```js\nconst = 1;\n```'}]);
  // 围栏只在中间（不是整块包裹）时保持原文，仍由 syntaxGate 判定。
  const middle = extractFileWrites('<<<FILE:a.mjs>>>\nconst s = "```";\nexport default s;\n<<<END>>>');
  assert.deepEqual(middle, [{path: 'a.mjs', content: 'const s = "```";\nexport default s;'}]);
});

test('extractFileWrites：只认显式 FILE 块，重复路径按后写覆盖先写并留下审计', () => {
  const writes = extractFileWrites('说明\n<<<FILE:docs/a.md>>>\n# A\n<<<END>>>\n尾巴');
  assert.deepEqual(writes, [{path: 'docs/a.md', content: '# A'}]);
  assert.deepEqual(extractFileWrites('没有文件块'), []);
  // 2026-11-21 run 44879913406/44881730792：模型把同一路径输出两遍，整单被 duplicate_file 拒绝。
  const repeated = '<<<FILE:a.md>>>\n# A\n<<<END>>>\n<<<FILE:a.md>>>\n# A\n<<<END>>>';
  const same = extractFileWrites(repeated);
  assert.deepEqual(same, [{path: 'a.md', content: '# A'}]);
  assert.deepEqual(same.duplicates, [{path: 'a.md', identical: true}]);
  const conflicting = '<<<FILE:a.md>>>\n# A\n<<<END>>>\n<<<FILE:a.md>>>\n# B\n<<<END>>>';
  const revised = extractFileWrites(conflicting);
  assert.deepEqual(revised, [{path: 'a.md', content: '# B'}]);
  assert.deepEqual(revised.duplicates, [{path: 'a.md', identical: false}]);
  assert.deepEqual(validateWrites(revised), {ok: true, writes: revised});
});

test('validateWrites：拒绝空集、重复、超量、受保护路径', () => {
  assert.equal(validateWrites([]).error, 'no_file_writes');
  assert.equal(validateWrites([{path: 'a.md', content: '1'}, {path: 'a.md', content: '2'}]).error, 'duplicate_file:a.md');
  assert.deepEqual(validateWrites([{path: '.github/workflows/x.yml', content: 'name: x\n'}]), {ok: true, writes: [{path: '.github/workflows/x.yml', content: 'name: x\n'}]});
  const many = Array.from({length: 7}, (_, i) => ({path: `f${i}.md`, content: 'x'}));
  assert.equal(validateWrites(many).error, 'too_many_files');
});

test('validateWrites：deep-autonomy 配置不得移除五个保留家族', () => {
  const families = ['funds', 'refund_terminal', 'signing', 'private_keys', 'wallet_operations'];
  const okConfig = JSON.stringify({still_requires_gpt_decision: families.map((family) => ({family}))});
  assert.deepEqual(validateWrites([{path: 'config/deep-autonomy-20261119.json', content: okConfig}]).ok, true);
  const missing = JSON.stringify({still_requires_gpt_decision: families.slice(0, 4).map((family) => ({family}))});
  assert.match(validateWrites([{path: 'config/deep-autonomy-20261119.json', content: missing}]).error, /reserved_family_removed:wallet_operations/);
  assert.match(validateWrites([{path: 'config/deep-autonomy-20261119.json', content: 'not json'}]).error, /reserved_family_unparseable/);
});

test('readRepoContext / applyRepoContext：注入真实文件证据并记录缺失', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.md'), 'hello');
  const context = readRepoContext(root, ['a.md', 'missing.md']);
  assert.match(context.text, /hello/);
  assert.deepEqual(context.files.map((file) => file.status), ['read', 'missing']);
  const body = applyRepoContext({prompt: 'P'}, context);
  assert.ok(body.prompt.startsWith('P'));
  assert.match(body.prompt, /仓库读取证据/);
});

test('readRepoContext：超过桥接预算的文件不注入，只记 size_budget_exceeded（run 46096350431）', () => {
  const root = tmp();
  // worker 的 prompt 上限是 20,000 字符；53KB 的 latest.json 曾在 POST 后才被拒绝。
  fs.writeFileSync(path.join(root, 'latest.json'), 'x'.repeat(53 * 1024));
  fs.writeFileSync(path.join(root, 'summary.json'), '{"oldest":[]}');
  const context = readRepoContext(root, ['latest.json', 'summary.json']);
  assert.deepEqual(context.files.map((file) => file.status), ['size_budget_exceeded', 'read']);
  assert.doesNotMatch(context.text, /x{100}/);
  assert.match(context.text, /summary\.json/);
  const body = applyRepoContext({prompt: 'P'.repeat(3500)}, context);
  assert.ok(body.prompt.length < 20000, 'prompt 必须落在 worker 的 20,000 字符上限内');
});

test('repoContextBudget：证据预算按卡面 prompt 剩余空间收缩（run 46097201873）', () => {
  // Issue #640 卡面 9,852 字符；固定 16KB 证据叠加后 23,578 字符，POST 被 worker 拒绝。
  const longPrompt = 'P'.repeat(9852);
  const budget = repoContextBudget(longPrompt);
  assert.ok(budget > 0);
  assert.ok(budget < 16 * 1024);
  assert.equal(repoContextBudget('P'.repeat(19500)), 0);
  assert.equal(repoContextBudget('P'.repeat(20000)), 0);
});

test('readRepoContext：长卡面下只注入放得下的文件，整条 prompt 不越界', () => {
  const root = tmp();
  // 用 #640 的真实大小模拟：12,439 B 放不下，2,599 B 与 758 B 放得下。
  fs.writeFileSync(path.join(root, 'policy.json'), 'p'.repeat(12439));
  fs.writeFileSync(path.join(root, 'seats.md'), `# seats\n${'s'.repeat(2599 - 8)}`);
  fs.writeFileSync(path.join(root, 'state.json'), `{"open":true}`);
  const prompt = 'P'.repeat(9852);
  const context = readRepoContext(root, ['policy.json', 'seats.md', 'state.json'], {limitBytes: repoContextBudget(prompt)});
  assert.deepEqual(context.files.map((file) => file.status), ['size_budget_exceeded', 'read', 'read']);
  assert.doesNotMatch(context.text, /p{100}/);
  assert.match(context.text, /seats\.md/);
  const body = applyRepoContext({prompt}, context);
  assert.ok(body.prompt.length <= 19000, `prompt chars ${body.prompt.length}`);
  assert.ok(Buffer.byteLength(body.prompt) <= 29 * 1024, `prompt bytes ${Buffer.byteLength(body.prompt)}`);
  assert.ok(Buffer.byteLength(JSON.stringify({prompt: body.prompt})) <= 32768);
});

test('applyRepoContext：外部构造的超长证据被截断并标记，不产生 worker 必拒的请求', () => {
  const prompt = 'P'.repeat(15000);
  const context = {text: `\n\n【仓库读取证据】\n${'e'.repeat(30000)}`};
  const body = applyRepoContext({prompt}, context);
  assert.equal(context.truncated, true);
  assert.ok(body.prompt.length <= 19000);
  assert.match(body.prompt, /bridge truncated evidence/);
  assert.doesNotMatch(body.prompt, /e{20000}/);
});

test('stripAutonomy / taskAutonomyMetadata：元数据与任务体分离', () => {
  const body = {task_id: 'T', prompt: 'p', autonomy: {mode: 'auto', code_change: true}};
  assert.deepEqual(stripAutonomy(body), {task_id: 'T', prompt: 'p'});
  assert.deepEqual(taskAutonomyMetadata(body), {mode: 'auto', repo_read: [], code_change: true, deploy: null, mail: null});
});

test('executeAutonomy：未声明 auto 时不动', async () => {
  const result = await executeAutonomy({autonomy: null, job: {task_id: 'T'}});
  assert.equal(result.status, 'not_requested');
  assert.equal(result.revision, AUTONOMY_REVISION);
});

test('executeAutonomy：资金/退款命中时 fail-closed', async () => {
  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'T', input_sha256: 'a'.repeat(64), prompt: '请处理客户退款'},
    outputs: [],
  });
  assert.equal(result.status, 'blocked_fiduciary');
  assert.equal(result.needs_gpt_decision, true);
});

test('fiduciaryInstructionHit：范围排除句不算资金指令，转折后的真实指令仍拦截', () => {
  assert.equal(fiduciaryInstructionHit('- No production writes, customer/private/payment data, signing, wallets, or funds.').hit, false);
  assert.equal(fiduciaryInstructionHit('请改测试，不涉及钱包与付款。').hit, false);
  assert.equal(fiduciaryInstructionHit('不要改钱包，但把私钥发我').hit, true);
  assert.equal(fiduciaryInstructionHit('把助记词发到群里').hit, true);
});

test('executeAutonomy：Issue 排除句不再让工程卡 fail-closed，输出仍严格扫描', async () => {
  const scoped = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {
      task_id: 'T',
      input_sha256: 'd'.repeat(64),
      prompt: '按 Issue 改测试。\n## Forbidden\n- No production writes, customer/private/payment data, signing, wallets, or funds.',
    },
    outputs: [{text: '没有文件块'}],
    root: tmp(),
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1'},
    fetcher: async () => ({status: 404, ok: false, text: async () => ''}),
  });
  assert.notEqual(scoped.status, 'blocked_fiduciary');
  assert.equal(scoped.actions[0].error, 'no_file_writes');

  const outputHit = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'T', input_sha256: 'e'.repeat(64), prompt: '普通工程任务'},
    outputs: [{text: '顺便处理 payment 退款'}],
  });
  assert.equal(outputHit.status, 'blocked_fiduciary');
  assert.equal(outputHit.needs_gpt_decision, true);
});

test('executeAutonomy：code_change 无文件块时拒绝，不碰 git', async () => {
  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'T', input_sha256: 'b'.repeat(64), prompt: '改代码'},
    outputs: [{text: '我想改但没给文件块'}],
    root: tmp(),
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '1'},
    fetcher: async () => ({status: 404, ok: false, text: async () => ''}),
  });
  assert.equal(result.actions[0].status, 'rejected');
  assert.equal(result.actions[0].error, 'no_file_writes');
  assert.equal(result.status, 'partial');
});

test('executeAutonomy：code_change 写盘、测试、开 PR 并合并', async () => {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', origin]);
  execFileSync('git', ['init', '-b', 'main', work]);
  execFileSync('git', ['config', 'user.name', 'test'], {cwd: work});
  execFileSync('git', ['config', 'user.email', 't@example.com'], {cwd: work});
  fs.writeFileSync(path.join(work, 'a.md'), 'old\n');
  execFileSync('git', ['add', 'a.md'], {cwd: work});
  execFileSync('git', ['commit', '-m', 'init'], {cwd: work});
  execFileSync('git', ['remote', 'add', 'origin', origin], {cwd: work});
  execFileSync('git', ['push', '-u', 'origin', 'main'], {cwd: work});

  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push(`${options.method || 'GET'} ${url}`);
    if (url.includes('/contents/')) return {status: 404, ok: false, text: async () => ''};
    if (url.endsWith('/pulls')) return {status: 201, ok: true, text: async () => JSON.stringify({number: 7})};
    if (url.endsWith('/actions/workflows/deep-autonomy-verify.yml/dispatches')) return {status: 204, ok: true, text: async () => ''};
    if (url.includes('/actions/runs?head_sha=deadbeef')) {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          workflow_runs: [{id: 300, name: 'Small payment policy offline validation (no payment)', event: 'push', status: 'completed', conclusion: 'success'}],
        }),
      };
    }
    if (url.includes('/actions/workflows/deep-autonomy-verify.yml/runs')) {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          workflow_runs: [{id: 99, head_branch: 'deep-auto/deep-1-42', status: 'completed', conclusion: 'success', html_url: 'https://example/run/99'}],
        }),
      };
    }
    if (url.endsWith('/pulls/7/merge')) return {status: 200, ok: true, text: async () => JSON.stringify({merged: true, sha: 'deadbeef'})};
    throw new Error(`unexpected ${url}`);
  };

  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'DEEP-1', input_sha256: 'c'.repeat(64), prompt: '更新文档'},
    outputs: [{text: '<<<FILE:a.md>>>\nnew\n<<<END>>>'}],
    root: work,
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '42'},
    fetcher,
    runTests: () => 'ok',
  });

  assert.equal(result.status, 'executed');
  assert.equal(result.actions[0].status, 'merged');
  assert.equal(result.actions[0].pr, 7);
  assert.equal(result.actions[0].merge_sha, 'deadbeef');
  assert.equal(result.actions[0].ci.status, 'ci_passed');
  assert.equal(result.actions[0].ci.run_id, 99);
  // 无 PAT 时如实标 github_token，并回读合并后触发的 run。
  assert.equal(result.actions[0].merge_token_kind, 'github_token');
  assert.equal(result.actions[0].post_merge_runs.count, 1);
  assert.equal(result.actions[0].post_merge_runs.runs[0].event, 'push');
  assert.equal(result.actions[0].post_merge_runs_triggered, true);
  assert.ok(calls.some((call) => call.startsWith('POST ') && call.endsWith('/pulls')));
  assert.ok(calls.some((call) => call.includes('/actions/workflows/deep-autonomy-verify.yml/dispatches')));
  const receipt = JSON.parse(fs.readFileSync(path.join(work, result.receipt_path), 'utf8'));
  assert.equal(receipt.schema, 'ltzzz.deep-superagent.autonomy.v1');
  assert.equal(receipt.financial_execution, false);
  assert.equal(receipt.secrets_included, false);
  // 合并后回到 main，回执落在 main 工作树。
  assert.equal(execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {cwd: work, encoding: 'utf8'}).trim(), 'main');
});

test('executeAutonomy：合并使用 LTZZZ_AGENT_TOKEN，避免 GITHUB_TOKEN 抑制 push 工作流', async () => {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', origin]);
  execFileSync('git', ['init', '-b', 'main', work]);
  execFileSync('git', ['config', 'user.name', 'test'], {cwd: work});
  execFileSync('git', ['config', 'user.email', 't@example.com'], {cwd: work});
  fs.writeFileSync(path.join(work, 'a.md'), 'old\n');
  execFileSync('git', ['add', 'a.md'], {cwd: work});
  execFileSync('git', ['commit', '-m', 'init'], {cwd: work});
  execFileSync('git', ['remote', 'add', 'origin', origin], {cwd: work});
  execFileSync('git', ['push', '-u', 'origin', 'main'], {cwd: work});

  let mergeAuth = null;
  const fetcher = async (url, options = {}) => {
    if (url.includes('/contents/')) return {status: 404, ok: false, text: async () => ''};
    if (url.endsWith('/pulls')) return {status: 201, ok: true, text: async () => JSON.stringify({number: 11})};
    if (url.endsWith('/actions/workflows/deep-autonomy-verify.yml/dispatches')) return {status: 204, ok: true, text: async () => ''};
    if (url.includes('/actions/workflows/deep-autonomy-verify.yml/runs')) {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          workflow_runs: [{id: 101, head_branch: 'deep-auto/deep-pat-55', status: 'completed', conclusion: 'success', html_url: 'https://example/run/101'}],
        }),
      };
    }
    if (url.endsWith('/pulls/11/merge')) {
      mergeAuth = options.headers.authorization;
      return {status: 200, ok: true, text: async () => JSON.stringify({merged: true, sha: 'cafebabe'})};
    }
    if (url.includes('/actions/runs?head_sha=cafebabe')) {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          workflow_runs: [
            {id: 301, name: 'Deploy static site to GitHub Pages', event: 'push', status: 'completed', conclusion: 'success'},
            {id: 302, name: 'Small payment policy offline validation (no payment)', event: 'push', status: 'completed', conclusion: 'success'},
          ],
        }),
      };
    }
    throw new Error(`unexpected ${url}`);
  };

  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'DEEP-PAT', input_sha256: 'd'.repeat(64), prompt: '更新文档'},
    outputs: [{text: '<<<FILE:a.md>>>\npat\n<<<END>>>'}],
    root: work,
    env: {GITHUB_TOKEN: 't', LTZZZ_AGENT_TOKEN: 'pat-token', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '55'},
    fetcher,
    runTests: () => 'ok',
  });

  assert.equal(result.actions[0].status, 'merged');
  assert.equal(result.actions[0].merge_token_kind, 'agent_token');
  assert.equal(mergeAuth, 'Bearer pat-token');
  assert.equal(result.actions[0].post_merge_runs.count, 2);
  assert.equal(result.actions[0].post_merge_runs.runs[0].event, 'push');
  assert.equal(result.actions[0].post_merge_runs_triggered, true);
});

test('executeAutonomy：CI 失败时不合并，回执记录实际 run', async () => {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', origin]);
  execFileSync('git', ['init', '-b', 'main', work]);
  execFileSync('git', ['config', 'user.name', 'test'], {cwd: work});
  execFileSync('git', ['config', 'user.email', 't@example.com'], {cwd: work});
  fs.writeFileSync(path.join(work, 'a.md'), 'old\n');
  execFileSync('git', ['add', 'a.md'], {cwd: work});
  execFileSync('git', ['commit', '-m', 'init'], {cwd: work});
  execFileSync('git', ['remote', 'add', 'origin', origin], {cwd: work});
  execFileSync('git', ['push', '-u', 'origin', 'main'], {cwd: work});

  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push(`${options.method || 'GET'} ${url}`);
    if (url.includes('/contents/')) return {status: 404, ok: false, text: async () => ''};
    if (url.endsWith('/pulls')) return {status: 201, ok: true, text: async () => JSON.stringify({number: 8})};
    if (url.endsWith('/dispatches')) return {status: 204, ok: true, text: async () => ''};
    if (url.includes('/actions/workflows/deep-autonomy-verify.yml/runs')) {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          workflow_runs: [{id: 100, head_branch: 'deep-auto/deep-ci-52', status: 'completed', conclusion: 'failure', html_url: 'https://example/run/100'}],
        }),
      };
    }
    if (url.endsWith('/pulls/8/merge')) return {status: 200, ok: true, text: async () => JSON.stringify({merged: true, sha: 'should-not-happen'})};
    throw new Error(`unexpected ${url}`);
  };

  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'DEEP-CI', input_sha256: '3'.repeat(64), prompt: '更新文档'},
    outputs: [{text: '<<<FILE:a.md>>>\nnew\n<<<END>>>'}],
    root: work,
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '52'},
    fetcher,
    runTests: () => 'ok',
  });

  assert.equal(result.actions[0].status, 'ci_failed');
  assert.equal(result.actions[0].pr, 8);
  assert.equal(result.actions[0].ci.run_id, 100);
  assert.equal(result.actions[0].merge_sha, undefined);
  assert.equal(result.status, 'partial');
  assert.ok(!calls.some((call) => call.includes('/pulls/8/merge')));
});

test('executeAutonomy：CI run 不出现时超时且不合并', async () => {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', origin]);
  execFileSync('git', ['init', '-b', 'main', work]);
  execFileSync('git', ['config', 'user.name', 'test'], {cwd: work});
  execFileSync('git', ['config', 'user.email', 't@example.com'], {cwd: work});
  fs.writeFileSync(path.join(work, 'a.md'), 'old\n');
  execFileSync('git', ['add', 'a.md'], {cwd: work});
  execFileSync('git', ['commit', '-m', 'init'], {cwd: work});
  execFileSync('git', ['remote', 'add', 'origin', origin], {cwd: work});
  execFileSync('git', ['push', '-u', 'origin', 'main'], {cwd: work});

  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push(`${options.method || 'GET'} ${url}`);
    if (url.includes('/contents/')) return {status: 404, ok: false, text: async () => ''};
    if (url.endsWith('/pulls')) return {status: 201, ok: true, text: async () => JSON.stringify({number: 9})};
    if (url.endsWith('/dispatches')) return {status: 204, ok: true, text: async () => ''};
    if (url.includes('/actions/workflows/deep-autonomy-verify.yml/runs')) {
      return {status: 200, ok: true, text: async () => JSON.stringify({workflow_runs: []})};
    }
    if (url.endsWith('/pulls/9/merge')) return {status: 200, ok: true, text: async () => JSON.stringify({merged: true, sha: 'should-not-happen'})};
    throw new Error(`unexpected ${url}`);
  };
  let now = 0;

  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'DEEP-TIMEOUT', input_sha256: '4'.repeat(64), prompt: '更新文档'},
    outputs: [{text: '<<<FILE:a.md>>>\nnew\n<<<END>>>'}],
    root: work,
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '53'},
    fetcher,
    runTests: () => 'ok',
    clock: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    ciTimeoutMs: 10000,
    ciIntervalMs: 5000,
  });

  assert.equal(result.actions[0].status, 'ci_timeout');
  assert.equal(result.actions[0].ci.error, 'ci_timeout');
  assert.ok(!calls.some((call) => call.includes('/pulls/9/merge')));
});

test('executeAutonomy：CI dispatch 失败时不合并', async () => {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', origin]);
  execFileSync('git', ['init', '-b', 'main', work]);
  execFileSync('git', ['config', 'user.name', 'test'], {cwd: work});
  execFileSync('git', ['config', 'user.email', 't@example.com'], {cwd: work});
  fs.writeFileSync(path.join(work, 'a.md'), 'old\n');
  execFileSync('git', ['add', 'a.md'], {cwd: work});
  execFileSync('git', ['commit', '-m', 'init'], {cwd: work});
  execFileSync('git', ['remote', 'add', 'origin', origin], {cwd: work});
  execFileSync('git', ['push', '-u', 'origin', 'main'], {cwd: work});

  const fetcher = async (url) => {
    if (url.includes('/contents/')) return {status: 404, ok: false, text: async () => ''};
    if (url.endsWith('/pulls')) return {status: 201, ok: true, text: async () => JSON.stringify({number: 10})};
    if (url.endsWith('/dispatches')) return {status: 500, ok: false, text: async () => 'dispatch_failed'};
    throw new Error(`unexpected ${url}`);
  };

  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'DEEP-NOCI', input_sha256: '5'.repeat(64), prompt: '更新文档'},
    outputs: [{text: '<<<FILE:a.md>>>\nnew\n<<<END>>>'}],
    root: work,
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '54'},
    fetcher,
    runTests: () => 'ok',
  });

  assert.equal(result.actions[0].status, 'ci_dispatch_failed');
  assert.equal(result.actions[0].merge_sha, undefined);
});

test('executeAutonomy：code_change 测试失败会恢复原文件且不合并', async () => {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', origin]);
  execFileSync('git', ['init', '-b', 'main', work]);
  execFileSync('git', ['config', 'user.name', 'test'], {cwd: work});
  execFileSync('git', ['config', 'user.email', 't@example.com'], {cwd: work});
  fs.writeFileSync(path.join(work, 'a.md'), 'old\n');
  execFileSync('git', ['add', 'a.md'], {cwd: work});
  execFileSync('git', ['commit', '-m', 'init'], {cwd: work});
  execFileSync('git', ['remote', 'add', 'origin', origin], {cwd: work});
  execFileSync('git', ['push', '-u', 'origin', 'main'], {cwd: work});

  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true},
    job: {task_id: 'DEEP-2', input_sha256: 'd'.repeat(64), prompt: '更新文档'},
    outputs: [{text: '<<<FILE:a.md>>>\nnew\n<<<END>>>'}],
    root: work,
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '43'},
    fetcher: async () => ({status: 404, ok: false, text: async () => ''}),
    runTests: () => {
      throw new Error('boom');
    },
  });

  assert.equal(result.actions[0].status, 'failed');
  assert.equal(result.actions[0].test_ok, false);
  assert.equal(fs.readFileSync(path.join(work, 'a.md'), 'utf8'), 'old\n');
});

test('executeAutonomy：当天无需改文件时 deploy 仍按声明的 workflow 派发', async () => {
  const calls = [];
  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true, deploy: {workflow: 'deep-superagent.yml'}},
    job: {task_id: 'DEEP-3', input_sha256: 'e'.repeat(64), prompt: '分诊积压'},
    outputs: [{text: '没有需要改的文件，只有分诊结果'}],
    root: tmp(),
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '44'},
    fetcher: async (url, options = {}) => {
      calls.push(`${options.method} ${url}`);
      if (url.includes('/contents/')) return {status: 404, ok: false, text: async () => ''};
      return {status: 200, ok: true, text: async () => '{}'};
    },
  });
  assert.equal(result.actions[0].error, 'no_file_writes');
  const deploy = result.actions.find((action) => action.action === 'deploy');
  assert.equal(deploy.status, 'dispatched');
  assert.ok(calls.some((call) => call.includes('/actions/workflows/deep-superagent.yml/dispatches')));
});

test('executeAutonomy：code_change 实际失败时 deploy 跳过', async () => {
  const root = tmp();
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '--bare', origin]);
  execFileSync('git', ['init', '-b', 'main', work]);
  execFileSync('git', ['config', 'user.name', 'test'], {cwd: work});
  execFileSync('git', ['config', 'user.email', 't@example.com'], {cwd: work});
  fs.writeFileSync(path.join(work, 'a.md'), 'old\n');
  execFileSync('git', ['add', 'a.md'], {cwd: work});
  execFileSync('git', ['commit', '-m', 'init'], {cwd: work});
  execFileSync('git', ['remote', 'add', 'origin', origin], {cwd: work});
  execFileSync('git', ['push', '-u', 'origin', 'main'], {cwd: work});

  const result = await executeAutonomy({
    autonomy: {mode: 'auto', code_change: true, deploy: {workflow: 'deep-superagent.yml'}},
    job: {task_id: 'DEEP-3B', input_sha256: '9'.repeat(64), prompt: '改代码'},
    outputs: [{text: '<<<FILE:a.md>>>\nnew\n<<<END>>>'}],
    root: work,
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '44'},
    fetcher: async () => ({status: 404, ok: false, text: async () => ''}),
    runTests: () => {
      throw new Error('boom');
    },
  });
  const deploy = result.actions.find((action) => action.action === 'deploy');
  assert.equal(deploy.status, 'skipped');
  assert.equal(deploy.error, 'code_change_not_merged');
});

test('executeAutonomy：deploy 只按声明的 workflow 派发', async () => {
  const calls = [];
  const result = await executeAutonomy({
    autonomy: {mode: 'auto', deploy: {workflow: 'daily-ops-report.yml'}},
    job: {task_id: 'DEEP-4', input_sha256: 'f'.repeat(64), prompt: '部署每日报表'},
    outputs: [],
    root: tmp(),
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '45'},
    fetcher: async (url, options = {}) => {
      calls.push(`${options.method} ${url}`);
      if (url.includes('/contents/')) return {status: 404, ok: false, text: async () => ''};
      return {status: 200, ok: true, text: async () => '{}'};
    },
  });
  assert.equal(result.actions[0].status, 'dispatched');
  assert.ok(calls.some((call) => call.includes('/actions/workflows/daily-ops-report.yml/dispatches')));
});

test('executeAutonomy：mail 缺凭据时明确失败，不假装已发送', async () => {
  const result = await executeAutonomy({
    autonomy: {mode: 'auto', mail: {to: ['owner@example.com'], subject: '汇报', body: '正文'}},
    job: {task_id: 'DEEP-5', input_sha256: '1'.repeat(64), prompt: '发汇报邮件'},
    outputs: [],
    root: tmp(),
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '46'},
    fetcher: async () => ({status: 404, ok: false, text: async () => ''}),
  });
  assert.equal(result.actions[0].status, 'failed');
  assert.equal(result.actions[0].error, 'mail_credentials_missing');
});

test('executeAutonomy：mail 正文为空时失败', async () => {
  const result = await executeAutonomy({
    autonomy: {mode: 'auto', mail: {to: ['owner@example.com'], subject: '汇报', body_from_output: true}},
    job: {task_id: 'DEEP-6', input_sha256: '2'.repeat(64), prompt: '发汇报邮件'},
    outputs: [],
    root: tmp(),
    env: {GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '47', MAIL_SMTP_USER: 'u', MAIL_SMTP_AUTH_CODE: 'p'},
    fetcher: async () => ({status: 404, ok: false, text: async () => ''}),
  });
  assert.equal(result.actions[0].status, 'failed');
  assert.equal(result.actions[0].error, 'empty_mail_body');
});

test('fiduciaryInstructionHit：design/assign/signal 等含 sign 子串的普通词不误报（#640 假阳性）', () => {
  assert.equal(fiduciaryInstructionHit('design the dispatcher priority mapping').hit, false);
  assert.equal(fiduciaryInstructionHit('assign seats to Claude and GPT').hit, false);
  assert.equal(fiduciaryInstructionHit('signal handling for CI failure').hit, false);
  assert.equal(fiduciaryInstructionHit('resign the lease after merge').hit, false);
});

test('fiduciaryInstructionHit：真实签名/钱包/付款词仍拦截（未放宽）', () => {
  assert.equal(fiduciaryInstructionHit('sign the transaction with the wallet').hit, true);
  assert.equal(fiduciaryInstructionHit('signature verification of the payload').hit, true);
  assert.equal(fiduciaryInstructionHit('请签名后转账').hit, true);
  assert.equal(fiduciaryInstructionHit('wallet operations for Safe').hit, true);
});

test('fiduciaryInstructionHit：分类/负向样例语境不算执行指令（#640）', () => {
  assert.equal(fiduciaryInstructionHit('“sign”不等于执行签名；“退款人工终判”不等于执行退款').hit, false);
  assert.equal(fiduciaryInstructionHit('增加两个负向回归：“sign”不等于执行签名；“退款人工终判”不等于执行退款').hit, false);
  assert.equal(fiduciaryInstructionHit('以 #645 作退款词负向样例').hit, false);
  // 否定分类句里出现地址/金额/收款对象时仍按指令处理。
  assert.equal(fiduciaryInstructionHit('退款不等于执行转账给 0x1111111111111111111111111111111111111111').hit, true);
  assert.equal(fiduciaryInstructionHit('这不是样例：退款 100 USDC').hit, true);
});

test('fiduciaryInstructionHit：卡面分流数据行不因任务名含保留词而拦截（OPS-3）', () => {
  // 生成器写入的公开分流行是待核对数据，不是执行指令；stage/task_id 可能含 wallet/refund。
  assert.equal(fiduciaryInstructionHit('- backlog_oldest=[{"task_id":"REFUND-TERMINAL-1","stage":"wallet_operations_missing","action":"escalate_reserved_family"}]').hit, false);
  assert.equal(fiduciaryInstructionHit('- backlog_by_seat={"wallet":3,"refund":2}').hit, false);
  // 同样内容去掉可信前缀后仍是普通卡面文本，照常拦截。
  assert.equal(fiduciaryInstructionHit('请执行 wallet 转账 100 USDC').hit, true);
  assert.equal(fiduciaryInstructionHit('把退款金额打给客户').hit, true);
});
