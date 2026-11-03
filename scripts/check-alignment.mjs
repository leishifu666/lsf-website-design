// 用法：node check-alignment.mjs <url> [--viewports 375,1440] [--tol 6] [--out 目录]
// 查“差一点就对齐”：同一区块里，文字块、图片、按钮、卡片的左边缘 / 右边缘 / 中线，
// 和最常见的对齐线相差 1～tol px（默认 6px）的，判为没对齐。差得更远的视为有意错位，不报。
// 输出带辅助线的整页截图（蓝线 = 对齐线，红框 = 没对上的元素）。
import { mkdir } from 'node:fs/promises';
import { launch, open } from './lib/browser.mjs';

const args = process.argv.slice(2); const url = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : d; };
if (!url) { console.error('用法：node check-alignment.mjs <url> [--viewports 375,1440] [--tol 6] [--out 目录]'); process.exit(1); }
const vws = opt('--viewports', '375,1440').split(',').map(Number); const tol = +opt('--tol', 6); const out = opt('--out', './out-alignment');
await mkdir(out, { recursive: true });
const browser = await launch(); let total = 0;
try {
  for (const vw of vws) {
    const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
    await open(page, url);
    await page.addStyleTag({ content: '*,*::before,*::after{transform:none!important;translate:none!important;rotate:none!important;scale:none!important;animation-play-state:paused!important}' });
    const res = await page.evaluate(tol => {
      const name = e => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
      const leafish = e => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') return false; const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 12) return false; const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); return own || /^(IMG|VIDEO|PICTURE|SVG|CANVAS|BUTTON|INPUT)$/.test(e.tagName) || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && r.width < innerWidth * 0.9); };
      const sections = [...document.querySelectorAll('section, header, footer, main > *')].filter(s => s.getBoundingClientRect().height > 80);
      const issues = [], guides = [];
      for (const sec of sections.length ? sections : [document.body]) {
        const els = [...sec.querySelectorAll('*')].filter(leafish).filter(e => ![...e.querySelectorAll('*')].some(leafish) || /^(BUTTON|A)$/.test(e.tagName));
        if (els.length < 3) continue;
        // 文字块用文字实际左边缘（Range），不是盒子边缘；居中文本看中线
        const edge = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); let L = r.left, R = r.right; if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !/BUTTON|A/.test(e.tagName)) { const rg = document.createRange(); rg.selectNodeContents(e); const rs = [...rg.getClientRects()]; if (rs.length) { L = Math.min(...rs.map(x => x.left)); R = Math.max(...rs.map(x => x.right)); } } return { L, R, C: (L + R) / 2, centered: s.textAlign === 'center', rightAligned: /^(right|end)$/.test(s.textAlign), box: /^(IMG|VIDEO|PICTURE|SVG|CANVAS|BUTTON|INPUT)$/.test(e.tagName) }; };
        const data = els.map(e => ({ e, ...edge(e) }));
        for (const axis of ['L', 'C', 'R']) {
          const pool = data.filter(d => axis === 'C' ? d.centered : axis === 'R' ? (d.rightAligned || d.box) : (!d.centered && !d.rightAligned) || d.box);
          if (pool.length < 3) continue;
          const bins = new Map(); for (const d of pool) { const k = Math.round(d[axis]); bins.set(k, (bins.get(k) || 0) + 1); }
          const lines = [...bins].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
          for (const ln of lines) { guides.push({ x: ln, top: sec.getBoundingClientRect().top + scrollY, h: sec.getBoundingClientRect().height }); for (const d of pool) { const off = d[axis] - ln; if (Math.abs(off) >= 1 && Math.abs(off) <= tol && !lines.some(o => Math.abs(d[axis] - o) < 1)) { const k = `a${issues.length}`; d.e.setAttribute('data-lsf-align', k); issues.push({ k, axis: { L: '左边缘', C: '中线', R: '右边缘' }[axis], off: +off.toFixed(1), el: name(d.e), text: (d.e.innerText || d.e.getAttribute('alt') || '').trim().slice(0, 30), section: name(sec) }); } } }
        }
      }
      // 画辅助线
      const layer = document.createElement('div'); layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483647'; document.body.appendChild(layer);
      for (const g of guides) { const l = document.createElement('div'); l.style.cssText = `position:absolute;left:${g.x}px;top:${g.top}px;height:${g.h}px;width:0;border-left:1px dashed rgba(0,120,255,.6)`; layer.appendChild(l); }
      // 同一元素可能在多个轴/区块中重复命中，后一次标记会替换旧 ID。
      // 保留问题记录，标注时允许旧 ID 已不存在，不能因此丢掉整轮检测结果。
      for (const i of issues) { const e = document.querySelector(`[data-lsf-align="${i.k}"]`); if (e) e.style.outline = '2px solid red'; }
      return issues;
    }, tol);
    await page.screenshot({ path: `${out}/alignment-${vw}.png`, fullPage: true });
    for (const i of res) console.log(`✗ @${vw}px [${i.section}] ${i.el}「${i.text}」${i.axis}偏 ${i.off}px`);
    total += res.length; await page.close();
  }
  console.log(total ? `\n共 ${total} 处差 1～${tol}px 的没对齐。辅助线截图在 ${out}/` : '✓ 没有发现差一点没对齐的元素');
  process.exitCode = total ? 1 : 0;
} finally { await browser.close(); }
