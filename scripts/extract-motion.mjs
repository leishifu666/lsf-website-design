// 用法：node extract-motion.mjs <url> [输出目录] [视口宽度，默认1440]
// 抓参考站的动效证据，输出 motion.json + frames/ + 滚动录屏 .webm：
// 1 动效库与渲染技术（按脚本源码特征 + 全局变量 + canvas/WebGL 探针）
// 2 CSS transition / animation / @keyframes（含跨域 CDN 样式表）
// 3 交互：按钮型元素优先、按样式去重后的 hover 与按压前后差（含子元素），以及光标跟随元素
// 4 滚动：用真实滚轮输入逐帧截图，记录平滑滚动、钉住元素、随滚动变化的元素
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, collectSources, open, parseCss, PROBE } from './lib/browser.mjs';

const [, , url, outDir = './out-motion', vw = '1440'] = process.argv;
if (!url) { console.error('用法：node extract-motion.mjs <url> [输出目录] [视口宽度]'); process.exit(1); }
await mkdir(`${outDir}/frames`, { recursive: true });
const W = Number(vw), H = 900;

const SIGS = {
  gsap: /gsap\.(to|from|fromTo|timeline|registerPlugin)|GreenSock|_gsScope/, ScrollTrigger: /ScrollTrigger/, SplitText: /SplitText/,
  lenis: /\blenis\b|Lenis\(/i, locomotive: /locomotive-scroll|LocomotiveScroll/, framerMotion: /framer-motion|framerusercontent\.com|__framer/i,
  motionOne: /motion\.dev|animateMini/, animejs: /anime\.timeline|animejs/, three: /WebGLRenderer|THREE\.REVISION|three\.module/, pixi: /PIXI\.|pixi\.js|@pixi\//,
  ogl: /new Renderer\(\{[^}]*dpr|from["']ogl["']/, babylon: /BABYLON\./, r3f: /@react-three\/fiber|useFrame\(/, spline: /@splinetool|splinecode/, rive: /@rive-app|rive\.wasm/,
  lottie: /lottie|bodymovin/i, barba: /barba/i, swup: /\bSwup\b/, matter: /Matter\.Engine/, p5: /p5\.prototype|new p5\(/, viewTransitions: /startViewTransition/,
};

const browser = await launch();
try {
  // 录屏需要 Playwright 的 ffmpeg（npx playwright install ffmpeg）；装不上时自动跳过录屏，其余照常
  let ctx, page, video = !process.env.NO_VIDEO;
  try {
    ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(video ? { recordVideo: { dir: outDir, size: { width: W, height: H } } } : {}) });
    await ctx.addInitScript(PROBE); page = await ctx.newPage();
  } catch (e) {
    if (!/ffmpeg/i.test(e.message)) throw e;
    console.warn('未找到 ffmpeg，跳过录屏（逐帧截图照常输出）。需要录屏请运行：npx playwright install ffmpeg');
    await ctx?.close().catch(() => {}); video = false;
    ctx = await browser.newContext({ viewport: { width: W, height: H } }); await ctx.addInitScript(PROBE); page = await ctx.newPage();
  }
  const src = collectSources(page);
  const { banner } = await open(page, url);
  await page.waitForTimeout(1500);

  // 1. 库与渲染技术
  const allJs = src.js.map(s => s.body).join('\n');
  const libs = Object.fromEntries(Object.entries(SIGS).map(([k, re]) => [k, re.test(allJs)]));
  const runtime = await page.evaluate(() => {
    const r = { htmlClass: document.documentElement.className.slice(0, 200), canvases: [], probe: window.__lsfProbe };
    if (window.gsap) r.gsapVersion = window.gsap.version;
    const ST = window.ScrollTrigger || window.gsap?.core?.globals?.()?.ScrollTrigger;
    if (ST?.getAll) r.scrollTriggers = ST.getAll().slice(0, 30).map(t => ({ trigger: t.trigger?.className?.toString().slice(0, 60) || t.trigger?.tagName, start: t.vars.start, end: t.vars.end, scrub: t.vars.scrub, pin: !!t.vars.pin, snap: t.vars.snap ? true : false }));
    const L = window.lenis || window.__lenis; if (L?.options) r.lenisOptions = Object.fromEntries(Object.entries(L.options).filter(([, v]) => typeof v !== 'object' && typeof v !== 'function'));
    if (window.THREE?.REVISION) r.threeRevision = window.THREE.REVISION;
    if (window.__THREE__) r.threeRevision = window.__THREE__;
    for (const c of document.querySelectorAll('canvas')) { const b = c.getBoundingClientRect(); r.canvases.push({ type: c.__lsfType || '未知（脚本运行前已创建或未取上下文）', css: `${Math.round(b.width)}x${Math.round(b.height)}`, buffer: `${c.width}x${c.height}`, fixed: getComputedStyle(c).position, top: Math.round(b.top + scrollY) }); }
    r.videos = [...document.querySelectorAll('video')].slice(0, 10).map(v => ({ src: (v.currentSrc || '').slice(-80), autoplay: v.autoplay, loop: v.loop, muted: v.muted }));
    r.lottie = document.querySelectorAll('lottie-player, dotlottie-player, [data-animation-path]').length;
    return r;
  });
  if (runtime.probe?.contexts?.some(c => /webgl/.test(c.type))) libs.webgl = true;
  if (runtime.probe?.contexts?.some(c => c.type === '2d')) libs.canvas2d = true;
  if (/\blenis\b/.test(runtime.htmlClass)) libs.lenis = true;

  // 2. CSS 过渡、动画、关键帧（计算样式 + 源码）
  const css = await page.evaluate(() => {
    const trans = {}, anim = {};
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      const tag = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      if (s.transitionDuration.split(',').some(d => parseFloat(d) > 0)) { const k = `${s.transitionProperty} | ${s.transitionDuration} | ${s.transitionTimingFunction} | ${s.transitionDelay}`; trans[k] ??= { n: 0, eg: [] }; trans[k].n++; if (trans[k].eg.length < 3) trans[k].eg.push(tag.slice(0, 60)); }
      if (s.animationName !== 'none') { const k = `${s.animationName} | ${s.animationDuration} | ${s.animationTimingFunction} | ${s.animationIterationCount}`; anim[k] ??= { n: 0, eg: [] }; anim[k].n++; if (anim[k].eg.length < 3) anim[k].eg.push(tag.slice(0, 60)); }
      if (s.animationTimeline && s.animationTimeline !== 'auto') anim['scroll-driven: ' + s.animationTimeline] = { n: 1, eg: [tag] };
    }
    const sort = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1].n - a[1].n).slice(0, 40));
    return { transitions: sort(trans), animations: sort(anim) };
  });
  const parsed = parseCss(src.css);

  // 3. 交互：挑候选（按钮型优先、样式去重），逐个 hover 和按压
  const picks = await page.evaluate(() => {
    const out = []; const seen = new Set(); let i = 0;
    const els = document.querySelectorAll('a, button, [role=button], input[type=submit], summary, [class*=btn i], [class*=button i], [class*=cta i], [class*=card i]');
    for (const el of els) {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      if (r.width < 8 || r.height < 8 || s.visibility === 'hidden' || s.display === 'none') continue;
      const inNav = !!el.closest('header, nav, footer');
      const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || (s.borderTopStyle !== 'none' && s.borderTopWidth !== '0px') || s.backgroundImage !== 'none';
      const kind = /card/i.test(el.className) || (r.width > 220 && r.height > 160) ? 'card' : (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || filled) ? 'button' : inNav ? 'nav-link' : 'link';
      const sig = [kind, el.tagName, s.backgroundColor, s.color, s.borderRadius, s.paddingTop, s.paddingLeft, s.fontSize, s.fontWeight].join('|');
      if (seen.has(sig)) continue; seen.add(sig);
      el.setAttribute('data-lsf-pick', String(i));
      out.push({ i: i++, kind, inNav, text: (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40), y: Math.round(r.top + scrollY), area: Math.round(r.width * r.height) });
    }
    const quota = { button: 14, card: 6, 'nav-link': 4, link: 4 }; const used = {};
    return out.sort((a, b) => (a.kind === 'button' ? 0 : 1) - (b.kind === 'button' ? 0 : 1) || b.area - a.area).filter(p => (used[p.kind] = (used[p.kind] || 0) + 1) <= quota[p.kind]);
  });

  const PROPS = ['color', 'backgroundColor', 'borderColor', 'transform', 'scale', 'translate', 'boxShadow', 'opacity', 'borderRadius', 'textDecorationLine', 'clipPath', 'filter', 'letterSpacing', 'width'];
  const read = h => h.evaluate((el, ps) => {
    const snap = n => { const s = getComputedStyle(n); return Object.fromEntries(ps.map(p => [p, s[p]])); };
    const kids = [...el.querySelectorAll('*')].slice(0, 6);
    const pseudo = w => { const s = getComputedStyle(el, w); return s.content === 'none' || s.content === 'normal' ? null : Object.fromEntries(ps.map(p => [p, s[p]])); };
    return { self: snap(el), kids: kids.map(snap), before: pseudo('::before'), after: pseudo('::after'), transition: getComputedStyle(el).transition.slice(0, 200), cursor: getComputedStyle(el).cursor };
  }, PROPS);
  const diff = (a, b) => Object.fromEntries(PROPS.filter(p => a[p] !== b[p]).map(p => [p, [a[p], b[p]]]));
  const interactions = [];
  for (const p of picks) {
    const h = await page.$(`[data-lsf-pick="${p.i}"]`); if (!h) continue;
    await h.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(250);
    const box = await h.boundingBox(); if (!box) continue;
    await page.mouse.move(2, 2); await page.waitForTimeout(400);
    const before = await read(h);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 }); await page.waitForTimeout(700);
    const hover = await read(h);
    await page.mouse.down(); await page.waitForTimeout(150);
    const press = await read(h);
    // 松开前移出元素，避免触发点击跳转
    await page.mouse.move(2, 2); await page.mouse.up();
    const hd = diff(before.self, hover.self), pd = diff(hover.self, press.self);
    const pseudoHover = ['before', 'after'].map(w => before[w] && hover[w] ? { w: '::' + w, d: diff(before[w], hover[w]) } : null).filter(x => x && Object.keys(x.d).length);
    const kidHover = before.kids.map((k, j) => hover.kids[j] ? diff(k, hover.kids[j]) : {}).map((d, j) => ({ j, d })).filter(x => Object.keys(x.d).length);
    interactions.push({ ...p, transition: before.transition, cursor: before.cursor, hover: hd, hoverChildren: kidHover.slice(0, 3), hoverPseudo: pseudoHover, press: pd, noFeedback: !Object.keys(hd).length && !kidHover.length && !pseudoHover.length && !Object.keys(pd).length });
  }
  if (page.url() !== url && !page.url().startsWith(url)) await page.goto(url, { waitUntil: 'load' });

  // 光标跟随：移动鼠标，看有没有 fixed 小元素跟着动
  const fixedPos = () => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.position === 'fixed' && r.width < 120 && r.height < 120 && r.width > 0 && s.pointerEvents === 'none'; }).slice(0, 10).map(e => { const r = e.getBoundingClientRect(); return { k: e.tagName + '.' + String(e.className).slice(0, 40), x: Math.round(r.x), y: Math.round(r.y) }; }));
  await page.mouse.move(300, 300, { steps: 5 }); await page.waitForTimeout(500); const c1 = await fixedPos();
  await page.mouse.move(900, 600, { steps: 5 }); await page.waitForTimeout(500); const c2 = await fixedPos();
  const cursorFollower = c2.filter((b, j) => c1[j] && (Math.abs(b.x - c1[j].x) > 100)).map(b => b.k);

  // 3b. 导航栏随滚动的变化：顶部 → 向下滚 1200px → 向上滚 300px，各读一次导航状态
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(600);
  const navState = () => page.evaluate(() => {
    const cand = [...document.querySelectorAll('header, nav, [class*=header i], [class*=navbar i]')].filter(e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return (s.position === 'fixed' || s.position === 'sticky') && r.width > innerWidth * 0.5 && r.height < 200; });
    const e = cand[0]; if (!e) return null; const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    return { el: e.tagName.toLowerCase() + (typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : ''), top: Math.round(r.top), height: Math.round(r.height), visibleHeight: Math.round(Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))), bg: s.backgroundColor, backdrop: s.backdropFilter, shadow: s.boxShadow !== 'none', opacity: s.opacity, transform: s.transform, transition: s.transition.slice(0, 120) };
  });
  const navTop = await navState();
  for (let i = 0; i < 3; i++) { await page.mouse.move(W / 2, H / 2); await page.mouse.wheel(0, 400); await page.waitForTimeout(350); }
  await page.waitForTimeout(700); const navDown = await navState();
  await page.mouse.wheel(0, -300); await page.waitForTimeout(1000); const navUp = await navState();
  let navOnScroll = null;
  if (navTop) {
    const hiddenDown = navDown && navDown.visibleHeight < navTop.visibleHeight * 0.3, backUp = navUp && navUp.visibleHeight > navTop.visibleHeight * 0.7;
    const kinds = [];
    if (hiddenDown && backUp) kinds.push('向下滚隐藏、向上滚出现'); else if (hiddenDown) kinds.push('向下滚隐藏');
    if (navDown && !hiddenDown && navDown.height < navTop.height - 4) kinds.push(`变矮 ${navTop.height}→${navDown.height}px`);
    if (navDown && navDown.bg !== navTop.bg) kinds.push(`底色 ${navTop.bg}→${navDown.bg}`);
    if (navDown && navDown.backdrop !== navTop.backdrop) kinds.push(`背景模糊 ${navTop.backdrop}→${navDown.backdrop}`);
    if (navDown && navDown.shadow !== navTop.shadow) kinds.push('出现阴影');
    navOnScroll = { pattern: kinds.length ? kinds.join('；') : '不变', top: navTop, down: navDown, up: navUp };
  }
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(600);

  // 4. 滚动：真实滚轮输入（会经过 Lenis 等平滑滚动），每步截图并记录变化
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(800);
  const sample = () => page.evaluate(() => {
    const out = {}; let i = 0;
    for (const e of document.querySelectorAll('body *')) {
      if (i++ > 2500) break; const r = e.getBoundingClientRect(); if (r.width < 40 || r.height < 20) continue;
      const s = getComputedStyle(e); out[i] = `${s.transform}|${s.opacity}|${s.clipPath}|${s.filter}`;
    }
    const pinned = [...document.querySelectorAll('body *')].filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && e.getBoundingClientRect().height > 200).length;
    return { y: Math.round(scrollY), pinned, out };
  });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const frames = []; let prev = await sample(); let smooth = null;
  for (let i = 0; i < 60 && prev.y + H < total - 10; i++) {
    await page.mouse.move(W / 2, H / 2);
    if (smooth === null && i < 6) {
      // 记录一次滚轮后 1.5 秒内每一帧的 scrollY，算出“延迟/惯性”参数（Lenis 一类平滑滚动的手感就在这里）
      await page.evaluate(() => { const c = (window.__lsfCurve = []); const t0 = performance.now(); const tick = () => { c.push([Math.round(performance.now() - t0), Math.round(scrollY)]); if (performance.now() - t0 < 1500) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      await page.mouse.wheel(0, 400); await page.waitForTimeout(1600);
      const curve = await page.evaluate(() => window.__lsfCurve);
      const y0 = curve[0]?.[1] ?? prev.y, yEnd = curve.at(-1)?.[1] ?? y0, d = yEnd - y0;
      if (d > 20) {
        const tAt = f => curve.find(([, y]) => y - y0 >= d * f)?.[0] ?? null;
        const t10 = tAt(0.1), t50 = tAt(0.5), t90 = tAt(0.9), t99 = tAt(0.99);
        const frames = t90 != null && t10 != null ? Math.max(1, (t90 - t10) / 16.7) : null;
        // 指数趋近（lerp）：每帧剩余距离乘 (1-lerp)；从剩 90% 到剩 10% 缩小 9 倍
        const lerp = frames ? +(1 - Math.pow(1 / 9, 1 / frames)).toFixed(3) : null;
        const smoothing = t90 != null && t90 > 120;
        smooth = { smoothing, distance: d, t10ms: t10, t50ms: t50, t90ms: t90, t99ms: t99, estimatedLerp: smoothing ? lerp : null, note: smoothing ? '有延迟的平滑滚动：t90 越大越“滑”；estimatedLerp 按 60fps 估算，以 runtime.lenisOptions 为准' : '实时滚动（滚轮一下立刻到位）', curve: curve.filter((_, k) => k % 3 === 0).slice(0, 40) };
      }
    } else { await page.mouse.wheel(0, 400); await page.waitForTimeout(450); }
    const cur = await sample();
    const changed = Object.keys(cur.out).filter(k => prev.out[k] !== undefined && prev.out[k] !== cur.out[k]).length;
    const f = `frames/${String(i).padStart(2, '0')}.png`;
    await page.screenshot({ path: `${outDir}/${f}` });
    frames.push({ frame: f, y: cur.y, pinned: cur.pinned, changedElements: changed, scrollStuck: cur.y === prev.y });
    if (cur.y === prev.y && i > 2 && frames.at(-2)?.scrollStuck) break;
    prev = cur;
  }

  const probe = runtime.probe || {}; delete runtime.probe;
  const result = {
    url, viewport: W, video, measuredAt: new Date().toISOString().slice(0, 10), cookieBanner: banner,
    libs, runtime, rendering: { contexts: probe.contexts, shaderCount: probe.shaders, shaderSamples: probe.shaderSamples, rafCalls: probe.raf, intersectionObservers: probe.io, wheelListeners: probe.wheelListeners },
    ...css, keyframes: parsed.keyframes, interactions, cursorFollower, navOnScroll, smoothScroll: smooth, frames,
    notes: ['libs 来自脚本源码特征匹配，可能误报，用 runtime 和录屏核对', 'hover 在无头 Chromium 中测得；只在 @media (hover:hover) 下生效的样式需要设备模拟为桌面'],
  };
  await writeFile(`${outDir}/motion.json`, JSON.stringify(result, null, 2));
  await ctx.close();
  console.log(`已写入 ${outDir}/motion.json${video ? ' 和录屏 .webm' : '（无录屏）'}：库 ${Object.entries(libs).filter(([, v]) => v).map(([k]) => k).join(', ') || '无'}；交互 ${interactions.length} 个（无反馈 ${interactions.filter(x => x.noFeedback).length}）；滚动帧 ${frames.length}；平滑滚动 ${smooth?.smoothing ? '是' : '否'}；导航随滚动：${navOnScroll?.pattern || '没找到固定导航'}`);
} finally { await browser.close(); }
