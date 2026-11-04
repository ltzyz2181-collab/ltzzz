// Public, inert metadata target. No wallet, model, storage or service binding.
export default {
  fetch(request, env) {
    const source = env.CANARY_SOURCE_COMMIT;
    const version = env.CF_VERSION_METADATA?.id;
    const { pathname } = new URL(request.url);

    if (
      request.method !== 'GET' ||
      (pathname !== '/canary' && pathname !== '/capabilities')
    ) {
      return new Response('not_found', { status: 404 });
    }

    if (
      !/^[a-f0-9]{40}$/.test(source || '') ||
      typeof version !== 'string' ||
      !version
    ) {
      return Response.json(
        { error: 'deployment_metadata_missing' },
        { status: 503 }
      );
    }

    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Source-Commit': source,
      'X-Worker-Version-Id': version,
    };

    if (pathname === '/canary') {
      return new Response(
        JSON.stringify({
          schema: 'ltzzz.patchgate.canary.v1',
          source_commit: source,
        }) + '\n',
        { headers }
      );
    }

    return new Response(
      JSON.stringify({
        schema: 'ltzzz.deep-superagent.capability-card.v1',
        coordinator: 'deepseek',
        worker_seats: ['doubao', 'qianwen', 'kimi', 'grok'],
        decision_seat: 'gpt',
        deployment_executor: 'trusted_CI_after_GPT_decision',
        financial_execution: false,
        external_submissions_enabled: false,
        native_paid_reserved_enabled: false,
        source_commit: source,
      }),
      { headers }
    );
  },
};
