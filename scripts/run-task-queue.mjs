// The legacy bulk runner is retired while ANS is priority one.
// Default is a zero-model durable plan. Paid execution belongs to the workflow,
// which commits that plan before entering the execute phase.
process.argv[2] ||= 'prepare';
await import('./run-ans-cycle.mjs');
