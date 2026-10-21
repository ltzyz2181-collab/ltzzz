import { createHash } from 'node:crypto';

export function deliveryPayload(item, source) {
  if (!item || item.executor !== 'doubao' || typeof item.output !== 'string' || item.output.trim().length < 8 || !/^knowledge\/results\/[\w./-]+\.json$/.test(source) || source.split('/').includes('..') || item.file !== source || item.data?.hiring?.deliverable_file !== source) throw Error('invalid_provider_delivery');
  const text = item.output + '\nEvidence: https://ltzzz.com/' + source;
  return {text, sha256: createHash('sha256').update(text).digest('hex')};
}

export function isInternalSettlement(result, sha256) {
  const r = result?.receipt;
  return result?.ok === true && ['HIRED', 'ALREADY_SETTLED'].includes(result.status) &&
    r?.status === 'cleared' && r.paid === false && r.tx_hash === null &&
    r.settlement_mode === 'internal_credit' && r.poster === 'DeepSeek' && r.worker === 'Doubao' &&
    r.attester === 'GPT' && r.audit?.accepted === true && r.audit.auditor === 'GPT' &&
    r.audit.deliverable_sha256 === sha256 &&
    (r.deliverable_sha256 === undefined || r.deliverable_sha256 === sha256);
}
