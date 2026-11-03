import { resolveSharedPost } from '../worker/linkResolver.js';

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: '只支持 POST 请求' }, 405);

    try {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > 16 * 1024) return json({ error: '请求内容过大' }, 413);

      const body = await request.json();
      const result = await resolveSharedPost(body?.text);
      const images = result.images.map((source, index) => ({
        id: `${result.platform}-${index + 1}`,
        url: `/api/link-image?platform=${result.platform}&source=${encodeURIComponent(source)}`,
      }));

      return json({ ...result, images });
    } catch (error) {
      return json({
        error: error.message || '链接解析失败',
        code: error.code || 'RESOLVE_FAILED',
      }, 422);
    }
  },
};
