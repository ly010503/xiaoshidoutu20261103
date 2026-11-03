import { fetchProxiedImage } from '../worker/linkResolver.js';

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
    if (request.method !== 'GET') return json({ error: '只支持 GET 请求' }, 405);

    try {
      const url = new URL(request.url);
      const response = await fetchProxiedImage(
        url.searchParams.get('source'),
        url.searchParams.get('platform'),
      );
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'private, max-age=1800');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.delete('set-cookie');
      return new Response(response.body, { status: 200, headers });
    } catch (error) {
      return json({ error: error.message || '图片读取失败' }, 422);
    }
  },
};
