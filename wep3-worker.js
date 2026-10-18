import {auditProof} from './wep3-audit-proof.js';
import {marketRoute,Market} from './wep3-market.js';
export {Market};
// Cloudflare renamed_classes preserves the existing namespace and stored book.
export class MarketRuntimeV2 extends Market {}
/** LTZZZ WEP3 v1.2 — credit loop, skill-owner hire, SKU pay, swarm hire. */
const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Lab-Pin, X-Wep3-Intent, X-Pay-Secret', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'};
const AGENTS = ['Grok', 'Doubao', 'DeepSeek', 'Qianwen', 'Kimi', 'GPT', 'Microsoft', 'Claude', 'Meya'];
// Owner 待确认：Claude / 千问 / Kimi / Meya 身份与职责（可改 config 后热更新）
const AGENT_ROLES = {
  Grok:     { region: 'global', role: 'signal / research / payment insight', skills: ['signal'] },
  Doubao:   { region: 'cn',     role: 'copy / video script / contract-test', skills: ['copy', 'contract-test'] },
  DeepSeek: { region: 'cn',     role: 'market scan / strategy', skills: ['scan'] },
  Qianwen:  { region: 'cn',     role: 'product close / sell', skills: ['sell'] },
  Kimi:     { region: 'cn',     role: 'causal stamp / long-context', skills: ['cause'] },
  GPT:      { region: 'global', role: 'audit / hire plan / route', skills: ['audit', 'route'] },
  Claude:   { region: 'global', role: 'deep audit / long reasoning', skills: ['audit'] },
  Meya:     { region: 'cn',     role: 'domestic ops / 工单接力', skills: [] },
  Microsoft:{ region: 'global', role: 'fallback / tooling', skills: [] },
  LTZZZ:    { region: 'lab',    role: 'treasury / lab share', skills: [] }
};
