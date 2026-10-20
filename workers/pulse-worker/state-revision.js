// Durable Object requests are serialized. Revision advances on every saved
// mutation, including controls/tasks/incentives between health observations.
export function markStateMutation(state,now=Date.now()){
 state.state_revision=(Number.isSafeInteger(state.state_revision)?state.state_revision:0)+1;
 state.state_updated_at=new Date(now).toISOString();return state;
}
