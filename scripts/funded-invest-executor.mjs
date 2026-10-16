/**
 * funded-invest-executor.mjs v2 — LTZZZ 四席位真钱投资派单执行器
 *
 * 治理边界（policy/web3-investment-charter-v0.1.md，owner 一票生效）：
 *   §1 仅允许 Aave V3 Base 主网 / USDC；非白名单 → 合约 revert
 *   §2 试点档单笔 ≤20 USDC、敞口 ≤100 USDC；余额 <5 USDC 停止开新仓
 *   §3 无 receipt 不算投资：hypothesis → exit_plan → tx_hash
 *   §6 执行席不得自行扩大限额或白名单
 *
 * v2 相对 v1 的四项更正（自审，详见 plan.self_audit_v1_errors）：
 *   1. 移除 CEX 下单能力。BTC-USDT 不在章程白名单，执行席无权扩白名单 → venue=cex 一律拒绝。
 *   2. 移除直连 Aave Pool 的 approve+supply 载荷。那会绕过 LTZZZVault 的
 *      ForbiddenTarget / 日限 / 暂停 / veto 护栏 → 改为走既有受审计路径。
 *   3. 额度不再自行决定：真值源是 WEP3 协议的 reputation_and_actual_equity 实时限额，
 *      本脚本只做派单参考值与二次截断，冲突时服从协议。
 *   4. 资金池改为当前在用金库 0x5df5…a32d（v1 误查 agent 钱包与 legacy vault 得出「资金为 0」的错误结论）。
 *
 * 安全闸门：
 *   - 默认只读/dry-run。真实执行需 ARM_REAL_ORDERS=1 且 ARM_ACK=当天北京时间日期。
 *   - 密钥只从环境变量读取，永不打印明文、永不写入回执。
 *   - 余额不足即拒，绝不部分执行后静默失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PLAN_PATH = 'agent-wallet/funded-invest-plan.json';
const OUT_DIR = 'knowledge/results/funded-invest';
const RPCS = ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org'];
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AUSDC_BASE = '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';
// 当前在用金库（withdraw_receiver / 签名主体），非 agent 钱包、非 legacy vault
const TREASURY = '0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d';
// 既有受审计执行路径：WEP3 Worker（签名与合约护栏都在 Worker/金库内）
const WEP3_BASE = process.env.WEP3_BASE || 'https://ltzzz-wep3.ltzyz2181.workers.dev';

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };
const mask = (v) => (v ? String(v).slice(0, 6) + '****' + String(v).slice(-4) : '(absent)');
const nowIso = () => new Date().toISOString();
/** 北京时间当日日期。不可用 toISOString().slice(0,10)：UTC 在北京 00:00–08:00 慢一天，
 *  会导致回执归档错日期，且 ARM_ACK 当日校验形同虚设。 */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function loadPlan() {
  if (!fs.existsSync(PLAN_PATH)) throw new Error('plan missing: ' + PLAN_PATH);
  const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  const lim = plan.protocol_limits_2026_10_15 || {};
  const singleCap = Number(lim.single_cap_usdc ?? 20);
  const charterCap = 20; // 章程 §2 试点档
  const hardCap = Math.min(singleCap, charterCap);
  for (const a of plan.agents) {
    const raw = Number(a.quota_at_reference_pool ?? 0);
    a.quota_usdc = Math.min(raw, hardCap);
    a.capped_by = a.quota_usdc < raw ? 'policy' : null;
  }
  plan._hard_cap = hardCap;
  plan._sum_quota = Number(plan.agents.reduce((s, a) => s + a.quota_usdc, 0).toFixed(6));
  return plan;
}

/* ---------- 链上只读（公开 RPC，无需密钥） ---------- */
async function rpcCall(url, method, params) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(25000),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return d.result;
}
async function withRpc(fn) {
  let last = null;
  for (const rpc of RPCS) { try { return { rpc, value: await fn(rpc) }; } catch (e) { last = e; } }
  throw last || new Error('all rpc failed');
}
const balData = (holder) => '0x70a08231' + '0'.repeat(24) + holder.toLowerCase().replace(/^0x/, '');
async function erc20(token, holder) {
  const { value } = await withRpc((rpc) => rpcCall(rpc, 'eth_call', [{ to: token, data: balData(holder) }, 'latest']));
  return Number(BigInt(value)) / 1e6;
}
async function ethOf(addr) {
  const { value } = await withRpc((rpc) => rpcCall(rpc, 'eth_getBalance', [addr, 'latest']));
  return Number(BigInt(value)) / 1e18;
}

/* ---------- WEP3 Worker：既有受审计路径 ---------- */
function runnerToken() {
  if (process.env.WEP3_RUNNER_TOKEN) return { token: process.env.WEP3_RUNNER_TOKEN, derived: false };
  const cf = process.env.CLOUDFLARE_API_TOKEN;
  if (!cf) return { token: null, derived: false };
  return { token: crypto.createHmac('sha256', cf).update('ltzzz-runner-v2').digest('hex'), derived: true };
}

async function wep3(action, body) {
  const { token, derived } = runnerToken();
  const rec = { at: nowIso(), path: action, token_present: Boolean(token), token_derived: derived };
  if (!token) { rec.status = 'blocked_missing_runner_token'; rec.blocker = 'BLOCK-4'; return rec; }
  const isRead = ['status', 'diagnose', 'reconcile', 'preview', 'auto-preview'].includes(action);
  const p = '/market/aave/' + (action === 'auto-preview' ? 'auto-preview' : action === 'auto' ? 'auto' : action === 'reconcile' ? 'reconcile' : action === 'diagnose' ? 'diagnostics' : action === 'preview' ? 'preview' : action === 'status' ? 'status' : 'execute');
  try {
    const r = await fetch(WEP3_BASE + p, {
      method: isRead ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lab-Pin': token },
      body: isRead ? undefined : JSON.stringify(body || {}),
      signal: AbortSignal.timeout(60000),
    });
    rec.http = r.status;
    const j = await r.json().catch(() => null);
    rec.result = j;
    rec.service_verified = Boolean(r.ok && j && j.ok === true);
    rec.status = rec.service_verified ? (isRead ? 'read_ok' : 'execute_ok') : 'service_or_execution_failed';
  } catch (e) {
    rec.status = 'unreachable';
    rec.blocker = 'BLOCK-6';
    rec.error = String(e.message || e).slice(0, 200);
  }
  return rec;
}

/** 协议实时限额（额度真值源）。只读。 */
async function protocolLimits() {
  const st = await wep3('status');
  const lim = st.result?.limits || st.result?.storage?.limits || null;
  return { status_probe: st, limits: lim };
}

/* ---------- 额度分派（派单参考值，服从协议） ---------- */
function dispatchTable(plan, treasury, protocolLim) {
  const cap = protocolLim?.single_cap_usdc != null ? Number(protocolLim.single_cap_usdc) : plan._hard_cap;
  const floor = protocolLim?.cash_floor_usdc != null ? Number(protocolLim.cash_floor_usdc) : 5;
  const spendable = Math.max(0, Number(treasury.usdc ?? 0) - floor);
  let remaining = spendable;
  return plan.agents.map((a) => {
    const want = Math.min(a.quota_usdc, cap);
    const granted = Math.min(want, Math.max(0, remaining));
    remaining = Number((remaining - granted).toFixed(6));
    return {
      agent: a.id, seat: a.seat_name, rank: a.rank,
      identity_score: a.identity_score, multiplier: a.multiplier,
      weight_share: a.weight_share,
      quota_reference_usdc: a.quota_usdc,
      protocol_single_cap_usdc: Number(cap.toFixed(6)),
      granted_usdc: Number(granted.toFixed(6)),
      reduced_reason: granted < want ? (granted === 0 ? 'cash_floor_or_pool_exhausted' : 'pool_partial') : null,
      has_own_chain_identity: a.has_own_chain_identity,
      custody: a.has_own_chain_identity ? 'own_eoa' : 'treasury_custody',
      blocker: a.has_own_chain_identity ? null : 'BLOCK-3',
    };
  });
}

function armed() {
  const flag = process.env.ARM_REAL_ORDERS === '1';
  const ack = process.env.ARM_ACK === today();
  return { armed: flag && ack, flag, ack };
}

async function main() {
  const venue = arg('venue') || 'web3';
  const agentSel = arg('agent') || 'all';

  // 入参白名单：无效 venue 必须显式失败。
  // 曾因缺此校验导致 `--venue nosuch` 静默 exit 0 并伪造一份空回执，
  // 与本项目历史上的 dry_run 谎报同类，绝不允许「跑了不存在的路径却看起来像成功」。
  const VENUES = ['web3', 'defi', 'okx_web3_defi', 'cex', 'okx', 'okx_cex'];
  if (!VENUES.includes(venue)) {
    console.error('INVALID_VENUE venue=' + venue + ' allowed=' + VENUES.join(','));
    process.exit(2);
  }

  const { armed: isArmed, flag, ack } = armed();
  const plan = loadPlan();

  // agent 选择校验：拼错席位名不得静默产出「零席位」回执冒充成功
  const known = plan.agents.map((a) => a.id).concat(plan.agents.map((a) => a.seat_name));
  if (agentSel !== 'all' && !known.includes(agentSel)) {
    console.error('INVALID_AGENT agent=' + agentSel + ' allowed=all,' + plan.agents.map((a) => a.id).join(','));
    process.exit(2);
  }

  const run = {
    plan_version: plan.plan_version,
    at: nowIso(), run_date: today(), venue, agent_selection: agentSel,
    arm: { requested_flag: flag, ack_matches_today: ack, effective: isArmed },
    charter: 'policy/web3-investment-charter-v0.1.md',
    execution_status: 'not_started', orders_submitted: 0, paid: false, tx_hash: null,
    results: [],
  };

  // 章程闸门：CEX 一律拒绝（BLOCK-5）。执行席无权扩白名单。
  if (venue === 'cex' || venue === 'okx' || venue === 'okx_cex') {
    run.execution_status = 'refused_by_charter';
    run.blocker = 'BLOCK-5';
    run.refusal = {
      reason: '章程 §1 仅允许 Aave V3 Base / USDC；§6 执行席不得自行扩大白名单',
      requested_venue: venue,
      note: '如需启用 CEX 现货，须 owner 一票修订章程；在此之前本执行器不具备 CEX 下单能力',
    };
    run.results = plan.agents.map((a) => ({ agent: a.id, seat: a.seat_name, venue: 'okx_cex', status: 'refused_by_charter', paid: false, tx_hash: null }));
    return finish(run);
  }

  // 资金现实：当前在用金库（v1 曾误查 agent 钱包得出「资金为 0」的错误结论）
  const [usdc, ausdc, eth] = await Promise.all([
    erc20(USDC_BASE, TREASURY).catch(() => null),
    erc20(AUSDC_BASE, TREASURY).catch(() => null),
    ethOf(TREASURY).catch(() => null),
  ]);
  const treasury = {
    address: TREASURY,
    usdc: usdc === null ? null : Number(usdc.toFixed(6)),
    ausdc: ausdc === null ? null : Number(ausdc.toFixed(6)),
    eth: eth === null ? null : Number(eth.toFixed(6)),
    readable: usdc !== null,
  };
  run.treasury = treasury;
  run.agent_wallet_reference_only = { address: '0x21F502f29294c50d9C37A30dc038D8D95eB97fdc', note: 'A 轨钱包，当前 USDC=0，非本单资金池' };

  if (!treasury.readable) { run.execution_status = 'blocked_treasury_unreadable'; return finish(run); }
  if (treasury.usdc < 5) { run.execution_status = 'blocked_below_cash_floor'; run.blocker = 'charter_§2'; return finish(run); }

  // 协议实时限额 = 额度真值源
  const pl = await protocolLimits();
  run.protocol_limits_probe = { status: pl.status_probe.status, http: pl.status_probe.http, blocker: pl.status_probe.blocker ?? null };
  run.protocol_limits = pl.limits ?? { fallback: 'plan.protocol_limits_2026_10_15', ...plan.protocol_limits_2026_10_15 };
  if (!pl.limits) run.limits_source = 'plan_fallback_worker_unreachable';
  else run.limits_source = 'protocol_live';

  const table = dispatchTable(plan, treasury, pl.limits || plan.protocol_limits_2026_10_15);
  run.dispatch_table = table;
  run.granted_sum_usdc = Number(table.reduce((s, r) => s + r.granted_usdc, 0).toFixed(6));

  const targets = agentSel === 'all' ? table : table.filter((r) => r.agent === agentSel || r.seat === agentSel);
  if (!targets.length) { run.execution_status = 'no_matching_agent'; return finish(run); }

  for (const t of targets) {
    const rec = {
      agent: t.agent, seat: t.seat, venue: 'okx_web3_defi_via_wep3',
      granted_usdc: t.granted_usdc, custody: t.custody,
      on_behalf: t.has_own_chain_identity ? plan.agents.find((a) => a.id === t.agent)?.address : TREASURY,
      hypothesis: '按声誉额度将 USDC 供应至 Aave V3 Base，验证四席位真钱投资闭环（章程 §3）',
      exit_plan: 'Aave 无锁定期，随时 withdrawUSDC 全额赎回回金库（章程 §5）',
      paid: false, tx_hash: null, orders_submitted: 0, signing_performed_by_this_script: false,
    };
    if (t.granted_usdc <= 0) { rec.status = 'skipped_no_budget'; rec.blocker = t.blocker; run.results.push(rec); continue; }

    // 一律先做只读预览，拿到协议侧的真实限额与可执行性
    const prev = await wep3('preview', { intent_id: 'FUNDED-INVEST-' + run.run_date + '-' + t.agent, action: 'supply', amount_usdc: String(t.granted_usdc) });
    rec.preview = { http: prev.http, status: prev.status, blocker: prev.blocker ?? null, service_verified: prev.service_verified };

    if (!isArmed) {
      rec.status = prev.status === 'unreachable' ? 'dry_run_worker_unreachable' : 'dry_run_preview_only';
      rec.note = '未武装：不会发生任何链上执行。武装需 ARM_REAL_ORDERS=1 且 ARM_ACK=' + today();
      run.results.push(rec); continue;
    }
    if (prev.status === 'unreachable') { rec.status = 'armed_but_worker_unreachable'; rec.blocker = 'BLOCK-6'; run.results.push(rec); continue; }
    if (!prev.service_verified) { rec.status = 'armed_but_preview_failed'; run.results.push(rec); continue; }

    const ex = await wep3('execute', { intent_id: 'FUNDED-INVEST-' + run.run_date + '-' + t.agent, action: 'supply', amount_usdc: String(t.granted_usdc) });
    rec.execute = { http: ex.http, status: ex.status, service_verified: ex.service_verified };
    const step = Array.isArray(ex.result?.steps) ? ex.result.steps.findLast((s) => s.kind === 'supply') : null;
    if (ex.service_verified && ex.result?.status === 'confirmed' && step?.tx_hash) {
      rec.orders_submitted = 1; rec.paid = true; rec.tx_hash = step.tx_hash; rec.status = 'executed_onchain';
      run.orders_submitted += 1;
    } else {
      rec.status = ex.result?.status === 'pending' || ex.result?.status === 'pending_confirmations'
        ? 'pending_requires_reconciliation' : 'execution_not_confirmed';
    }
    run.results.push(rec);
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
  const file = path.join(OUT_DIR, run.run_date + '-' + (run.venue || 'web3') + '-' + (run.arm.effective ? 'armed' : 'dryrun') + '.json');
  fs.writeFileSync(file, JSON.stringify(run, null, 2));
  console.log(JSON.stringify({
    file, plan_version: run.plan_version, execution_status: run.execution_status,
    arm_effective: run.arm.effective, orders_submitted: run.orders_submitted,
    paid: run.paid, tx_hash: run.tx_hash,
    treasury: run.treasury, granted_sum_usdc: run.granted_sum_usdc,
    limits_source: run.limits_source ?? null,
    refusal: run.refusal ?? null,
    per_agent: (run.dispatch_table || run.results || []).map((r) => ({
      agent: r.agent ?? r.id, granted: r.granted_usdc ?? r.quota_usdc,
      status: r.status ?? null, custody: r.custody ?? null, blocker: r.blocker ?? null,
    })),
  }, null, 2));
}

main().catch((e) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, today() + '-error.json'), JSON.stringify({ at: nowIso(), error: String(e.stack || e) }, null, 2));
  console.error('EXECUTOR_ERROR ' + String(e.message || e));
  process.exit(1);
});
