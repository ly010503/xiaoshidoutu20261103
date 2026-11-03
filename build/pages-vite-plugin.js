import { PAGES, pageFromPath } from '../src/state/pages.js';

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 把构建好的首页 HTML 改成某一页：标题、描述、收录设置、社交分享信息和顶部标题。 */
export function renderPageHtml(html, id, page, origin = '') {
  const url = origin ? `${origin}${page.path}` : '';
  const head = [
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    page.index ? '' : '<meta name="robots" content="noindex" />',
    url ? `<link rel="canonical" href="${url}" />` : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    url ? `<meta property="og:url" content="${url}" />` : '',
  ].filter(Boolean).join('\n    ');
  let result = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, head)
    .replace(/<body data-page="[^"]*"/, `<body data-page="${id}"`);
  // 上传入口页把顶部标题直接写进 HTML，不执行脚本的搜索引擎也能读到这一页讲什么。
  if (page.heading) {
    result = result.replace(
      '<span id="creationEyebrow" class="eyebrow"></span><h2 id="creationTitle" tabindex="-1"></h2><p id="creationDescription"></p>',
      `<span id="creationEyebrow" class="eyebrow">${escapeHtml(page.heading.eyebrow)}</span><h2 id="creationTitle" tabindex="-1">${escapeHtml(page.heading.title)}</h2><p id="creationDescription">${escapeHtml(page.heading.description)}</p>`,
    );
  }
  return result;
}

export function renderRobots(origin = '') {
  const hidden = Object.values(PAGES).filter((page) => !page.index).map((page) => `Disallow: ${page.path}`);
  return ['User-agent: *', 'Allow: /', ...hidden, origin ? `Sitemap: ${origin}/sitemap.xml` : ''].filter(Boolean).join('\n') + '\n';
}

export function renderSitemap(origin) {
  const urls = Object.values(PAGES).filter((page) => page.index)
    .map((page) => `  <url><loc>${origin}${page.path}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/**
 * 构建时为每个页面生成独立 HTML（/photo → photo.html），再生成 robots.txt；
 * 设置了 SITE_URL（如 https://example.com）时同时生成 sitemap.xml 和 canonical 地址。
 */
export function pages({ siteUrl = process.env.SITE_URL || '' } = {}) {
  const origin = siteUrl.replace(/\/+$/, '');
  // 开发时 /photo、/text 等页面路径同样返回首页 HTML，由前端按路径显示对应页面；
  // 要排在 Cloudflare 插件之前，否则请求会被交给 Worker。
  const devRoutes = {
    name: 'pages-dev-routes',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const [pathname, query = ''] = (request.url || '/').split('?');
        if (request.method === 'GET' && pathname !== '/' && pageFromPath(pathname)) {
          // Cloudflare 插件按 originalUrl 转发请求，两个都要改；改成 / 而不是 /index.html，
          // 否则它的静态资源处理会把 /index.html 重定向回 /，再被改写，陷入循环。
          request.url = `/${query ? `?${query}` : ''}`;
          request.originalUrl = request.url;
        }
        next();
      });
    },
  };
  const buildPages = {
    name: 'pages-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const entry = bundle['index.html'];
      if (!entry || entry.type !== 'asset') return;
      const template = String(entry.source);
      for (const [id, page] of Object.entries(PAGES)) {
        const html = renderPageHtml(template, id, page, origin);
        if (page.path === '/') entry.source = html;
        else this.emitFile({ type: 'asset', fileName: `${page.path.slice(1)}.html`, source: html });
      }
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: renderRobots(origin) });
      if (origin) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(origin) });
    },
  };
  return [devRoutes, buildPages];
}
