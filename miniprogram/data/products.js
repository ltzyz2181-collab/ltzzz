// Source: four public Gumroad pages. Prices are USD, not CNY.
const products = [
  {
    id: 'muse', slug: 'rjubgv', title: 'LTZZZ Muse 治理凭证（早期参与券）', tag: '实验参与',
    priceLabel: 'US$7 / 份',
    summary: 'LTZZZ Muse 实验的早期数字参与凭证，面向早期支持者。',
    items: ['原商品页列出数字参与凭证', '实验预算参与与未来治理投票计划'],
    notice: '具体权益、启用时间和参与规则需按实际销售页面核对。本页不承诺治理功能已上线，也不承诺投资收益。'
  },
  {
    id: 'agent', slug: 'mimlr', title: 'LTZZZ Agent 启动包（完整运营手册）', tag: '开发资料',
    priceLabel: 'US$29 / 份',
    summary: '从 DID 模板、支付策略和运营手册开始搭建自己的 AI Agent 钱包实验室，适合开发者与创业者。',
    items: ['DID 身份模板', '支付策略 v0.4', 'Worker 代理示例', 'LTZZZ 运营手册'],
    notice: '附件内容和版本以实际交付为准。资料用于学习与实验，不代表部署完成或自动盈利。'
  },
  {
    id: 'weekly', slug: 'bjqfcc', title: 'LTZZZ 每周 AI/Web3 情报简报', tag: '研究阅读',
    priceLabel: 'US$5 / 月',
    summary: '由 LTZZZ 多 Agent 实验室整理市场信号、原型思路以及 AI Agent 与 Web3 支付动态。',
    items: ['每周一项市场信号', '一项协议解析', '一份实验记录'],
    notice: '每期内容及后续更新指引以实际发布为准。月付及取消规则来自原商品页，本页不发起订阅或自动扣款，信息不构成收益承诺。'
  },
  {
    id: 'economy', slug: 'ugyhy', title: 'AI Agent 经济启动工具包', tag: '六文件工具包',
    priceLabel: 'US$19 / 份',
    summary: '为个人与小团队提供多 AI 运营闭环的模板和操作指引，用提案、预算与回执核对工作与花费。',
    items: ['花费操作手册', '预算策略 JSON 模板', '花费提案模板', '英文外联素材', '每日指标追踪表', 'Base 交易核验指南'],
    notice: '内部积分与真钱付款分别记录，链上付款以实际交易回执为准。原商品页列出商业使用许可与 30 天退款，条款以实际销售页面为准。'
  }
];
module.exports = { products };
