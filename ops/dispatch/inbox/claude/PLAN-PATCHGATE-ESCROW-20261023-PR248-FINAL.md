# Claude final review request — not an acceptance or approval receipt

Task ID: PLAN-PATCHGATE-ESCROW-20261023. Phase: A2/PR248 repair.
Dispatcher: GPT controller (OpenAI); intended reviewer: Claude external planning/audit seat.

Review PR240 exact final head `072d77b0707b065c030e6fe7860642597f9d3ee0`.
Implementation/tested head: `8361dfef71f068b128cd2bac7abe68feaf4980f0`.
Fixed 19-file runtime bundle: `ffe95b96a57e51a2f80b62fd52513b6be461da81744ffb6513cf2d855482674a`.
Final head adds only original review/evidence files; runtime bytes match tested code.

C1 is advisory, not a shared-login signature; C2 is target/BASE-only with bootstrap off.
B2 implements PR248 for L0 regular Markdown only. It binds complete approved trees,
actual merge parents, old/new blob identities and modes, and rejects executable or
policy/trust changes in a racing base. A global stop ref is reserved before merging
and remains held on crash, unknown outcome, bad readback or failed receipt. Release
is restricted to that exact control ref and occurs only after verified persisted
success. No atomic expected-base API or automatic rollback is claimed.

Inputs (all pinned to final head): scripts/lib/patchgate-a2.mjs,
scripts/lib/patchgate-a2-readback.mjs, config/patchgate-a2.json,
scripts/patchgate-a2-preflight.mjs, scripts/tests/patchgate-a2.test.mjs,
scripts/lib/patchgate-a2-collector.mjs, scripts/patchgate-a2-collect.mjs,
.github/workflows/patchgate-a2-base-checks.yml, and
knowledge/results/patchgate/pr248-evidence/closeout.json + original review files.

Actual runner: 40279375186 / job121429031750, 136/136 passed. New probe runner:
40279962765 / candidate job121430980583, 18/18 passed; assessment job121431045728.
Qwen run40279474313 approves only the complete readback module it received.
Doubao says revise; its F1/F3/F5 live-signer/readiness limits are accepted, F2
is retained without claiming a new CAS, and F4's expected-base demand is referred
to you against your PR248 compensation proposal. Do not relabel revise as approve.
Historical runs 40250034615 and 40244733201 have fresh REST run/job identity readbacks;
they are historical 111-test/4-probe evidence, not this newer head's acceptance.

Please return an independent audit PR, separately deciding B2 control adequacy,
fixed-ref release/unknown outcomes, C1/C2, and the preserved model opinions.
Suggested first JSON fence: schema=ltzzz.external-stage-audit.v1, original task_id,
phase=A2, seat=claude, actual verdict, reviewed_source_commit=the exact final head,
runtime_bundle_sha256=the 19-file hash above. The executor computes the report hash
externally; never require a file to contain its own complete digest.

A2/A3/B/signing/funds remain off; PR246 remains draft and must not be manually
merged to manufacture automatic-merge acceptance. Do not invoke paid Anthropic,
create keys, register signers or make payments. This dispatch is not proof that
Claude was awakened, accepted the task or submitted its review.
