/**
 * ltzzz-pay-proxy 本地单元测试（Node ≥ 19，无外部依赖）
 * 运行：node tools/pay_safety_test.mjs
 * 覆盖：金额规整 / 类目黑名单 / RSA2 签名验签（含 PKCS1→PKCS8 转换）/
 *       决策安全规则（余额、超限、黑名单、白名单、重复支出、连续失败暂停）/ 签名串构造
 */
import { generateKeyPairSync } from 'node:crypto';
import {
  checkDecision, buildSignString, rsa2Sign, rsa2Verify, pkcs1ToPkcs8,
  isBlockedCategory, normalizeAmount, BLOCK_CATEGORIES,
} from '../ltzzz-pay-proxy-worker.mjs';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.error(`  ✘ ${name}${extra ? ' → ' + JSON.stringify(extra) : ''}`); }
}

/* ---------- 内存 KV mock ---------- */
function mockKV() {
  const map = new Map();
  return {
    get: async (k, type) => (type === 'json' ? (map.has(k) ? JSON.parse(map.get(k)) : null) : map.get(k) ?? null),
    put: async (k, v) => { map.set(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    del: async (k) => { map.delete(k); },
    list: async ({ prefix }) => ({ keys: [...map.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }),
    _map: map,
  };
}

/* ---------- 1. 金额 ---------- */
console.log('\n[1] normalizeAmount');
ok('合法金额 19.9', normalizeAmount('19.9') === 19.9);
ok('整数 400', normalizeAmount(400) === 400);
ok('两位小数 0.1', normalizeAmount('0.1') === 0.1);
ok('负数拒绝', normalizeAmount(-5) === null);
ok('零拒绝', normalizeAmount(0) === null);
ok('非数字拒绝', normalizeAmount('abc') === null);

/* ---------- 2. 类目黑名单 ---------- */
console.log('\n[2] isBlockedCategory');
ok('赌博', isBlockedCategory('gambling'));
ok('花呗', isBlockedCategory('huabei'));
ok('个人转账', isBlockedCategory('personal-transfer'));
ok('诈骗变体', isBlockedCategory('scam-like'));
ok('正常类目放行', !isBlockedCategory('video-generation'));
ok('API 服务放行', !isBlockedCategory('api-service'));

/* ---------- 3. RSA2 签名/验签（含 PKCS1 私钥转换） ---------- */
console.log('\n[3] RSA2 sign/verify');
{
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privPkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' });   // "BEGIN RSA PRIVATE KEY"
  const privPkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' });   // "BEGIN PRIVATE KEY"
  const pubSpki = publicKey.export({ type: 'spki', format: 'pem' });       // "BEGIN PUBLIC KEY"

  ok('pkcs1ToPkcs8 产出合法 DER（以 BEGIN PRIVATE KEY 头部包装）', pkcs1ToPkcs8(privPkcs1).length > 100);

  const text = 'app_id=2021000000000000&biz_content={"a":1}&method=alipay.trade.query&sign_type=RSA2';
  const sig1 = await rsa2Sign(text, privPkcs1);   // 经 PKCS1→PKCS8 转换后签名
  const sig2 = await rsa2Sign(text, privPkcs8);   // 原生 PKCS8 签名
  ok('PKCS1 与 PKCS8 签名结果一致', sig1 === sig2);
  ok('验签通过（支付宝公钥）', await rsa2Verify(text, sig1, pubSpki));
  ok('篡改内容验签失败', !(await rsa2Verify(text + '&tampered=1', sig1, pubSpki)));
}

/* ---------- 4. 签名串构造 ---------- */
console.log('\n[4] buildSignString');
{
  const s = buildSignString({ z: '1', a: '2', sign: 'x', sign_type: 'RSA2', b: '3' });
  ok('按键名升序且剔除 sign/sign_type', s === 'a=2&b=3&z=1');
}

/* ---------- 5. 决策安全规则 ---------- */
console.log('\n[5] checkDecision');
{
  const kv = mockKV();
  const env = { LTZZZ_MAX_AMOUNT: '50', PAY_MODE: 'manual', LTZZZ_ALLOWED_VENDORS: '[]' };

  await kv.put('ltzzz:balance', JSON.stringify({ initial: 400, spent: 0, refunded: 0 }));
  const base = { project: 'LTZZZ', vendor: '某视频生成服务', vendor_id: 'v1', item: 'API 额度', category: 'api-service', amount: 19.9, reason: '测试第一批视频生产能力' };

  let r = await checkDecision(env, kv, base);
  ok('正常采购允许', r.allowed, r);

  r = await checkDecision(env, kv, { ...base, amount: 60 });
  ok('超单笔上限(50) → 拒绝', !r.allowed, r.reason);

  r = await checkDecision(env, kv, { ...base, category: 'gambling' });
  ok('赌博类目拒绝', !r.allowed, r.reason);

  r = await checkDecision(env, kv, { ...base, amount: 400.01 });
  ok('超总授权额度拒绝', !r.allowed, r.reason);

  await kv.put('ltzzz:balance', JSON.stringify({ initial: 400, spent: 399.9, refunded: 0 }));
  r = await checkDecision(env, kv, { ...base, amount: 0.2 });
  ok('余额不足拒绝（剩 0.1）', !r.allowed, r.reason);
  await kv.put('ltzzz:balance', JSON.stringify({ initial: 400, spent: 400, refunded: 0 }));
  r = await checkDecision(env, kv, base);
  ok('余额=0 全局停止', !r.allowed, r.reason);
  await kv.put('ltzzz:balance', JSON.stringify({ initial: 400, spent: 0, refunded: 0 }));

  // 短时间同服务商同金额重复（模拟一笔已成功入账）
  await kv.put(`ltzzz:ledger:1`, JSON.stringify({ time: new Date().toISOString(), vendor_id: 'v1', amount: 19.9, result: 'success' }));
  r = await checkDecision(env, kv, base);
  ok('5 分钟内同服务商同金额重复 → 拒绝', !r.allowed, r.reason);

  // 连续失败暂停
  await kv.put('ltzzz:fail:v2', '3');
  r = await checkDecision(env, kv, { ...base, vendor_id: 'v2' });
  ok('连续失败 3 次服务商暂停', !r.allowed, r.reason);

  // 全局暂停
  await kv.put('ltzzz:stop:global', '用户暂停');
  r = await checkDecision(env, kv, base);
  ok('全局暂停生效', !r.allowed, r.reason);
  await kv.del('ltzzz:stop:global');
}

/* ---------- 6. transfer 档位白名单 ---------- */
console.log('\n[6] transfer 模式白名单');
{
  const kv = mockKV();
  const env = {
    LTZZZ_MAX_AMOUNT: '50', PAY_MODE: 'transfer',
    LTZZZ_ALLOWED_VENDORS: JSON.stringify([{ id: 'v1', name: '某某云', identity: 'vendor@alipay.com', identity_type: 'ALIPAY_LOGON_ID', max_amount: 200 }]),
  };
  await kv.put('ltzzz:balance', JSON.stringify({ initial: 400, spent: 0, refunded: 0 }));
  let r = await checkDecision(env, kv, { vendor_id: 'v1', amount: 30, category: 'cloud' });
  ok('白名单内服务商允许', r.allowed, r);
  r = await checkDecision(env, kv, { vendor_id: 'unknown', amount: 30, category: 'cloud' });
  ok('白名单外服务商拒绝', !r.allowed, r.reason);
  r = await checkDecision(env, kv, { vendor_id: 'v1', amount: 300, category: 'cloud' });
  ok('超服务商单笔上限(200)拒绝', !r.allowed, r.reason);
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
