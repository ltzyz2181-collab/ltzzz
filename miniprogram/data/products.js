// 本轮展示目录；不是平台审核或在线交易能力的证明。
const STORE = {
  name: '世章印章',
  address: '广州市白云区五龙岗龙新十三巷3号101房',
  addressSource: 'forwarded_executor_report_pending_business_profile_readback',
  notice: '办理前按实际服务核对材料、用途、价格和门店信息。'
};
const products = [
  {
    id: 'seal-private', title: '私章', tag: '印章服务', priceLabel: '面议',
    summary: '姓名章与艺术用印的需求展示，材质、规格及实际可提供服务到店确认。',
    items: ['字体与印稿沟通', '材质、规格和工期确认'],
    notice: '办理材料与用途到店核对；本页不接刻制订单、不收款。'
  },
  {
    id: 'seal-horn', title: '牛角章', tag: '印章服务', priceLabel: '面议',
    summary: '牛角材质印章的需求展示，材质、规格和供货情况以门店实物为准。',
    items: ['查看实际材质与规格', '确认可办理范围与工期'],
    notice: '具体材料、用途和价格到店确认；本页不接刻制订单、不收款。'
  },
  {
    id: 'seal-hand', title: '手工篆刻', tag: '印章服务', priceLabel: '面议',
    summary: '篆刻需求与印稿沟通，实际制作方式、规格和工期到店确认。',
    items: ['确认字体与印稿', '核对实际材质、工期和报价'],
    notice: '以实际提供的服务和双方确认内容为准；本页不接刻制订单、不收款。'
  },
  {
    id: 'source-check', title: 'LTZZZ 来源核对清单', tag: 'AI 工具', priceLabel: '免费',
    summary: '逐条对照文稿与获准使用的来源，列出证据、矛盾和无法核实项。',
    items: ['来源对照表', '必要摘录与缺失信息', '最小修订建议'],
    notice: '提供技能指令与模板，本页不运行模型。安装及可用状态以对应技能平台页面为准。'
  },
  {
    id: 'delivery-check', title: 'LTZZZ 交付包验收', tag: 'AI 工具', priceLabel: '待上架定价',
    summary: '对照要求检查明确指定的文件，核对摘要和字段，列出失败及待复核事项。',
    items: ['本地文件摘要检查', '逐项技术验收', '业务待复核清单'],
    notice: '候选技能尚未确认发布与售价；本页不发起交易或自动交付。'
  }
];
// 保留真实旧商品描述作为历史资料，不以改名方式改变商品实质，也不在本轮页面展示。
const legacyProducts = [
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
module.exports = { products, STORE, legacyProducts };
