// Fixed BASE review manifest; no candidate-provided list.
export const A2_REVIEW_FILES=Object.freeze([
  'config/patch-policy.json','config/patchgate-trust.json','config/patchgate-executors.json','config/patchgate-a2.json',
  'scripts/patchgate.mjs','scripts/lib/patchgate.mjs','scripts/lib/patchgate-a2.mjs','scripts/lib/patchgate-a2-readback.mjs','scripts/patchgate-a2-preflight.mjs',
  'scripts/tests/patchgate.test.mjs','scripts/tests/patchgate-a1.test.mjs','scripts/tests/patchgate-a2.test.mjs',
  'scripts/lib/patchgate-a2-collector.mjs','scripts/patchgate-a2-collect.mjs','scripts/tests/patchgate-a2-collector.test.mjs','config/patchgate-a2-collector.json',
  '.github/workflows/patchgate-a2-base-checks.yml','.github/workflows/patchgate-a2-collector.yml','.github/workflows/patchgate-a2-verify.yml',
  'scripts/lib/patchgate-a2-reconcile.mjs','scripts/patchgate-a2-reconcile.mjs','config/patchgate-a2-reconcile.json','scripts/tests/patchgate-a2-reconcile.test.mjs','.github/workflows/patchgate-a2-reconcile.yml',
  'scripts/lib/patchgate-a2-executor.mjs','scripts/patchgate-a2-execute.mjs','scripts/tests/patchgate-a2-executor.test.mjs','.github/workflows/patchgate-a2-execute.yml'
,
'patchgate-oidc.mjs','patchgate-a2-manifest.mjs','patchgate-attestation-evidence.mjs','patchgate-model-attestation-worker.js','scripts/request-patchgate-model-attestation.mjs','config/patchgate-model-attestation.json','.github/workflows/patchgate-model-attest.yml','scripts/tests/patchgate-model-attestation.test.mjs','scripts/tests/patchgate-attestation-evidence.test.mjs',
'patchgate-secret-scan.mjs','patchgate-signer-source.mjs','scripts/lib/patchgate-native-response.mjs','scripts/build-patchgate-signer-release.mjs','scripts/lib/patchgate-author-checks-producer.mjs','config/patchgate-author-checks.json','scripts/tests/patchgate-author-checks-producer.test.mjs','scripts/tests/patchgate-signer-source.test.mjs'
]);
