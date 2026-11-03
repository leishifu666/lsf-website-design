// 每一轮改了什么，看得见。
//   截图：node round-report.mjs snap <url> rounds/round-02        （375 / 768 / 1440 整页截图存到该轮 shots/）
//   专项检查按影响运行；check <url> <轮次> 或 snap --checks 才跑全套。
//   收尾出报告一次：node round-report.mjs build rounds                    （生成 rounds/index.html）
// 每轮目录约定：rounds/round-NN/
//   changes.md   必填。主 Agent 写：本轮目标、改了哪些区块和文件、旧值 → 新值、对应评审的哪条意见、没改的及原因
//   score.json   可选。评审 Agent 的分数，如 {"总分":78,"视觉层级":15,...}
//   shots/*.png  snap 生成
// 报告里每轮显示：分数和上一轮的差、changes.md 原文、上一轮/本轮截图并排、差异图（红色 = 变化的像素）和变化面积占比。
import { validateDesignReview } from './review-policy.mjs';
import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , cmd, a, roundPath] = process.argv;
const b = roundPath ? resolve(roundPath) : undefined;
if (cmd === 'snap' || cmd === 'check') {
  if (!a || !b) throw new Error('须提供URL和轮次目录');
  if (cmd === 'snap') {
  const { launch, open } = await import('./lib/browser.mjs');
  await mkdir(join(b, 'shots'), { recursive: true });
  const browser = await launch();
  for (const vw of [375, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
    await open(page, a);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(b, 'shots', `${vw}.png`), fullPage: true, animations: 'disabled' });
    await page.close();
  }
  await browser.close(); console.log(`已截图到 ${b}/shots/`);
  if (!process.argv.includes('--checks')) {
    await writeFile(join(b, 'checks.json'), JSON.stringify({截图: {ok:true,kind:'snapshot-only',lines:['仅完成截图；专项检查与实际播放另列证据，不冒充已执行']}},null,2));
    process.exit(0);
  }
  }
  await mkdir(b,{recursive:true});
  // Only explicit check / snap --checks runs the full diagnostic suite; otherwise use targeted scripts.
  const { execFile } = await import('node:child_process');
  const run = (script, extra) => new Promise(res => execFile(process.execPath, [script, ...extra], { cwd: fileURLToPath(new URL('.', import.meta.url)), windowsHide: true, maxBuffer: 1 << 24 }, (err, out, stderr) => {
    const lines = String(out).split('\n').filter(l => l.startsWith('✗')).slice(0, 30);
    if (err && !lines.length) lines.push('✗ 检查器运行失败：' + String(stderr || err.message).slice(-600));
    res({ ok: !err, lines });
  }));
  const approvedPath = resolve('copy/approved.json');
  const checks = {
    断行: await run('check-text-wrap.mjs', [a, '--viewports', '375,768,1440', '--out', join(b, 'checks', 'text-wrap')]),
    对齐: await run('check-alignment.mjs', [a, '--viewports', '375,768,1440', '--out', join(b, 'checks', 'alignment')]),
    过渡: await run('check-transitions.mjs', [a, join(b, 'checks', 'transitions'), '1440']),
    图标: await run('check-icons.mjs', ['--url', a, '--viewports', '375,1440', '--out', join(b, 'checks', 'icons')]),
    文案: (await stat(approvedPath).then(() => true, () => false)) ? await run('check-copy.mjs', ['--approved', approvedPath, '--url', a, '--viewports', '375,1440']) : { ok: false, lines: ['✗ 没有 copy/approved.json：文案须先从当前默认AI Studio入口回收真实Gemini候选，再交 copy_reviewer 定稿'] },
  };
  const staticIcons = await run('check-icons.mjs', ['--src', process.cwd()]);
  checks.图标.ok = checks.图标.ok && staticIcons.ok;
  checks.图标.lines.push(...staticIcons.lines);
  await writeFile(join(b, 'checks.json'), JSON.stringify(checks, null, 2));
  for (const [k, v] of Object.entries(checks)) console.log(`${v.ok ? '✓' : '✗'} ${k}${v.ok ? '' : '：' + v.lines.length + ' 处'}`);
  process.exit(Object.values(checks).every(v => v.ok) ? 0 : 1);
}
if (cmd !== 'build' || !a) { console.error('用法：snap <url> <轮次目录> [--checks] | check <url> <轮次目录> | build <rounds 目录>'); process.exit(1); }

const exists = p => stat(p).then(() => true, () => false);
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const md = s => esc(s).split('\n').map(l => /^#{1,3} /.test(l) ? `<h4>${l.replace(/^#+ /, '')}</h4>` : /^\s*[-*] /.test(l) ? `<li>${l.replace(/^\s*[-*] /, '')}</li>` : l.trim() ? `<p>${l}</p>` : '').join('\n').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/→/g, '<b>→</b>');
async function diff(p1, p2, outP) {
  const { default: sharp } = await import('sharp');
  const [A, B] = await Promise.all([p1, p2].map(p => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const w = Math.min(A.info.width, B.info.width), h = Math.min(A.info.height, B.info.height);
  const o = Buffer.alloc(w * h * 4); let changed = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ia = (y * A.info.width + x) * 4, ib = (y * B.info.width + x) * 4, io = (y * w + x) * 4;
    const d = Math.abs(A.data[ia] - B.data[ib]) + Math.abs(A.data[ia + 1] - B.data[ib + 1]) + Math.abs(A.data[ia + 2] - B.data[ib + 2]);
    const g = Math.round((B.data[ib] + B.data[ib + 1] + B.data[ib + 2]) / 3 * 0.35 + 160);
    if (d > 30) { changed++; o[io] = 255; o[io + 1] = 40; o[io + 2] = 40; } else { o[io] = o[io + 1] = o[io + 2] = Math.min(255, g); }
    o[io + 3] = 255;
  }
  await sharp(o, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outP);
  const hNote = A.info.height !== B.info.height ? `（页面高度 ${A.info.height} → ${B.info.height}px）` : '';
  return { pct: +(changed / (w * h) * 100).toFixed(1), hNote };
}

const rounds = (await readdir(a)).filter(d => /^round-\d+/.test(d)).sort();
const sections = []; let prevScore = null, prevDir = null, prevRubric = null; const summary = [];
for (const r of rounds) {
  const dir = join(a, r);
  const changes = (await exists(join(dir, 'changes.md'))) ? await readFile(join(dir, 'changes.md'), 'utf8') : '（缺 changes.md：这一轮没写改了什么，不算有效轮次）';
  const checks = (await exists(join(dir, 'checks.json'))) ? JSON.parse(await readFile(join(dir, 'checks.json'), 'utf8')) : null;
  const checkHtml = checks ? `<div class="checks">${Object.entries(checks).map(([k, v]) => `<div class="${v.ok ? 'pass' : 'fail'}">${v.ok ? '✓' : '✗'} ${esc(k)}${v.ok ? '' : `（${(v.lines || []).length} 处）<ul>${(v.lines || []).map(l => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>`}</div>`).join('')}</div>` : '<div class="checks">本轮无附加工程检查记录；不计设计分</div>';
  const allPass = checks && Object.values(checks).every(v => v.ok);
  const score = (await exists(join(dir, 'score.json'))) ? JSON.parse(await readFile(join(dir, 'score.json'), 'utf8')) : null;
  const review = (await exists(join(dir, 'review.json'))) ? JSON.parse(await readFile(join(dir, 'review.json'), 'utf8')) : null;
  const styleDeviations = (review?.style_fidelity || []).filter(s => (s.status || s.rating) === '偏离');
  const final = (await exists(join(dir,'final-score.json'))) ? JSON.parse(await readFile(join(dir,'final-score.json'),'utf8')) : review;
  const reviewPassed = final && !validateDesignReview(final).length;
  const reviewHtml = review ? `<div class="${reviewPassed ? 'pass' : 'fail'}"><strong>${esc(final?.label || '历史独立评审')}：${esc(final?.verdict || review.verdict)} · ${esc(review._meta?.agent_id || '见原记录')}${styleDeviations.length ? '；仍有风格偏离，A风格参考收尾未达标' : ''}</strong></div><p><a href="${r}/review.json">查看评分、证据与完整门槛</a></p><ul>${(review.hard_gates || []).filter(g => g.pass !== true).map(g => `<li class="fail">${esc(g.gate)}：${esc(g.note || '未通过')}</li>`).join('')}</ul>` : '<p class="fail">独立评审尚未回收</p>';
  const scoreRows = score ? Object.entries(score).map(([k, v]) => { const pv = prevScore?.[k]; const d = review?.schema_version !== 2 && (review?.rubric_id || 'legacy-seven-dimensions') === prevRubric && typeof v === 'number' && typeof pv === 'number' ? v - pv : null; return `<tr><td>${esc(k)}</td><td>${v}</td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d == null ? '' : (d > 0 ? '+' : '') + d}</td></tr>`; }).join('') : '';
  let shots = '';
  for (const vw of [1440, 768, 375]) {
    const cur = join(dir, 'shots', `${vw}.png`); if (!(await exists(cur))) continue;
    const prev = prevDir && join(prevDir, 'shots', `${vw}.png`);
    if (prev && (await exists(prev))) {
      const dp = join(dir, 'shots', `${vw}-diff.png`); const { pct, hNote } = await diff(prev, cur, dp);
      summary.push({ r, vw, pct });
      shots += `<h4>${vw}px：变化面积 ${pct}%${hNote}</h4><div class="row"><figure><img src="${basename(prevDir)}/shots/${vw}.png"><figcaption>上一轮</figcaption></figure><figure><img src="${r}/shots/${vw}.png"><figcaption>本轮</figcaption></figure><figure><img src="${r}/shots/${vw}-diff.png"><figcaption>差异（红）</figcaption></figure></div>`;
    } else shots += `<h4>${vw}px</h4><div class="row"><figure><img src="${r}/shots/${vw}.png"><figcaption>本轮</figcaption></figure></div>`;
  }
  sections.push(`<section><h2>${r}${score?.['总分'] != null ? `　总分 ${score['总分']}` : ''}　<span class="${allPass ? 'pass' : 'fail'}">${allPass ? '本轮记录的检查已通过（不代表未运行项目）' : '查看本轮实际检查范围与未验证项'}</span></h2>${reviewHtml}${checkHtml}${scoreRows ? `<table><tr><th>项</th><th>分</th><th>比上轮</th></tr>${scoreRows}</table>` : ''}<div class="changes">${md(changes)}</div>${shots}</section>`);
  prevScore = score; prevRubric = review?.rubric_id || 'legacy-seven-dimensions'; prevDir = dir;
}
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>轮次记录</title><style>
body{font:14px/1.6 system-ui,sans-serif;margin:0;padding:24px 32px;background:#f6f6f4;color:#222}h1{margin:0 0 16px}section{background:#fff;border-radius:8px;padding:20px 24px;margin:0 0 24px}
table{border-collapse:collapse;margin:8px 0 16px}td,th{border-bottom:1px solid #eee;padding:4px 12px;text-align:left}.up{color:#0a7d33}.down{color:#c0262d}
.pass{color:#0a7d33}.fail{color:#c0262d}.checks{margin:4px 0 12px}.checks ul{margin:2px 0 6px;font-size:13px}h2 span{font-size:14px;font-weight:600}.changes{background:#fafafa;border-left:3px solid #222;padding:8px 16px;margin:8px 0 16px}.row{display:flex;gap:12px;align-items:flex-start}figure{margin:0;flex:1;min-width:0}figure img{width:100%;border:1px solid #ddd}figcaption{color:#777;font-size:12px}
</style><h1>轮次记录（${rounds.length} 轮）</h1>${sections.reverse().join('\n')}</html>`;
await writeFile(join(a, 'index.html'), html);
console.log(`已生成 ${join(a, 'index.html')}：${rounds.length} 轮` + (summary.length ? '；变化面积 ' + summary.map(s => `${s.r}@${s.vw} ${s.pct}%`).join('，') : ''));
