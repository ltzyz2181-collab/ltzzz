// 记忆晋升评审执行器的离线回归（零真实模型调用）
// 目的：证明产出回执能通过官方 reviewApproval 硬校验，并证明常量回填被严格校验。
import {mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewOneCandidate, applyResults} from '../run-memory-promotion-review.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');

function makeFixture({claim = '系统只有在结果真实落盘后，才能把任务记为完成。' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'promo-'));
  mkdirSync(join(root, 'memory/daily'), {recursive: true});
  mkdirSync(join(root, 'memory/promote'), {recursive: true});
  const dailyRel = 'memory/daily/agent-2026-11-09-test.md';
  const dailyAbs = join(root, dailyRel);
  const body = `# 测试日课\n\n${claim}\n`;
  writeFileSync(dailyAbs, body);
  const item = {
    id: 'CAND-20261109-test0001',
    source: dailyRel,
    source_sha256: sha256(readFileSync(dailyAbs)),
    snapshot_hash: sha256(readFileSync(dailyAbs)).slice(0, 12),
    claim,
    claim_type: 'agent_observation_unverified',
    evidence_tier: 'agent_output_pending_independent_review',
    impact: 'low',
    status: 'candidate',
    deduped: true,
    conflicts: [],
    human_confirm: false,
    human_confirmation_required: false,
    review_status: 'pending_review'
  };
  const queue = {items: [item], applied: []};
  writeFileSync(join(root, 'memory/promote/queue.json'), JSON.stringify(queue, null, 2));
  return {root, item, queue};
}

// 假 worker：从 prompt 里抓取脚本算好的 subject_sha256 与 subject 原文，原样回填
function fakeWorker({corruptSha = null} = {}) {
  return {
    provider: 'doubao', model: 'fake-worker', apiKey: 'fake',
    callAgent: async ({prompt}) => {
      const m = prompt.match(/subject_sha256 必须是字符串 "([a-f0-9]{64})"/);
      assert.ok(m, 'prompt 里必须带 subject_sha256');
      const subjectLine = prompt.split('\n').find(l => l.trim().startsWith('{"candidate_id"'));
      assert.ok(subjectLine, 'prompt 里必须带 subject 原文');
      return {
        ok: true, status: 'success', finish_reason: 'stop', model: 'fake-worker', tokens_used: 10,
        output: JSON.stringify({
          operation: 'memory_promotion',
          subject_sha256: corruptSha || m[1],
          subject: JSON.parse(subjectLine)
        })
      };
    }
  };
}

function fakeReviewer({accepted = true, corruptSubjectSha = null} = {}) {
  return {
    provider: 'deepseek', model: 'fake-reviewer', apiKey: 'fake',
    callAgent: async ({prompt}) => {
      const m = prompt.match(/subject_sha256 必须是 "([a-f0-9]{64})"/);
      assert.ok(m, 'reviewer prompt 必须带 subject_sha256');
      const a = prompt.match(/artifact_sha256 必须是 "([a-f0-9]{64})"/);
      assert.ok(a, 'reviewer prompt 必须带 artifact_sha256');
      return {
        ok: true, status: 'success', finish_reason: 'end_turn', model: 'fake-reviewer', tokens_used: 12,
        output: JSON.stringify({
          operation: 'memory_promotion',
          subject_sha256: corruptSubjectSha || m[1],
          artifact_sha256: a[1],
          accepted,
          reasons: [accepted ? '该声明属可复用的实质事实，且未见与已载事实冲突' : '该内容为日常操作元数据，不构成持久事实'],
          unverified: []
        })
      };
    }
  };
}

const RUN = {runId: '42590000000', sourceCommit: 'a'.repeat(40)};

test('双 provider 评审产出回执，且通过官方 reviewApproval 校验', async () => {
  const {root, item} = makeFixture();
  try {
    const r = await reviewOneCandidate(item, {...RUN, rootDir: root, worker: fakeWorker(), reviewer: fakeReviewer()});
    assert.equal(r.accepted, true, JSON.stringify(r));
    assert.ok(existsSync(join(root, r.receipt_path)), '回执文件必须落盘');
    const receipt = JSON.parse(readFileSync(join(root, r.receipt_path), 'utf8'));
    assert.equal(receipt.run_id, RUN.runId);
    assert.equal(receipt.source_commit, RUN.sourceCommit);
    assert.equal(receipt.artifacts.length, 2);
    assert.deepEqual(receipt.artifacts.map(a => a.role), ['worker', 'reviewer']);
    assert.equal(receipt.calls.length, 2);
    assert.equal(r.worker_provider, 'doubao');
    assert.equal(r.reviewer_provider, 'deepseek');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('applyResults 让候选真正晋升并生成长期记忆文件', async () => {
  const {root, item} = makeFixture();
  try {
    const r = await reviewOneCandidate(item, {...RUN, rootDir: root, worker: fakeWorker(), reviewer: fakeReviewer()});
    assert.equal(r.accepted, true);
    const res = applyResults(root, {applied: [r]});
    assert.deepEqual(res.applied, [item.id], '官方 apply 必须真的晋升');
    const queue = JSON.parse(readFileSync(join(root, 'memory/promote/queue.json'), 'utf8'));
    const after = queue.items.find(i => i.id === item.id);
    assert.equal(after.status, 'applied');
    assert.equal(after.confirmation_provenance, 'independent_executor_review_not_human_confirmation');
    assert.equal(after.confirmation_provenance, 'independent_executor_review_not_human_confirmation',
      '来源必须是独立执行器评审，且明确标注非人工确认');
    assert.ok(existsSync(join(root, 'memory/long-term', item.id + '.json')));
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('worker 抄错 subject_sha256 必须被拦下（LLM 常量转录护栏）', async () => {
  const {root, item} = makeFixture();
  try {
    const r = await reviewOneCandidate(item, {
      ...RUN, rootDir: root, worker: fakeWorker({corruptSha: 'b'.repeat(64)}), reviewer: fakeReviewer()
    });
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'worker_subject_sha_mismatch');
    assert.ok(!existsSync(join(root, 'knowledge/results/memory-promotion')), '不得写出任何回执');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('源文件哈希变化必须拒绝，且不调用模型', async () => {
  const {root, item} = makeFixture();
  try {
    const tampered = {...item, source_sha256: 'c'.repeat(64)};
    let called = false;
    const spy = {...fakeWorker(), callAgent: async () => { called = true; throw Error('should not call'); }};
    const r = await reviewOneCandidate(tampered, {...RUN, rootDir: root, worker: spy, reviewer: fakeReviewer()});
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'candidate_source_changed');
    assert.equal(called, false, '源未校验通过时不得发起任何模型调用');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('评审方拒绝时回执保留为证据，但不晋升', async () => {
  const {root, item} = makeFixture();
  try {
    const r = await reviewOneCandidate(item, {
      ...RUN, rootDir: root, worker: fakeWorker(), reviewer: fakeReviewer({accepted: false})
    });
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'reviewer_declined');
    assert.ok(r.receipt_path, '拒绝也要留回执');
    const res = applyResults(root, {applied: [r]});
    assert.deepEqual(res.applied, [], '被拒候选不得晋升');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('非实质声明（操作元数据）在调用模型前即被拒', async () => {
  const {root, item} = makeFixture({claim: '- mode: dry-run / inspect only'});
  try {
    const r = await reviewOneCandidate(item, {...RUN, rootDir: root, worker: fakeWorker(), reviewer: fakeReviewer()});
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'not_substantive_claim');
  } finally { rmSync(root, {recursive: true, force: true}); }
});
