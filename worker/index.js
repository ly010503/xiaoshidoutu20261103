import { fetchProxiedImage, resolveSharedPost } from './linkResolver.js';
import { PAGES, pageFromPath } from '../src/state/pages.js';

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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/resolve-link') {
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
        return json({ error: error.message || '链接解析失败', code: error.code || 'RESOLVE_FAILED' }, 422);
      }
    }
    if (url.pathname === '/api/link-image') {
      if (request.method !== 'GET') return json({ error: '只支持 GET 请求' }, 405);
      try {
        const response = await fetchProxiedImage(url.searchParams.get('source'), url.searchParams.get('platform'));
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', 'private, max-age=1800');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.delete('set-cookie');
        return new Response(response.body, { status: 200, headers });
      } catch (error) {
        return json({ error: error.message || '图片读取失败' }, 422);
      }
    }
    // /photo/、/photo.html 统一跳到 /photo，搜索引擎只收录一个地址。
    const page = pageFromPath(url.pathname);
    if (page && url.pathname !== PAGES[page].path) {
      return Response.redirect(new URL(`${PAGES[page].path}${url.search}`, url), 301);
    }
    // 本地开发时静态文件由 Vite 提供，没有 ASSETS 绑定；落到这里的请求都是不存在的路径。
    if (!env.ASSETS) return new Response('Not Found', { status: 404 });
    const response = await env.ASSETS.fetch(request);
    // 托管平台没有把 /photo 自动对应到 photo.html 时，在这里补上。
    if (response.status === 404 && page) {
      return env.ASSETS.fetch(new Request(new URL(page === 'home' ? '/' : `${PAGES[page].path}.html`, url), request));
    }
    return response;
  },
};
