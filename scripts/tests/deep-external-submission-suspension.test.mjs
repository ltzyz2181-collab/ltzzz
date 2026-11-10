import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cfg = () => JSON.parse(fs.readFileSync('config/deep-superagent.json', 'utf8'));
const workerSrc = () => fs.readFileSync('workers/deep-superagent/index.js', 'utf8');
const a3Src = () => fs.readFileSync('scripts/run-patchgate-a3.mjs', 'utf8');

test('外部接单权限为关闭状态', () => {
  const d = cfg();
  assert.equal(d.external_submissions_enabled, false, '顶层外部提交开关必须为 false');
});

test('暂停记录完整：谁定的、依据、范围、恢复条件', () => {
  const s = cfg().external_submissions_suspension;
  assert.ok(s, '必须有 external_submissions_suspension 记录');
  assert.equal(s.suspended_at, '2026-11-10');
  assert.equal(s.decided_by, 'gpt_decision_seat');
  assert.equal(s.relayed_by_owner_in_session, true, '本次变更由 owner 在场转达');
  assert.ok(s.basis.includes('cross_system_claim_bridge_verified'), '依据需点名未通过的三项验证');
  assert.ok(s.reactivation_requires.includes('real_generation_and_delivery_verified'));
  assert.ok(s.reactivation_requires.includes('GPT'), '恢复须由 GPT 决策席重新开通');
});

test('2026-11-08 声明降级为历史待审材料，但原文字段不许删', () => {
  const p = cfg().external_order_policy;
  assert.equal(p.effective, false, '2026-11-08 的接单策略不再生效');
  assert.equal(p.status, 'historical_material_only');
  assert.ok(typeof p.enabled_by === 'string' && p.enabled_by.length > 0, '历史来源必须保留，不得抹除');
  assert.ok(p.enabled_by.includes('2026-11-08'), '历史来源需保留原始日期');
  assert.ok(typeof p.historical_note === 'string' && p.historical_note.length > 0);
});

test('financial_execution 保持 false', () => {
  const d = cfg();
  assert.equal(d.financial_execution, false);
  assert.equal(d.daily_supervision.financial_execution, false);
});

test('GPT 直接授权不变：资金与决策仍归 GPT，且不要求 owner 二次审批', () => {
  const d = cfg();
  assert.equal(d.decision_seat, 'gpt');
  assert.equal(d.treasury_authority.holder, 'gpt');
  assert.equal(d.treasury_authority.owner_approval_required, false, '不得新增资金动作的人工审批');
  assert.equal(d.authority.repeat_owner_confirmation_for_ordinary_operations, false);
  assert.deepEqual(d.treasury_authority.actions, ['收款', '放款', '退款', '结算']);
});

test('不新增人工审批或 Claude 否决权', () => {
  const d = cfg();
  const raw = JSON.stringify(d);
  // reviewers 只能监督并留异见，不得替代控制者决策
  assert.ok(d.authority.reviewers.includes('do not replace the controller decision'));
  assert.ok(d.authority.reviewers.includes('retain disagreements'));
  // 不允许出现否决/批准类新增门
  for (const bad of ['claude_veto', 'veto_power', 'human_approval_required', 'reviewer_consent_required', 'reviewer_approval_required']) {
    assert.equal(raw.includes(bad), false, `不得引入 ${bad}`);
  }
  // Claude 仍只是保留且禁用的槽位，不得获得原生审核权
  assert.equal(d.native_paid_reserved_enabled, false);
  assert.equal(d.seat_roles.claude, 'original-provider API slot reserved and disabled; no native review is implied');
});

test('配置的声明必须与运行时一致，不允许配置台说 true 而系统说 false', () => {
  const d = cfg();
  // Worker health 对外声明
  assert.ok(workerSrc().includes('external_submissions_enabled:false'),
    'Worker health 仍声明 false；若运行时改为 true，必须同时改本测试与配置，不得单边漂移');
  assert.ok(workerSrc().includes('financial_execution:false'));
  // A3 能力卡 fail-closed 校验门
  assert.ok(a3Src().includes('external_submissions_enabled:false'),
    'A3 能力卡期望值仍为 false');
  assert.equal(d.external_submissions_enabled, false, '配置不得与上述运行时声明相反');
});

test('暂停不牵连其它既有授权：GPT 账户注册与资金执行授权仍在', () => {
  const g = cfg().authority.owner_grant;
  assert.ok(g.granted.some(s => s.includes('自由注册海外账户')), 'GPT 账户注册授权不受本次收口影响');
  assert.ok(g.granted.some(s => s.includes('收款/放款/退款/结算')), '资金执行授权不受影响');
  assert.deepEqual(g.not_granted, ['多签钱包签名', '代理生物人实名验证'], '既有的两条红线保持不变');
  assert.ok(g.suspended.some(s => s.includes('事前接单')), '仅接单授权被标记暂停');
});
