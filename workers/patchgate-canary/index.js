// Public, inert A3 metadata target. No wallet, model, storage or service binding.
export default {
  fetch(request,env){
    const source=env.CANARY_SOURCE_COMMIT,version=env.CF_VERSION_METADATA?.id;
    if(request.method!=='GET'||new URL(request.url).pathname!=='/canary')return new Response('not_found',{status:404});
    if(!/^[a-f0-9]{40}$/.test(source||'')||typeof version!=='string'||!version)return Response.json({error:'deployment_metadata_missing'},{status:503});
    return new Response(JSON.stringify({schema:'ltzzz.patchgate.canary.v1',source_commit:source})+'\n',{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Source-Commit':source,'X-Worker-Version-Id':version}});
  }
};
