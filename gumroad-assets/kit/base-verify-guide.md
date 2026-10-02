# Base Chain Verification Guide (2 minutes)

How to verify any LTZZZ spend without trusting anyone.

## Option A — Blockscout (no wallet needed)

1. Open https://base.blockscout.com
2. Paste the tx hash in the search bar
3. Check: Status = Success, and the Amount matches the ledger row

REST shortcut (works from any tool):
```
https://base.blockscout.com/api?module=account&action=tokentx&address=<ADDRESS>&contractaddress=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
```

## Option B — RPC balanceOf (programmatic)

```js
const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const usdc = new ethers.Contract(
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  ["function balanceOf(address) view returns (uint256)"], provider
);
console.log((await usdc.balanceOf("0x21F502f29294c50d9C37A30dc038D8D95eB97fdc")).toString());
// 6 decimals: 41000000 = 41.000000 USDC
```

## Key facts

- USDC contract on Base: 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
- Agent wallet: 0x21F502f29294c50d9C37A30dc038D8D95eB97fdc
- USDC has 6 decimals — raw 2000000 = 2 USDC

Verify before you trust: hash → status → amount → ledger row. Four boxes, two minutes.
