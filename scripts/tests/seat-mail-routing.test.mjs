import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSeatMailRegistry, normalizeSeatId, seatMailRoute} from '../lib/seat-mail-routing.mjs';

const registry = {
  seats: [
    {id: 'owner', address: 'ltzyz2181@gmail.com', kind: 'owner', transport: 'smtp_shared_qq'},
    {id: 'deep', address: 'qingqizhu6502@agent.qq.com', kind: 'agent_mail', transport: 'agently_cli'},
    {id: 'desktop_claude', address: '306122054@qq.com', kind: 'shared_mailbox', seat_prefix: '[seat:desktop_claude]', transport: 'seat_mail_relay'},
    {id: 'qianwen', address: null, kind: 'unverified', transport: 'none', status: 'unavailable'},
  ],
};

test('normalizes hyphen and underscore seat ids', () => {
  assert.equal(normalizeSeatId('desktop-claude'), 'desktop-claude');
  assert.equal(normalizeSeatId('desktop_claude'), 'desktop-claude');
  assert.equal(normalizeSeatId('did:ltzzz:relay_gpt'), 'relay-gpt');
});

test('owner mail stays with the owner address and no prefix', () => {
  const route = seatMailRoute('owner', {registry});
  assert.equal(route.to, 'ltzyz2181@gmail.com');
  assert.equal(route.subject_prefix, '');
  assert.equal(route.delivery, 'owner_mailbox');
});

test('shared-mailbox seats keep their registered prefix', () => {
  const route = seatMailRoute('desktop-claude', {registry});
  assert.equal(route.to, '306122054@qq.com');
  assert.equal(route.subject_prefix, '[seat:desktop_claude]');
  assert.equal(route.delivery, 'seat_mailbox');
});

test('Agent Mail seats use a recorded shared-mailbox fallback, not a false direct send', () => {
  const route = seatMailRoute('deep', {registry});
  assert.equal(route.to, '306122054@qq.com');
  assert.equal(route.subject_prefix, '[seat:deep]');
  assert.equal(route.transport, 'agently_cli');
  assert.equal(route.delivery, 'shared_mailbox_fallback');
  assert.equal(route.reason, 'smtp_relay_cannot_reach_agent_mail');
});

test('an unavailable or unknown seat falls back to the owner mailbox', () => {
  assert.equal(seatMailRoute('qianwen', {registry}).delivery, 'owner_fallback');
  assert.equal(seatMailRoute('no-such-seat', {registry}).to, 'ltzyz2181@gmail.com');
});

test('the repository registry routes desktop-claude and deep deterministically', () => {
  const real = loadSeatMailRegistry(process.cwd());
  assert.ok(Array.isArray(real.seats) && real.seats.length > 0);
  assert.equal(seatMailRoute('desktop-claude', {registry: real}).delivery, 'seat_mailbox');
  assert.equal(seatMailRoute('deep', {registry: real}).delivery, 'shared_mailbox_fallback');
});
