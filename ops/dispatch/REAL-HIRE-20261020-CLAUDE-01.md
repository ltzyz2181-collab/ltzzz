# REAL-HIRE-20261020-CLAUDE-01

类型：派单（固定规则，非Claude原生定时调用）
模式：internal
目标：消费现有ANS工作/独立审核任务，保存原生模型、用量、认领、交付哈希与拒收/验收数据；不新增模型调用、不结算真钱。
输入：wep3-market.js @ 96c82f8a9e9a363eb3df9d0455ac44b5db8d5e125629a5f8be35341d6e6cc153
wep3-aave.js @ 8008e92b17dc12927aa22312bbc4c9663d8a5b5342d746dd097b8a810f4be098
wep3-procurement-contract.js @ cf549303d1ac810315eb62f3ab2bfe69d0d4dfd09bbd2e342f43c060350a6659
knowledge/results/ans-cycle/2026-10-20.json @ 5fbd88f3e73e085d232d1475c7aaf43b5e75c274a6d1bbdcc3e0e1db9258ee6b
输出：knowledge/results/claude-team/real-hire-20261020.json
验收：来源任务ID、实际提供商与结束原因、用量、原文哈希和异提供商审稿绑定；草稿不写成上线。
禁止：倒填接单时间、重复调用/付款、缺证据写成功。内部积分与USDC分开，未结算即如实标注。
来源：8855b7fd81a3e49da045c45cdc8e7f824ebd9795；运行：39351385606。
