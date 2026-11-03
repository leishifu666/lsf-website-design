// 用法：node extract-components.mjs <url> [输出目录] [视口宽度，默认1440]
// 拆参考站的组件是怎么设计的：按钮、卡片、导航、输入框、标签、区块。
// 每类按样式去重成“变体”，记录尺寸、内边距、圆角、颜色、边框、阴影、字体、内部结构，并截图。
// 输出 components.json、components.md（表格，可直接贴进拆解报告）和 crops/*.png
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, open } from './lib/browser.mjs';

const [, , url, outDir = './out-components', vw = '1440'] = process.argv;
if (!url) { console.error('用法：node extract-components.mjs <url> [输出目录] [视口宽度]'); process.exit(1); }
await mkdir(`${outDir}/crops`, { recursive: true });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: Number(vw), height: 900 } });
  await open(page, url);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
  await page.waitForTimeout(800);

  const data = await page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; };
    const st = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return {
      w: Math.round(r.width), h: Math.round(r.height), padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`, radius: s.borderRadius,
      bg: s.backgroundColor, bgImage: s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 120) : '', color: s.color,
      border: parseFloat(s.borderTopWidth) ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` : '', shadow: s.boxShadow !== 'none' ? s.boxShadow : '',
      font: `${s.fontSize}/${s.lineHeight} ${s.fontWeight} ${s.fontFamily.split(',')[0]}`, tracking: s.letterSpacing, transform: s.textTransform,
      gap: /flex|grid/.test(s.display) ? s.gap : '', display: s.display, backdrop: s.backdropFilter !== 'none' ? s.backdropFilter : '', position: s.position, transition: s.transition.slice(0, 120) }; };
    const tree = e => [...e.children].slice(0, 8).map(c => c.tagName.toLowerCase() + (c.querySelector('img,svg,video,canvas') && !/img|svg|video|canvas/i.test(c.tagName) ? '[媒体]' : '')).join(' + ');
    const groups = {}; let id = 0;
    const add = (kind, e, extra = {}) => {
      const s = st(e); const sig = [kind, s.bg, s.color, s.radius, s.padding, s.font, s.border, s.shadow].join('|');
      const g = (groups[sig] ??= { kind, style: s, count: 0, samples: [], ids: [] }); g.count++;
      if (g.samples.length < 3) { const t = (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 50); g.samples.push({ text: t, structure: tree(e), ...extra }); const k = `c${id++}`; e.setAttribute('data-lsf-comp', k); g.ids.push(k); }
    };
    // 按钮
    for (const e of document.querySelectorAll('button, [role=button], a, input[type=submit]')) { if (!vis(e)) continue; const s = getComputedStyle(e); const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) > 0; const r = e.getBoundingClientRect(); if ((filled || e.tagName === 'BUTTON') && r.height <= 72 && r.width <= 420) add(e.closest('header,nav') ? 'button(导航内)' : 'button', e); }
    // 输入框
    for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select')) if (vis(e)) add('input', e);
    // 标签 / 徽章：短文本、有底色或边框、矮
    for (const e of document.querySelectorAll('span, a, div, li')) { if (!vis(e) || e.children.length > 2) continue; const s = getComputedStyle(e), r = e.getBoundingClientRect(); const txt = e.innerText?.trim() || ''; if (txt && txt.length <= 24 && r.height <= 32 && r.height >= 14 && (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) > 0) && parseFloat(s.borderRadius) > 0 && parseFloat(s.paddingLeft) >= 2 && !e.closest('pre,code')) add('badge', e); }
    // 卡片：同一父元素下 ≥3 个 class 相同、尺寸相近、带背景/边框/阴影/圆角之一的兄弟
    for (const p of document.querySelectorAll('body *')) {
      const kids = [...p.children].filter(vis); if (kids.length < 3) continue;
      const byCls = {}; for (const k of kids) (byCls[k.tagName + '.' + String(k.className)] ??= []).push(k);
      for (const list of Object.values(byCls)) {
        if (list.length < 3) continue; const r0 = list[0].getBoundingClientRect(); if (r0.width < 160 || r0.height < 100) continue;
        const s = getComputedStyle(list[0]); const boxed = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none' || parseFloat(s.borderRadius) > 0 || list[0].querySelector('img,picture,video');
        if (boxed && list.every(k => Math.abs(k.getBoundingClientRect().height - r0.height) < r0.height * 0.5)) list.slice(0, 4).forEach(k => add('card', k, { siblings: list.length, columns: new Set(list.map(k => Math.round(k.getBoundingClientRect().top))).size ? Math.round(list.length / new Set(list.map(k => Math.round(k.getBoundingClientRect().top))).size) : 1 }));
      }
    }
    // 导航
    const header = document.querySelector('header') || document.querySelector('nav');
    const nav = header && vis(header) ? { ...st(header), links: header.querySelectorAll('a').length, structure: tree(header) } : null;
    if (header) header.setAttribute('data-lsf-comp', 'nav');
    // 区块：body 下内容宽度较大的直接分段
    let main = document.querySelector('main') || document.body;
    while ([...main.children].filter(vis).length < 3 && main.firstElementChild) main = [...main.children].filter(vis).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] || main.firstElementChild;
    const sections = [...main.children].filter(vis).filter(e => e.getBoundingClientRect().height > 200).slice(0, 20).map(e => { const s = st(e); const inner = [...e.querySelectorAll('*')].find(c => { const cs = getComputedStyle(c); return cs.maxWidth !== 'none' && cs.maxWidth.endsWith('px'); }); return { tag: e.tagName.toLowerCase(), h: s.h, padding: s.padding, bg: s.bg, bgImage: s.bgImage, container: inner ? getComputedStyle(inner).maxWidth : '', heading: (e.querySelector('h1,h2,h3')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) }; });
    // 显眼程度：有底色/边框、有可读文字、面积大、靠近首屏的排前面，产品截图里的小控件自然沉底
    for (const g of Object.values(groups)) { const s = g.style; const filled = s.bg !== 'rgba(0, 0, 0, 0)' || !!s.border; const txt = g.samples.some(x => x.text.length > 2); g.prominence = (filled ? 2 : 0) + (txt ? 2 : 0) + Math.min(3, Math.log10(s.w * s.h + 1) - 2) + (parseFloat(s.font) >= 14 ? 1 : 0); g.prominence = +g.prominence.toFixed(1); }
    return { variants: Object.values(groups).sort((a, b) => a.kind.localeCompare(b.kind) || b.prominence - a.prominence || b.count - a.count), nav, sections };
  });

  // 每个变体截 1 张图
  let shots = 0;
  for (const [i, v] of data.variants.entries()) {
    const k = v.ids[0]; const h = await page.$(`[data-lsf-comp="${k}"]`); if (!h) continue;
    const f = `crops/${v.kind.replace(/\W+/g, '')}-${String(i).padStart(2, '0')}.png`;
    try { await h.scrollIntoViewIfNeeded(); await h.screenshot({ path: `${outDir}/${f}`, timeout: 5000 }); v.crop = f; shots++; } catch {}
    delete v.ids;
  }
  if (data.nav) { const h = await page.$('[data-lsf-comp="nav"]'); await page.evaluate(() => scrollTo(0, 0)); try { await h.screenshot({ path: `${outDir}/crops/nav.png` }); data.nav.crop = 'crops/nav.png'; } catch {} }

  await writeFile(`${outDir}/components.json`, JSON.stringify({ url, viewport: Number(vw), ...data }, null, 2));
  const row = v => `| ${v.kind} | ${v.prominence} | ${v.count} | ${v.samples.map(s => s.text).filter(Boolean).slice(0, 2).join(' / ').replace(/\|/g, '/')} | ${v.style.w}×${v.style.h} | ${v.style.padding} | ${v.style.radius} | ${v.style.bg}${v.style.border ? '；边框 ' + v.style.border : ''} | ${v.style.font} | ${v.style.shadow ? '有' : ''} | ${v.samples[0]?.structure || ''} | ${v.crop || ''} |`;
  const md = [`# 组件拆解：${url}（${vw}px）`, '', '| 类型 | 显眼度 | 出现 | 示例文字 | 尺寸 | 内边距 | 圆角 | 底色 / 边框 | 字体 | 阴影 | 内部结构 | 截图 |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...data.variants.slice(0, 40).map(row), '',
    data.nav ? `导航：${data.nav.position}，高 ${data.nav.h}px，底色 ${data.nav.bg}${data.nav.backdrop ? '，背景模糊 ' + data.nav.backdrop : ''}，链接 ${data.nav.links} 个，结构 ${data.nav.structure}` : '导航：未识别', '',
    '| 区块 | 高 | 内边距 | 底色 | 内容最大宽 | 标题 |', '|---|---|---|---|---|---|---|', ...data.sections.map(s => `| ${s.tag} | ${s.h} | ${s.padding} | ${s.bg}${s.bgImage ? ' + 渐变/图' : ''} | ${s.container} | ${s.heading.replace(/\|/g, '/')} |`)].join('\n');
  await writeFile(`${outDir}/components.md`, md);
  console.log(`已写入 ${outDir}/components.json、components.md：${data.variants.length} 个变体（截图 ${shots} 张），区块 ${data.sections.length} 个`);
} finally { await browser.close(); }
