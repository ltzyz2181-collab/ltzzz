/**
 * LTZZZ R2 公共访问代理 · videos.ltzzz.com → ltzzz-videos bucket
 * 2026-10-02 豆包建：CF 控制台 R2 自定义域名页面加载失败，改用 Worker 路由实现同等公共访问。
 * 用途：video-scheduler cron 自动发布时通过 PUBLIC_VIDEO_BASE=https://videos.ltzzz.com/ 拉取 R2 视频。
 * 安全：只读公开 bucket 对象（LTZZZ 视频本身要对外公开，无敏感数据）。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!key) return new Response('missing key', { status: 400 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }
    try {
      const obj = await env.VIDEOS.get(key);
      if (!obj) return new Response('not found: ' + key, { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      headers.set('Cache-Control', 'public, max-age=3600');
      return new Response(obj.body, { headers });
    } catch (e) {
      return new Response('error: ' + String(e.message || e), { status: 500 });
    }
  },
};
