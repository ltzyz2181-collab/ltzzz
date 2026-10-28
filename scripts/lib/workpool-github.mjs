import {randomUUID} from 'node:crypto';
import {sha256} from './workpool-policy.mjs';

// No raw issue text, shell commands or model self-reported identity enter this store.
export class WorkpoolGitHubStore {
  #token;
  constructor({repository,token,baseCommit,baseTree,fetcher=fetch}) {
    if (repository !== 'ltzyz2181-collab/ltzzz' || !/^[a-f0-9]{40}$/.test(baseCommit) || !/^[a-f0-9]{40}$/.test(baseTree) || !token) throw Error('trusted_repository_context_required');
    this.#token=token;Object.assign(this,{repository,baseCommit,baseTree,fetcher});
  }
  async api(path,{method='GET',body,allow=[]}={}) {
    const response=await this.fetcher(`https://api.github.com/repos/${this.repository}/${path}`,{method,headers:{Authorization:`Bearer ${this.#token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});
    if (!response.ok && !allow.includes(response.status)) throw Error(`workpool_github_http_${response.status}`);
    return {status:response.status,data:await response.json()};
  }
  names(key) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('invalid_unit_key');
    return {ref:`heads/workpool/leases/${key}`,file:`knowledge/results/workpool/leases/${key}.json`};
  }
  async read(key) {
    const n=this.names(key),ref=await this.api(`git/ref/${n.ref}`,{allow:[404]});
    if (ref.status===404) return null;
    const head=ref.data.object?.sha;
    if (!/^[a-f0-9]{40}$/.test(head)) throw Error('invalid_remote_lease_ref');
    const commit=await this.api(`git/commits/${head}`),file=await this.api(`contents/${n.file}?ref=${head}`);
    if (file.data.encoding!=='base64') throw Error('invalid_lease_encoding');
    return {head,tree:commit.data.tree.sha,state:JSON.parse(Buffer.from(file.data.content,'base64').toString('utf8'))};
  }
  async compareAndSwap(key,previous,state,{artifact}={}) {
    const n=this.names(key);
    // Distinct commits even for simultaneous identical transitions; otherwise a
    // same-second identical Git object could make two writers both report success.
    const saved={...state,cas_nonce:randomUUID()};
    const entries=[{path:n.file,mode:'100644',type:'blob',content:JSON.stringify(saved,null,2)+'\n'}];
    if (artifact?.content !== undefined) {
      const expected=`knowledge/results/workpool/artifacts/${key}/${state.lease_id}.json`;
      if (!/^[a-f0-9-]{36}$/.test(state.lease_id) || artifact.path!==expected || typeof artifact.content!=='string' || sha256(artifact.content)!==artifact.sha256 || state.artifact?.sha256!==artifact.sha256) throw Error('artifact_not_bound_to_lease');
      entries.push({path:expected,mode:'100644',type:'blob',content:artifact.content});
    }
    const tree=await this.api('git/trees',{method:'POST',body:{base_tree:previous?.tree||this.baseTree,tree:entries}});
    const commit=await this.api('git/commits',{method:'POST',body:{message:'workpool: atomic lease state',tree:tree.data.sha,parents:[previous?.head||this.baseCommit]}});
    const changed=previous
      ? await this.api(`git/refs/${n.ref}`,{method:'PATCH',body:{sha:commit.data.sha,force:false},allow:[409,422]})
      : await this.api('git/refs',{method:'POST',body:{ref:`refs/${n.ref}`,sha:commit.data.sha},allow:[409,422]});
    return changed.status>=200 && changed.status<300;
  }
}
