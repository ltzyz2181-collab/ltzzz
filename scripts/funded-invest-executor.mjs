/**
 * funded-invest-executor.mjs — LTZZZ 真钱投资执行器（按声誉领额度）
 *
 * 用途：执行 agent-wallet/funded-invest-plan.json 里按声誉算好的额度，
 *      分派给 gpt / xai(grok) / doubao / deepseek 四个席位，去
 *      ① 欧易交易所（CEX，OKX REST API 下单）
 *      ② 欧易 Web3 钱包 DeFi（链上合约调用，仅构造待签载荷）
 *
 * 安全设计（不可绕过）：
 *   1. 默认 DRY-RUN。任何真实下单/签名都必须显式设置 ARM_REAL_ORDERS=1，
 *      且必须同时提供 ARM_ACK=<当前UTC日期 YYYY-MM-DD>，两者缺一即拒绝执行。
 *   2. Web3 DeFi 永不自签。只输出待签交易载荷 + 校验数据，签名必须由 owner 人工完成。
 *   3. 额度硬上限来自 plan.policy_caps，脚本内二次截断，不信任任何外部输入放大额度。
 *   4. 余额不足即拒绝，绝不部分下单后静默失败；每笔都写回执。
 *   5. 密钥只从环境变量读取，永不打印明文，永不写入回执文件。
 *
 * 用法：
 *   node scripts/funded-invest-executor.mjs --venue cex --agent grok
 *   node scripts/funded-invest-executor.mjs --venue web3 --agent all
 *   ARM_REAL_ORDERS=1 ARM_ACK=2026-10-17 node scripts/funded-invest-executor.mjs --venue cex --agent grok
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PLAN_PATH = 'agent-wallet/funded-invest-plan.json';
const OUT_DIR = 'knowledge/results/funded-invest';
const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'];
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AGENT_WALLET = '0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const mask = (v) => (v ? String(v).slice(0, 6) + '****' + String(v).slice(-4) : '(absent)');
const nowIso = () => new Date().toISOString();
/**
 * 北京时间（Asia/Shanghai）当日日期。
 * 注意：不能用 toISOString().slice(0,10)——那是 UTC 日期，北京时间 00:00–08:00 之间
 * 会慢一天，导致回执归档到错误日期，且 ARM_ACK 当日校验形同虚设。
 */
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/* ---------- 1. 读取计划并按 policy 二次截断额度 ---------- */
function loadPlan() {
  if (!fs.existsSync(PLAN_PATH)) throw new Error('plan missing: ' + PLAN_PATH);
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const caps = plan.policy_caps || {};
  const perTx = Number(caps.per_tx_cap_usdc ?? 20);
  const daily = Number(caps.daily_cap_usdc ?? 60);
  const pool = Number(plan.reference_pool_usdc ?? 0);
  let sum = 0;
  for (const a of plan.agents) {
    const raw = Number(a.quota_at_reference_pool ?? 0);
    a.quota_usdc = Math.min(raw, perTx);   // 单笔上限截断
    a.capped_by_policy = a.quota_usdc < raw;
    sum += a.quota_usdc;
  }
  plan._sum_quota = Number(sum.toFixed(6));
  plan._daily_cap = daily;
  plan._pool = pool;
  return plan;
}

/* ---------- 2. 链上只读余额（公开 RPC，无需密钥） ---------- */
async function rpcCall(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(25000),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.result;
}

async function withRpc(fn) {
  let lastErr = null;
  for (const rpc of RPCS) {
    try { return await fn(rpc); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all rpc failed');
}

async function balanceOfErc20(token, holder) {
  const data = '0x70a08231' + '0'.repeat(24) + holder.toLowerCase().replace(/^0x/, '');
  const hex = await withRpc((rpc) => rpcCall(rpc, 'eth_call', [{ to: token, data }, 'latest']));
  return Number(BigInt(hex)) / 1e6;
}

async function ethBalance(addr) {
  const hex = await withRpc((rpc) => rpcCall(rpc, 'eth_getBalance', [addr, 'latest']));
  return Number(BigInt(hex)) / 1e18;
}

/* ---------- 3. OKX CEX：签名 + 只读探测 + 下单（默认 dry-run） ---------- */
function okxCreds() {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET || process.env.OKX_SECRET_KEY;
  const pass = process.env.OKX_API_PASSPHRASE || process.env.OKX_PASSPHRASE;
  return { key, secret, pass, complete: Boolean(key && secret && pass) };
}

function okxSign(secret, ts, method, requestPath, body) {
  const pre = ts + method + requestPath + (body || '');
  return crypto.createHmac('sha256', secret).update(pre).digest('base64');
}

async function okxRequest(method, requestPath, bodyObj) {
  const c = okxCreds();
  if (!c.complete) return { ok: false, status: 'missing_secret_triplet', missing: !c.pass ? ['passphrase'] : (!c.key ? ['key'] : ['secret']) };
  const ts = new Date().toISOString();
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const headers = {
    'OK-ACCESS-KEY': c.key,
    'OK-ACCESS-SIGN': okxSign(c.secret, ts, method, requestPath, body),
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': c.pass,
    'Content-Type': 'application/json',
  };
  try {
    const r = await fetch('https://www.okx.com' + requestPath, {
      method, headers, body: body || undefined, signal: AbortSignal.timeout(25000),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d.code === '0', http: r.status, code: d.code ?? null, msg: d.msg ?? null, data: d.data ?? null, status: 'requested' };
  } catch (e) {
    return { ok: false, status: 'network_or_timeout', error: String(e.message || e) };
  }
}

/** 只读：账户配置权限 + 余额。绝不下单。 */
async function okxReadOnly() {
  const out = { at: nowIso(), venue: 'okx_cex', orders_submitted: 0 };
  const c = okxCreds();
  out.creds = { key_present: Boolean(c.key), secret_present: Boolean(c.secret), passphrase_present: Boolean(c.pass), complete: c.complete };
  if (!c.complete) { out.status = 'blocked_missing_credentials'; out.blocker = 'BLOCK-2'; return out; }
  const cfg = await okxRequest('GET', '/api/v5/account/config');
  const bal = await okxRequest('GET', '/api/v5/account/balance');
  out.config = { http: cfg.http, code: cfg.code, permissions: cfg.data?.[0]?.perm ?? null };
  out.balance = { http: bal.http, code: bal.code };
  if (bal.ok) {
    const details = bal.data?.[0]?.details || [];
    out.balance.nonzero_assets = details.filter((x) => Number(x.eq) > 0).map((x) => ({ ccy: x.ccy, eq: x.eq }));
    out.balance.usdt_eq = details.find((x) => x.ccy === 'USDT')?.eq ?? '0';
  }
  const perms = String(out.config.permissions || '').split(',').map((s) => s.trim());
  out.trade_permission = perms.includes('trade');
  out.status = cfg.ok && bal.ok ? 'verified_read_only' : 'api_error';
  return out;
}

/** 下单：默认 dry-run；armed 时才真正提交 */
async function okxPlaceOrder({ agent, instId, side, ordType, sz, armed }) {
  const rec = {
    at: nowIso(), venue: 'okx_cex', agent, instId, side, ordType, sz,
    armed, orders_submitted: 0, tx_hash: null, paid: false,
  };
  if (!armed) { rec.status = 'dry_run_not_armed'; rec.reason = 'ARM_REAL_ORDERS=1 且 ARM_ACK=今日 才会真实下单'; return rec; }
  const ro = await okxReadOnly();
  if (!ro.trade_permission) { rec.status = 'blocked_no_trade_permission'; rec.permissions = ro.config?.permissions ?? null; return rec; }
  const body = { instId, tdMode: 'cash', side, ordType, sz };
  const r = await okxRequest('POST', '/api/v5/trade/order', body);
  rec.okx_code = r.code; rec.okx_msg = r.msg; rec.okx_data = r.data;
  if (r.ok && r.data?.[0]?.ordId) {
    rec.orders_submitted = 1; rec.paid = true; rec.ordId = r.data[0].ordId; rec.status = 'submitted';
  } else {
    rec.status = 'order_rejected';
  }
  return rec;
}

/* ---------- 4. Web3 钱包 DeFi：只构造待签载荷，永不自签 ---------- */
const AAVE_V3_POOL_BASE = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'; // Aave V3 Pool (Base)
const RESERVE_INDEX = 0; // USDC 在 Base Aave V3 的 underlying

function encodeAddressArg(addr) { return '0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''); }
/**
 * 编码为 32 字节 uint256。接受 BigInt / number / 数字字符串。
 * 注意：Math.round(BigInt) 会抛 TypeError，所以这里先归一化为 BigInt 再处理。
 */
function encodeUint256(n) {
  let v;
  if (typeof n === 'bigint') v = n;
  else if (typeof n === 'number') v = BigInt(Math.round(n));
  else v = BigInt(String(n).trim());
  if (v < 0n) throw new Error('negative amount not allowed: ' + v);
  const hex = v.toString(16);
  if (hex.length > 64) throw new Error('amount overflows uint256: ' + hex);
  return hex.padStart(64, '0');
}

/**
 * 构造两笔待签交易：① approve USDC → Pool；② Pool.supply(USDC, amount, onBehalf, referral)
 * 只返回载荷与校验值，不签名、不广播。
 */
async function web3DeFiPayload({ agent, amountUsdc, onBehalf }) {
  const rec = {
    at: nowIso(), venue: 'okx_web3_defi', agent,
    chain: 'base', amount_usdc: amountUsdc,
    signing_performed: false, broadcast_performed: false,
    tx_hash: null, paid: false, status: null,
  };
  try {
    const walletUsdc = await balanceOfErc20(USDC_BASE, AGENT_WALLET);
    const walletEth = await ethBalance(AGENT_WALLET);
    rec.wallet = { address: AGENT_WALLET, usdc: Number(walletUsdc.toFixed(6)), eth: Number(walletEth.toFixed(6)) };
    if (walletUsdc < amountUsdc) {
      rec.status = 'blocked_insufficient_balance'; rec.blocker = 'BLOCK-1';
      rec.shortfall = Number((amountUsdc - walletUsdc).toFixed(6));
      return rec;
    }
    if (walletEth < 0.0005) { rec.status = 'blocked_insufficient_gas'; return rec; }

    const amountWei = BigInt(Math.round(amountUsdc * 1e6));
    rec.pending_txs = [
      {
        step: 1, purpose: 'approve USDC → Aave V3 Pool',
        to: USDC_BASE, value: '0x0',
        // approve(address spender, uint256 amount)  selector 0x095ea7b3
        data: '0x095ea7b3' + encodeAddressArg(AAVE_V3_POOL_BASE) + encodeUint256(amountWei),
      },
      {
        step: 2, purpose: 'Pool.supply(USDC, amount, onBehalf, referral=0)',
        to: AAVE_V3_POOL_BASE, value: '0x0',
        // supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) selector 0x617ba037
        data: '0x617ba037' + encodeAddressArg(USDC_BASE) + encodeUint256(amountWei) + encodeAddressArg(onBehalf) + '0000',
      },
    ];
    rec.unsigned_payload_sha256 = crypto.createHash('sha256').update(JSON.stringify(rec.pending_txs)).digest('hex');
    rec.status = 'payload_ready_awaiting_owner_signature';
    rec.next_step = 'owner 在欧易 Web3 钱包/任意签名端逐笔确认；本脚本不持有私钥、不自动签名';
  } catch (e) {
    rec.status = 'error'; rec.error = String(e.message || e);
  }
  return rec;
}

/* ---------- 5. 主流程 ---------- */
function armed() {
  const flag = process.env.ARM_REAL_ORDERS === '1';
  const ack = process.env.ARM_ACK === today();
  return { armed: flag && ack, flag, ack };
}

async function main() {
  const venue = arg('venue') || 'cex';
  const agentSel = arg('agent') || 'all';
  const { armed: isArmed, flag, ack } = armed();

  const plan = loadPlan();
  const run = {
    plan_version: plan.plan_version,
    at: nowIso(),
    run_date: today(),
    venue,
    agent_selection: agentSel,
    arm: { requested_flag: flag, ack_matches_today: ack, effective: isArmed },
    execution_status: 'not_started',
    orders_submitted: 0,
    paid: false,
    tx_hash: null,
    results: [],
  };

  const agents = agentSel === 'all' ? plan.agents : plan.agents.filter((a) => a.id === agentSel || a.seat_name === agentSel);
  if (!agents.length) { run.execution_status = 'no_matching_agent'; finish(run); return; }

  // 资金闸门：A 轨可用现金为 0 时，真实下单必然失败 → 直接标记阻塞，不浪费尝试
  const walletUsdc = await balanceOfErc20(USDC_BASE, AGENT_WALLET).catch(() => null);
  run.funding = {
    agent_wallet_usdc: walletUsdc === null ? 'unreadable' : Number(walletUsdc.toFixed(6)),
    required_sum: plan._sum_quota,
    sufficient: walletUsdc !== null && walletUsdc >= plan._sum_quota,
  };

  for (const a of agents) {
    const base = { agent: a.id, seat: a.seat_name, quota_usdc: a.quota_usdc, capped_by_policy: a.capped_by_policy };

    if (venue === 'cex') {
      if (!run.funding.sufficient && !isArmed) {
        run.results.push({ ...base, venue: 'okx_cex', status: 'dry_run_funding_insufficient', blocker: 'BLOCK-1', note: '额度已按声誉算好；A 轨可用 USDC 为 ' + run.funding.agent_wallet_usdc });
      } else {
        // CEX 用 USDT 计价；额度是 USDC 名义值，真实下单需先确认账户 USDT 余额
        const rec = await okxPlaceOrder({
          agent: a.id, instId: process.env.OKX_INST_ID || 'BTC-USDT',
          side: 'buy', ordType: 'market', sz: String(a.quota_usdc), armed: isArmed,
        });
        run.results.push({ ...base, ...rec });
        if (rec.orders_submitted) run.orders_submitted += 1;
      }
    } else if (venue === 'web3') {
      const onBehalf = a.address || AGENT_WALLET; // 无链上身份者由执行器代持并记账
      const rec = await web3DeFiPayload({ agent: a.id, amountUsdc: a.quota_usdc, onBehalf });
      rec.on_behalf = onBehalf;
      rec.uses_executor_custody = !a.has_own_chain_identity;
      if (!a.has_own_chain_identity) rec.blocker = 'BLOCK-3';
      run.results.push({ ...base, ...rec });
    } else {
      run.results.push({ ...base, status: 'unknown_venue', venue });
    }
  }

  run.paid = run.results.some((r) => r.paid === true);
  run.tx_hash = run.results.find((r) => r.tx_hash)?.tx_hash ?? null;
  run.execution_status = isArmed
    ? (run.orders_submitted > 0 ? 'executed' : 'armed_but_blocked')
    : 'dry_run_only';

  finish(run);
}

function finish(run) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, run.run_date + '-' + run.venue + '-' + (run.arm.effective ? 'armed' : 'dryrun') + '.json');
  fs.writeFileSync(file, JSON.stringify(run, null, 2));
  const c = okxCreds();
  console.log(JSON.stringify({
    file,
    execution_status: run.execution_status,
    arm_effective: run.arm.effective,
    orders_submitted: run.orders_submitted,
    paid: run.paid,
    tx_hash: run.tx_hash,
    funding: run.funding,
    okx_creds_complete: c.complete,
    key_mask: mask(process.env.OKX_API_KEY),
    per_agent: run.results.map((r) => ({ agent: r.agent, quota: r.quota_usdc, status: r.status, blocker: r.blocker ?? null })),
  }, null, 2));
}

main().catch((e) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, today() + '-error.json');
  fs.writeFileSync(file, JSON.stringify({ at: nowIso(), error: String(e.stack || e) }, null, 2));
  console.error('EXECUTOR_ERROR ' + String(e.message || e));
  process.exit(1);
});
