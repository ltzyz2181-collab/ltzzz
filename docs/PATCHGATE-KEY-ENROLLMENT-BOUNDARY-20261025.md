# Persistent key enrollment is not A2 admission

Original task: PLAN-PATCHGATE-ESCROW-20261023, B4 preparation after PR254.
Two isolated Cloudflare services bind one executor to one configured provider.
The runner generates Ed25519 keys in memory, writes private material only to
Cloudflare Secrets, then verifies independent nonces before and after redeployment.
The signed challenge now binds a distinct public per-upload deployment marker; a
successful Cloudflare upload API response followed by a stale serving edge is
**not** persistence verification. The runner waits for the new marker and fails
closed if it never appears. The marker is not a credential or role signature.
Each executor gets its own 256-bit random authentication token, generated only
in memory and written only to that executor's CHALLENGE_AUTH Cloudflare Secret.
No shared LTZZZ_AGENT_TOKEN is read, reused, exported or accepted as fallback.
Existing keys and authentication are never silently rotated. A later enrollment
attempt cannot export those Secrets, so it records
existing_executor_auth_not_exported_no_rotation and performs no update; any
future native attestation transport requires a separately reviewed auth channel.
Partially provisioned Workers (for example private-key Secret written but auth
Secret or subdomain enablement failed) remain blocked. The current workflow
cannot safely export the existing auth/private key or resume it automatically;
this is an explicit recovery blocker, not evidence that persistence succeeded.
No silent rotation or re-enrollment is permitted.
Only public keys, nonce
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
