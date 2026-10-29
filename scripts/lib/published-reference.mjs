import {publishedProof} from '../prune-published-videos.mjs';

// The publication record is the reference. A retained local MP4 is unnecessary.
export function selectPublishedReference(entries){
 const removed=new Set(entries.filter(({data})=>data?.deleted===true&&data.absence_verified===true).map(({data})=>data.video_id));
 return entries.filter(({data})=>publishedProof(data)&&!removed.has(data.video_id))
  .sort((a,b)=>(Date.parse(b.data.verified_at||b.data.at||'')||0)-(Date.parse(a.data.verified_at||a.data.at||'')||0)||b.file.localeCompare(a.file))[0]||null;
}
