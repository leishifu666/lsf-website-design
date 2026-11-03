// 用法：
//   静态：node check-tokens.mjs <reference-spec.json> <源码目录或文件...> [--allow tokens/tokens.allow.json]
//   运行时：node check-tokens.mjs <reference-spec.json> --url http://localhost:3000 [--paths /,/about]
// 检查颜色、字体、字号、行高、字距、间距、圆角、阴影、时长、缓动是否都来自锁定规格。
// 静态模式还查：未定义的 var(--x)、Tailwind 任意值（p-[13px]）、Tailwind 默认色板类（bg-zinc-800）、Motion/GSAP 的 duration 和 ease。
// 运行时模式在真实渲染结果上查计算样式，用来兜住静态扫不到的写法。任何违规都以退出码 1 结束。
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { loadSpec } from './lib/spec.mjs';
import { parseColor, sameColor, toPx, toMs, normEase, normShadow, splitTop, COLOR_RE, NAMED } from './lib/values.mjs';

const args = process.argv.slice(2);
const specPath = args[0]; const opt = n => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
if (!specPath || args.length < 2) { console.error('用法见文件头注释'); process.exit(2); }
const S = loadSpec(specPath); const A = S.allow;
const allowPath = opt('--allow');
const TW_SPACING = parseFloat(opt('--tw-spacing') || '4'); // 项目改过 --spacing 时传 --tw-spacing <px>
const allowVars = new Set(allowPath ? Object.keys(JSON.parse(await readFile(allowPath, 'utf8')).vars) : []);
const KW = new Set(['0', 'none', 'inherit', 'initial', 'unset', 'revert', 'auto', 'normal', 'currentcolor', 'transparent']);
const bad = []; // {cat, value, where}
const seenFlag = new Set();
const flag = (cat, value, where) => { const v = String(value).trim().slice(0, 80); const k = `${cat}|${v}|${where}`; if (seenFlag.has(k)) return; seenFlag.add(k); bad.push({ cat, value: v, where }); };

const okColor = s => { const c = parseColor(s); if (!c) return null; if (c[3] === 0) return true; return A.colors.some(a => sameColor(a, c)); };
const okLen = (set, v, { neg = true } = {}) => { const px = toPx(v); if (px == null) return null; return px === 0 || set.has(px) || (neg && set.has(-px)); };

// —— 单条声明检查（静态和运行时共用的规则）——
const CAT = p => {
  p = p.toLowerCase();
  if (/^(margin|padding)(-|$)|^(row-|column-)?gap$|^(padding|margin)-(inline|block)/.test(p)) return 'spacing';
  if (p === 'font-size') return 'fontSize'; if (p === 'line-height') return 'lineHeight'; if (p === 'letter-spacing') return 'letterSpacing';
  if (/radius$/.test(p)) return 'radius'; if (p === 'box-shadow') return 'shadow'; if (p === 'font-family') return 'fontFamily';
  if (/^(transition|animation)(-duration|-timing-function)?$/.test(p)) return 'motion';
  return 'other';
};
function checkDecl(prop, value, where, localVars) {
  value = value.replace(/!important/i, '').trim(); if (!value || KW.has(value.toLowerCase())) return;
  // 1 变量：必须来自生成的令牌，或本仓库里有定义（本地定义的值另行检查）
  for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) if (!allowVars.has(m[1]) && !localVars.has(m[1])) flag('未定义变量', m[1], where);
  const lit = value.replace(/var\([^()]*(\([^()]*\))*[^()]*\)/g, ' ');
  // 2 颜色：任何属性里出现的颜色字面量
  for (const m of lit.matchAll(COLOR_RE)) { const r = okColor(m[0]); if (r === null) flag('无法解析的颜色', m[0], where); else if (!r) flag('颜色', m[0], where); }
  if (/^(color|background(-color)?|border(-\w+)?-color|fill|stroke|outline-color)$/.test(prop)) for (const w of lit.split(/\s+/)) if (NAMED[w.toLowerCase()] && !okColor(w)) flag('颜色', w, where);
  const cat = CAT(prop); const toks = lit.split(/[\s,/()]+/).filter(Boolean);
  const lens = toks.filter(t => /^-?[\d.]+(px|rem|em|vw|vh|%|ch|svh|dvh)$/.test(t));
  const fluid = lens.filter(t => /(vw|vh|%|ch|svh|dvh)$/.test(t));
  if (cat === 'spacing') for (const t of lens) { if (fluid.includes(t)) { if (/[a-z]h$|vw$/.test(t)) flag('间距（视口单位）', t, where); continue; } if (!okLen(A.spacing, t)) flag('间距', t, where); }
  if (cat === 'fontSize') { if (fluid.length) flag('字号（流体值需写进规格 exceptions）', value, where); else for (const t of lens) if (!okLen(A.fontSize, t, { neg: false })) flag('字号', t, where); }
  if (cat === 'lineHeight') { const px = toPx(lit.trim()); const ok = A.lineHeight.has(lit.trim()) || (px != null && A.lineHeight.has(`${px}px`)); if (!ok && lit.trim()) flag('行高', lit.trim(), where); }
  if (cat === 'letterSpacing') for (const t of lens) if (!okLen(A.letterSpacing, t)) flag('字距', t, where);
  if (cat === 'radius') for (const t of lens) { if (t.endsWith('%')) { if (!A.radius.has(t)) flag('圆角', t, where); } else if (!okLen(A.radius, t, { neg: false })) flag('圆角', t, where); }
  if (cat === 'shadow' && lit.trim() && !A.shadows.has(normShadow(value))) flag('阴影', value, where);
  if (cat === 'fontFamily') { const first = lit.split(',')[0].trim().replace(/['"]/g, '').toLowerCase(); if (first && !A.fontFamilies.includes(first)) flag('字体', first, where); }
  if (cat === 'motion') {
    for (const t of toks) { const ms = toMs(t); if (ms != null && ms !== 0 && !A.durations.has(ms)) flag('时长', t, where); }
    for (const e of [...lit.matchAll(/cubic-bezier\([^)]*\)|steps\([^)]*\)|linear\([^)]*\)|\b(ease-in-out|ease-in|ease-out|ease|linear)\b/g)].map(m => m[0])) if (!A.easings.has(normEase(e))) flag('缓动', e, where);
  }
}

// —— 静态模式 ——
async function staticMode(targets) {
  const files = [];
  const walk = async p => { const s = await stat(p); if (s.isDirectory()) { if (/node_modules|\.git|\.next|dist|build|_samples/.test(p)) return; for (const f of await readdir(p)) await walk(join(p, f)); } else if (['.css', '.scss', '.html', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro', '.mjs'].includes(extname(p))) files.push(p); };
  for (const t of targets) await walk(t);
  const texts = [];
  for (const f of files) { const t = await readFile(f, 'utf8'); if (t.startsWith('/* LSF-GENERATED')) continue; texts.push([f, t]); }
  const localVars = new Map();
  for (const [f, t] of texts) for (const m of t.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)) if (!m[0].includes('var(' + m[1])) localVars.set(m[1], { v: m[2], f });
  // 本地定义的变量：值里的颜色/长度必须在规格里出现过（任一类别）
  const anyLen = new Set([...A.spacing, ...A.radius, ...A.fontSize, ...A.letterSpacing]);
  for (const [name, { v, f }] of localVars) { if (allowVars.has(name)) continue; const where = `${f}（变量 ${name}）`; for (const m of v.matchAll(COLOR_RE)) if (!okColor(m[0])) flag('颜色', m[0], where); for (const t of v.split(/[\s,()]+/)) if (/^-?[\d.]+(px|rem)$/.test(t) && !anyLen.has(Math.abs(toPx(t)))) flag('长度（本地变量）', t, where); const ms = toMs(v.trim()); if (ms && !A.durations.has(ms)) flag('时长', v, where); }
  const lv = new Set(localVars.keys());
  const TW = { p: 'padding', px: 'padding', py: 'padding', pt: 'padding', pr: 'padding', pb: 'padding', pl: 'padding', ps: 'padding', pe: 'padding', m: 'margin', mx: 'margin', my: 'margin', mt: 'margin', mr: 'margin', mb: 'margin', ml: 'margin', gap: 'gap', 'gap-x': 'gap', 'gap-y': 'gap', 'space-x': 'gap', 'space-y': 'gap', rounded: 'border-radius', text: '?text', bg: 'background', border: '?border', shadow: 'box-shadow', duration: 'transition-duration', ease: 'transition-timing-function', tracking: 'letter-spacing', leading: 'line-height', font: 'font-family', fill: 'fill', stroke: 'stroke', ring: 'outline-color', from: 'background', to: 'background', via: 'background', outline: 'outline-color' };
  const PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|shadow|decoration|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-\d{2,3}\b/g;
  for (const [f, t] of texts) {
    const lines = t.split('\n'); const isCss = /\.(s?css)$/.test(f);
    lines.forEach((line, i) => {
      const where = `${relative(process.cwd(), f)}:${i + 1}`;
      if (isCss || /\.(html|vue|svelte|astro)$/.test(f)) for (const m of line.matchAll(/(?:^|[{;\s"'])([a-z-]+)\s*:\s*([^;{}"']+)/g)) { if (m[1].startsWith('--')) continue; checkDecl(m[1], m[2], where, lv); }
      if (!isCss) {
        for (const m of line.matchAll(/\b(fontSize|lineHeight|letterSpacing|fontFamily|padding\w*|margin\w*|gap|rowGap|columnGap|borderRadius|boxShadow|color|background(?:Color)?|borderColor|transition\w*|animation\w*)\s*:\s*(['"`])([^'"`]+)\2/g)) checkDecl(m[1].replace(/[A-Z]/g, c => '-' + c.toLowerCase()), m[3], where, lv);
        for (const m of line.matchAll(/\b(fontSize|padding\w*|margin\w*|gap|borderRadius)\s*:\s*(\d+(?:\.\d+)?)\b(?!\s*[%'"`a-z])/g)) checkDecl(m[1].replace(/[A-Z]/g, c => '-' + c.toLowerCase()), `${m[2]}px`, where, lv); // React 数字即 px
        for (const m of line.matchAll(COLOR_RE)) if (!/[a-z-]+\s*:\s*[^;]*$/.test(line.slice(0, m.index)) || !isCss) { const r = okColor(m[0]); if (r === false) flag('颜色', m[0], where); }
        for (const m of line.matchAll(/\bduration\s*:\s*([\d.]+)\b/g)) { const v = parseFloat(m[1]); const ms = v < 20 ? v * 1000 : v; if (ms && !A.durations.has(ms)) flag('时长（JS 动效库）', m[0], where); }
        for (const m of line.matchAll(/\bease\s*:\s*\[([^\]]+)\]/g)) { const e = normEase(`cubic-bezier(${m[1]})`); if (!A.easings.has(e)) flag('缓动（JS 动效库）', m[0], where); }
        for (const m of line.matchAll(/\bease\s*:\s*['"]([\w.()]+)['"]/g)) if (!A.easings.has(normEase(m[1]))) flag('缓动（JS 动效库）', m[0], where);
      }
      for (const m of line.matchAll(/(?<![\w-])(-?)((?:[a-z]+:)*)([a-z]+(?:-[xy])?)-\[([^\]\s]+)\]/g)) { // Tailwind 任意值
        let prop = TW[m[3]]; if (!prop) continue; let v = m[4].replace(/_/g, ' ');
        if (prop === '?text') prop = /^#|rgb|hsl|oklch|color/.test(v) ? 'color' : 'font-size';
        if (prop === '?border') prop = /^#|rgb|hsl|oklch/.test(v) ? 'border-color' : 'border-width';
        if (prop === 'border-width') continue;
        checkDecl(prop, (m[1] ? '-' : '') + v, `${where}（Tailwind ${m[0].trim()}）`, lv);
      }
      for (const m of line.matchAll(PALETTE)) flag('Tailwind 默认色板', m[0], where);
      // Tailwind 数字类：p-4 = 4 × --spacing（默认 0.25rem = 4px）；duration-300 = 300ms
      for (const m of line.matchAll(/(?<![\w-])(?:[a-z]+:)*(-?)(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(\d+(?:\.\d+)?)(?![\w.\[-])/g)) { const px = parseFloat(m[3]) * TW_SPACING; if (px && !A.spacing.has(px)) flag('间距（Tailwind 数字类）', m[0].trim(), where); }
      for (const m of line.matchAll(/(?<![\w-])(?:[a-z]+:)*(duration|delay)-(\d+)(?![\w\[-])/g)) { const ms = +m[2]; if (ms && !A.durations.has(ms)) flag('时长（Tailwind 类）', m[0].trim(), where); }
    });
  }
  return files.length;
}

// —— 运行时模式 ——
async function runtimeMode(base, paths) {
  const { launch, open } = await import('./lib/browser.mjs');
  const browser = await launch(); let n = 0;
  try {
    for (const vw of (S.raw.viewports || [375, 1440])) for (const p of paths) {
      const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
      await open(page, base.replace(/\/$/, '') + p);
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } scrollTo(0, 0); });
      await page.waitForTimeout(1000); // Inspect the stable end state, not a navigation color tween halfway through.
      const rows = await page.evaluate(() => {
        const out = [];
        const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
        for (const e of document.querySelectorAll('body, body *')) {
          const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') continue;
          const hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          const d = { w: name(e) };
          if (hasText) Object.assign(d, { color: s.color, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, fontFamily: s.fontFamily });
          d.bg = s.backgroundColor; if (parseFloat(s.borderTopWidth)) d.border = s.borderTopColor;
          const ml = parseFloat(s.marginLeft), mr = parseFloat(s.marginRight);
          const isAuto = name => e.computedStyleMap?.().get(name)?.toString() === 'auto';
          d.space = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft, ...(!isAuto('margin-top') ? [s.marginTop] : []), ...(!isAuto('margin-bottom') ? [s.marginBottom] : []), ...(ml === mr && ml > 0 ? [] : [...(!isAuto('margin-left') ? [s.marginLeft] : []), ...(!isAuto('margin-right') ? [s.marginRight] : [])]), ...(/flex|grid/.test(s.display) ? [s.rowGap, s.columnGap] : [])];
          d.radius = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius];
          d.shadow = s.boxShadow; d.td = s.transitionDuration; d.te = s.transitionTimingFunction; d.ad = s.animationName !== 'none' ? s.animationDuration : ''; d.ae = s.animationName !== 'none' ? s.animationTimingFunction : '';
          out.push(d);
        }
        return out;
      });
      n += rows.length; await page.close();
      const W = r => `${p} @${vw}px ${r.w}`;
      for (const r of rows) {
        for (const c of [r.color, r.bg, r.border].filter(Boolean)) if (okColor(c) === false) flag('颜色', c, W(r)); else if (okColor(c) === null) flag('无法解析的颜色', c, W(r));
        if (r.fontSize && !A.fontSize.has(toPx(r.fontSize))) flag('字号', r.fontSize, W(r));
        if (r.lineHeight && r.lineHeight !== 'normal' && !A.lineHeight.has(`${+parseFloat(r.lineHeight).toFixed(2)}px`)) flag('行高', r.lineHeight, W(r));
        if (r.letterSpacing && r.letterSpacing !== 'normal' && !okLen(A.letterSpacing, `${+parseFloat(r.letterSpacing).toFixed(2)}px`)) flag('字距', r.letterSpacing, W(r));
        if (r.fontFamily) { const f = r.fontFamily.split(',')[0].trim().replace(/['"]/g, '').toLowerCase(); if (!A.fontFamilies.includes(f)) flag('字体', f, W(r)); }
        for (const v of r.space) if (v && v !== 'normal' && !okLen(A.spacing, `${+parseFloat(v).toFixed(2)}px`)) flag('间距', v, W(r));
        for (const v of r.radius) if (v !== '0px' && !okLen(A.radius, v, { neg: false }) && !A.radius.has(v)) flag('圆角', v, W(r));
        if (r.shadow !== 'none' && !A.shadows.has(normShadow(r.shadow))) flag('阴影', r.shadow, W(r));
        for (const t of [...splitTop(r.td), ...splitTop(r.ad)]) { const ms = toMs(t); if (ms && !A.durations.has(ms)) flag('时长', t, W(r)); }
        if (toMs(splitTop(r.td)[0]) || r.ad) for (const e of [...splitTop(r.te), ...splitTop(r.ae)]) if (e && !A.easings.has(normEase(e))) flag('缓动', e, W(r));
      }
    }
  } finally { await browser.close(); }
  return n;
}

const url = opt('--url');
const scanned = url ? await runtimeMode(url, (opt('--paths') || '/').split(',')) : await staticMode(args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(arr[i - 1] || '').startsWith('--')));
// 汇总：同一个值只报一次，列出最多 3 个位置
const groups = new Map();
for (const b of bad) { const k = `${b.cat}｜${b.value}`; const g = groups.get(k) || { ...b, n: 0, wheres: [] }; g.n++; if (g.wheres.length < 3) g.wheres.push(b.where); groups.set(k, g); }
const sorted = [...groups.values()].sort((a, b) => a.cat.localeCompare(b.cat) || b.n - a.n);
for (const g of sorted) console.log(`✗ [${g.cat}] ${g.value}  ×${g.n}  ${g.wheres.join(' ; ')}`);
console.log(sorted.length ? `\n共 ${sorted.length} 个规格外的值（${url ? '运行时，' + scanned + ' 个元素' : '静态，' + scanned + ' 个文件'}）。改成规格值，或在 reference-spec.json 的 exceptions 里写明理由后加入。` : `✓ 全部来自参考规格（${url ? '运行时，' + scanned + ' 个元素' : '静态，' + scanned + ' 个文件'}）`);
process.exit(sorted.length ? 1 : 0);
