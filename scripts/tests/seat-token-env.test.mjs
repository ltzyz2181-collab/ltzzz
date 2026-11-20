import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'ghp_' + 'a1b2c3d4e5'.repeat(3);

function run(command, args, options = {}) {
  return spawnSync(command, args, {encoding: 'utf8', timeout: 90000, cwd: root, ...options});
}
function usable(command, args) {
  const result = run(command, args);
  return !result.error && result.status === 0;
}
function runBashScript(lines) {
  const dir = fs.mkdtempSync(path.join(root, '.tmp-seat-env-'));
  const file = path.join(dir, 'case.sh');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  const relative = path.relative(root, file).split(path.sep).join('/');
  try {
    return run('bash', [relative]);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const hasBash = usable('bash', ['--version']);
const psExe = usable('powershell', ['-NoProfile', '-Command', 'exit 0']) ? 'powershell'
  : usable('pwsh', ['-NoProfile', '-Command', 'exit 0']) ? 'pwsh' : '';
const psArgs = (extra) => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/seat-token-env.ps1', ...extra];

test('seat-token-env.sh resolves GH_TOKEN and never prints it', {skip: hasBash ? false : 'bash not available'}, () => {
  const result = runBashScript([
    'export GH_TOKEN=' + TOKEN,
    'bash scripts/seat-token-env.sh --check',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"has_token":true/);
  assert.match(result.stdout, /env:GH_TOKEN/);
  assert.ok(!result.stdout.includes(TOKEN), 'token must not be printed');
  assert.ok(!result.stderr.includes(TOKEN), 'token must not be printed to stderr');
});

test('seat-token-env.sh injects the token into the child process only', {skip: hasBash ? false : 'bash not available'}, () => {
  const result = runBashScript([
    'export GH_TOKEN=' + TOKEN,
    'bash scripts/seat-token-env.sh --exec node -e ' + JSON.stringify('process.stdout.write("child=" + (process.env.GH_TOKEN === ' + JSON.stringify(TOKEN) + ' && process.env.GITHUB_TOKEN === ' + JSON.stringify(TOKEN) + '))'),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /child=true/);
  assert.ok(!result.stdout.includes(TOKEN), 'token must not be printed');
});

test('seat-token-env.sh reads GH_TOKEN from ~/.config/ltzzz/github.env when no env token is set', {skip: hasBash ? false : 'bash not available'}, () => {
  const result = runBashScript([
    'tmp=$(mktemp -d)',
    'mkdir -p "$tmp/.config/ltzzz"',
    'printf "GH_TOKEN=' + TOKEN + '\\n" > "$tmp/.config/ltzzz/github.env"',
    'HOME="$tmp" bash scripts/seat-token-env.sh --check',
    'HOME="$tmp" bash scripts/seat-token-env.sh --exec node -e ' + JSON.stringify('process.stdout.write("child=" + (process.env.GH_TOKEN === ' + JSON.stringify(TOKEN) + '))'),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /file:github.env/);
  assert.match(result.stdout, /child=true/);
  assert.ok(!result.stdout.includes(TOKEN), 'token must not be printed');
});

test('seat-token-env.sh fails closed when no token is available', {skip: hasBash ? false : 'bash not available'}, () => {
  const result = runBashScript([
    'HOME=$(mktemp -d) GIT_TERMINAL_PROMPT=0 bash scripts/seat-token-env.sh --exec true',
    'echo rc=$?',
  ]);
  const output = result.stdout + result.stderr;
  assert.ok(!output.includes(TOKEN));
  assert.match(output, /rc=3/);
  assert.match(output, /token_missing/);
});

test('seat-token-env.ps1 reports and injects without printing', {skip: psExe ? false : 'powershell not available'}, () => {
  const env = {...process.env, GH_TOKEN: TOKEN, GITHUB_TOKEN: TOKEN};
  const check = run(psExe, psArgs(['-Check']), {env});
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /"has_token":true/);
  assert.match(check.stdout, /env:GH_TOKEN/);
  assert.ok(!check.stdout.includes(TOKEN), 'token must not be printed');

  const probe = path.join(os.tmpdir(), `seat-env-probe-${process.pid}.mjs`);
  fs.writeFileSync(probe, 'process.stdout.write("child=" + (process.env.GH_TOKEN === process.env.GITHUB_TOKEN && process.env.GH_TOKEN === ' + JSON.stringify(TOKEN) + '))\n', 'utf8');
  try {
    const exec = run(psExe, psArgs(['-Exec', `node "${probe}"`]), {env});
    assert.equal(exec.status, 0, exec.stderr);
    assert.match(exec.stdout, /child=true/);
    assert.ok(!exec.stdout.includes(TOKEN), 'token must not be printed');
  } finally {
    fs.rmSync(probe, {force: true});
  }
});

test('seat-token-env.ps1 prints usage and exits 2 without arguments', {skip: psExe ? false : 'powershell not available'}, () => {
  const result = run(psExe, psArgs([]), {env: {...process.env, GH_TOKEN: '', GITHUB_TOKEN: ''}});
  assert.equal(result.status, 2);
  assert.match(result.stdout, /seat-token-env/);
});