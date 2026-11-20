import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const SECRET_VALUE_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const SENSITIVE_KEY = /^(password|passwd|secret|token|auth_code|app_password|private_key|access_key|api_key)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function walk(value, trail = [], out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, trail.concat(String(index)), out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) walk(item, trail.concat(key), out);
    return out;
  }
  out.push({path: trail.join('.'), key: trail.at(-1) || '', value});
  return out;
}

test('seat mail registry declares every seat without storing credentials', () => {
  const registry = readJson('config/seat-mail-registry.json');
  assert.equal(registry.schema, 'ltzzz.seat-mail-registry.v1');
  assert.equal(registry.repo_visibility, 'public');

  const expected = ['owner', 'doubao', 'workbuddy', 'deep', 'qianwen', 'kimi_cn', 'xai', 'relay_gpt', 'relay_claude', 'desktop_claude', 'desktop_gpt', 'meta'];
  const seats = new Map(registry.seats.map((seat) => [seat.id, seat]));
  for (const id of expected) {
    const seat = seats.get(id);
    assert.ok(seat, 'missing seat ' + id);
    assert.match(seat.address, EMAIL, 'bad address for ' + id);
    assert.ok(seat.transport, 'missing transport for ' + id);
    assert.ok(seat.status, 'missing status for ' + id);
  }

  assert.equal(seats.get('doubao').address, 'qingqizhu6502@agent.qq.com');
  assert.equal(seats.get('owner').address, 'ltzyz2181@gmail.com');
  assert.equal(registry.shared_mailbox.address, '306122054@qq.com');

  for (const seat of registry.seats) {
    if (seat.kind === 'shared_mailbox') {
      assert.equal(seat.address, registry.shared_mailbox.address, 'shared seat must use the shared mailbox: ' + seat.id);
      assert.equal(seat.seat_prefix, '[seat:' + seat.id + ']', 'seat prefix mismatch: ' + seat.id);
    }
  }
});

test('WorkBuddy address stays unconfirmed until owner settles the spelling', () => {
  const registry = readJson('config/seat-mail-registry.json');
  const workbuddy = registry.seats.find((seat) => seat.id === 'workbuddy');
  assert.equal(workbuddy.status, 'needs_address_confirmation');
  assert.equal(workbuddy.owner_stated_address, 'gii7122@agent.qq.com');
  assert.equal(workbuddy.address, 'sgii7122@agent.qq.com');
});

test('registry carries credential names only, never values', () => {
  const registry = readJson('config/seat-mail-registry.json');
  const leaves = walk(registry);
  for (const leaf of leaves) {
    if (typeof leaf.value !== 'string') continue;
    for (const pattern of SECRET_VALUE_PATTERNS) {
      assert.ok(!pattern.test(leaf.value), 'possible secret at ' + leaf.path);
    }
    if (SENSITIVE_KEY.test(leaf.key)) {
      assert.match(leaf.value, /^[A-Z0-9_]+$/, 'sensitive field must hold an env name, not a value: ' + leaf.path);
    }
  }
  for (const [name, ref] of Object.entries(registry.credential_refs)) {
    assert.equal(ref.value_in_repo, false, 'credential ref must be external: ' + name);
    assert.ok(Array.isArray(ref.env) && ref.env.length > 0, 'credential ref needs env names: ' + name);
    assert.ok(ref.where, 'credential ref needs a location note: ' + name);
  }
  for (const [name, channel] of Object.entries(registry.token_injection)) {
    assert.equal(channel.value_in_repo, false, 'token channel must be external: ' + name);
  }
});

test('mail allowlist only lists known addresses and caps recipients', () => {
  const registry = readJson('config/seat-mail-registry.json');
  const allowlist = readJson('config/mail-allowlist-20261119.json');
  assert.equal(allowlist.registry, 'config/seat-mail-registry.json');
  assert.ok(allowlist.limits.max_recipients_per_mail <= 8);

  const known = new Set(registry.seats.map((seat) => seat.address));
  known.add(registry.shared_mailbox.address);
  for (const entry of allowlist.addresses) {
    assert.match(entry.address, EMAIL);
    assert.ok(known.has(entry.address), 'allowlist address is not registered: ' + entry.address);
    assert.ok(Array.isArray(entry.seats) && entry.seats.length > 0, 'allowlist entry needs seats: ' + entry.address);
  }
  assert.ok(allowlist.addresses.some((entry) => entry.address === 'qingqizhu6502@agent.qq.com'));
  assert.ok(allowlist.addresses.some((entry) => entry.address === '306122054@qq.com'));
});