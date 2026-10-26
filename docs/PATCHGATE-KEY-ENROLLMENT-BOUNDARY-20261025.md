# Persistent key enrollment is not A2 admission

Original task: PLAN-PATCHGATE-ESCROW-20261023, B4 preparation after PR254.
Two isolated Cloudflare services bind one executor to one configured provider.
The runner generates Ed25519 keys in memory, writes private material only to
Cloudflare Secrets, then verifies independent nonces before and after redeployment.
Existing keys are reused and never silently rotated. Only public keys, nonce
payloads, signatures and exact blockers are archived. There is no wallet key.

These services intentionally sign only the domain-separated
`ltzzz.executor.key-challenge.v1` payload. They cannot sign A2 author/review/check
or stage attestations. A configured provider binding is not evidence of native
model generation. No model call occurs during enrollment. Production A2 key roles,
trust.enable, A2.enable, automated merge, deployment and funds remain off.

A successful persistence challenge closes only the persistence subtest. The later
audited native-model attestation adapter and source-bound checker signing path
must be implemented and reviewed before these keys can be admitted. Do not
present challenge keys, local fixtures or an enrollment workflow success as full
B4/A2 readiness or as acceptance of PR246.
