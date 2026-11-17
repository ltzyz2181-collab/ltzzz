// Deploy automation authority + phase invariants.
// Run: node --test scripts/tests/deploy-authority.test.mjs
//
// The four `automatic_deploy: false` values in phase configs are fail-closed
// phase invariants, not one global deployment switch. Deploy already happens
// automatically on push to main through .github/workflows/deploy-*.yml.
// This test pins both facts so nobody "opens the gate" by flipping a flag that
// the validators reject.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePolicy} from '../lib/patchgate.mjs';
import {validateA2Config} from '../lib/patchgate-a2.mjs';
import {validateConfig as validatePiCloudConfig} from '../lib/pi-cloud.mjs';

const read = p => JSON.parse(fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const exists = p => fs.existsSync(new URL('../../' + p, import.meta.url));
const AUTHORITY = 'config/deploy-authority-20261116.json';

test('deploy authority record states owner authorization without overclaiming', () => {
  const a = read(AUTHORITY);
  assert.equal(a.schema, 'ltzzz.deploy-authority.v1');
  assert.equal(a.automatic_deploy, true);
  assert.match(a.recorded_at_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(a.authorization?.source);
  assert.ok(a.authorization?.instruction);
  assert.equal(a.authorization.owner_date, '2026-11-16');
  assert.ok(a.authorization.scope);
  assert.ok(Array.isArray(a.preconditions) && a.preconditions.length >= 3);
  assert.ok(a.not_claimed.includes('any specific deployment has already occurred under this record'));
});

test('rollback entry stays explicit and manual', () => {
  const a = read(AUTHORITY);
  assert.equal(a.rollback.required, true);
  assert.equal(a.rollback.automatic_rollback, false);
  assert.ok(a.rollback.entry);
});

test('money and signing boundaries are excluded from deploy automation', () => {
  const a = read(AUTHORITY);
  for (const item of ['five_signature_wallet', 'wallet signing or transfers', 'real funds']) {
    assert.ok(a.exclusions.includes(item), 'missing exclusion: ' + item);
  }
});

test('phase configs keep automatic_deploy=false and never get flipped to open deploys', () => {
  const a = read(AUTHORITY);
  const policy = read('config/patch-policy.json');
  const a2 = read('config/patchgate-a2.json');
  const publisher = read('config/patchgate-cloud-publisher.json');
  const pi = read('config/pi-cloud.json');
  const paths = ['config/patch-policy.json', 'config/patchgate-a2.json', 'config/patchgate-cloud-publisher.json', 'config/pi-cloud.json'];
  for (const p of paths) {
    assert.ok(Object.hasOwn(a.phase_configs_not_flipped, p), 'authority record must name ' + p);
  }
  for (const c of [policy, a2, publisher, pi]) assert.equal(c.automatic_deploy, false);
});

test('validators reject automatic_deploy=true instead of silently weakening the phase', () => {
  const policy = read('config/patch-policy.json');
  const a2 = read('config/patchgate-a2.json');
  const pi = read('config/pi-cloud.json');
  assert.equal(validatePolicy({...policy}).automatic_deploy, false);
  assert.equal(validateA2Config({...a2}).automatic_deploy, false);
  assert.equal(validatePiCloudConfig({...pi}).automatic_deploy, false);
  assert.throws(() => validatePolicy({...policy, automatic_deploy: true}), /A0_validation_only_policy_required/);
  assert.throws(() => validateA2Config({...a2, automatic_deploy: true}), /invalid_A2_docs_only_config/);
  assert.throws(() => validatePiCloudConfig({...pi, automatic_deploy: true}), /pi_capability_not_accepted/);
});

test('authority registry stays byte-locked; the deploy record points at itself instead', () => {
  // config/autonomy-authority.json 被 knowledge/results/patchgate/post271/artifact-manifest.json
  // 的 small_payment_release 集合逐字节锁定（历史证据，不可改写）。往里面加字段会直接
  // 触发 manifest_source_bytes_changed，所以部署授权不往登记表里塞指针，改为自描述。
  const autonomy = fs.readFileSync(new URL('../../config/autonomy-authority.json', import.meta.url), 'utf8');
  assert.equal(Object.hasOwn(JSON.parse(autonomy), 'deployment_authority'), false);
  const a = read(AUTHORITY);
  assert.equal(a.schema, 'ltzzz.deploy-authority.v1');
  assert.equal(a.automatic_deploy, true);
});

test('deploys stay triggered by push to main', () => {
  const a = read(AUTHORITY);
  assert.ok(a.already_automatic.examples.length >= 3);
  for (const rel of a.already_automatic.examples) {
    assert.ok(exists(rel), 'missing deploy workflow: ' + rel);
    const text = fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
    assert.match(text, /branches:\s*\[main\]/);
  }
});
