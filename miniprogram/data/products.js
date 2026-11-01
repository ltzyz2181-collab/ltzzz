// 目录数据：印章业务（主体主营） + 数字服务（工具/资料）
// 说明：价格一律「面议」，实际定价由 owner 确认后回填（见 TODO）。
// 不出现 Web3、治理投票、链上核验、美元标价等表述；不涉及虚拟支付。
const STORE = {
  name: '世章印章',
  address: '广州市白云区五龙岗龙新十三巷3号101房',
  notice: '印章刻制属特种行业，具体办理材料与流程需到店核验，本页不提供在线刻制下单。'
};

const products = [
  // ===== 印章业务（与主体经营范围一致）=====
  {
    id: 'seal-private', slug: 'seal-private', title: '私章', tag: '印章',
    priceLabel: '面议',
    summary: '个人姓名章，常用於书画落款、收藏钤印与日常用印。',
    items: ['字体可指定（篆书/隶书/楷书等）', '材质与规格到店选料', '手工篆刻，工期面议'],
    notice: '需到店选料并核验用途；本页不提供在线刻制下单。'
  },
  {
    id: 'seal-horn', slug: 'seal-horn', title: '牛角章', tag: '印章',
    priceLabel: '面议',
    summary: '牛角材质印章，质地坚韧、印面清晰，适合日常频繁用印。',
    items: ['天然牛角材质', '规格按需定制', '可配印盒'],
    notice: '材质纹理每件不同，以实物为准。'
  },
  {
    id: 'seal-hand', slug: 'seal-hand', title: '手工篆刻', tag: '印章',
    priceLabel: '面议',
    summary: '手工篆刻定制，按印稿逐刀完成，适合收藏与礼品用途。',
    items: ['按客户印稿定制', '可指定字体与章体', '工期与价格到店商议'],
    notice: '定制类需确认印稿后开工，开工后不支持随意更改。'
  },

  // ===== 数字服务（工具/资料，非金融、非虚拟货币）=====
  {
    id: 'source-check', slug: 'source-check', title: 'LTZZZ 来源核对清单', tag: '工具',
    priceLabel: '免费',
    summary: '逐条核对文稿的事实与来源，输出证据、矛盾与无法核实项。',
    items: ['逐条对照原文', '输出来源与摘录', '保留未知，不补造引文'],
    notice: '提供指令与模板，在支持该技能的环境中使用；本页不发起交易。'
  },
  {
    id: 'delivery-check', slug: 'delivery-check', title: 'LTZZZ 交付包验收', tag: '工具',
    priceLabel: '面议',
    summary: '把交付要求与文件逐项对上，检查摘要与字段，列出失败与待复核项。',
    items: ['本地文件摘要', '逐项技术检查', '待业务复核报告'],
    notice: '附本地脚本，不联网、不安装依赖、不访问钱包。价格以实际服务页为准。'
  },
  {
    id: 'agent-kit', slug: 'mimlr', title: 'LTZZZ Agent 启动包', tag: '资料',
    priceLabel: '面议',
    summary: '搭建 AI Agent 工作流的模板与操作指引，适合开发者与创业者学习参考。',
    items: ['身份模板', '策略与预算模板', '运营手册'],
    notice: '资料用于学习与实验，不代表部署完成或自动盈利。价格以实际服务页为准。'
  },
  {
    id: 'weekly', slug: 'bjqfcc', title: 'LTZZZ AI 情报简报', tag: '资料',
    priceLabel: '面议',
    summary: '整理 AI 与 Agent 工程的市场信号、原型思路与实验记录。',
    items: ['市场信号', '技术分析', '实验记录'],
    notice: '内容与更新以实际发布为准。价格以实际服务页为准。'
  },
  {
    id: 'economy-kit', slug: 'ugyhy', title: 'AI Agent 工程工具包', tag: '资料',
    priceLabel: '面议',
    summary: '为个人与小团队提供多 Agent 协作的模板与操作指引。',
    items: ['操作手册', '预算与提案模板', '指标追踪表'],
    notice: '资料用于学习与实验，不构成收益承诺。价格以实际服务页为准。'
  },
  {
    id: 'muse-pack', slug: 'rjubgv', title: 'LTZZZ Muse 实验资料', tag: '资料',
    priceLabel: '面议',
    summary: 'LTZZZ Muse 实验的早期资料包，面向早期支持者。',
    items: ['实验说明', '资料下载指引'],
    notice: '权益与启用时间以实际服务页为准；不涉及任何凭证、投票或投资安排。'
  }
];

module.exports = { products, STORE };
