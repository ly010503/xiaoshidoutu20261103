import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, pageFromPath } from '../src/state/pages.js';
import { renderPageHtml, renderRobots, renderSitemap } from '../build/pages-vite-plugin.js';

const TEMPLATE = `<head><meta name="description" content="旧描述" /><title>旧标题</title></head>
<body data-page="home"><span id="creationEyebrow" class="eyebrow"></span><h2 id="creationTitle" tabindex="-1"></h2><p id="creationDescription"></p></body>`;

test('地址栏路径对应到页面，兼容末尾斜杠和 .html 后缀', () => {
  assert.equal(pageFromPath('/'), 'home');
  assert.equal(pageFromPath('/index.html'), 'home');
  assert.equal(pageFromPath('/photo'), 'photo');
  assert.equal(pageFromPath('/photo/'), 'photo');
  assert.equal(pageFromPath('/text.html'), 'text');
  assert.equal(pageFromPath('/nope'), null);
  assert.equal(pageFromPath('/assets/index.js'), null);
});

test('每个页面的路径、标题和描述都不重复', () => {
  const values = Object.values(PAGES);
  for (const key of ['path', 'title', 'description']) {
    assert.equal(new Set(values.map((page) => page[key])).size, values.length, key);
  }
});

test('生成的页面 HTML 带自己的标题、描述、收录设置和顶部标题', () => {
  const photo = renderPageHtml(TEMPLATE, 'photo', PAGES.photo, 'https://example.com');
  assert.match(photo, new RegExp(`<title>${PAGES.photo.title}</title>`));
  assert.match(photo, /<link rel="canonical" href="https:\/\/example.com\/photo" \/>/);
  assert.match(photo, /<body data-page="photo"/);
  assert.match(photo, new RegExp(`<h2 id="creationTitle" tabindex="-1">${PAGES.photo.heading.title}</h2>`));
  assert.doesNotMatch(photo, /旧描述|noindex/);
  const editor = renderPageHtml(TEMPLATE, 'editor', PAGES.editor);
  assert.match(editor, /<meta name="robots" content="noindex" \/>/);
  assert.doesNotMatch(editor, /canonical/);
});

test('robots 屏蔽依赖本机数据的页面，sitemap 只列可收录页面', () => {
  const robots = renderRobots('https://example.com');
  assert.match(robots, /Disallow: \/editor/);
  assert.match(robots, /Sitemap: https:\/\/example.com\/sitemap.xml/);
  const sitemap = renderSitemap('https://example.com');
  assert.match(sitemap, /<loc>https:\/\/example.com\/text<\/loc>/);
  assert.doesNotMatch(sitemap, /library|editor/);
});
