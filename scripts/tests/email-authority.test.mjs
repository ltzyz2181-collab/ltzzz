// Email automation authority (GPT-LTZZZ-AUTONOMY-RULING-20261117-01).
// Run: node --test scripts/tests/email-authority.test.mjs
//
// Pins the three-level permission model and the technical send/intake gates so a
// later edit cannot quietly promote L3 (money, signing, production deploy) into
// automatic send, or turn Gmail intake into a mutating channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const exists = p => fs.existsSync(new URL('../../' + p, import.meta.url));
const POLICY = 'config/email-authority-20261117.json';
const DOC = 'docs/2026-11-17-邮件自动化三级授权裁决.md';

test('decision identity is recorded and the policy has a readable record', () => {
  const p = read(POLICY);
  assert.equal(p.schema, 'ltzzz.email-authority.v1');
  assert.equal(p.decision_id, 'GPT-LTZZZ-AUTONOMY-RULING-20261117-01');
  assert.equal(p.decided_by, 'gpt_decision_seat');
  assert.equal(p.decided_at, '2026-11-17');
  assert.ok(exists(DOC));
});

test('L1 and L2 may send automatically; L3 may not', () => {
  const {levels} = read(POLICY);
  assert.equal(levels.L1_information.auto_send, true);
  assert.equal(levels.L2_adjudication_and_dispatch.auto_send, true);
  assert.equal(levels.L3_high_risk.auto_send, false);
  assert.match(levels.L2_adjudication_and_dispatch.precondition, /明确裁决/);
  assert.match(levels.L3_high_risk.requires, /Owner 授权/);
});

test('L3 keeps every high-risk category blocked', () => {
  const l3 = read(POLICY).levels.L3_high_risk.examples.join('|');
  for (const keyword of ['付款', '退款', '转账', '链上交易', '钱包签名', '生产部署', '权限提升', 'Secrets 变更', '不可逆']) {
    assert.ok(l3.includes(keyword), 'missing L3 category: ' + keyword);
  }
});

test('dispatch emails must carry the six required fields and a send receipt', () => {
  const g = read(POLICY).send_gates;
  assert.deepEqual(g.required_fields, ['task_id', 'decision_id', 'decision_status', 'executing_seat', 'permission_boundary', 'acceptance_criteria']);
  assert.deepEqual(g.receipt_fields, ['message_id', 'thread_id', 'sent_at', 'result']);
  assert.match(g.unknown_result, /原线程/);
  assert.equal(g.impersonation_forbidden, true);
  assert.equal(g.runner_judgement_is_not_gpt_ruling, true);
  assert.equal(g.send_failure_must_not_block_independent_tasks, true);
});

test('secrets and customer material never travel by email', () => {
  const forbidden = read(POLICY).send_gates.forbidden_content.join('|');
  for (const keyword of ['密码', '私钥', 'Secrets', '客户敏感资料']) assert.ok(forbidden.includes(keyword), keyword);
});

test('Gmail intake is read-only, on-demand and never mutates the mailbox', () => {
  const m = read(POLICY).gmail_intake;
  assert.equal(m.read_only, true);
  assert.equal(m.fetch_mode, 'BODY.PEEK');
  assert.deepEqual(m.forbidden_mutations, ['标记已读', '删除', '移动']);
  assert.match(m.body_read, /按需/);
  assert.match(m.untrusted_input, /不构成 Owner 授权/);
  assert.match(m.channel_separation, /Agent Mail/);
});

test('three-layer dedupe uses message_id, thread_id and the original Task ID', () => {
  assert.deepEqual(read(POLICY).gmail_intake.dedupe_keys, ['message_id', 'thread_id', 'original_task_id']);
});

test('daily loop order and stage gates match the ruling', () => {
  const p = read(POLICY);
  assert.deepEqual(p.daily_loop, [
    'gmail_intake', 'project_match', 'three_layer_dedupe', 'task_state_update', 'gpt_ruling',
    'auto_dispatch', 'ai_execute', 'receipt_collection', 'independent_audit', 'gpt_review', 'auto_send_audit_result',
  ]);
  assert.deepEqual(p.stage_gates.map(s => s.stage), [1, 2, 3, 4]);
  assert.equal(p.loop_constraints.blocked_task_does_not_pause_others, true);
  assert.equal(p.loop_constraints.auto_send_success_is_not_execution_success, true);
  assert.equal(p.loop_constraints.ci_pass_is_not_production_acceptance, true);
});

test('money, signing, real refunds and unapproved deploys stay out of scope', () => {
  const s = read(POLICY).not_authorized.join('|');
  for (const keyword of ['真实资金', '私钥签名', '真实退款', '未经批准的生产部署', '不可逆']) assert.ok(s.includes(keyword), keyword);
});

test('every deployment completion sends a report with ruling items and a next-step question', () => {
  const r = read(POLICY).deployment_completion_report;
  assert.equal(r.required, true);
  assert.equal(r.send_level, 'L1_information');
  assert.deepEqual(r.required_fields, [
    'receipt_id', 'code_commit', 'deployed_at', 'deployment_status',
    'verified', 'blockers', 'items_requiring_owner_ruling', 'next_step_question',
  ]);
  assert.match(r.next_step_question, /询问 Owner 下一步/);
  assert.match(r.ruling_items, /需要 Owner 裁决/);
  assert.match(r.no_false_completion, /平台验收/);
  assert.match(r.idempotency, /原线程/);
  assert.match(r.l3_boundary, /L3/);
  assert.equal(r.receipt_required, true);
});

test('deploy authority is revised by this ruling: merge may automate, production deploy may not', () => {
  const d = read('config/deploy-authority-20261116.json');
  assert.equal(d.revised_by, 'GPT-LTZZZ-AUTONOMY-RULING-20261117-01');
  assert.equal(d.automatic_deploy, false);
  assert.equal(d.automatic_merge.allowed, true);
  assert.equal(d.production_deploy.not_covered_by_this_record, true);
});
