(() => {
  'use strict';
  const region = new URLSearchParams(location.search).get('region') === 'global' ? 'global' : 'cn';
  const english = region === 'global';
  document.documentElement.lang = english ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-region]').forEach(a => { if (a.dataset.region === region) a.setAttribute('aria-current', 'page'); });
  const copy = english ? {
    shopTitle: 'Ideas become real actions.', shopIntro: 'Start with a deliverable tool. Keep a record of the action, its result, and what changes next.',
    availableTitle: 'Products & services', availableHint: 'Final price and delivery terms are shown by the seller.',
    contactTitle: 'Have a specific task?', contactText: 'Confirm scope, price and acceptance before ordering. A submitted transaction hash alone is not proof of verified payment.'
  } : {};
  Object.entries(copy).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
  // Events are integration hooks. No remote collector is configured or claimed here.
  function track(event, productId) {
    const detail = {event, product_id: productId, region, page: 'products', at: new Date().toISOString()};
    window.dispatchEvent(new CustomEvent('ltzzz:commerce', {detail}));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(detail);
  }
  const starter = {id: 'agent-economy-kit', name: 'AI Agent Economy Starter Kit', price_usd: 19,
    description: english ? 'A starter kit for intent, policy checks, receipts and multi-AI workflows. See the Gumroad listing for package contents.' : '意图、策略检查、回执与多 AI 工作流起步包。具体文件与交付说明以 Gumroad 商品页为准。', gumroad: 'https://ltzyz.gumroad.com/l/ugyhy'};
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
  function render(data) {
    const wanted = ['ai-automation-monthly', 'small-agent-service'];
    const services = wanted.map(id => (data.products || []).find(p => p.id === id)).filter(Boolean);
    const grid = document.getElementById('productGrid'); grid.replaceChildren();
    [starter, ...services].forEach(p => {
      const ready = p.id === starter.id;
      const card = node('article', 'shop-card'); card.dataset.productId = p.id;
      card.append(node('span', 'shop-badge', ready ? (english ? 'Gumroad listing' : 'Gumroad 正式商品') : (english ? 'Scope confirmation required' : '先咨询确认范围')));
      const names = {'ai-automation-monthly': 'AI Automation Service', 'small-agent-service': 'Custom Agent Service'};
      card.append(node('h3', '', english ? (names[p.id] || p.name) : p.name));
      const price = node('div', 'shop-price', ready ? '$19' : english ? 'Quote' : `¥${Number(p.price)} 起`);
      price.append(node('small', '', ready ? (english ? 'USD · Gumroad' : '美元 · 平台结算') : (english ? 'Confirm before ordering' : '目录参考价 · 需确认'))); card.append(price);
      card.append(node('p', '', ready ? p.description : english ? 'A custom workflow or agent, scoped to your actual channels and credentials. Delivery and publishing capabilities must be confirmed before payment.' : '按你的渠道、凭证和任务定制工作流或 Agent。先确认可实现范围、交付内容与验收，不承诺尚未跑通的平台自动发布。'));
      const a = node('a', 'shop-button', ready ? (english ? 'View on Gumroad ↗' : '到 Gumroad 查看 / 购买 ↗') : (english ? 'Discuss this task →' : '咨询这个任务 →'));
      a.href = ready ? starter.gumroad : 'https://t.me/ltzzz_agi_lab_bot'; a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', () => track(ready ? 'begin_checkout' : 'contact_service', p.id)); card.append(a); grid.append(card);
      track('view_content', p.id);
    });
  }
  const fallback = {products: [{id: 'ai-automation-monthly', name: 'AI 自动化服务', price: 299}, {id: 'small-agent-service', name: '小型 Agent 服务', price: 499}]};
  render(fallback);
  fetch('products.json').then(r => { if (!r.ok) throw Error('catalog_unavailable'); return r.json(); }).then(d => {
    if (!Array.isArray(d.products)) throw Error('catalog_invalid');
    // Rendering twice must not duplicate impression events.
    const grid = document.getElementById('productGrid');
    d.products.filter(p => ['ai-automation-monthly', 'small-agent-service'].includes(p.id)).forEach(p => {
      const card = Array.from(grid.children).find(el => el.dataset.productId === p.id);
      if (!card || english || !Number.isFinite(Number(p.price))) return;
      card.querySelector('.shop-price').firstChild.textContent = `¥${Number(p.price)} 起`;
    });
  }).catch(() => { /* The labelled reference prices remain available. */ });
})();
