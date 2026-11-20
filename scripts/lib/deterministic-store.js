// Source Intelligence M1: 只读来源记录的确定性、只追加存储。
// 由 Deep 生成的初稿（PR #501）带 markdown 围栏且用 require，在 type=module 下不可执行；
// 本文件按仓库 ESM 规范重写，并落实 Task SOURCE-INTELLIGENCE-MVP-M1-M4 的“只追加更正”。
import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_FIELDS = ['source_url', 'retrieved_at', 'content_sha256', 'parser_version', 'uncertainty'];
export const DEFAULT_FILE = 'data/records.json';
const SHA256 = /^[a-f0-9]{64}$/;
const PRIVATE_HOST = /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

export function isPublicUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  return !PRIVATE_HOST.test(url.hostname);
}

export function assertRecord(record, {allowedHosts = null} = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('invalid_record');
  for (const field of REQUIRED_FIELDS) if (!(field in record)) throw new Error('missing_field:' + field);
  if (!isPublicUrl(record.source_url)) throw new Error('private_or_invalid_source');
  if (allowedHosts && !allowedHosts.includes(new URL(record.source_url).hostname)) throw new Error('source_not_allowlisted');
  if (!SHA256.test(String(record.content_sha256))) throw new Error('invalid_content_sha256');
  if (Number.isNaN(Date.parse(record.retrieved_at))) throw new Error('invalid_retrieved_at');
  if (typeof record.parser_version !== 'string' || !record.parser_version.trim()) throw new Error('invalid_parser_version');
  if (record.uncertainty === undefined) throw new Error('missing_field:uncertainty');
  return record;
}

// 只追加：同 URL 同哈希视为重复（幂等），同 URL 不同哈希追加新版本并指向上一版哈希。
export function appendRecord(records, record, options = {}) {
  const list = Array.isArray(records) ? records : [];
  assertRecord(record, options);
  const sameUrl = list.filter((item) => item.source_url === record.source_url);
  if (sameUrl.some((item) => item.content_sha256 === record.content_sha256)) {
    return {records: list, appended: false, reason: 'duplicate_content'};
  }
  const previous = sameUrl[sameUrl.length - 1] || null;
  const next = previous ? {...record, supersedes: previous.content_sha256} : {...record};
  return {records: [...list, next], appended: true, reason: previous ? 'appended_correction' : 'appended_new'};
}

export function readRecords(file = DEFAULT_FILE) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('records_not_array');
  return parsed;
}

export function addRecord(file, record, options = {}) {
  const result = appendRecord(readRecords(file), record, options);
  if (result.appended) {
    fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
    fs.writeFileSync(file, JSON.stringify(result.records, null, 1) + '\n', 'utf8');
  }
  return result;
}