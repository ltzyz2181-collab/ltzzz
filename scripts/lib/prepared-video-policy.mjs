import {OWNER_REMOVAL} from '../../youtube-owner-removal.mjs';
export function preparedVideoPolicy({day,hash,meta,receipts=[]}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||!/^[a-f0-9]{64}$/.test(hash||''))return 'blocked_invalid_prepared_identity';
 if(hash===OWNER_REMOVAL.video_sha256)return 'blocked_owner_removed_video_content';
 if(meta?.day&&meta.day!==day||meta?.publication_day&&meta.publication_day!==day)return 'blocked_prepared_day_mismatch';
 if(meta?.video_sha256&&meta.video_sha256!==hash)return 'blocked_prepared_hash_mismatch';
 if(typeof meta?.title!=='string'||!meta.title.trim()||meta.title.length>100||typeof meta.description!=='string'||meta.description.length>4900)return 'blocked_prepared_metadata';
 if(receipts.some(r=>r.video_sha256===hash&&(r.published===true||r.uploaded===true||r.video_id)))return 'blocked_prepared_content_already_used';
 return 'ready';
}
