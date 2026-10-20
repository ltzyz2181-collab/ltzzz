export function completeReadback(report){
 const missing=[];
 if(report.status==='blocked_media_readback')missing.push(report.error||'media_transport');
 if(report.cloud_cron?.verified!==true)missing.push('cloud_cron_unverified');
 if(report.queue_read_complete!==true)missing.push('queue_pagination_incomplete');
 if(report.wallet?.two_rpc_agreement!==true)missing.push('independent_wallet_balance_unverified');
 if(report.youtube?.connected!==true||report.youtube.channel_id!=='UCnKqseQ7uivSc7FN38ccRUA')missing.push('expected_youtube_channel_unverified');
 if(report.candidate_video_count>0&&!report.selected_video?.queued)missing.push('selected_video_content_not_verified');
 return {status:missing.length?'blocked_incomplete_readback':'media_readback_complete_no_publication_attempt',missing};
}
