// Entry point for `node --test scripts/wallet/__tests__`.
// Some Node builds resolve an explicit --test path as a module instead of
// discovering the directory, so this file imports every test module.
import './ledger.test.mjs';
import './adapters.test.mjs';
import './onchain.test.mjs';
import './subscriptions.test.mjs';
