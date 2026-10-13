// Source: four public Gumroad pages. Prices are USD, not CNY.
const products = [
  {
    id: 'muse', slug: 'rjubgv', title: 'Muse 实验治理参与凭证', tag: '实验参与',
    priceLabel: 'US$7 / 份',
    summary: '了解 LTZZZ Muse 的预算实验与治理参与计划。',
    items: ['原商品页列出数字参与凭证', '实验预算参与与未来治理投票计划'],
    notice: '具体权益、启用时间和参与规则需按实际销售页面核对。本页不承诺治理功能已上线，也不承诺投资收益。'
  },
  {
    id: 'agent', slug: 'mimlr', title: 'Agent 入门资料包', tag: '开发资料',
    priceLabel: 'US$29 / 份',
    summary: '从身份模板、支付策略与代理示例开始搭建 Agent 实验。',
    items: ['DID 身份模板', '支付策略 v0.4', 'Worker 代理示例', 'LTZZZ 运营手册'],
    notice: '附件内容和版本以实际交付为准。资料用于学习与实验，不代表部署完成或自动盈利。'
  },
  {
    id: 'weekly', slug: 'bjqfcc', title: 'AI / Web3 周报', tag: '研究阅读',
    priceLabel: 'US$5 / 月',
    summary: '跟踪 AI Agent、Web3 支付与自治经济实验。',
    items: ['每周一项市场信号', '一项协议解析', '一份实验记录'],
    notice: '月付及取消规则来自原商品页。本页不发起订阅或自动扣款，信息不构成收益承诺。'
  },
  {
    id: 'economy', slug: 'ugyhy', title: 'AI Agent 经济管理工具包', tag: '六文件工具包',
    priceLabel: 'US$19 / 份',
    summary: '用提案、预算与回执核对 Agent 的工作和花费。',
    items: ['花费操作手册', '预算策略 JSON 模板', '花费提案模板', '英文外联素材', '每日指标追踪表', 'Base 交易核验指南'],
    notice: '内部积分与真钱付款分别记录，链上付款以实际交易回执为准。原商品页列出商业使用许可与 30 天退款，条款以实际销售页面为准。'
  }
];
module.exports = { products };
