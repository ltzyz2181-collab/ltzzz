#!/usr/bin/env node
// Wallet P0 selftest.
//
// Runs a synthetic ledger in a temp directory (never the real ledger) and then
// audits the configured real ledger read-only. A single failed check sets a
// non-zero exit code, so CI or a shell `&&` chain blocks on it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {
  aggregateMonetaryTotals,
  appendEvent,
  deriveBalance,
  foldBalances,
  readEvents,
  resolveLedgerPath,
  unitsToAmount,
  verifyChain,
} from './core.mjs';
import {attemptSettlement} from './adapters/index.mjs';
import {readOnchainBalance} from './rpc.mjs';

async function run(checks, name, fn) {
  try {
    const detail = await fn();
    checks.push({name, ok: true, detail: detail ?? null});
  } catch (error) {
    checks.push({name, ok: false, error: {code: error.code || 'error', message: error.message}});
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function reconcile(events, folded, account, asset, totals) {
  const state = folded.accounts.get(account)?.byAsset.get(asset);
  assert(state, `missing folded state for ${account}/${asset}`);
  assert(totals, `missing aggregated totals for ${account}/${asset}`);
  const expectedNet = totals.credited - totals.debited - totals.settled;
  const expectedFrozen = totals.frozenIn - totals.frozenOut - totals.settled;
  assert(state.net === expectedNet, `net mismatch ${account}/${asset}: fold=${state.net} aggregate=${expectedNet}`);
  assert(state.frozen === expectedFrozen, `frozen mismatch ${account}/${asset}: fold=${state.frozen} aggregate=${expectedFrozen}`);
  assert(state.net >= 0n, `negative net for ${account}/${asset}`);
  assert(state.frozen >= 0n, `negative frozen for ${account}/${asset}`);
  assert(state.frozen <= state.net, `frozen exceeds net for ${account}/${asset}`);
  return {net: state.net, frozen: state.frozen};
}

export async function main(argv = process.argv.slice(2)) {
  const {values} = parseArgs({
    args: argv,
    options: {
      ledger: {type: 'string'},
      json: {type: 'boolean'},
      keep: {type: 'boolean'},
      help: {type: 'boolean'},
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log('Usage: node scripts/wallet/selftest.mjs [--ledger <path>] [--json] [--keep]');
    return 0;
  }

  const checks = [];
  const createdDirs = [];
  const syntheticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-selftest-'));
  createdDirs.push(syntheticDir);
  const ledgerPath = path.join(syntheticDir, 'ledger.jsonl');
  const account = 'selftest:agent';
  const asset = 'USDC';
  const at = '2026-11-16T00:00:00.000Z';
  const append = event => appendEvent({...event, account, asset, at}, {ledgerPath});

  try {
    append({type: 'credit', amount: '100', idempotencyKey: 'selftest-credit'});
    append({type: 'freeze', amount: '30', idempotencyKey: 'selftest-freeze'});
    append({type: 'unfreeze', amount: '5', idempotencyKey: 'selftest-unfreeze'});
    append({type: 'settle', amount: '25', idempotencyKey: 'selftest-settle', reference: 'selftest-settlement-1'});

    await run(checks, 'synthetic chain integrity', () => {
      const chain = verifyChain({ledgerPath});
      assert(chain.ok, `expected valid chain, got ${JSON.stringify(chain.errors)}`);
      assert(chain.count === 4, `expected 4 records, got ${chain.count}`);
      return `${chain.count} records, head ${chain.head.slice(0, 12)}...`;
    });

    await run(checks, 'synthetic derived balance consistency', () => {
      const balance = deriveBalance(account, {ledgerPath});
      const events = readEvents({ledgerPath});
      const folded = foldBalances(events);
      const totals = aggregateMonetaryTotals(events).get(account)?.get(asset);
      const state = reconcile(events, folded, account, asset, totals);
      assert(balance.net === unitsToAmount(state.net), 'deriveBalance net differs from fold');
      assert(balance.frozen === unitsToAmount(state.frozen), 'deriveBalance frozen differs from fold');
      assert(balance.net === '75' && balance.frozen === '0' && balance.available === '75', `unexpected balance ${JSON.stringify({net: balance.net, frozen: balance.frozen, available: balance.available})}`);
      return `net=${balance.net}, frozen=${balance.frozen}, available=${balance.available}`;
    });

    await run(checks, 'synthetic idempotent replay', () => {
      const before = fs.readFileSync(ledgerPath, 'utf8');
      const replay = append({type: 'credit', amount: '100', idempotencyKey: 'selftest-credit'});
      const after = fs.readFileSync(ledgerPath, 'utf8');
      assert(replay.appended === false && replay.duplicate === true, 'replay was not recognized as a duplicate');
      assert(before === after, 'idempotent replay changed the ledger bytes');
      return 'same key replayed with zero writes';
    });

    await run(checks, 'synthetic tamper detection', () => {
      const tamperedPath = path.join(syntheticDir, 'tampered.jsonl');
      const lines = fs.readFileSync(ledgerPath, 'utf8').trimEnd().split('\n');
      const first = JSON.parse(lines[0]);
      first.amount = '9999';
      lines[0] = JSON.stringify(first);
      fs.writeFileSync(tamperedPath, `${lines.join('\n')}\n`);
      const chain = verifyChain({ledgerPath: tamperedPath});
      assert(!chain.ok, 'tampered ledger was accepted');
      assert(chain.errors.some(error => error.code === 'hash_mismatch'), `no hash_mismatch in ${JSON.stringify(chain.errors)}`);
      return 'modified amount rejected with hash_mismatch';
    });

    await run(checks, 'synthetic unimplemented rail is rejected before writes', () => {
      const before = fs.readFileSync(ledgerPath, 'utf8');
      let rejected = null;
      try {
        attemptSettlement({rail: 'stripe', account, asset, amount: '1', idempotencyKey: 'selftest-adapter'});
      } catch (error) {
        rejected = error;
      }
      assert(rejected, 'unimplemented rail did not throw');
      assert(rejected.code === 'not_adapted', `expected not_adapted, got ${rejected.code}`);
      const after = fs.readFileSync(ledgerPath, 'utf8');
      assert(before === after, 'rejected rail changed the ledger bytes');
      return 'not_adapted with zero ledger writes';
    });

    await run(checks, 'synthetic onchain unavailable is explicit', async () => {
      const result = await readOnchainBalance({
        address: '0x0000000000000000000000000000000000000000',
        rpcUrl: null,
      });
      assert(result.status === 'unavailable', `expected unavailable, got ${result.status}`);
      assert(result.reason === 'no_rpc_configured', `unexpected reason ${result.reason}`);
      assert(!Object.prototype.hasOwnProperty.call(result, 'wei'), 'unavailable result contained wei');
      assert(!Object.prototype.hasOwnProperty.call(result, 'amount'), 'unavailable result contained amount');
      return 'status=unavailable, no fabricated balance';
    });

    const realPath = values.ledger ? path.resolve(values.ledger) : resolveLedgerPath({});
    if (!fs.existsSync(realPath)) {
      checks.push({
        name: 'real ledger read-only audit',
        ok: true,
        skipped: true,
        detail: `${realPath} not found; synthetic checks still ran and no file was created`,
      });
    } else {
      await run(checks, 'real ledger read-only audit', () => {
        const chain = verifyChain({ledgerPath: realPath});
        assert(chain.ok, `real ledger is invalid: ${JSON.stringify(chain.errors)}`);
        const events = readEvents({ledgerPath: realPath});
        const folded = foldBalances(events);
        const totalsByAccount = aggregateMonetaryTotals(events);
        let assets = 0;
        for (const [realAccount, accountState] of folded.accounts) {
          for (const [realAsset, state] of accountState.byAsset) {
            reconcile(events, folded, realAccount, realAsset, totalsByAccount.get(realAccount)?.get(realAsset));
            assets += 1;
            assert(state.net >= 0n && state.frozen >= 0n, `negative state for ${realAccount}/${realAsset}`);
          }
        }
        assert(folded.violations.length === 0, `real ledger has violations: ${JSON.stringify(folded.violations)}`);
        return `${events.length} events, ${folded.accounts.size} accounts, ${assets} asset states, head ${chain.head ? chain.head.slice(0, 12) + '...' : 'empty'}`;
      });
    }
  } finally {
    if (!values.keep) {
      for (const dir of createdDirs) fs.rmSync(dir, {recursive: true, force: true});
    }
  }

  const failed = checks.filter(check => !check.ok).length;
  const summary = {ok: failed === 0, failed, checks};
  if (values.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    for (const check of checks) {
      const status = check.ok ? (check.skipped ? 'SKIP' : 'PASS') : 'FAIL';
      const suffix = check.detail ? ` - ${check.detail}` : '';
      const error = check.error ? ` - ${check.error.code}: ${check.error.message}` : '';
      console.log(`${status} ${check.name}${suffix}${error}`);
    }
    console.log(`RESULT: ${failed === 0 ? 'PASS' : 'FAIL'} (${checks.length} checks, ${failed} failed)`);
    if (values.keep) console.log(`kept synthetic ledger: ${ledgerPath}`);
  }
  return failed === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error(`${error.code || 'error'}: ${error.message}`);
    process.exitCode = 1;
  });
}
