// node replay-behavior.mjs PLAN.json reference|implementation EMPTY_OUTPUT_DIRECTORY
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { launch } from './lib/browser.mjs';
import { installRecorder, runtimeDirect } from './lib/replay-recorder.mjs';
import { defaultProperties, layerChanges, resolvePlan, summarizeWheel } from './lib/replay-plan.mjs';

const [file, side, out] = process.argv.slice(2);
if (!out) throw new Error('node replay-behavior.mjs PLAN.json reference|implementation EMPTY_OUT_DIR');
const bytes = await readFile(file);
const plan = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const { url, targets, sameOrigin } = resolvePlan(plan, side);
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error('Use a new or empty directory for each replay');
await mkdir(path.join(out, 'frames'));
await writeFile(path.join(out, 'input-plan.json'), bytes);
const report = { version: 1, side, planFile: 'input-plan.json', planSha256: createHash('sha256').update(bytes).digest('hex'), url,
  startedAt: new Date().toISOString(), viewport: plan.viewport, targets, experiments: [], direct: [], measured: [], fitted: [] };

const browser = await launch();
try {
  report.browser = browser.version();
  report.headless = !process.env.HEADED;
  const ctx = await browser.newContext({ viewport: plan.viewport, deviceScaleFactor: 1, acceptDownloads: false });
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(60000);
  const sinks = new Map();
  let config = null, pressed = false;
  await page.exposeBinding('__lsfReplayConfig', () => config);
  await page.exposeBinding('__lsfReplayEmit', (_, token, item) => {
    const step = sinks.get(token);
    if (!step) return;
    const { kind, ...data } = item;
    data.tMs = data.wallMs - step.startedMs;
    step[{frame:'frames', event:'events', effect:'effects'}[kind]].push(data);
  });
  await page.addInitScript(installRecorder, { targets, properties: plan.properties || defaultProperties });
  const cdp = await ctx.newCDPSession(page);

  // Never guess a control, force through an overlay, activate a form submission,
  // launch a download, or follow an unreviewed cross-origin/new-window anchor.
  async function checkActivation(loc, action) {
    const result = await loc.evaluate((el, opts) => {
      const link = el.closest('a[href]');
      if (link) {
        if (opts.action !== 'link' && !['down','up','key'].includes(opts.action)) return { error: 'Use link action for navigation' };
        const dst = new URL(link.href);
        if (dst.origin !== opts.origin || !['http:', 'https:'].includes(dst.protocol) || dst.username || dst.password ||
          link.hasAttribute('download') || (link.target && link.target !== '_self')) return { error: 'Unsupported link destination' };
        return { href: dst.href };
      }
      if (opts.action === 'link') return { error: 'Target is not an anchor with href' };
      const control = el.closest('button,summary,[role="button"],[role="tab"],[role="switch"],[role="menuitem"],input[type="button"],input[type="checkbox"],input[type="radio"]');
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true' ||
        (control.form && ['submit','reset','image'].includes(control.type))) return { error: 'Select an enabled, non-submitting UI control' };
      return {};
    }, { action, origin: new URL(url).origin });
    if (result.error) throw new Error(result.error);
    return result.href;
  }

  async function perform(s, step) {
    const loc = s.target && page.locator('css=' + targets[s.target].selector);
    if (loc && s.action !== 'waitFor' && await loc.count() !== 1) throw new Error('Input selector must match exactly one target: ' + targets[s.target].selector);
    let response;
    switch (s.action) {
      case 'visit': case 'direct':
        response = await page.goto(s.action === 'visit' ? url : sameOrigin(s.url), { waitUntil: 'commit' }); break;
      case 'reload': response = await page.reload({ waitUntil: 'commit' }); break;
      case 'back': response = await page.goBack({ waitUntil: 'commit', timeout: 15000 }); break;
      case 'forward': response = await page.goForward({ waitUntil: 'commit', timeout: 15000 }); break;
      case 'wait': break;
      case 'waitFor': await loc.waitFor({ state: 'visible', timeout: 30000 }); break;
      case 'move': await page.mouse.move(s.x, s.y); break;
      case 'wheel':
        for (let i = 0; i < (s.count || 1); i++) {
          if (i && s.intervalMs) await sleep(s.intervalMs);
          await page.mouse.wheel(s.dx || 0, s.dy);
        }
        break;
      case 'hover': await loc.hover(); break;
      case 'focus':
        await loc.focus();
        if (!(await loc.evaluate(el => document.activeElement === el))) throw new Error('Target did not receive focus');
        break;
      case 'key':
        if (loc && !(await loc.evaluate(el => document.activeElement === el))) throw new Error('Explicit keyboard target is not focused');
        if (s.key === 'Enter' || s.key === 'Space') await checkActivation(loc, s.action);
        await page.keyboard.press(s.key); break;
      case 'click': case 'link':
        step.href = await checkActivation(loc, s.action);
        await loc.click({ noWaitAfter: true }); break;
      case 'down': case 'up': {
        await checkActivation(loc, s.action);
        if ((s.action === 'down') === pressed) throw new Error('Unbalanced mouse down/up');
        await loc.hover();
        if (s.action === 'down') await page.mouse.down();
        else await page.mouse.up();
        pressed = s.action === 'down';
        break;
      }
    }
    if (response) {
      step.httpStatus = response.status();
      if (step.httpStatus >= 400) throw new Error('HTTP ' + step.httpStatus);
    }
  }

  async function snapshot(step, prefix, tag, offsetMs) {
    const startedMs = Date.now();
    const screenshot = 'frames/' + prefix + '-' + tag + '.png';
    let fallbackReason;
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(path.join(out, screenshot), Buffer.from(data, 'base64'));
    } catch (err) {
      // A freshly committed document can exist before Chromium has a surface.
      // Let Playwright await the paint; retain both timing and the first error.
      fallbackReason = err.message;
      await page.screenshot({ path: path.join(out, screenshot), timeout: 5000 });
    }
    step.screenshots.push({ path: screenshot, offsetMs, startedMs, finishedMs: Date.now(), url: page.url(), fallbackReason });
    step.screenshot = screenshot;
  }

  async function checkpoint() {
    await writeFile(path.join(out, 'replay.json'), JSON.stringify(report));
  }
  for (const exp of plan.experiments) {
    const experiment = { id: exp.id, category: exp.category, status: 'ok', steps: [] };
    report.experiments.push(experiment);
    for (const [index, s] of exp.steps.entries()) {
      const token = exp.id + '-' + String(index + 1).padStart(2, '0');
      const step = { ...s, status: 'skipped', events: [], frames: [], effects: [], screenshots: [] };
      experiment.steps.push(step);
      if (experiment.status === 'failed') continue;
      // A direct URL from the location bar must load a document even when
      // this tab already has the same path/fragment. Preserve the context cache.
      if (s.action === 'direct' && page.url() !== 'about:blank')
        await page.goto('about:blank', { waitUntil: 'commit' });
      step.startedMs = Date.now();
      step.fromUrl = page.url();
      sinks.set(token, step);
      config = { token, watch: exp.watch };
      try {
        await page.evaluate(cfg => window.__lsfReplay?.start(cfg), config);
        await perform(s, step);
        step.dispatchedMs = Date.now();
        const end = step.dispatchedMs + (s.observeMs ?? 400);
        for (const [i, ms] of [...(s.screenshotsMs || [])].sort((a,b) => a-b).entries()) {
          await sleep(Math.max(0, step.dispatchedMs + ms - Date.now()));
          await snapshot(step, token, 'sample' + (i+1), ms);
        }
        await sleep(Math.max(0, end - Date.now()));
        if (s.screenshot) await snapshot(step, token, 'end', null);
        if (s.expectedUrl || (s.action === 'link' && !s.interrupt)) {
          const expected = s.expectedUrl ? sameOrigin(s.expectedUrl) : step.href;
          if (page.url() !== expected) throw new Error('Expected ' + expected + ', observed ' + page.url());
        }
        if (['back','forward'].includes(s.action) && step.fromUrl === page.url() && !step.events.some(e => e.name === 'popstate'))
          throw new Error('History traversal was not observed');
        if (page.url() !== 'about:blank' && new URL(page.url()).origin !== new URL(url).origin)
          throw new Error('Left the planned origin');
        step.status = 'ok';
      } catch (err) {
        step.error = err.message;
        step.status = experiment.status = 'failed';
        await snapshot(step, token, 'failed', null).catch(() => {});
        if (pressed) {
          // Cancel outside the pressed control before recovery, avoiding a click.
          await page.mouse.move(0, 0).catch(() => {});
          await page.mouse.up().catch(() => {});
          pressed = false;
        }
      } finally {
        config = null;
        await page.evaluate(() => window.__lsfReplay?.finish()).catch(() => {});
        step.toUrl = page.url();
        step.frames.sort((a,b) => a.wallMs - b.wallMs);
        if (!step.frames.length && step.status === 'ok') {
          step.status = experiment.status = 'failed';
          step.error = 'No main-document measurement was delivered';
        }
        const key = { experimentId: exp.id, step: index };
        const direct = await page.evaluate(runtimeDirect).catch(() => null);
        if (direct) report.direct.push({ ...key, ...direct, effects: step.effects });
        const summary = s.action === 'wheel' && summarizeWheel(step);
        report.measured.push({ ...key, ...layerChanges(step), ...(summary?.measured || {}) });
        if (summary?.fitted) report.fitted.push({ ...key, ...summary.fitted });
      }
    }
    await checkpoint();
    console.log(exp.id, experiment.status, experiment.steps.find(s => s.error)?.error || '');
  }
  report.status = report.experiments.every(e => e.status === 'ok') ? 'ok' : 'failed';
  await checkpoint();
  if (report.status !== 'ok') process.exitCode = 1;
} finally { await browser.close(); }
