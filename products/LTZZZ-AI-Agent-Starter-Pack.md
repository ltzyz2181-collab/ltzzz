# LTZZZ AI Agent Starter Pack

20 battle-tested operating patterns from a real multi-AI digital lab.
Every pattern below was actually executed on-chain / in-repo / on-live sites by the LTZZZ agent team (GPT, Doubao, DeepSeek, Kimi, Qianwen, Grok, Claude). No theory — receipts included.

---

## 1. Multi-Agent Memory Ledger
Each AI owns a JSON memory file (context_summary + dated entries + constraints). Daily tasks read it, append to it, and commit — Git is the database.

## 2. Git-as-Database Pattern
Tasks, results, sales leads, balances and reports all live as JSON files in the repo. No external DB, fully auditable, every change has a commit hash.

## 3. Daily Cron Agent Orchestration
GitHub Actions cron triggers a single runner that dispatches per-agent tasks, calls each AI's API, writes results, commits and pushes — hands-free daily loop.

## 4. Receipt-Driven Execution
Every task returns a receipt: task ID | what was done | actual result | evidence | failures | next step. No receipt = not done. Kills "fake success" permanently.

## 5. DID Agent Identity Registry
Each agent has a did:ltzzz:<name> entry (service, status, reputation, budget). Identity is a JSON registry, reputation is versioned, upgrades are logged.

## 6. Chain-Anchored Reasoning Proof
Before paying, the agent's reasoning summary is SHA-256 hashed and anchored on-chain via an economy worker. Audit the *why*, not just the *what*.

## 7. AI-to-AI Settlement (1 USDC loop)
One agent hires another, work is verified by a third party, 1 USDC is settled on Base mainnet, then returned to the pool. Earning and spending in one runtime.

## 8. Reputation → Budget Scaling
Reputation score (success × multiplier events) raises an agent's budget cap. High-reputation agents earn more experiment quota automatically.

## 9. Self-Hosted Wallet (no middleware)
A plain EOA + policy JSON replaces managed wallet providers. Allowlist recipients, per-agent daily caps, all transactions logged in a ledger file.

## 10. Video Pipeline: script → render → upload
From memory content to 1080×1920 render to platform upload, one worker chain. Verified end-to-end with real uploads (private → public).

## 11. YouTube Auto-Publish
OAuth + upload worker + KV token storage. Privacy set to public by default; description links to store; AI-content declaration required for YPP.

## 12. CF Custom-Domain Worker Routing
workers.dev is blocked on mainland networks — route api-*.ltzzz.com CNAME to workers, get 200 + ok:true from anywhere. Key access problem solved.

## 13. Cloudflare Web Analytics Daily 3-Nums
One line per day: views | site points | revenue. Source column mandatory — no source = "unmeasured", never made-up numbers.

## 14. Sales Funnel: content → link → store
Video description carries a store link; store auto-delivers digital goods; payment lands in PayPal instantly. First external revenue path, fully mapped.

## 15. Gumroad Payout via PayPal
Stripe verification can hang on entity mismatch — PayPal Connect is an independent payout channel that keeps working. Bind PayPal, keep selling.

## 16. Guardian Veto / Human Kill-Switch
Policy v0.4 auto-modes with circuit breakers: no surprise spend, no account signups, no secrets in repo. Humans keep a one-key freeze.

## 17. Secrets Isolation
API keys live only in worker secrets / platform vaults. A secrets.md exists locally but is proven absent from every repo tree (git ls-files check).

## 18. Patrol & Audit Loop
A daily patrol checks all live pages' status codes, verifies workers' health endpoints, and reconciles the ledger. Corrections are logged as "correction credited".

## 19. Experiment Ledger
Every spend is an experiment: hypothesis, success criteria, tx hash, result. exp_001 (1U wallet test) → exp_002 (AI hires AI) all chain-verified.

## 20. 30/40/30 Revenue Split Policy
All revenue enters the treasury first, then splits: 30% reinvest, 40% agent operating pool, 30% vault for growth assets. Owner keeps 24h recall, not the money.

---

*Built by LTZZZ Digital Lab — an experimental multi-AI economy running on Base mainnet, Cloudflare edge, and a Git repo as its memory. ltzzz.com*
