// CI 策略测试：邮件摄入工作流分两个 job，权限互不借用。
// - contract：仅仓库内契约测试，不读 secrets、不写仓库（PR 默认跑这个）。
// - intake：每日只读采集，只允许用 Gmail 与 QQ 两组 IMAP secrets，只允许提交脱敏结果到固定路径。
// 依据：GPT-LTZZZ-AUTONOMY-RULING-20261117-01 §二、§六，以及
// docs/2026-11-18-gmail-intake-定时启用-最小证据与回退.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW = path.join(ROOT, '.github/workflows/mail-intake-phase2.yml');
const source = fs.readFileSync(WORKFLOW, 'utf8');

function job(name) {
  const marker = `\n  ${name}:\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `缺少 job ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][a-z0-9-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const contract = job('contract');
const intake = job('intake');

test('定时任务只有一条，且只在 workflow 级 schedule 中声明', () => {
  const crons = source.match(/cron\s*:/g) || [];
  assert.equal(crons.length, 1, '只允许一条 cron');
  assert.match(source, /^\s*schedule:\s*$/m);
  assert.match(source, /cron:\s*'23 0 \* \* \*'/);
  assert.ok(!/cron\s*:/.test(contract), 'contract job 不得包含 cron');
});

test('contract job 只读仓库，不读取任何 secret', () => {
  assert.match(contract, /permissions:\s*\{contents:\s*read\}/);
  assert.ok(!/secrets\./.test(contract), 'contract job 不得读取 secrets');
  assert.ok(!/GMAIL_IMAP_APP_PASSWORD/.test(contract), 'contract job 不得注入邮箱密码');
});

test('intake job 只允许四个邮箱 secret，并显式声明写权限', () => {
  assert.match(intake, /permissions:\s*\{contents:\s*write\}/);
  const names = [...intake.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(names)].sort(), [
    'GMAIL_IMAP_APP_PASSWORD', 'GMAIL_IMAP_USER', 'QQ_IMAP_PASSWORD', 'QQ_IMAP_USER',
  ]);
});

test('intake job 不得把凭据写进日志或文件', () => {
  for (const forbidden of ['printenv', 'set -x', 'echo $GMAIL', 'echo "$GMAIL', 'cat ~/.config', 'cat $HOME/.config']) {
    assert.ok(!intake.includes(forbidden), `不得出现 ${forbidden}`);
  }
});

test('缺 secrets 时 fail-closed，不尝试读邮箱', () => {
  assert.match(intake, /\[ -z "\$\{GMAIL_IMAP_APP_PASSWORD:-\}" \]/);
  assert.match(intake, /no mailbox read attempted/);
  assert.match(intake, /exit 1/);
});

test('intake 只在定时或手动 read-only-intake 模式运行，不在 PR 运行', () => {
  assert.match(intake, /github\.event_name == 'schedule'/);
  assert.match(intake, /inputs\.mode == 'read-only-intake'/);
  assert.ok(!intake.includes('pull_request'), 'intake job 不得在 PR 上运行');
});

test('intake 只提交脱敏结果到固定路径，用 rebase 推送助手而非强推', () => {
  // 提交步骤改成逐文件 add（缺失的 last-ok.json 不会拖垮整条 git add），
  // 因此路径要从整个提交步骤里提取，而不是只看 git add 之后的行。
  const commitStep = intake.split('- name: Commit redacted result')[1]?.split('if git diff')[0] || '';
  const added = [...commitStep.matchAll(/(knowledge\/results\/deep-superagent\/[A-Za-z0-9._\/-]+)/g)].map((m) => m[1]);
  assert.ok(added.length >= 4, '必须显式列出要提交的结果文件');
  for (const file of added) {
    assert.ok(
      file.startsWith('knowledge/results/deep-superagent/mail-') ||
        file.startsWith('knowledge/results/deep-superagent/ruling-tracker/'),
      `不允许提交 ${file}`,
    );
  }
  assert.match(intake, /node tools\/push-receipt-commit\.mjs/);
  assert.ok(!/git push\s+--force/.test(source), '不得强推');
  assert.ok(!/git push\s+-f/.test(source), '不得强推');
});

test('intake 只在 ok/partial 时落库，失败态不得覆盖上次可核验结果', () => {
  assert.match(intake, /ok\|partial\)/);
  assert.match(intake, /result not committed/);
});

test('工作流不合并 PR、不部署、不响应 workflow_run', () => {
  for (const forbidden of ['gh pr merge', 'workflow_run', 'deploy']) {
    assert.ok(!source.includes(forbidden), `不得出现 ${forbidden}`);
  }
});

test('触发方式保留 PR 与手动，不在 push 时自动执行', () => {
  assert.match(source, /pull_request:/);
  assert.match(source, /workflow_dispatch:/);
  assert.ok(!/^\s*push\s*:/m.test(source), '不得在 push 时自动执行');
});

test('凭据检查步骤使用脚本自己的参数，不用 Node 会吞掉的 --env-file', () => {
  const line = source.split('\n').find((l) => l.includes('node scripts/check-gmail-credentials.mjs') && l.includes('--credentials-file')) || '';
  assert.match(line, /--credentials-file/, '必须用脚本可接收的参数名');
  assert.ok(!/\s--env-file(\s|=)/.test(line), 'Node 22 会把 --env-file 当自己的选项吞掉');
  assert.match(line, /--json/);
});

test('run 的 plain scalar 不得含冒号加空格（会让整条工作流解析失败、静默不建 job）', () => {
  const bad = [];
  source.split('\n').forEach((line, i) => {
    const m = line.match(/^(\s*)run:\s+(?![|>])(.+)$/);
    if (!m) return;
    const value = m[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) return;
    if (/:(\s|$)/.test(value)) bad.push(`第 ${i + 1} 行: ${line.trim()}`);
  });
  assert.deepEqual(bad, [], 'run 值含 ": " 时必须加引号或改成块标量（run: |）');
});

test('工作流能被真正的 YAML 解析器读通', (t) => {
  const probe = spawnSync('python3', ['-c', 'import yaml'], {encoding: 'utf8'});
  if (probe.status !== 0) {
    t.skip('本机无 python3 + PyYAML，跳过真实解析校验');
    return;
  }
  const parsed = spawnSync(
    'python3',
    ['-c', 'import sys,yaml;d=yaml.safe_load(open(sys.argv[1]));assert isinstance(d.get("jobs"),dict) and d["jobs"]', WORKFLOW],
    {encoding: 'utf8'},
  );
  // Windows 的 python3 是 Store 别名：探测可能返回 0，真正执行却 9009。
  // 只在本机跳过，CI（Linux）仍要求真实解析通过。
  if (parsed.error || parsed.status === 9009) {
    t.skip('本机 python3 是 Windows Store 别名（9009），跳过真实解析校验');
    return;
  }
  assert.equal(parsed.status, 0, `YAML 解析失败：\n${parsed.stderr || ''}`);
});

test('工作流指向最小证据集与回退方案文档', () => {
  assert.match(source, /2026-11-18-gmail-intake-定时启用-最小证据与回退\.md/);
  const doc = path.join(ROOT, 'docs/2026-11-18-gmail-intake-定时启用-最小证据与回退.md');
  assert.ok(fs.existsSync(doc), '回退文档必须存在');
  const text = fs.readFileSync(doc, 'utf8');
  assert.match(text, /回退/);
  assert.match(text, /最小证据集/);
});
