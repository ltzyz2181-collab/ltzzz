import test from 'node:test';
import assert from 'node:assert/strict';

// 纯函数测试：不触网、不需要 AppSecret
const mod = await import('../../scripts/wechat-jsapi-sign-server.mjs');

test('签名算法对齐微信官方文档示例', () => {
  const signature = mod.signJsapi({
    ticket: 'sM4AOVdWfPE4DxkXGEs8VMCPGGVi4C3VM0P37wVUCFvkVAy_90u5h9nbSlYy3-Sl-HhTdfl2fzFy1AOcHKP7qg',
    noncestr: 'Wm3WZYTPz0wzccnW',
    timestamp: 1414587457,
    url: 'http://mp.weixin.qq.com?params=value',
  });
  assert.equal(signature, '0f9de62fce790f9a083d5c99e95740ceb90c27ed');
});

test('url 带 # 片段被拒绝（微信要求签名串不含 hash）', () => {
  assert.throws(() => mod.normalizeUrl('https://ltzzz.com/open/#/a'), /不能带 #/);
});

test('非 http(s) 协议被拒绝', () => {
  assert.throws(() => mod.normalizeUrl('ftp://ltzzz.com/open/'), /http\(s\)/);
});

test('非法绝对地址被拒绝', () => {
  assert.throws(() => mod.normalizeUrl('/open/'), /合法绝对地址/);
});

test('合法地址通过并去掉末尾斜杠', () => {
  assert.equal(mod.normalizeUrl('https://ltzzz.com/open/'), 'https://ltzzz.com/open/');
  assert.equal(mod.normalizeUrl('https://ltzzz.com/open'), 'https://ltzzz.com/open');
});
