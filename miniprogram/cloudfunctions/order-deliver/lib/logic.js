'use strict';

// 纯判定逻辑集中在这里，不依赖 wx-server-sdk：
// 云函数 index.js 只负责取身份、查库、写库，规则本身可以被 node --test 直接覆盖。

const MAX_INTAKE = 10;
const MAX_NAME_LENGTH = 120;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TRADE_NO_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
// 允许大写十六进制（外部工具常输出大写），统一落库为小写再比对。
const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

// ADMIN_OPENIDS 以逗号分隔配置在云函数环境变量里；未配置即拒绝一切交付写入（fail closed）。
function parseAdminList(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function isAdmin(list, openid) {
  if (!openid || !Array.isArray(list)) return false;
  return list.indexOf(openid) !== -1;
}

function isTradeNo(value) {
  return typeof value === 'string' && TRADE_NO_PATTERN.test(value);
}

function isSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

// 云存储 fileID 形如 cloud://env-bucket.xxxx/intake/<订单号>/<时间戳>-<文件名>。
// 必须同时满足：是 cloud:// 文件、路径里带本单订单号，避免把别人的文件挂到自己订单上。
function isIntakeFileId(fileID, tradeNo) {
  if (typeof fileID !== 'string' || !fileID) return false;
  if (fileID.slice(0, 8) !== 'cloud://') return false;
  return fileID.indexOf('/intake/' + tradeNo + '/') !== -1;
}

function normalizeIntake(input) {
  const fileID = input && input.fileID;
  if (typeof fileID !== 'string' || !fileID) throw fail('BAD_FILE', '缺少材料文件');
  const name = String((input && input.fileName) || '材料').trim();
  if (!name || name.length > MAX_NAME_LENGTH) throw fail('BAD_NAME', '材料名称无效');
  const size = input && input.size;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) throw fail('BAD_SIZE', '材料大小无效');
  if (size > MAX_FILE_BYTES) throw fail('FILE_TOO_LARGE', '单个材料不能超过 10MB');
  return {
    file_id: fileID,
    name: name,
    size: size,
    uploaded_at: (input && input.now) || new Date().toISOString()
  };
}

// 交付写入的唯一形态：状态、时间、交付人、文件、哈希缺一不可。
function buildDeliverPatch(input) {
  const sha256 = input && input.sha256;
  const fileID = input && input.fileID;
  const openid = input && input.openid;
  if (!isSha256(sha256)) throw fail('BAD_SHA256', '交付物需提供 64 位 sha256');
  if (typeof fileID !== 'string' || !fileID) throw fail('BAD_FILE', '缺少交付物文件');
  if (typeof openid !== 'string' || !openid) throw fail('NO_IDENTITY', '缺少交付人身份');
  return {
    status: 'delivered',
    delivered_at: (input && input.now) || new Date().toISOString(),
    delivered_by: openid,
    deliverable_file_id: fileID,
    deliverable_sha256: sha256.toLowerCase()
  };
}

module.exports = {
  MAX_INTAKE,
  MAX_NAME_LENGTH,
  MAX_FILE_BYTES,
  parseAdminList,
  isAdmin,
  isTradeNo,
  isSha256,
  isIntakeFileId,
  normalizeIntake,
  buildDeliverPatch
};
