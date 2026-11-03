// 用法：node check-text-wrap.mjs <url> [--viewports 375,768,1440] [--out 目录]
// 查“词被拆到两行”和“孤字”：标题、按钮、链接、标签、短段落（≤80 字）里，
// 1 换行点落在一个词中间（中文用 Intl.Segmenter 分词，英文看单词）；
// 2 最后一行只剩 1～2 个汉字或 1 个英文单词（孤字/孤词）；
// 3 标点出现在行首（避头点失败，通常是手动 <br> 或 nowrap 造成）。
// 每个问题截图（红框）放进 out 目录。
import { mkdir } from 'node:fs/promises';
import { launch, open } from './lib/browser.mjs';

const args = process.argv.slice(2); const url = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : d; };
if (!url) { console.error('用法：node check-text-wrap.mjs <url> [--viewports 375,768,1440] [--out 目录]'); process.exit(1); }
const vws = opt('--viewports', '375,768,1440').split(',').map(Number); const out = opt('--out', './out-text-wrap');
await mkdir(out, { recursive: true });
const browser = await launch(); let total = 0;
try {
  for (const vw of vws) {
    const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
    await open(page, url);
    await page.evaluate(async () => { await document.fonts?.ready; });
    const issues = await page.evaluate(() => {
      const seg = new Intl.Segmenter(document.documentElement.lang || 'zh', { granularity: 'word' });
      const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
      const sel = 'h1,h2,h3,h4,h5,h6,button,a,label,figcaption,li,[class*=title i],[class*=heading i],[class*=badge i],[class*=tag i],p';
      const res = []; let n = 0;
      for (const el of document.querySelectorAll(sel)) {
        const text = el.innerText?.trim() || ''; if (!text || text.length > (el.tagName === 'P' ? 80 : 120)) continue;
        if ([...el.querySelectorAll(sel)].some(c => c !== el)) continue; // 只看最内层
        const r0 = el.getBoundingClientRect(); if (!r0.width || getComputedStyle(el).visibility === 'hidden') continue;
        // 逐字取位置，按 top 分行
        let matrix = new DOMMatrix(); for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const t = getComputedStyle(n).transform; if (t && t !== 'none') matrix = new DOMMatrix(t).multiply(matrix); } const inverse = matrix.inverse();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const chars = []; const range = document.createRange();
        for (let node; (node = walker.nextNode());) for (let i = 0; i < node.length; i++) { range.setStart(node, i); range.setEnd(node, i + 1); const rs = range.getClientRects(); if (!rs.length) continue; const rect = rs[0]; const center = new DOMPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2).matrixTransform(inverse); chars.push({ ch: node.data[i], top: Math.round(center.y) }); }
        const vis = chars.filter(c => c.ch.trim()); if (vis.length < 2) continue;
        const lines = []; for (const c of chars) { if (!c.ch.trim() && !lines.length) continue; const last = lines.at(-1); if (!last || Math.abs(c.top - last.top) > 3) lines.push({ top: c.top, s: c.ch }); else last.s += c.ch; }
        const L = lines.map(l => l.s.trim()).filter(Boolean); if (L.length < 2) continue;
        const flat = L.join('\u0000'); // 行与行之间用 \0 标记
        const words = [...seg.segment(L.join(''))]; const breaks = []; let p = 0; for (let i = 0; i < L.length - 1; i++) { p += L[i].length; breaks.push(p); }
        const found = [];
        for (const b of breaks) { let acc = 0; for (const w of words) { const s = acc, e = acc + w.segment.length; acc = e; if (b > s && b < e && w.isWordLike && w.segment.length >= 2) { found.push(`词被拆开「${w.segment}」`); break; } } }
        const last = L.at(-1); const lastCjk = [...last].filter(c => CJK.test(c)).length;
        if ((CJK.test(last) && lastCjk <= 2 && last.replace(/[，。！？、；：,.!?]/g, '').length <= 2) || (!CJK.test(last) && !/\s/.test(last) && L.length > 1 && last.length < 12 && /^[A-Za-z]/.test(last))) found.push(`孤字「${last}」`);
        for (const l of L.slice(1)) if (/^[，。！？、；：）》」』】,.!?)]/.test(l)) found.push(`行首标点「${l[0]}」`);
        if (found.length) { const k = `t${n++}`; el.setAttribute('data-lsf-wrap', k); res.push({ k, tag: el.tagName.toLowerCase(), text: text.replace(/\s+/g, ' ').slice(0, 60), lines: L, problems: found, wrapStyle: getComputedStyle(el).textWrapStyle || getComputedStyle(el).textWrap || '', wordBreak: getComputedStyle(el).wordBreak }); }
      }
      return res;
    });
    for (const it of issues) {
      const h = await page.$(`[data-lsf-wrap="${it.k}"]`);
      if (h) { await h.evaluate(e => { e.style.outline = '2px solid red'; e.style.outlineOffset = '2px'; }); await h.scrollIntoViewIfNeeded().catch(() => {}); await h.screenshot({ path: `${out}/${vw}-${it.k}.png` }).catch(() => {}); }
      console.log(`✗ @${vw}px <${it.tag}> ${it.problems.join('；')}  行：${it.lines.map(l => `「${l}」`).join(' / ')}  （text-wrap: ${it.wrapStyle || 'auto'}，word-break: ${it.wordBreak}）`);
    }
    total += issues.length; await page.close();
  }
  console.log(total ? `\n共 ${total} 处。修法见 references/排版细节.md 第 1 节。截图在 ${out}/` : '✓ 没有发现词被拆开、孤字或行首标点');
  process.exitCode = total ? 1 : 0;
} finally { await browser.close(); }
