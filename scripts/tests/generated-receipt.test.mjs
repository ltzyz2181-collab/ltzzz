import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {git} from '../../tools/push-receipt-commit.mjs';
import {pushGeneratedReceipt} from '../../tools/push-generated-receipt.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-receipt-'));
  const remote = path.join(root, 'remote.git');
  const a = path.join(root, 'a');
  const b = path.join(root, 'b');
  const cmd = (cwd, args) => {
    const r = git(cwd, args);
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  cmd(root, ['init', '--bare', '--initial-branch=main', remote]);
  cmd(root, ['clone', remote, a]);
  for (const dir of [a]) {
    cmd(dir, ['config', 'user.name', 'Fixture']);
    cmd(dir, ['config', 'user.email', 'fixture@example.invalid']);
  }
  fs.mkdirSync(path.join(a, 'knowledge/results/task-hub'), {recursive: true});
  fs.writeFileSync(path.join(a, 'knowledge/results/task-hub/latest.json'), '{}');
  cmd(a, ['add', '.']);
  cmd(a, ['commit', '-m', 'base']);
  cmd(a, ['push', 'origin', 'main']);
  cmd(root, ['clone', remote, b]);
  cmd(b, ['config', 'user.name', 'Fixture']);
  cmd(b, ['config', 'user.email', 'fixture@example.invalid']);
  return {root, a, b, cmd, target: 'knowledge/results/task-hub/latest.json', close: () => fs.rmSync(root, {recursive: true, force: true})};
}

test('an unchanged generated snapshot is not committed again', () => {
  const f = fixture();
  try {
    const r = pushGeneratedReceipt({
      cwd: f.a,
      target: f.target,
      build: (tree) => fs.writeFileSync(path.join(tree, f.target), '{}'),
    });
    assert.equal(r.ok, true);
    assert.equal(r.changed, false);
  } finally { f.close(); }
});

test('a rebuilt snapshot lands on the newest main instead of failing on a rebase conflict', () => {
  const f = fixture();
  try {
    let injected = false;
    const r = pushGeneratedReceipt({
      cwd: f.a,
      target: f.target,
      message: 'task-hub: snapshot',
      build: (tree) => fs.writeFileSync(path.join(tree, f.target), JSON.stringify({by_state: {new: 1}})),
      beforePush: () => {
        if (injected) return;
        injected = true;
        fs.writeFileSync(path.join(f.b, 'other.txt'), 'another writer');
        f.cmd(f.b, ['add', 'other.txt']);
        f.cmd(f.b, ['commit', '-m', 'other writer']);
        f.cmd(f.b, ['push', 'origin', 'main']);
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    assert.equal(r.attempts, 2);
    f.cmd(f.b, ['fetch', 'origin', 'main']);
    const latest = f.cmd(f.b, ['show', 'origin/main:' + f.target]);
    assert.equal(JSON.parse(latest).by_state.new, 1);
    assert.equal(f.cmd(f.b, ['show', 'origin/main:other.txt']), 'another writer');
  } finally { f.close(); }
});
