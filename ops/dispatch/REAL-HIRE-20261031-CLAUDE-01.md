# REAL-HIRE-20261031-CLAUDE-01

类型：派单（固定规则，非Claude原生定时调用）
模式：internal
目标：消费现有ANS工作/独立审核任务，保存原生模型、用量、认领、交付哈希与拒收/验收数据；不新增模型调用、不结算真钱。
输入：wep3-market.js @ 2def68bce9ec9b21bca069ddc7cada8597aca1d6e85d30617c6a1da953c88120
wep3-aave.js @ 3b74d3595e2ec0934d7762d09111a4d83be1e9f646d2e172681eb1fad51a8efb
wep3-procurement-contract.js @ 114cc61b07b7ec5f8f0b2f2d215f5ee35097027d59f51d588b15b2ab52bdcbc4
knowledge/results/ans-cycle/2026-10-31.json @ ff733820972b05e73d53852e57b8db865e4e1750976f5758d6a01101ca460bc6
输出：knowledge/results/claude-team/real-hire-20261031.json
验收：来源任务ID、实际提供商与结束原因、用量、原文哈希和异提供商审稿绑定；草稿不写成上线。
禁止：倒填接单时间、重复调用/付款、缺证据写成功。内部积分与USDC分开，未结算即如实标注。
来源：f77f10f82262686f4f9a71732f21f573cc3b2f16；运行：41136823415。
