// 用法：node extract-media.mjs <url> [输出目录] [视口宽度，默认1440]
// 看参考站的图片是怎么处理的：格式、是否透明、裁切方式、遮罩、混合模式、滤镜、圆角、叠加层、
// 是否压住文字（图文穿插）、是否跨出所在区块、是否是重复纹理。输出 media.json、media.md、crops/。
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, open } from './lib/browser.mjs';

const [, , url, outDir = './out-media', vw = '1440'] = process.argv;
if (!url) { console.error('用法：node extract-media.mjs <url> [输出目录] [视口宽度]'); process.exit(1); }
await mkdir(`${outDir}/crops`, { recursive: true });

// 从文件头判断格式和是否带 alpha（不解码整张图）
function sniff(buf, ctype = '') {
  const b = buf; const s = (o, n) => b.toString('latin1', o, o + n);
  if (b.length > 26 && b.readUInt32BE(0) === 0x89504e47) { const ct = b[25]; let trns = b.includes(Buffer.from('tRNS')); return { format: 'png', alpha: ct === 4 || ct === 6 || trns }; }
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') { const chunk = s(12, 4); if (chunk === 'VP8X') return { format: 'webp', alpha: !!(b[20] & 0x10) }; return { format: 'webp', alpha: chunk === 'VP8L' ? !!(b[24] & 0x10) || null : false }; }
  if (s(4, 4) === 'ftyp' && /avif|avis|mif1/.test(s(8, 16))) return { format: 'avif', alpha: b.includes(Buffer.from('auxiliary:alpha')) };
  if (b[0] === 0xff && b[1] === 0xd8) return { format: 'jpeg', alpha: false };
  if (s(0, 3) === 'GIF') return { format: 'gif', alpha: null };
  if (/svg/.test(ctype) || s(0, 200).includes('<svg')) return { format: 'svg', alpha: true };
  return { format: ctype.split('/')[1] || '未知', alpha: null };
}

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: Number(vw), height: 900 } });
  const bodies = new Map();
  page.on('response', async r => { try { if (r.request().resourceType() === 'image' && r.status() < 400) { const buf = await r.body(); bodies.set(r.url(), sniff(buf.subarray(0, 4096).length < 4096 ? buf : Buffer.concat([buf.subarray(0, 4096), buf.subarray(-2048)]), r.headers()['content-type'] || '')); } } catch {} });
  await open(page, url);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); } scrollTo(0, 0); });
  await page.waitForTimeout(1200);

  const items = await page.evaluate(() => {
    const out = []; let id = 0;
    const texts = [...document.querySelectorAll('h1,h2,h3,h4,p,a,button,span,li')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)).map(e => ({ e, r: e.getBoundingClientRect() })).filter(t => t.r.width && t.r.height);
    const section = e => e.closest('section, header, footer, [class*=section i], main > div') || document.body;
    const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const describe = (el, kind, src, extra = {}) => {
      const r = el.getBoundingClientRect(); if (r.width < 24 || r.height < 24) return; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return;
      const sec = section(el).getBoundingClientRect();
      const overText = texts.filter(t => !el.contains(t.e) && !t.e.contains(el) && inter(r, t.r) > t.r.width * t.r.height * 0.3).length;
      // 叠在图上的半透明层：同一父元素里另一个绝对定位、带渐变或半透明底色的兄弟，或 ::before/::after
      const p = el.parentElement; const overlay = p ? [...p.children].some(c => c !== el && /absolute|fixed/.test(getComputedStyle(c).position) && (getComputedStyle(c).backgroundImage.includes('gradient') || /rgba\(.+, 0\.\d+\)/.test(getComputedStyle(c).backgroundColor))) || ['::before', '::after'].some(w => { const ps = getComputedStyle(p, w); return ps.content !== 'none' && (ps.backgroundImage.includes('gradient') || /rgba/.test(ps.backgroundColor)); }) : false;
      const k = `m${id++}`; el.setAttribute('data-lsf-media', k);
      out.push({ id: k, kind, src: (src || '').slice(0, 300), y: Math.round(r.top + scrollY), rendered: `${Math.round(r.width)}x${Math.round(r.height)}`, viewportShare: +(r.width * r.height / (innerWidth * innerHeight)).toFixed(2),
        objectFit: s.objectFit, objectPosition: s.objectPosition, radius: s.borderRadius !== '0px' ? s.borderRadius : '', clipPath: s.clipPath !== 'none' ? s.clipPath.slice(0, 80) : '', mask: (s.maskImage || s.webkitMaskImage || 'none') !== 'none' ? (s.maskImage || s.webkitMaskImage).slice(0, 80) : '',
        blend: s.mixBlendMode !== 'normal' ? s.mixBlendMode : '', filter: s.filter !== 'none' ? s.filter : '', opacity: s.opacity !== '1' ? s.opacity : '', shadow: s.boxShadow !== 'none' ? 'box-shadow' : (s.filter.includes('drop-shadow') ? 'drop-shadow' : ''),
        position: s.position, zIndex: s.zIndex, overText, overlay, bleedsOutOfSection: r.top < sec.top - 4 || r.bottom > sec.bottom + 4 || r.left < sec.left - 4 || r.right > sec.right + 4, fullBleed: r.width >= innerWidth - 2,
        alt: el.getAttribute('alt'), loading: el.getAttribute('loading') || '', fetchpriority: el.getAttribute('fetchpriority') || '', srcset: !!el.getAttribute('srcset') || !!el.closest('picture'), ...extra });
    };
    for (const img of document.querySelectorAll('img')) describe(img, 'img', img.currentSrc || img.src, { natural: `${img.naturalWidth}x${img.naturalHeight}` });
    for (const v of document.querySelectorAll('video')) describe(v, 'video', v.currentSrc || v.poster, { autoplay: v.autoplay, loop: v.loop, muted: v.muted });
    for (const sv of document.querySelectorAll('svg')) { const r = sv.getBoundingClientRect(); if (r.width >= 120) describe(sv, 'svg', '(内联 SVG)'); }
    for (const el of document.querySelectorAll('body *')) { const s = getComputedStyle(el); const m = s.backgroundImage.match(/url\(["']?([^"')]+)/); if (m) describe(el, s.backgroundRepeat.includes('repeat') && !s.backgroundRepeat.includes('no-repeat') && !['cover', 'contain'].includes(s.backgroundSize) ? 'bg-texture' : 'bg-image', m[1], { bgSize: s.backgroundSize, bgPosition: s.backgroundPosition, bgBlend: s.backgroundBlendMode !== 'normal' ? s.backgroundBlendMode : '', attachment: s.backgroundAttachment }); }
    return out;
  });

  for (const it of items) { const f = bodies.get(it.src) || [...bodies.entries()].find(([u]) => it.src && u.split('?')[0] === it.src.split('?')[0])?.[1]; Object.assign(it, f || { format: it.kind === 'svg' ? 'svg' : '', alpha: it.kind === 'svg' ? true : null }); }
  // 归类：这张图在版式里扮演什么
  for (const it of items) {
    it.role = it.kind === 'bg-texture' || (it.blend && it.viewportShare > 0.5) ? '纹理/叠加' : it.alpha && it.kind !== 'svg' && !it.radius && it.objectFit !== 'cover' ? '透明抠图主体' : it.fullBleed || it.viewportShare > 0.6 ? '满版背景/主视觉' : it.kind === 'svg' ? '矢量插画/图形' : it.radius || it.shadow ? '卡片/框内配图' : '内容配图';
    if (it.overText) it.role += ' · 压住文字';
    if (it.bleedsOutOfSection) it.role += ' · 跨出区块';
  }
  let shots = 0;
  for (const it of items.sort((a, b) => b.viewportShare - a.viewportShare).slice(0, 24)) {
    const h = await page.$(`[data-lsf-media="${it.id}"]`); if (!h) continue;
    try { await h.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await h.screenshot({ path: `${outDir}/crops/${it.id}.png`, timeout: 5000 }); it.crop = `crops/${it.id}.png`; shots++; } catch {}
  }
  items.sort((a, b) => a.y - b.y);
  await writeFile(`${outDir}/media.json`, JSON.stringify({ url, viewport: Number(vw), items }, null, 2));
  const count = {}; for (const it of items) { const k = it.role.split(' · ')[0]; count[k] = (count[k] || 0) + 1; }
  const md = [`# 图片处理拆解：${url}（${vw}px）`, '', '角色统计：' + Object.entries(count).map(([k, v]) => `${k} ${v}`).join('，'), '', '| 位置 y | 角色 | 类型 / 格式 | 透明 | 显示尺寸 | 裁切 | 圆角 / 遮罩 / 裁形 | 混合 / 滤镜 / 透明度 | 叠加层 | 截图 |', '|---|---|---|---|---|---|---|---|---|---|',
    ...items.slice(0, 60).map(it => `| ${it.y} | ${it.role} | ${it.kind} / ${it.format || '?'} | ${it.alpha === true ? '是' : it.alpha === false ? '否' : '?'} | ${it.rendered} | ${it.objectFit && it.objectFit !== 'fill' ? it.objectFit + ' ' + it.objectPosition : it.bgSize || ''} | ${[it.radius, it.mask && '遮罩', it.clipPath && '裁形 ' + it.clipPath].filter(Boolean).join(' / ')} | ${[it.blend, it.bgBlend, it.filter, it.opacity && '透明度 ' + it.opacity].filter(Boolean).join(' / ')} | ${it.overlay ? '有' : ''} | ${it.crop || ''} |`)].join('\n');
  await writeFile(`${outDir}/media.md`, md);
  console.log(`已写入 ${outDir}/media.json、media.md：${items.length} 个图片/视频/背景（截图 ${shots} 张）；${Object.entries(count).map(([k, v]) => `${k} ${v}`).join('，')}`);
} finally { await browser.close(); }
