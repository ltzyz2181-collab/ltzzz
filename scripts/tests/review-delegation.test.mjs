import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reviewApproval, reviewSubjectHash, sha256} from '../lib/review-approval.mjs';
import {scanMuseAssets, museSubject} from '../scan-muse-assets.js';
import {applyReviewedMemory, memorySubject} from '../../tools/reviewed-memory.mjs';
import {nextSupervision, attachSupervision, persistSupervision} from '../lib/pending-supervision.mjs';
import {prepareCycle, executeCycle, digest} from '../lib/ans-cycle.mjs';

function fixture(operation = 'memory_promotion', subject = {candidate_id: 'CAND-example'}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-delegation-'));
  const worker = {operation, subject, subject_sha256: reviewSubjectHash(operation, subject)};
  const text = JSON.stringify(worker), artifact = {role: 'worker', executed_by: 'DeepSeek', model: 'deepseek-fixture', text, sha256: sha256(text)};
  const verdict = {operation, subject_sha256: worker.subject_sha256, artifact_sha256: artifact.sha256, accepted: true, reasons: ['Fixture source supports exact claim'], unverified: []};
  const reviewerText = JSON.stringify(verdict), reviewer = {role: 'reviewer', executed_by: 'Doubao', model: 'doubao-fixture', text: reviewerText, sha256: sha256(reviewerText)};
  const receipt = {run_id: '123456789', source_commit: 'a'.repeat(40), artifacts: [artifact, reviewer],
    calls: [artifact, reviewer].map(a => ({status: 'success', executed_by: a.executed_by, model: a.model, finish_reason: 'stop'}))};
  const relative = 'knowledge/results/review-fixture.json';
  const save = () => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); const bytes = JSON.stringify(receipt); fs.writeFileSync(file, bytes); return {path: relative, sha256: sha256(bytes)}; };
  return {root, receipt, save, reference: save(), subject, operation, clean: () => fs.rmSync(root, {recursive: true, force: true})};
}
const approve = f => reviewApproval({rootDir: f.root, operation: f.operation, subject: f.subject, reference: f.reference});

test('actual recorded author/reviewer proof approves a subject without changing permissions or claiming payment', () => {
  const f = fixture(); try { const r = approve(f); assert.equal(r.ok, true); assert.equal(r.human_confirmation_required, false); assert.equal(r.permissions_changed, false); assert.equal(r.spending_authorized, false); assert.equal(r.paid, false); } finally { f.clean(); }
});
test('a pass checkbox, wrong operation or changed subject cannot reuse a review', () => {
  const f = fixture(); try {
    assert.equal(reviewApproval({rootDir: f.root, operation: f.operation, subject: f.subject, reference: {accepted: true}}).ok, false);
    assert.equal(reviewApproval({rootDir: f.root, operation: 'video_publication', subject: f.subject, reference: f.reference}).ok, false);
    assert.equal(reviewApproval({rootDir: f.root, operation: f.operation, subject: {candidate_id: 'other'}, reference: f.reference}).ok, false);
    assert.equal(reviewApproval({rootDir: f.root, operation: 'wallet_transfer', subject: f.subject, reference: f.reference}).ok, false);
  } finally { f.clean(); }
});
test('truncated calls, same actual provider, changed bytes and missing provenance cannot authorize execution', () => {
  for (const mutate of [r => {r.calls[1].finish_reason = 'length';}, r => {r.artifacts[1].executed_by = 'deepseek'; r.calls[1].executed_by = 'deepseek';}, r => {r.artifacts[1].text += 'x';}, r => {r.run_id = null;}, r => {r.source_commit = 'main';}]) {
    const f = fixture(); try { mutate(f.receipt); f.reference = f.save(); assert.equal(approve(f).ok, false); } finally { f.clean(); }
  }
});
test('rejection becomes revision_required; it is never relabelled as a pass or owner approval request', () => {
  const f = fixture(); try {
    const a = f.receipt.artifacts[1], v = JSON.parse(a.text); v.accepted = false; a.text = JSON.stringify(v); a.sha256 = sha256(a.text); f.reference = f.save();
    const r = approve(f); assert.equal(r.ok, false); assert.equal(r.status, 'revision_required'); assert.equal(r.human_confirmation_required, false);
  } finally { f.clean(); }
});
test('traversal, secret paths and symlink escape cannot be used as review receipts', () => {
  const f = fixture(), other = fs.mkdtempSync(path.join(os.tmpdir(), 'review-outside-')); try {
    fs.writeFileSync(path.join(other, 'fixture.json'), '{}'); fs.symlinkSync(path.join(other, 'fixture.json'), path.join(f.root, 'knowledge/results/link.json'));
    for (const file of ['.env', '../fixture.json', 'knowledge/results/../../fixture.json', 'knowledge/results/link.json']) assert.equal(reviewApproval({rootDir: f.root, operation: f.operation, subject: f.subject, reference: {path: file, sha256: sha256('{}')}}).ok, false);
  } finally { f.clean(); fs.rmSync(other, {recursive: true, force: true}); }
});
function memoryFixture() {
  const claim = 'The immutable receipt documents a reproducible deployment verification, not a cash payment.';
  const item = {id: 'CAND-example', source: 'memory/daily/2026-10-21.md', claim, source_sha256: sha256(claim), conflicts: [], status: 'candidate', human_confirm: false};
  const f = fixture('memory_promotion', memorySubject(item)); fs.mkdirSync(path.join(f.root, 'memory/daily'), {recursive: true}); fs.writeFileSync(path.join(f.root, item.source), claim);
  item.review_reference = f.reference; return {...f, item};
}
test('approved memory is actually written once, with accurate applied index and no fake human confirmation', () => {
  const f = memoryFixture(); try {
    const q = {items: [f.item], applied: []}; assert.deepEqual(applyReviewedMemory(q, {rootDir: f.root}).applied, ['CAND-example']);
    assert.equal(q.items[0].human_confirm, false); assert.equal(q.items[0].status, 'applied'); assert.deepEqual(q.applied, ['CAND-example']);
    const file = path.join(f.root, q.items[0].applied_to), bytes = fs.readFileSync(file); assert.equal(sha256(bytes), q.items[0].applied_sha256);
    assert.deepEqual(applyReviewedMemory(q, {rootDir: f.root}).applied, []); assert.deepEqual(fs.readFileSync(file), bytes);
  } finally { f.clean(); }
});
test('changed source, metadata or unresolved conflicts do not enter long-term memory', () => {
  for (const mode of ['source', 'metadata', 'conflict']) { const f = memoryFixture(); try {
    if (mode === 'source') fs.writeFileSync(path.join(f.root, f.item.source), 'changed');
    if (mode === 'metadata') f.item.eligible_for_promotion = false;
    if (mode === 'conflict') f.item.conflicts.push('contradictory evidence');
    const q = {items: [f.item]}; assert.deepEqual(applyReviewedMemory(q, {rootDir: f.root}).applied, []); assert.equal(f.item.status, 'candidate');
  } finally { f.clean(); } }
});
test('video with human_confirm=false is eligible after a bound review; changes and prior publication exclude it', () => {
  const video = Buffer.from('fixture video bytes'), meta = {id: 'video-example', source: 'muse', file: 'assets/video/muse/example.mp4', content_sha256: sha256(video), title: 'Fixture', created_at: '2026-10-21T00:00:00Z', status: 'reviewed', human_confirm: false};
  const f = fixture('video_publication', museSubject(meta)); try {
    const dir = path.join(f.root, 'assets/video/muse'); fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(path.join(f.root, meta.file), video);
    const save = () => fs.writeFileSync(path.join(dir, 'example.meta.json'), JSON.stringify({...meta, review_reference: f.reference})); save();
    assert.equal(scanMuseAssets({rootDir: f.root}).publishable, 1);
    meta.youtube_video_id = 'already-uploaded'; save(); assert.equal(scanMuseAssets({rootDir: f.root}).publishable, 0); delete meta.youtube_video_id;
    meta.title = 'Unreviewed replacement'; save(); assert.equal(scanMuseAssets({rootDir: f.root}).publishable, 0);
  } finally { f.clean(); }
});
test('supervisory review reuses exactly two existing ANS calls and cannot confuse draft acceptance with memory acceptance', async () => {
  const f = memoryFixture(); try {
    const supervision = {operation: f.operation, subject: f.subject, subject_sha256: reviewSubjectHash(f.operation, f.subject), source_text: f.item.claim};
    const r = {...prepareCycle({date: '2026-10-21', runId: '123456789', sourceCommit: 'a'.repeat(40)}).record, supervisory_subject: supervision}; let calls = 0;
    const worker = {finding: 'A concrete engineering gap with a reproducible test', minimal_patch: 'Engineering specification is only a draft; record review independently.', supervisory_proposal: {accepted: true, operation: supervision.operation, subject_sha256: supervision.subject_sha256}};
    await executeCycle(r, {context: 'fixture source', call: async (agent, prompt) => {
      calls++; let output = worker;
      if (agent === 'Doubao') { assert.match(prompt, /另做独立监督/); output = {accepted: true, artifact_sha256: digest(JSON.stringify(worker, null, 2) + '\n'), reasons: ['Engineering draft review'], unverified: [], supervisory_review: {accepted: true, operation: supervision.operation, subject_sha256: supervision.subject_sha256, artifact_sha256: r.supervisory_worker.sha256, reasons: ['Fixture candidate source supports claim'], unverified: []}}; }
      return {ok: true, status: 'success', output: JSON.stringify(output), executed_by: agent, model: agent + '-fixture', finish_reason: 'stop'};
    }});
    assert.equal(calls, 2); const ref = persistSupervision(r, f.root); assert.ok(ref);
    assert.equal(reviewApproval({rootDir: f.root, operation: f.operation, subject: f.subject, reference: ref}).ok, true);
    const q = {items: [{...f.item, review_reference: undefined}]}; attachSupervision(q, f.root); assert.deepEqual(q.items[0].review_reference, ref);
    delete r.supervisory_reviewer; assert.equal(persistSupervision(r, f.root), null);
  } finally { f.clean(); }
});
test('next supervision requires a complete matching source snapshot, not just a candidate label', () => {
  const f = memoryFixture(); try {
    delete f.item.review_reference; const queue = {items: [{...f.item, id:'CAND-missing',source:'memory/daily/missing.md'}, f.item]}; fs.mkdirSync(path.join(f.root, 'memory/promote'), {recursive: true});
    fs.writeFileSync(path.join(f.root, 'memory/promote/queue.json'), JSON.stringify(queue));
    assert.equal(nextSupervision(f.root).subject_sha256, reviewSubjectHash(f.operation, f.subject));
    fs.writeFileSync(path.join(f.root, f.item.source), 'changed'); assert.equal(nextSupervision(f.root), null);
  } finally { f.clean(); }
});
