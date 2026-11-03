// 文案门槛。两步：
//   静态：node check-copy.mjs --approved copy/approved.json
//     每条定稿文案必须来自某个 Gemini 候选（copy/gemini/*.json），只允许删字、换词这类小改：
//     定稿和来源候选的相似度（最长公共子序列 / 定稿长度）≥ 0.6。否则来源一致性未通过；相似度不能证明模型身份。
//   运行时：node check-copy.mjs --approved copy/approved.json --url http://localhost:3000 [--viewports 375,1440]
//     页面上每段可见文案（标题、段落、按钮、链接、标签、列表项，≥2 个字）都必须在 approved.json 里；
//     标题、按钮、标签、导航、卡片标题结尾不能有标点（。．.！!？?；;，,：:）。
// approved.json：{ "块id": { "text": "定稿", "from": "copy/gemini/xxx.json#块id#候选序号", "reviewed_by": "copy_reviewer" } }
// 允许不经 Gemini 的：品牌名、人名、数字、日期、代码、法律条款原文，写在 approved.json 的 "_exempt": ["牛马日常", ...]
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';

const args = process.argv.slice(2); const opt = (n, d) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : d; };
const apPath = opt('--approved', 'copy/approved.json'); const url = opt('--url');
const styleOnly = args.includes('--style-only');
if (styleOnly && !url) { console.error('✗ --style-only 需要 --url；只检查标点，不代表来源已通过。'); process.exit(2); }
const norm = s => String(s).replace(/\s+/g, '').replace(/[\u200b\u00ad]/g, '');
const lcs = (a, b) => { const m = a.length, n = b.length; let prev = new Array(n + 1).fill(0); for (let i = 1; i <= m; i++) { const cur = new Array(n + 1).fill(0); for (let j = 1; j <= n; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev = cur; } return prev[n]; };
let bad = 0; const fail = s => { console.log('✗ ' + s); bad++; };

let approved = {};
if (!styleOnly) try { approved = JSON.parse(await readFile(apPath, 'utf8')); } catch { fail(`没有 ${apPath}：文案没有经过 Gemini 生成和 copy_reviewer 定稿；标点可单独检查 --style-only --url`); process.exit(1); }
const exempt = new Set((approved._exempt || []).map(norm));
const entries = Object.entries(approved).filter(([k]) => !k.startsWith('_'));
// 静态：追溯到 Gemini 候选
const gdir = join(dirname(apPath), 'gemini'); const cands = [];
if (!styleOnly) {
  let fixed = new Map(), approvedEmpty = false;
  try {
    const brief = JSON.parse(await readFile(join(dirname(apPath), 'brief.json'), 'utf8'));
    const review = JSON.parse(await readFile(join(dirname(apPath), 'review.json'), 'utf8'));
    const { candidateCopyProblems } = await import('./lib/copy-necessity.mjs');
    if (!candidateCopyProblems(brief, approved, review).length) {
      fixed = new Map(brief.blocks.filter(b => b.source === 'fixed').map(b => [b.id, b.text]));
      approvedEmpty = !entries.length;
    }
  } catch { /* Older briefs still use source tracing and explicit exemptions. */ }
  if (!entries.length && !approvedEmpty) fail('空定稿缺逐槽删除或无文案的独立依据');
  for (const [id, value] of entries) if (fixed.has(id) && fixed.get(id) === (value.text ?? value)) exempt.add(norm(fixed.get(id)));
  if (entries.some(([, v]) => !exempt.has(norm(v.text ?? v)))) try { for (const f of await readdir(gdir)) if (f.endsWith('.json')) { const r = JSON.parse(await readFile(join(gdir, f), 'utf8')); if (r.by !== 'gemini') continue; for (const [id, list] of Object.entries(r.candidates || {})) if (Array.isArray(list)) list.forEach((t, i) => cands.push({ file: f, id, i, t: norm(t) })); } } catch { fail(`没有 ${gdir}/：没有任何 Gemini 原始输出`); }
}
for (const [id, v] of entries) {
  const t = norm(v.text || v); if (!t || exempt.has(t)) continue;
  const ref = typeof v.from === 'string' ? v.from.split('#') : [];
  const source = ref.length === 3 && /^(0|[1-9]\d*)$/.test(ref[2])
    ? cands.find(c => c.file === basename(ref[0]) && c.id === ref[1] && c.i === Number(ref[2])) : null;
  if (!source) fail(`[来源缺失] ${id} 必须指向具体候选 文件#块id#序号`);
  else if (lcs(t, source.t) / t.length < 0.6) fail(`[来源不一致] ${id} 与所声明候选相似度不足 60%`);
  if (v.reviewed_by !== 'copy_reviewer') fail(`[缺审核记录] ${id} 未标明 copy_reviewer，还需实际审核回执`);
  const shortText = v.type ? /^(hero_title|section_title|card_title|meta_title|heading|button|link|form_label|nav|tag|badge)$/.test(v.type) : /title|heading|button|label|nav|tag|badge/.test(id) && !/subtitle|body|description/.test(id);
  if (shortText && /[。．.!！?？;；,，:：]$/.test(String(v.text || '').trim())) fail(`[标题结尾标点] ${id}「${v.text}」`);
}
if (!url) { console.log(bad ? `\n共 ${bad} 处` : `✓ ${entries.length} 条定稿都能追溯到 Gemini 候选`); process.exit(bad ? 1 : 0); }

const ok = new Set([...entries.map(([, v]) => norm(v.text || v)), ...exempt]);
const { launch, open } = await import('./lib/browser.mjs');
const browser = await launch();
try {
  for (const vw of opt('--viewports', '375,1440').split(',').map(Number)) {
    const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
    await open(page, url);
    // 完整读取外层标题，防止嵌套 span.title-period 使 h1 被跳过。
    const titles = await page.evaluate(() => {
      const selector = 'h1,h2,h3,h4,h5,h6,button,a,label,summary,[role=button],[role=tab],[data-copy-role=title],[class*=title i],[class*=heading i],[class*=eyebrow i],[class*=tag i],[class*=badge i]';
      return [...document.querySelectorAll(selector)].filter(e => {
        const s = getComputedStyle(e), r = e.getBoundingClientRect();
        const semanticTitle = /^(H[1-6]|BUTTON|A|LABEL|SUMMARY)$/.test(e.tagName) || ['button','tab'].includes(e.getAttribute('role')) || e.dataset.copyRole === 'title';
        const bodySubtitle = !semanticTitle && /subtitle|sub-title|description|body/i.test(String(e.className));
        return !bodySubtitle && r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden';
      }).map(e => ({ tag: e.tagName.toLowerCase(), text: (e.innerText || '').trim(), after: getComputedStyle(e, '::after').content }));
    });
    const titleSeen = new Set();
    for (const title of titles) {
      for (const line of title.text.split(/\n+/).map(s => s.trim()).filter(Boolean)) {
        if (/[。．.!！?？;；,，:：]$/.test(line) && !titleSeen.has(line)) { titleSeen.add(line); fail(`@${vw}px [标题/按钮结尾有标点] <${title.tag}>「${line}」`); }
      }
      if (/^["'][。．.!！?？;；,，:：]["']$/.test(title.after)) fail(`@${vw}px [标题伪元素结尾标点] <${title.tag}> ${title.after}`);
    }
    if (styleOnly) { await page.close(); continue; }
    const items = await page.evaluate(() => {
      const out = []; const sel = 'h1,h2,h3,h4,h5,h6,p,button,a,label,li,figcaption,blockquote,dt,dd,th,td,[role=button],[class*=title i],[class*=heading i],[class*=eyebrow i],[class*=tag i],[class*=badge i]';
      for (const e of document.querySelectorAll(sel)) {
        const s = getComputedStyle(e); const r = e.getBoundingClientRect(); if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none') continue;
        if ([...e.querySelectorAll(sel)].some(c => c !== e && (c.innerText || '').trim())) continue; // 只取最内层
        const t = (e.innerText || '').trim(); if (t.replace(/\s/g, '').length < 2) continue;
        const isTitle = /^H[1-6]$/.test(e.tagName) || /^(BUTTON|LABEL|A|TH|DT)$/.test(e.tagName) || e.getAttribute('role') === 'button' || (/title|heading|eyebrow|tag|badge/i.test(e.className) && !/subtitle|sub-title|description|body/i.test(e.className)) || !!e.closest('nav');
        out.push({ tag: e.tagName.toLowerCase(), t, isTitle });
      }
      return out;
    });
    const seen = new Set();
    for (const it of items) {
      const n = it.t.replace(/\s+/g, '');
      if (seen.has(n)) continue; seen.add(n);
      const lines = it.t.split(/\n+/).map(x => x.replace(/\s+/g, '')).filter(Boolean);
      const covered = ok.has(n) || lines.every(l => ok.has(l) || [...ok].some(o => o.includes(l)) || /^[\d\s:./%+\-–—·×↗→←↓↑]+$/.test(l));
      if (!covered) fail(`@${vw}px [未经 Gemini 定稿的文案] <${it.tag}>「${it.t.replace(/\s+/g, ' ').slice(0, 40)}」`);
      if (it.isTitle && /[。．.！!？?；;，,：:]$/.test(it.t.trim()) && !/\.\.\.$|…$/.test(it.t.trim())) fail(`@${vw}px [标题/按钮结尾有标点] <${it.tag}>「${it.t.trim().slice(-20)}」`);
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log(bad ? `\n共 ${bad} 处。文案按 Gemini → copy_reviewer 回填，不得伪造来源。` : styleOnly ? '✓ 标题标点检查通过（不代表文案来源或独立审核通过）' : '✓ 文案与所声明候选一致，模型身份及独立审核另需实际回执');
process.exit(bad ? 1 : 0);
