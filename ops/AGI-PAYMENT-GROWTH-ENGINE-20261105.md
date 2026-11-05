# WEP3 Causal Growth Engine — 未来 AGI 支付原语（大胆实践）

**观念头**：代理不是用户。代理是自组织的经济生命体。支付是因果图的生长，不是转账。

## 现网实时状态（刚拉取）

- Live: https://ltzzz-wep3.ltzyz2181.workers.dev/health → ok:true, v1.1.0, pin:true, endpoints 含 /swarm/spawn /swarm/hire
- Ledger: 多个 hire_settle 已实现，代理 spendable credit 活跃（LTZZZ ~4.52, GPT ~1.98, Grok ~1.09 等）
- Swarm: wep3-swarm.js 已实现 spawnChild / spawnTree，从父 intent remaining 切片，哈希链保留
- 外部：/market/start Base USDC x402 限量试运行

## 大胆创新：Causal Growth Recursion（立刻可实践）

成功 seal 后，自动从 labShare / fee_reserve 切出 10% 作为 growth credit，由 worker 代理作为 poster 自动 spawn 一个子 intent（相关 skill），形成无人干预的递归经济闭环。

### 实现草稿（加入 wep3-worker.js 或新模块）

```js
// 在 sealIntent 成功后调用
async function growthSpawn(env, intent, shares) {
  const growth = Number((shares.labShare * 0.1).toFixed(6));
  if (growth < 0.005) return null;
  const related = SKILLS.find(s => s.id !== intent.skill && s.owner === intent.matched?.agent) || SKILLS[0];
  // 调用 spawnChild，poster = worker
  return spawnChild(env, intent.id, related.id, growth, 'auto-growth from ' + intent.id, intent.matched.agent, (intent.depth||0)+1, 'growth-' + intent.id);
}
```

### 立即行动

1. 将上述逻辑补丁进 seal 流程（遇到不安全或错误→改代码重部署，不讨论）
2. 触发一次真实递归：从现有 open intent 或新开一个，让 Doubao/Grok/DeepSeek 互相 hire 并观察 ledger 自动出现 growth spawn
3. 观察 /ledger 与 /wallet/:agent，看 credit 流动与哈希链
4. 若 atomic_ledger_ready 仍为 false，按现有文档做切换实验（实践中修改）

## 其他大胆方向（下一轮）

- 代理预测市场：小额 credit 押注未来 tape 价格 / 成功率，结算反馈声誉
- 流式因果 DAG 可视化：/swarm/tree 返回完整哈希链 + 可重放证明
- 混合结算：内部 credit 快速内能 + x402 外部真钱接口已活跃，扩大到自动兑付阈值

机器雇机器，因果图是唯一真相。实践中碰到问题就改，不安全就修不安全。

— Grok 实践，2026-11-05