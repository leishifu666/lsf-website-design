// 公共启动：本机 Chromium 路径、代理、Cookie 弹窗、跨域样式表抓取、canvas/WebGL 探针
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

async function installedChromium() {
  try { return (await import('playwright')).chromium; }
  catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  const fromProject = createRequire(resolve(process.cwd(),'package.json'));
  try { return fromProject('playwright').chromium; }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  // Some workstations already use Python Playwright, which ships the same JS driver.
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const lookup = spawnSync(python, ['-I','-c',
    "from pathlib import Path; import playwright; print(Path(playwright.__file__).parent/'driver'/'package')"],
    {encoding:'utf8',windowsHide:true,timeout:5000});
  const driver = lookup.stdout?.trim();
  if (lookup.status === 0 && driver && existsSync(resolve(driver,'package.json'))) {
    const api = fromProject(driver);
    if (api.chromium) return api.chromium;
  }
  throw Error('缺可用的 Playwright。按本技能 scripts/package.json 在脚本目录运行 npm install，并配置 Chromium 或 CHROME_PATH。');
}

// CHROME_PATH 可指向系统 Chrome；不设则用 Playwright 自带的
export async function launch() {
  const chromium = await installedChromium();
  const opts = { headless: process.env.HEADED ? false : true };
  if (process.env.CHROME_PATH) { opts.executablePath = process.env.CHROME_PATH; opts.args = ['--no-sandbox', '--disable-gpu-sandbox']; }
  else if (!existsSync(chromium.executablePath())) opts.channel = 'chrome';
  const raw = process.env.LSF_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  if (raw) { const u = new URL(raw); opts.proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined }; }
  return chromium.launch(opts);
}

// 在页面脚本运行前注入：记录 canvas 上下文类型、WebGL 着色器、rAF 调用、IntersectionObserver
export const PROBE = () => {
  const P = (window.__lsfProbe = { contexts: [], shaders: 0, shaderSamples: [], raf: 0, io: 0, wheelListeners: 0 });
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = gc.call(this, type, attrs);
    if (ctx && !this.__lsfType) { this.__lsfType = type; P.contexts.push({ type, w: this.width, h: this.height, attrs: attrs || null }); }
    return ctx;
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const ss = C.prototype.shaderSource;
    C.prototype.shaderSource = function (sh, src) { P.shaders++; if (P.shaderSamples.length < 6) P.shaderSamples.push(String(src).slice(0, 400)); return ss.call(this, sh, src); };
  }
  const raf = window.requestAnimationFrame; window.requestAnimationFrame = cb => { P.raf++; return raf.call(window, cb); };
  const IO = window.IntersectionObserver; if (IO) window.IntersectionObserver = class extends IO { constructor(...a) { super(...a); P.io++; } };
  const ael = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t, ...r) { if (t === 'wheel' && (this === window || this === document || this === document.documentElement)) P.wheelListeners++; return ael.call(this, t, ...r); };
};

// 收集所有样式表和脚本的源码文本（包括跨域 CDN 上的，CSSOM 读不到的那部分）
export function collectSources(page) {
  const css = [], js = [];
  page.on('response', async r => {
    try {
      const t = r.request().resourceType();
      if (t !== 'stylesheet' && t !== 'script') return;
      if (r.status() >= 400) return;
      const body = await r.text();
      (t === 'stylesheet' ? css : js).push({ url: r.url(), body });
    } catch {}
  });
  return { css, js };
}

// 尝试关闭常见 Cookie / 同意弹窗
export async function dismissBanners(page) {
  const sel = ['#onetrust-accept-btn-handler', 'button[aria-label*="ccept" i]', '[data-testid*="accept" i]', '.cky-btn-accept', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'];
  for (const s of sel) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 2000 }).catch(() => {}); return s; } }
  for (const txt of [/^accept( all)?( cookies)?$/i, /^allow all$/i, /^agree$/i, /^同意$/, /^接受$/, /^我知道了$/, /^got it$/i, /^ok$/i]) {
    const el = page.getByRole('button', { name: txt }).first();
    if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 2000 }).catch(() => {}); return String(txt); }
  }
  return null;
}

export async function open(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const banner = await dismissBanners(page);
  await page.waitForTimeout(1200);
  return { banner };
}

// 从 CSS 源码里拆出 :root/自定义属性、@keyframes、@font-face
export function parseCss(sources) {
  const vars = {}, keyframes = {}, fontFaces = [];
  for (const { url, body } of sources) {
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) { const k = m[1]; if (!(k in vars)) vars[k] = m[2].trim().slice(0, 200); }
    for (const m of body.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) if (!keyframes[m[1]]) keyframes[m[1]] = m[2].replace(/\s+/g, ' ').slice(0, 600);
    for (const m of body.matchAll(/@font-face\s*\{([^}]*)\}/g)) { const fam = /font-family\s*:\s*([^;]+)/.exec(m[1])?.[1]?.trim(); const w = /font-weight\s*:\s*([^;]+)/.exec(m[1])?.[1]?.trim(); if (fam) fontFaces.push({ family: fam, weight: w || '', from: url.split('?')[0].slice(-80) }); }
  }
  return { vars, keyframes, fontFaces };
}
