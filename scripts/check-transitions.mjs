// 用法：node check-transitions.mjs <url> [输出目录] [视口宽度，默认1440]
// 查“状态切换没有过渡”：弹窗、抽屉、下拉、菜单、tab、折叠面板瞬间出现/消失；滚动时背景色硬切。
// 做法：逐个点击触发器（aria-expanded / aria-controls / aria-haspopup / popovertarget / role=tab / summary / 类名含 menu|modal|drawer|dialog|toggle|tab|accordion），
// 点击后 40ms 内看页面上有没有正在运行的过渡/动画（document.getAnimations），再看 600ms 后哪些元素出现、消失或换了底色。
// 有可见变化、但变化的元素及其祖先都没有动画 → 判“瞬间切换”。再按 Esc / 再点一次，同样查退出。
// 也可用在参考站上：输出里记录了每个状态切换实际用的时长、缓动和动画属性，可抄进 reference-spec.json。
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, open } from './lib/browser.mjs';

const [, , url, outDir = './out-transitions', vw = '1440'] = process.argv;
if (!url) { console.error('用法：node check-transitions.mjs <url> [输出目录] [视口宽度]'); process.exit(1); }
await mkdir(`${outDir}/shots`, { recursive: true });
const browser = await launch();
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: Number(vw), height: 900 } });
  await open(page, url);
  // 给页面装一个记录器：快照可见元素状态；收集某时刻正在跑的动画
  const install = () => page.evaluate(() => {
    window.__lsfSnap = () => { const m = new Map(); for (const e of document.querySelectorAll('body *')) { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); const vis = s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 0 && r.height > 0; m.set(e, `${vis}|${s.backgroundColor}|${Math.round(r.width)}x${Math.round(r.height)}`); } return m; };
    window.__lsfAnims = () => {
      const css = document.getAnimations().filter(a => a.playState === 'running').map(a => { const t = a.effect?.getTiming?.() || {}; const kf = a.effect?.getKeyframes?.() || []; return { el: a.effect?.target, name: a.animationName || a.transitionProperty || 'WAAPI', duration: t.duration, easing: t.easing, props: [...new Set(kf.flatMap(k => Object.keys(k).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))] }; });
      // GSAP changes DOM styles through its ticker; it is not listed by document.getAnimations().
      // Only active tweens on actual DOM elements count, never a timer or unrelated scroll object.
      const skip = new Set(['duration','ease','delay','stagger','overwrite','onComplete','onStart','onUpdate','repeat','repeatDelay','yoyo','scrollTrigger','immediateRender','clearProps','parent']);
      const gs = (window.gsap?.globalTimeline?.getChildren(true, true, false) || []).filter(t => t.isActive()).flatMap(t => (t.targets?.() || []).filter(el => el instanceof Element).map(el => ({ el, name: 'GSAP', duration: t.duration() * 1000, easing: typeof t.vars.ease === 'string' ? t.vars.ease : 'GSAP custom ease', props: Object.keys(t.vars).filter(k => !skip.has(k)) })));
      return css.concat(gs);
    };
    window.__lsfName = e => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : '';
  });
  await install();
  const triggers = await page.evaluate(() => {
    const sel = '[aria-expanded], [aria-controls], [aria-haspopup], [popovertarget], [role=tab], summary, [data-state], button[class*=menu i], button[class*=toggle i], [class*=modal i][role=button], [class*=drawer i] button, [class*=accordion i] button, [class*=tab i][role=button], [data-modal], [data-toggle], [data-bs-toggle]';
    const seen = new Set(); let i = 0; const out = [];
    for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); if (!r.width || !r.height || s.visibility === 'hidden') continue; const key = (e.getAttribute('aria-controls') || '') + e.className + e.textContent.trim().slice(0, 20); if (seen.has(key)) continue; seen.add(key); e.setAttribute('data-lsf-trigger', String(i)); out.push({ i: i++, label: (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40) }); if (i >= 20) break; }
    return out;
  });

  const probe = async (label, act, trig = null) => {
    await page.evaluate(t => { window.__lsfBefore = window.__lsfSnap(); window.__lsfTrig = t ? document.querySelector(`[data-lsf-trigger="${t}"]`) : null; }, trig);
    await act();
    await page.waitForTimeout(40);
    await page.evaluate(() => {
      window.__lsfEarly = window.__lsfAnims();
      window.__lsfMotionSignature = e => { const s = getComputedStyle(e); return ['opacity','transform','backgroundColor','color','width','height','top','left','right','bottom','clipPath','filter'].map(k => s[k]).join('|'); };
      window.__lsfEarly.forEach(a => { if (a.name === 'GSAP') a.initial = window.__lsfMotionSignature(a.el); });
    });
    await page.waitForTimeout(34);
    const early = await page.evaluate(() => {
      // A live tween can have identical start/end values. Require actual DOM style change.
      window.__lsfEarly = window.__lsfEarly.filter(a => a.name !== 'GSAP' || a.initial !== window.__lsfMotionSignature(a.el));
      return window.__lsfEarly.map(({ initial, ...a }) => ({ ...a, el: window.__lsfName(a.el) }));
    });
    await page.waitForTimeout(600);
    return page.evaluate(({ early }) => {
      const after = window.__lsfSnap(); const changed = [];
      for (const [e, v] of after) { const b = window.__lsfBefore.get(e); if (b === undefined ? v.startsWith('true') : b !== v) { const [vb, bgb] = (b || 'false|').split('|'); const [va, bga] = v.split('|'); const kind = vb !== va ? (va === 'true' ? '出现' : '消失') : bgb !== bga ? '换底色' : '尺寸变化'; changed.push({ e, kind }); } }
      for (const [e, b] of window.__lsfBefore) if (!e.isConnected && b.startsWith('true')) changed.push({ e, kind: '移除', name: window.__lsfName(e) });
      // 排除：自己会动的区域（自动播放的演示、轮播，见 __lsfNoise）和触发器本身的 hover/按下状态
      const noise = window.__lsfNoise || new Set(); const trig = window.__lsfTrig;
      const skip = e => e && ([...noise].some(n => n === e || n.contains(e) || e.contains(n)) || (trig && (trig === e || trig.contains(e) || e.contains(trig))));
      for (let i = changed.length - 1; i >= 0; i--) if (skip(changed[i].e)) changed.splice(i, 1);
      // 只看“顶层”变化：祖先也在变化列表里的跳过
      const set = new Set(changed.map(c => c.e).filter(Boolean));
      const top = changed.filter(c => ![...set].some(o => o !== c.e && o.contains(c.e)));
      const animated = new Set(window.__lsfEarly.map(a => a.el).filter(Boolean));
      const isAnimated = e => e && [...animated].some(a => a === e || a.contains(e) || e.contains(a));
      const area = c => { const k = window.__lsfBefore.get(c.e) || ''; const m = /(\d+)x(\d+)/.exec(c.e.isConnected ? `${Math.round(c.e.getBoundingClientRect().width)}x${Math.round(c.e.getBoundingClientRect().height)}` : k); return m ? m[1] * m[2] : 0; };
      const big = top.filter(c => Math.max(area(c), (/(\d+)x(\d+)/.exec(window.__lsfBefore.get(c.e) || '') || [0, 0, 0]).slice(1).reduce((a, b) => a * b, 1)) > 2000);
      const instant = big.filter(c => c.kind !== '尺寸变化' && !isAnimated(c.e));
      return { changes: big.slice(0, 6).map(c => ({ kind: c.kind, el: window.__lsfName(c.e) })), instant: instant.slice(0, 6).map(c => ({ kind: c.kind, el: window.__lsfName(c.e) })), animations: early.slice(0, 6) };
    }, { early });
  };

  for (const t of triggers) {
    const h = await page.$(`[data-lsf-trigger="${t.i}"]`); if (!h) continue;
    await h.scrollIntoViewIfNeeded().catch(() => {});
    const urlBefore = page.url();
    // 先不点，看 640ms 里页面自己有哪些变化（自动播放区域），记为噪声
    await page.evaluate(() => { window.__lsfNoiseBefore = window.__lsfSnap(); });
    await page.waitForTimeout(640);
    await page.evaluate(() => { const a = window.__lsfSnap(); const n = new Set(); for (const [e, v] of a) if (window.__lsfNoiseBefore.get(e) !== v) n.add(e); for (const [e] of window.__lsfNoiseBefore) if (!e.isConnected) n.add(e.parentElement || e); window.__lsfNoise = new Set([...(window.__lsfNoise || []), ...n]); });
    const openR = await probe(t.label, () => h.click({ timeout: 3000 }).catch(() => {}), t.i);
    if (page.url() !== urlBefore) { await page.goto(urlBefore); await install(); continue; }
    await page.screenshot({ path: `${outDir}/shots/trigger-${t.i}-open.png` });
    // 关闭：先用指针（点页面空白角落，大多数弹层点外部会关）；没关上再按 Esc。键盘触发的关闭允许没有动画（交互动效.md 第 4 条）
    let closeVia = 'pointer';
    let closeR = await probe(t.label, () => page.mouse.click(3, 897), t.i);
    if (!closeR.changes.length) { closeVia = 'keyboard'; closeR = await probe(t.label, () => page.keyboard.press('Escape'), t.i); }
    if (!closeR.changes.length) { closeVia = 'trigger'; const still = await page.$(`[data-lsf-trigger="${t.i}"]`); closeR = await probe(t.label, () => still?.click({ timeout: 2000 }).catch(() => {}), t.i); }
    const closeBad = closeVia !== 'keyboard' && closeR.instant.length;
    results.push({ trigger: t.label, open: openR, close: { ...closeR, via: closeVia }, verdict: openR.changes.length === 0 ? '无可见变化' : openR.instant.length ? '打开瞬间切换' : closeBad ? '关闭瞬间切换' : '有过渡' });
  }

  // 滚动时底色硬切：每次滚轮后 40ms 看 html/body/当前视口中心区块底色是否变了且没有动画
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
  const bgAt = () => page.evaluate(() => { const els = [document.documentElement, document.body, document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('section,main > div,header,footer') || document.body]; return els.map(e => getComputedStyle(e).backgroundColor).join(' | '); });
  const scrollFlips = []; let prev = await bgAt();
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0, i = 0; y < total && i < 40; y += 500, i++) {
    await page.mouse.move(400, 400); await page.mouse.wheel(0, 500); await page.waitForTimeout(40);
    const anims = await page.evaluate(() => window.__lsfAnims().filter(a => a.props.some(p => /background|color/i.test(p)) || /background|color/i.test(a.name)).length);
    await page.waitForTimeout(500); const cur = await bgAt();
    const [, , secPrev] = prev.split(' | '), [, , secCur] = cur.split(' | ');
    if (cur.split(' | ').slice(0, 2).join() !== prev.split(' | ').slice(0, 2).join() && !anims) scrollFlips.push({ y: await page.evaluate(() => Math.round(scrollY)), from: prev, to: cur });
    prev = cur;
  }
  const bad = results.filter(r => /瞬间/.test(r.verdict));
  await writeFile(`${outDir}/transitions.json`, JSON.stringify({ url, viewport: Number(vw), triggers: results, scrollBackgroundFlips: scrollFlips }, null, 2));
  for (const r of results) console.log(`${/瞬间/.test(r.verdict) ? '✗' : r.verdict === '有过渡' ? '✓' : '·'} 「${r.trigger}」${r.verdict}${r.open.animations[0] ? `（${r.open.animations[0].name} ${r.open.animations[0].duration}ms ${r.open.animations[0].easing}）` : ''}${r.open.instant.length ? ' → ' + r.open.instant.map(x => x.kind + ' ' + x.el).join('，') : ''}${r.close.instant.length && r.close.via !== 'keyboard' ? ' ／关闭（' + r.close.via + '）→ ' + r.close.instant.map(x => x.kind + ' ' + x.el).join('，') : ''}`);
  for (const f of scrollFlips) console.log(`✗ 滚动到 ${f.y}px 底色硬切：${f.from} → ${f.to}`);
  console.log(`\n触发器 ${results.length} 个，瞬间切换 ${bad.length} 个；滚动底色硬切 ${scrollFlips.length} 处。详情 ${outDir}/transitions.json`);
  process.exitCode = bad.length || scrollFlips.length ? 1 : 0;
} finally { await browser.close(); }
