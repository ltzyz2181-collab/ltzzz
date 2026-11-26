import fs from 'node:fs';
import path from 'node:path';

export const OWNER_MAILBOX = 'ltzyz2181@gmail.com';
export const SHARED_MAILBOX = '306122054@qq.com';

export function normalizeSeatId(value) {
  return String(value || '').trim().toLowerCase().replace(/^did:ltzzz:/, '').replace(/_/g, '-');
}

export function loadSeatMailRegistry(cwd = process.cwd()) {
  const file = path.join(cwd, 'config/seat-mail-registry.json');
  if (!fs.existsSync(file)) return {seats: []};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// The seat-mail relay only has SMTP. Agent Mail seats cannot be reached by that
// transport from CI, so their wake-up goes to the shared project mailbox with a
// seat prefix and the delivery mode is recorded instead of claiming a direct send.
export function seatMailRoute(seat, {registry = {seats: []}, owner = OWNER_MAILBOX, sharedMailbox = SHARED_MAILBOX} = {}) {
  const id = normalizeSeatId(seat);
  const seats = Array.isArray(registry?.seats) ? registry.seats : [];
  const entry = seats.find((candidate) => normalizeSeatId(candidate.id) === id) || null;
  if (!entry || !entry.address || entry.status === 'unavailable' || entry.transport === 'none') {
    return {
      seat: id || 'unspecified',
      to: owner,
      subject_prefix: '',
      transport: entry?.transport || 'unknown',
      delivery: 'owner_fallback',
      reason: 'no_routable_seat_address',
    };
  }
  if (entry.transport === 'agently_cli' || entry.kind === 'agent_mail') {
    return {
      seat: id,
      to: sharedMailbox,
      subject_prefix: '[seat:' + id + ']',
      transport: 'agently_cli',
      delivery: 'shared_mailbox_fallback',
      reason: 'smtp_relay_cannot_reach_agent_mail',
    };
  }
  if (entry.kind === 'owner' || entry.transport === 'smtp_shared_qq') {
    return {
      seat: id,
      to: entry.address,
      subject_prefix: '',
      transport: entry.transport || 'smtp_shared_qq',
      delivery: 'owner_mailbox',
      reason: 'routable',
    };
  }
  return {
    seat: id,
    to: entry.address,
    subject_prefix: entry.seat_prefix || '[seat:' + id + ']',
    transport: entry.transport || 'seat_mail_relay',
    delivery: 'seat_mailbox',
    reason: 'routable',
  };
}
