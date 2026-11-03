// 用法：node extract-tokens.mjs <url> [输出目录] [视口宽度，默认1440]
// 统计可见元素的计算样式（按出现次数排序），并从网络响应里读取全部 CSS 源码（含跨域 CDN），
// 输出 tokens.json：颜色、字体、字号、行高、字距、间距、圆角、阴影、边框、过渡、CSS 变量、@font-face
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, collectSources, open, parseCss } from './lib/browser.mjs';

const [, , url, outDir = './out', vw = '1440'] = process.argv;
if (!url) { console.error('用法：node extract-tokens.mjs <url> [输出目录] [视口宽度]'); process.exit(1); }
await mkdir(outDir, { recursive: true });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: Number(vw), height: 900 } });
  const src = collectSources(page);
  const { banner } = await open(page, url);
  // 滚到底再回顶，触发懒加载区块
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => {
    const count = {};
    const add = (k, v, w = 1) => { if (!v || v === 'none' || v === 'normal' || v === 'auto') return; (count[k] ??= {})[v] = (count[k][v] || 0) + w; };
    const px = v => v.split(' ').filter(x => x !== '0px');
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (hasText) {
        const chars = el.textContent.trim().length; // 按字数加权，正文样式不会被零散标签压过
        add('fontFamily', s.fontFamily, chars); add('fontSize', s.fontSize, chars); add('fontWeight', s.fontWeight, chars);
        add('lineHeight', s.lineHeight, chars); add('letterSpacing', s.letterSpacing, chars); add('textColor', s.color, chars);
        add('typePair', `${s.fontSize}/${s.lineHeight} ${s.fontWeight} ${s.letterSpacing}`, chars);
      }
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') add('backgroundColor', s.backgroundColor, Math.round(r.width * r.height / 1e4) + 1);
      if (s.backgroundImage.includes('gradient')) add('gradient', s.backgroundImage.slice(0, 160));
      px(s.margin).forEach(v => add('margin', v)); px(s.padding).forEach(v => add('padding', v));
      if (s.rowGap !== 'normal' && s.rowGap !== '0px') add('gap', s.rowGap); if (s.columnGap !== 'normal' && s.columnGap !== '0px') add('gap', s.columnGap);
      if (s.borderRadius !== '0px') add('borderRadius', s.borderRadius);
      if (s.boxShadow !== 'none') add('boxShadow', s.boxShadow);
      if (s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none') { add('border', `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`); add('borderColor', s.borderTopColor); }
      if (s.transitionDuration !== '0s') add('transition', `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}`.slice(0, 160));
      if (s.display === 'grid') add('gridTemplateColumns', s.gridTemplateColumns.split(' ').length + ' 列');
      if (s.maxWidth !== 'none' && s.maxWidth.endsWith('px')) add('maxWidth', s.maxWidth);
    }
    const sorted = {};
    for (const [k, v] of Object.entries(count)) sorted[k] = Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([value, n]) => ({ value, n }));
    const rootVars = {}; const cs = getComputedStyle(document.documentElement);
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } for (const r of rules) if (r.style) for (const n of r.style) if (n.startsWith('--')) rootVars[n] = cs.getPropertyValue(n).trim(); }
    return { url: location.href, viewport: innerWidth, tokens: sorted, cssVariablesResolved: rootVars };
  });
  const parsed = parseCss(src.css);
  result.cssSourceFiles = src.css.map(s => s.url);
  result.cssVariablesDeclared = parsed.vars;
  result.fontFaces = parsed.fontFaces;
  result.cookieBanner = banner;
  await writeFile(`${outDir}/tokens.json`, JSON.stringify(result, null, 2));
  console.log(`已写入 ${outDir}/tokens.json（样式表 ${src.css.length} 个，声明的 CSS 变量 ${Object.keys(parsed.vars).length} 个，@font-face ${parsed.fontFaces.length} 个${banner ? '，已关闭弹窗 ' + banner : ''}）`);
} finally { await browser.close(); }
