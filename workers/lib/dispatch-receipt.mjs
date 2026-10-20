// Transport observations, never model self-identification or cryptographic proof.
export function dispatchResponse(text, status, headers, {seat, model, taskId}) {
  let data;
  try { data = JSON.parse(text); } catch { return new Response(text, {status: status >= 400 ? status : 502, headers}); }
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  const nonempty = typeof content === 'string' && content.trim().length > 0;
  const complete = nonempty && choice?.finish_reason === 'stop';
  const ok = status >= 200 && status < 300 && complete;
  data.ltzzz_receipt = {
    schema_version: 1, task_id: typeof taskId === 'string' ? taskId.slice(0, 200) : null,
    seat, did: `did:ltzzz:${seat}`, requested_model: model,
    provider_reported_model: typeof data.model === 'string' ? data.model : null,
    observed_at: new Date().toISOString(), upstream_http: status,
    finish_reason: choice?.finish_reason ?? null, nonempty_output: nonempty,
    dispatch_status: ok ? 'response_received_pending_acceptance' : 'failed',
    identity_source: 'worker_configuration', signed: false
  };
  return new Response(JSON.stringify(data), {status: status >= 200 && status < 300 && !ok ? 502 : status, headers});
}
