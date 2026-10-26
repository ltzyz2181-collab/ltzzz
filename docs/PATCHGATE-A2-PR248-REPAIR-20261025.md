# PR248 repair — implementation submitted, A2/A3/B remain disabled

Original task: `PLAN-PATCHGATE-ESCROW-20261023`. This follows Claude PR248 at
`653a9ca490404a9cb329851cc304d88924540443` and preserves PR244/247 original revisions.

- C1 stays advisory: the shared GitHub login cannot authenticate Claude or owner.
  No owner-looking approval comment is fabricated. Aliyun and Volcengine remain
  the distinct real model-signature providers; no production keys are enrolled.
- C2 stays `pull_request_target`, trusted BASE checkout and immutable
  EVENT/BASE/HEAD/PR job marker checks. Its production bootstrap remains off.
- B2 uses Claude's L0-only compensation proposal with stronger readback:
  full approved BASE/HEAD tree deltas bind paths, blob identities and modes;
  the actual merge must have two parents and the approved HEAD as second parent.
  The first parent's complete tree delta must contain exactly the approved
  changes, including old/new blob identities and regular `100644` Markdown modes.
  A racing BASE must descend from the approved BASE and may introduce only
  unrelated L0 Markdown; executable, trust or policy drift invalidates approval.
- A fixed `patchgate-a2-stop` ref is acquired before any merge, serializing A2
  attempts. It is released only after verified merge readback and persisted
  outcome. Crashes, unknown results, bad readback, failed persistence or uncertain
  release leave future executions stopped across processes. Per-head claims are
  retained. The API permits deletion only of this exact control ref, never main
  or arbitrary branches. A confirmed-but-invalid merge is recorded explicitly;
  there is no automatic rollback or blind retry.

This is not an atomic expected-BASE merge API. `base_compare_and_swap_verified`
remains false. Branch protection remains a separate prerequisite for A3/L1+.
The new readback interpreter is included in the fixed runtime bundle. The
post-merge control and stop-latch fields are mandatory and covered by adversarial
regressions; real signing executors, trusted-main checker registration and the
first real automatic docs merge remain unverified. PR246 remains unmerged.

Independent Qwen/Doubao review and Claude's final review must bind the new exact
head and runtime bundle. Fixture signatures and native model text cannot enroll
production keys or enable A2. Historical Actions runs 40250034615/40244733201 are
audited separately; their success is not acceptance of this newer implementation.
