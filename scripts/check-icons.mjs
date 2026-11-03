// 图标检查。两种用法，可以一起跑：
//   静态：node check-icons.mjs --src src
//     查手写 SVG：组件 / HTML 里直接写 <svg>…<path d=…> 的，判“手写图标”。
//     放行：从图标库 import 的（lucide / phosphor / tabler / heroicons / remixicon / iconify），
//           或紧邻单个 SVG 写了来源注释 `icon-source: lucide/file-text`（从库里原样复制的 SVG），
//           来源注释只放行紧邻的单个 SVG，不能靠文件名 logo 或文件级注释放行整文件。
//   运行时：node check-icons.mjs --url http://localhost:3000 [--viewports 375,1440] [--out 目录]
//     1 用字母或符号冒充图标：按钮/链接里单独的 v ^ > < x + 等字符（图二那种“篇章 v”）。
//     2 图标和文字没对齐：同一行里图标的垂直中线和文字（取字形 x-height 中线）相差 > 1.5px；
//       头像/图标和右边文字块：既不顶对齐首行、也不和整块居中（图一那种）。
//     3 列表项状态不一致：同一列表里，选中/hover 的项文字左边缘和其他项不一样（图三那种）。
import { readFile, readdir, stat, mkdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const args = process.argv.slice(2); const opt = (n, d) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : d; };
const src = opt('--src'), url = opt('--url');
if (!src && !url) { console.error('用法：node check-icons.mjs --src <目录> | --url <地址> [--viewports 375,1440] [--out 目录]'); process.exit(1); }
const out = opt('--out', './out-icons'); let bad = 0;
const LIB = /from\s+['"](lucide-react|lucide-vue-next|lucide-svelte|lucide|@phosphor-icons\/[\w-]+|phosphor-react|@tabler\/icons[\w-]*|@heroicons\/[\w/-]+|remixicon|@remixicon\/[\w-]+|@iconify\/[\w-]+|@iconify-icon\/[\w-]+|~icons\/[\w/-]+|unplugin-icons)/;

if (src) {
  const files = []; const walk = async p => { const s = await stat(p); if (s.isDirectory()) { if (/node_modules|\.git|dist|build|\.next/.test(p)) return; for (const f of await readdir(p)) await walk(join(p, f)); } else if (['.jsx', '.tsx', '.js', '.ts', '.vue', '.svelte', '.astro', '.html', '.svg'].includes(extname(p))) files.push(p); };
  await walk(src);
  for (const f of files) {
    const t = await readFile(f, 'utf8');
    for (const m of t.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g)) {
      const before = t.slice(Math.max(0, m.index - 300), m.index);
      const imported = /(?:<!--|\/\*)\s*icon-source:\s*(?:lucide|phosphor|tabler|heroicons|remixicon|iconify)\/[\w./-]+\s*(?:-->|\*\/)\s*$/.test(before);
      const suppliedLogo = /(?:<!--|\/\*)\s*brand-source:\s*(?:user-provided|licensed):[^\r\n]+(?:-->|\*\/)\s*$/.test(before);
      if (imported || suppliedLogo) continue;
      const opening = m[0].slice(0, m[0].indexOf('>') + 1);
      const illustration = /\bdata-lsf-illustration\s*=\s*['"](?:isometric|cutaway|spatial)['"]/.test(opening);
      const iconName = /(?:aria-label|class(?:Name)?|id)\s*=\s*['"][^'"]*(?:arrow|chevron|caret|icon|箭头|图标)[^'"]*['"]/i.test(opening);
      if (illustration && !iconName) {
        console.log(`? [立体示意 SVG] ${relative(process.cwd(), f)} → 人工核对空间示意用途；声明不能豁免其中的UI图标来源`);
        continue;
      }
      if (!/<(path|polyline|polygon|line|circle|rect|ellipse)\b/.test(m[1])) continue;
      const line = t.slice(0, m.index).split('\n').length;
      const shapes = (m[1].match(/<(path|polyline|polygon|line|circle|rect|ellipse)\b/g) || []).length;
      console.log(`✗ [手写 SVG] ${relative(process.cwd(), f)}:${line}（${shapes} 个图形）→ 换成图标库组件，或从库里原样复制并在该 SVG 紧前写 icon-source 注释`);
      bad++;
    }
  }
  if (!bad) console.log('✓ 没有发现手写 SVG 图标');
}

if (url) {
  const { launch, open } = await import('./lib/browser.mjs');
  await mkdir(out, { recursive: true });
  const browser = await launch();
  try {
    for (const vw of opt('--viewports', '375,1440').split(',').map(Number)) {
      const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
      await open(page, url);
      await page.addStyleTag({ content: '*,*::before,*::after{transform:none!important;translate:none!important;rotate:none!important;scale:none!important}' });
      const res = await page.evaluate(() => {
        const issues = []; let k = 0;
        const name = e => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
        const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const mark = (e, kind, detail) => { const id = `i${k++}`; e.setAttribute('data-lsf-icon', id); issues.push({ id, kind, el: name(e), text: (e.closest('a,button,li,div')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), detail }); };
        // x-height 中线：用一个 x 字符的墨迹近似（canvas 量 actualBoundingBox）
        const cv = document.createElement('canvas').getContext('2d');
        const xMid = el => { const s = getComputedStyle(el); cv.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; const m = cv.measureText('x'); return m.actualBoundingBoxAscent / 2; };
        const textRun = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 2 }); const n = w.nextNode(); if (!n) return null; const r = document.createRange(); r.selectNodeContents(n); const rs = r.getClientRects()[0]; return rs ? { node: n, rect: rs, el: n.parentElement } : null; };
        // 1 字符冒充图标
        for (const e of document.querySelectorAll('a, button, [role=button], summary, li, span, i')) {
          if (!vis(e)) continue;
          for (const n of e.childNodes) if (n.nodeType === 3 && /^[vV^><xX+×›‹»«⌄⌃]$/.test(n.textContent.trim()) && e.textContent.trim().length > 1) mark(e, '字符冒充图标', `「${n.textContent.trim()}」当箭头/图标用`);
          if (e.children.length === 0 && /^[vV^⌄⌃]$/.test(e.textContent.trim()) && e.parentElement && e.parentElement.textContent.trim().length > 2) mark(e, '字符冒充图标', `单独的「${e.textContent.trim()}」`);
        }
        // 2 图标与文字垂直对齐
        for (const ic of document.querySelectorAll('svg, img, i[class*=icon], span[class*=icon]')) {
          if (!vis(ic)) continue; const ir = ic.getBoundingClientRect(); if (ir.width > 72 || ir.height > 72 || ir.width < 8) continue;
          const row = ic.parentElement; if (!row) continue;
          // 同行文字：父元素里图标前后的文字
          const t = textRun(row); if (!t || t.el.contains(ic)) { /* 图标在文字元素内部也算同行 */ }
          if (!t) continue;
          const tr = t.rect; const sameLine = Math.abs((tr.top + tr.bottom) / 2 - (ir.top + ir.bottom) / 2) < Math.max(ir.height, tr.height);
          const small = ir.height <= 32;
          if (small && sameLine && Math.abs(tr.left - ir.right) < 40 || small && sameLine && Math.abs(ir.left - tr.right) < 40) {
            const fs = parseFloat(getComputedStyle(t.el).fontSize); const lh = tr.height; const baseline = tr.top + (lh + fs * 0.8) / 2; // 近似基线
            const xm = baseline - xMid(t.el); const capMid = baseline - fs * 0.35;
            const icMid = (ir.top + ir.bottom) / 2;
            const off = Math.min(Math.abs(icMid - xm), Math.abs(icMid - capMid), Math.abs(icMid - (tr.top + tr.bottom) / 2));
            if (off > 1.5) mark(ic, '图标与文字没对齐', `图标中线偏 ${off.toFixed(1)}px`);
          } else if (ir.height > 24 && ir.height <= 72) {
            // 头像/大图标 + 右侧文字块
            const block = [...row.parentElement?.children || []].find(c => c !== row && c.getBoundingClientRect().left >= ir.right - 2 && vis(c)) || [...row.children].find(c => c !== ic && !c.contains(ic) && c.getBoundingClientRect().left >= ir.right - 2);
            if (!block) continue; const br = block.getBoundingClientRect(); const ft = textRun(block); if (!ft) continue;
            const topOff = Math.abs(ir.top - ft.rect.top), midOff = Math.abs((ir.top + ir.bottom) / 2 - (br.top + br.bottom) / 2), firstMid = Math.abs((ir.top + ir.bottom) / 2 - (ft.rect.top + ft.rect.bottom) / 2);
            if (Math.min(topOff, midOff, firstMid) > 3) mark(ic, '头像/图标和文字块没对齐', `顶部差 ${topOff.toFixed(0)}px，和首行中线差 ${firstMid.toFixed(0)}px，和整块中线差 ${midOff.toFixed(0)}px`);
          }
        }
        // 2b 头像/方形图标块（div 也算）+ 右侧文字块：要么顶对齐首行文字，要么和首行或整块居中
        for (const av of document.querySelectorAll('body *')) {
          if (!vis(av)) continue; const r = av.getBoundingClientRect(); if (r.width < 24 || r.width > 72 || Math.abs(r.width - r.height) > 4) continue;
          const s = getComputedStyle(av); const boxed = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) > 0 || av.querySelector('img,svg') || /^(IMG|SVG)$/i.test(av.tagName);
          if (!boxed || (av.innerText || '').trim().length > 2) continue;
          const sib = av.nextElementSibling; if (!sib || !vis(sib)) continue; const br = sib.getBoundingClientRect(); if (br.left < r.right - 2 || br.left - r.right > 40) continue;
          const ft = textRun(sib); if (!ft) continue;
          const topOff = Math.abs(r.top - ft.rect.top), firstMid = Math.abs((r.top + r.bottom) / 2 - (ft.rect.top + ft.rect.bottom) / 2), midOff = Math.abs((r.top + r.bottom) / 2 - (br.top + br.bottom) / 2);
          if (Math.min(topOff, firstMid, midOff) > 3) mark(av, '头像/图标和文字块没对齐', `顶部差 ${topOff.toFixed(0)}px，和首行中线差 ${firstMid.toFixed(0)}px，和整块中线差 ${midOff.toFixed(0)}px`);
        }
        // 3 列表项状态不一致（选中项缩进）
        for (const list of document.querySelectorAll('ul, ol, nav, [role=menu], [role=listbox], [role=tablist]')) {
          const items = [...list.children].filter(vis); if (items.length < 3) continue;
          const lefts = items.map(it => { const t = textRun(it); return t ? Math.round(t.rect.left) : null; }).filter(x => x != null); if (lefts.length < 3) continue;
          const mode = [...lefts].sort((a, b) => lefts.filter(x => x === b).length - lefts.filter(x => x === a).length)[0];
          items.forEach(it => { const t = textRun(it); if (t && Math.abs(Math.round(t.rect.left) - mode) >= 2 && Math.abs(Math.round(t.rect.left) - mode) <= 32) mark(it, '列表项文字不齐', `和其他项差 ${Math.round(t.rect.left) - mode}px（选中/高亮态改了内边距？）`); });
        }
        return issues;
      });
      for (const it of res) {
        const h = await page.$(`[data-lsf-icon="${it.id}"]`);
        if (h) { await h.evaluate(e => { e.style.outline = '2px solid red'; }); await h.scrollIntoViewIfNeeded().catch(() => {}); const box = await h.boundingBox(); if (box) await page.screenshot({ path: `${out}/${vw}-${it.id}.png`, clip: { x: Math.max(0, box.x - 120), y: Math.max(0, box.y - 60), width: Math.min(vw, box.width + 240), height: box.height + 120 } }).catch(() => {}); }
        console.log(`✗ @${vw}px [${it.kind}] ${it.el}「${it.text}」${it.detail}`);
      }
      bad += res.length; await page.close();
    }
    if (!bad) console.log('✓ 没有发现字符冒充图标、图标没对齐、列表项不齐');
  } finally { await browser.close(); }
}
process.exitCode = bad ? 1 : 0;
