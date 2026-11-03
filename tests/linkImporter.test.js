import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSupportedShareUrl, resolveSharedLink } from '../src/link/linkImporter.js';

test('前端能从分享文案提取支持的平台链接', () => {
  assert.equal(extractSupportedShareUrl('看看这个 2.88 https://v.douyin.com/AbCd/ 复制打开'), 'https://v.douyin.com/AbCd/');
  assert.equal(extractSupportedShareUrl('拼豆图纸 https://xhslink.cn/o/52QxeAxkJJ6 先复制再打开【小红书】'), 'https://xhslink.cn/o/52QxeAxkJJ6');
  assert.equal(extractSupportedShareUrl('https://example.com/a'), '');
});

test('解析接口错误会转换为可读提示', async () => {
  await assert.rejects(
    () => resolveSharedLink('https://xhslink.com/a/abc', async () => Response.json({ error: '平台要求安全验证' }, { status: 422 })),
    /平台要求安全验证/,
  );
});

test('解析接口必须返回至少一张图片', async () => {
  await assert.rejects(
    () => resolveSharedLink('https://xhslink.com/a/abc', async () => Response.json({ images: [] })),
    /没有找到可导入的图片/,
  );
});
