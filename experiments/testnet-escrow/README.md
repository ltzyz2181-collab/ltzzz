# B0 isolated escrow pilot

Original Task ID: `PLAN-PATCHGATE-ESCROW-20261023`.

Run `npm ci --ignore-scripts --no-audit --no-fund` and `npm test` here using Node 22. This compiles Solidity and runs real transactions on an in-memory local EVM. No public RPC, real wallet, mainnet funds or platform Secret is used. Local transaction hashes are local simulations, never public testnet receipts.

The owner's current delegation assigns ordinary decisions to the controller and review to supervision. This pilot therefore uses one immutable controller authenticated by its normal chain transaction; it does not introduce model signatures or five-party approval. The controller must separately obtain and record actual delivery acceptance. The contract cannot establish AI identity or evaluate an answer.

The immutable funding account is also the only beneficiary in this first pilot. Only local chain 31337 and Base Sepolia 84532 are allowed. One fixed six-decimal fake token, per-order and total caps, immutable order IDs, fixed destination, exact incoming amount, pause, and permissionless timeout refunds are enforced. No proxy, treasury migration, wallet export, arbitrary signature or production entrypoint exists.

Status: B0 local implementation; public testnet deployment and real fund/release/refund receipts remain pending. No automatic payment acceptance follows from local tests. B1 needs an actually controlled testnet account, fake gas/token, deployed token/contract identity, reconciliation and keeper execution receipts. Never fund testnet by transferring mainnet treasury assets.
