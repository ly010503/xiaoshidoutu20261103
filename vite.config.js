import { defineConfig } from 'vite';
import { sites } from './build/sites-vite-plugin.js';
import { pages } from './build/pages-vite-plugin.js';
import { fetchProxiedImage } from './worker/linkResolver.js';

function localLinkImageProxy() {
  return {
    name: 'local-link-image-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (url.pathname !== '/api/link-image') return next();
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: '只支持 GET 请求' }));
          return;
        }
        try {
          const image = await fetchProxiedImage(
            url.searchParams.get('source'),
            url.searchParams.get('platform'),
          );
          const body = Buffer.from(await image.arrayBuffer());
          response.statusCode = 200;
          response.setHeader('Content-Type', image.headers.get('content-type') || 'application/octet-stream');
          response.setHeader('Content-Length', String(body.byteLength));
          response.setHeader('Cache-Control', 'private, max-age=1800');
          response.end(body);
        } catch (error) {
          response.statusCode = 422;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ error: error.message || '图片读取失败' }));
        }
      });
    },
  };
}

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    // 页面使用 /photo、/text 这样的路径，资源必须按站点根目录引用。
    base: '/',
    plugins: [
      localLinkImageProxy(),
      pages(),
      sites(),
      cloudflare({
        config: {
          main: './worker/index.js',
          compatibility_flags: ['nodejs_compat'],
        },
      }),
    ],
    build: {
      target: 'es2020',
      sourcemap: true,
    },
  };
});
