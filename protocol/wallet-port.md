# IWalletPort · 多钱包接入 v1

> 未来 AGI 不必使用 LTZZZ EOA；实现本端口即可进入结算网。

## 接口

```ts
interface IWalletPort {
  id: string;
  supports: Array<'eoa' | 'safe' | 'aa' | 'session_key' | 'aave_adapter'>;
  getBalance(asset: 'USDC' | 'ETH'): Promise<number>;
  /** 对 intent 哈希授权或直接执行（由实现决定） */
  authorizeOrSettle(input: {
    intent_hash: string;
    amount_usdc: number;
    recipient: string;
    pool: 'ltzzz_ops' | 'owner_aave';
    risk_profile: 'standard' | 'aggressive';
  }): Promise<{ tx_hash?: string; status: string }>;
}
```

## 实现表

| Port ID | 状态 | 说明 |
|---------|------|------|
| `ltzzz_agent_eoa` | **live** | `0x21F5…7fdc` + spending-policy |
| `ltzzz_safe_5sig` | **live-金库** | 收入归集 / 注资 / 大额；不扛每笔微支付 |
| `external_wc` | planned | 用户自带钱包只签 intent |
| `owner_aave_adapter` | **代码有 / 章程限制** | `invest-channel/scripts/AaveAdapter.mjs`；个人 1000U **零接触**直至单独授权 |

## 风险档

- `standard`：ops 池，单笔默认 ≤20 USDC（policy）
- `aggressive`：仅 owner 授权池；更高杠杆/路由，与 ops **混钥禁止**

## 实践修正

遇到不安全：改 port 白名单与额度，保留 receipt 审计；不把「停更」当交付。
