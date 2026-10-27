// Retired by PR268 R1. Historical implementation is in Git; no credential access.
import {denyLegacyFinancialExecution} from '../lib/financial-exit-guard.js';
denyLegacyFinancialExecution('scripts/treasury-migration.mjs');
