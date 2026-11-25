import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT = resolve(ROOT, 'ops/deep-superagent/DAILY-RECEIPT-CONTRACT.md');
const text = readFileSync(CONTRACT, 'utf8');

test('原始纪律句保留（历史不回改）', () => {
  assert.match(text, /不得合并 PR、不得做生产部署、不得改合约或支付语义/);
});

test('生效范围限定块存在，且把它限定为本席自身动作', () => {
  assert.match(text, /### 生效范围（2026-11-26 更正，原文保留不改）/);
  assert.match(text, /本席（Deep 每日巡检协调席）自身动作/);
  assert.match(text, /不是全项目工程门禁/);
});

test('纠正后用 required checks 作判据，并保留五类隔离', () => {
  assert.match(text, /required checks 是否全绿/);
  assert.match(text, /五类保留动作（资金处分、退款终态、签名、私钥\/助记词\/根密钥、钱包\/Safe）/);
});

test('不把旧句正当化为 GPT 升级理由', () => {
  assert.match(text, /不得被用作任何项目路由的判定依据/);
});
