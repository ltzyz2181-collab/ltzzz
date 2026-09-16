/**
 * LTZZZ 唯一官方结算钱包配置（集中管理，禁止散落在各 HTML）
 *
 * 规则：
 * 1. 整个网站只有一个「LTZZZ 结算钱包地址」：LTZZZ_SETTLEMENT_WALLET
 * 2. 所有前端（Donate / ETH / USDC / Agent Payment / Creator 链上收入 / 未来收入）
 *    只能发送到这个唯一地址。
 * 3. 禁止普通页面修改本配置；修改必须通过治理流程（GPT 总控 + 用户确认）。
 * 4. 此处不存放任何私钥 / 助记词 / API Key，只有公开收款地址。
 *
 * 地址来源：沿用 LTZZZ 既有的官方收款地址（wallet.js / charity.html 长期使用）。
 */
window.LTZZZ_SETTLEMENT_WALLET = {
  address: '0xb99C6751f443842F4987bb2017580405572Df905',
  network: 'Ethereum Mainnet',
  chainId: 1,
  assets: ['ETH', 'USDC', 'USDT', 'ERC-20'],
  status: 'locked', // locked = 已锁定，前端不可修改
  updated_at: '2026-09-15',
  source: 'ltzzz-settlement.js (single source of truth)'
};
