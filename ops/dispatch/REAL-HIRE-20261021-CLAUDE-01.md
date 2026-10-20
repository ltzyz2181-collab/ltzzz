# REAL-HIRE-20261021-CLAUDE-01

类型：派单（固定规则，非Claude原生定时调用）
模式：internal
目标：消费现有ANS工作/独立审核任务，保存原生模型、用量、认领、交付哈希与拒收/验收数据；不新增模型调用、不结算真钱。
输入：wep3-market.js @ 96c82f8a9e9a363eb3df9d0455ac44b5db8d5e125629a5f8be35341d6e6cc153
wep3-aave.js @ 8008e92b17dc12927aa22312bbc4c9663d8a5b5342d746dd097b8a810f4be098
wep3-procurement-contract.js @ 114cc61b07b7ec5f8f0b2f2d215f5ee35097027d59f51d588b15b2ab52bdcbc4
knowledge/results/ans-cycle/2026-10-21.json @ 019bfa75911dd3af422f243d93860ee9a52c4924414a1ff9c845e716b94d98cd
输出：knowledge/results/claude-team/real-hire-20261021.json
验收：来源任务ID、实际提供商与结束原因、用量、原文哈希和异提供商审稿绑定；草稿不写成上线。
禁止：倒填接单时间、重复调用/付款、缺证据写成功。内部积分与USDC分开，未结算即如实标注。
来源：428bb526de172dd9b2fa78b76256d59f7f9e16d6；运行：39461737127。
