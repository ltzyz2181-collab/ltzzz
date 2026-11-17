// CI 策略测试：邮件摄入工作流只允许做仓库内契约测试。
// 对应工单 §三：仅提工作流 PR，不得直接启用生产定时任务；凭据不得出现在仓库/日志。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW = path.join(ROOT, '.github/workflows/mail-intake-phase2.yml');
const source = fs.readFileSync(WORKFLOW, 'utf8');

test('邮件工作流没有 schedule，不构成生产定时任务', () => {
  assert.ok(!/^\s*schedule\s*:/m.test(source), '本 PR 不得启用定时调度');
  assert.ok(!/cron\s*:/.test(source), '不得出现 cron 表达式');
});

test('邮件工作流只读仓库，不读取任何 secret', () => {
  assert.match(source, /permissions:\s*\{contents:\s*read\}/);
  assert.ok(!/secrets\./.test(source), 'CI 不得读取 secrets');
  assert.ok(!/env:\s*\n\s*GMAIL_IMAP_APP_PASSWORD/m.test(source), 'CI 不得注入邮箱密码');
});

test('邮件工作流不写仓库、不合并、不部署', () => {
  for (const forbidden of ['git push', 'git commit', 'gh pr merge', 'workflow_run', 'deploy']) {
    assert.ok(!source.includes(forbidden), `不得出现 ${forbidden}`);
  }
});

test('触发方式仅限 PR 与手动，不能直接跑在 main 的日常调度上', () => {
  assert.match(source, /pull_request:/);
  assert.match(source, /workflow_dispatch:/);
  assert.ok(!/^\s*push\s*:/m.test(source), '不得在 push 时自动执行');
});

test('CI 明确声明 Phase 1 真实回执由 Owner 本机完成', () => {
  assert.match(source, /Owner 在本机执行/);
  assert.match(source, /不持有、也拿不到应用专用密码/);
});
