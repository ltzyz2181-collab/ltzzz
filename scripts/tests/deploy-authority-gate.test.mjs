import test from 'node:test';
import assert from 'node:assert/strict';
import {decide, loadAuthority} from '../lib/deploy-authority.mjs';

test('合并与部署是两个独立开关，且都来自 owner 授权', () => {
  const a = loadAuthority();
  assert.equal(a.success !== false, true);
  assert.equal(a.automatic_merge, true);
  assert.equal(a.automatic_deploy, true);
  assert.equal(a.authorized_by, 'owner');
  // 两者必须是不同字段，删掉其一不得连带影响另一个
  assert.notEqual(decide({action: 'merge', family: 'documentation_and_test_artifacts', authority: {...a, automatic_deploy: false}}).allowed, false);
  assert.equal(decide({action: 'deploy', family: 'cloudflare_workers', authority: {...a, automatic_deploy: false}}).reason, 'auto_deploy_disabled');
});

test('被排除族即使开关为 true 也必须拒绝自动部署', () => {
  const a = loadAuthority();
  for (const fam of ['funding_moves', 'wallet_or_safe_ops', 'signing', 'refund_semantics']) {
    const r = decide({action: 'deploy', family: fam, authority: a});
    assert.equal(r.allowed, false, `${fam} 不应被自动部署`);
    assert.match(r.reason, /excluded_family/);
  }
});

test('正常部署族可自动执行，回滚默认拒绝', () => {
  const a = loadAuthority();
  assert.equal(decide({action: 'deploy', family: 'cloudflare_workers', authority: a}).allowed, true);
  assert.equal(decide({action: 'deploy', family: 'github_actions_pipeline', authority: a}).allowed, true);
  assert.equal(decide({action: 'rollback', family: 'cloudflare_workers', authority: a}).reason, 'auto_rollback_disabled');
});

test('未知动作必须 fail-closed', () => {
  assert.equal(decide({action: 'publish'}).allowed, false);
  assert.equal(decide({action: 'publish'}).reason, 'unknown_action');
});
