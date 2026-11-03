export function extractSupportedShareUrl(input) {
  const urls = String(input || '').match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const value of urls) {
    try {
      const url = new URL(value.replace(/[，。！？、；：)）\]}]+$/g, ''));
      const host = url.hostname.toLowerCase();
      if (['xiaohongshu.com', 'xhslink.com', 'xhslink.cn', 'douyin.com', 'iesdouyin.com'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
        return url.href;
      }
    } catch {
      // 继续查找分享文案中的下一个链接。
    }
  }
  return '';
}

export async function resolveSharedLink(text, request = fetch) {
  if (!extractSupportedShareUrl(text)) throw new Error('请粘贴抖音或小红书的公开分享链接');
  const response = await request('/api/resolve-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('链接解析服务返回了无效数据');
  }
  if (!response.ok) throw new Error(result?.error || '链接解析失败，请直接上传截图');
  if (!Array.isArray(result.images) || !result.images.length) throw new Error('这个作品中没有找到可导入的图片');
  return result;
}

function safeFileBase(title) {
  return String(title || '链接图纸').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '链接图纸';
}

export async function downloadLinkedImage(image, title, index, request = fetch) {
  const response = await request(image.url, { headers: { Accept: 'image/*' } });
  if (!response.ok) throw new Error('这张图片读取失败，请选择其他图片或上传截图');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('链接返回的内容不是图片');
  if (blob.size > 20 * 1024 * 1024) throw new Error('链接图片超过 20MB，请保存后从相册上传');
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  return new File([blob], `${safeFileBase(title)}-${index + 1}.${extension}`, { type: blob.type, lastModified: Date.now() });
}
