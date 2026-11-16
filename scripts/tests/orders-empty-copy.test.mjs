import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wxmlPath = new URL('../../miniprogram/pages/orders/index.wxml', import.meta.url);
const wxml = readFileSync(wxmlPath, 'utf8');

// 只在空列表分支（wx:elif="{{empty}}"）内取文案，避免误匹配页首 intro 的 payEnabled 行。
function readEmptyStateBranches(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.includes('wx:elif="{{empty}}"'));
  assert.notEqual(start, -1, '未找到空列表分支 wx:elif="{{empty}}"');

  const end = lines.findIndex((line, index) => index > start && line.includes('wx:for="{{orders}}"'));
  assert.notEqual(end, -1, '未找到订单列表起始行 wx:for="{{orders}}"');

  const block = lines.slice(start, end);
  const payEnabledLines = block.filter((line) => line.includes('wx:if="{{payEnabled}}"'));
  const elseLines = block.filter((line) => line.includes('wx:else'));

  assert.equal(payEnabledLines.length, 1, '空列表分支应恰好有一行 wx:if="{{payEnabled}}"');
  assert.equal(elseLines.length, 1, '空列表分支应恰好有一行 wx:else');

  return { payEnabledLine: payEnabledLines[0], elseLine: elseLines[0] };
}

const { payEnabledLine, elseLine } = readEmptyStateBranches(wxml);

test('payEnabled 空态文案为「暂无进行中的订单，去逛逛。」', () => {
  assert.match(payEnabledLine, /暂无进行中的订单，去逛逛。/);
});

test('wx:else 空态文案仍包含「在线支付通道尚在开通中」', () => {
  assert.match(elseLine, /在线支付通道尚在开通中/);
});
