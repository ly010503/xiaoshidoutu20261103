// 站内页面：路径、搜索结果里的标题与描述。浏览器导航和构建时生成每页 HTML 共用这一份。
// index 为 false 的页面依赖本机数据，不让搜索引擎收录。heading 是三个上传入口页顶部的标题与步骤。
export const SITE_NAME = '拼豆图纸生成器';

export const PAGES = {
  home: {
    path: '/',
    title: '拼豆图纸生成器 - 免费在线把图片、文字转成拼豆图纸',
    description: '免费在线拼豆图纸生成器：上传照片或插画、输入文字、粘贴抖音小红书链接，自动匹配 MARD 221 色号，生成带色号坐标的拼豆图纸、用豆清单和 1:1 打印 PDF，图片只在本地处理。',
    index: true,
  },
  photo: {
    path: '/photo',
    title: '图片转拼豆图纸 - 照片、卡通、像素画一键生成｜拼豆图纸生成器',
    description: '上传 JPG、PNG、WebP 图片，按照片、插画、卡通 Q版、像素画自动选取色方式，生成 MARD 色号拼豆图纸，可逐格精修、统计用豆、导出高清图纸和 1:1 打印 PDF。',
    index: true,
    heading: {
      eyebrow: '图片转图纸',
      title: '让喜欢的图片，变成可以拼的作品',
      description: '上传照片或插画，选好尺寸与颜色，再慢慢打磨每一颗豆。',
      steps: ['上传 JPG、PNG 或 WebP 图片', '裁剪主体，选择图纸尺寸与颜色效果', '生成图纸，继续精修与导出'],
    },
  },
  recover: {
    path: '/recover',
    title: '拼豆图纸识别 - 截图还原成可编辑的拼豆图纸｜拼豆图纸生成器',
    description: '上传现成的拼豆网格图纸截图，自动识别横纵格数、排除坐标栏、逐格读取颜色并匹配图例色号，还原成可以继续改色和导出的拼豆图纸。',
    index: true,
    heading: {
      eyebrow: '图纸识别',
      title: '让一份旧图纸，继续新的创作',
      description: '上传已有网格图纸的截图，还原格子与颜色，继续编辑。',
      steps: ['选择清晰、完整的网格图纸截图', '核对识别出的横纵格数与图纸范围', '恢复底色和图例，进入编辑工作区'],
    },
  },
  text: {
    path: '/text',
    title: '文字转拼豆图纸 - 云朵字、贴纸字、像素字名字牌｜拼豆图纸生成器',
    description: '输入名字或祝福语，选择像素体、黄油体、快乐体、文楷等字体和云朵字、贴纸字、空心字、彩虹描边样式，配色全部是 MARD 真实色号，直接生成文字拼豆图纸。',
    index: true,
  },
  link: {
    path: '/link',
    title: '抖音小红书图片转拼豆图纸 - 粘贴链接导入｜拼豆图纸生成器',
    description: '粘贴抖音或小红书图文作品的分享链接，读取作品里的图片并选择一张导入，裁剪后生成自己的拼豆图纸，不用先保存到相册。',
    index: true,
    heading: {
      eyebrow: '链接导入',
      title: '看到喜欢的图，把灵感带回来',
      description: '粘贴抖音或小红书的图文分享链接，选择一张图片开始制作。',
      steps: ['粘贴公开图文作品的链接或分享文案', '从作品的图片中选择一张导入', '调整图片，生成自己的拼豆图纸'],
    },
  },
  library: {
    path: '/library',
    title: `我的图纸｜${SITE_NAME}`,
    description: '保存在当前浏览器里的拼豆图纸草稿，可以随时打开继续编辑。',
    index: false,
  },
  editor: {
    path: '/editor',
    title: `当前图纸｜${SITE_NAME}`,
    description: '编辑当前的拼豆图纸：改色、画笔、合并色号、统计用豆并导出。',
    index: false,
  },
};

/** 把地址栏路径换成页面标识；兼容末尾斜杠和 .html 后缀，未知路径返回 null。 */
export function pageFromPath(pathname) {
  const path = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/+$/, '$1') || '/';
  return Object.keys(PAGES).find((page) => PAGES[page].path === path) || null;
}
