import assert from 'node:assert/strict';

export const categories = ['load', 'scroll', 'hover', 'pointer', 'component', 'navigation'];
const actions = ['visit', 'reload', 'direct', 'wait', 'waitFor', 'wheel', 'move', 'hover', 'down', 'up',
  'focus', 'key', 'click', 'link', 'back', 'forward'];
const targetActions = ['waitFor', 'hover', 'down', 'up', 'focus', 'click', 'link'];
const safeKeys = ['Escape', 'Tab', 'Shift+Tab', 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
export const defaultProperties = ['opacity', 'transform', 'translate', 'scale', 'rotate', 'color',
  'background-color', 'clip-path', 'filter', 'visibility', 'display', 'width', 'height', 'inset', 'pointer-events', 'transition-property',
  'transition-duration', 'transition-delay', 'transition-timing-function', 'animation-name', 'animation-duration'];
export const sided = (value, side) => typeof value === 'string' ? value : value?.[side];
const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(id);
function bounded(value, min, max, name) {
  assert(Number.isFinite(value) && value >= min && value <= max, name + ' out of range');
}
function props(fields) {
  assert(Array.isArray(fields) && fields.length && fields.every(k => /^[a-z-][a-z0-9-]*$/.test(k)), 'invalid CSS properties');
}
export function resolvePlan(plan, side) {
  assert(['reference', 'implementation'].includes(side), 'side must be reference or implementation');
  const url = new URL(plan.urls[side]);
  assert(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'use a public or local HTTP(S) origin');
  const { width, height } = plan.viewport;
  bounded(width, 100, 8192, 'width');
  bounded(height, 100, 8192, 'height');
  assert(Number.isInteger(width) && Number.isInteger(height), 'viewport needs integer dimensions');
  if (plan.properties) props(plan.properties);
  const targets = Object.fromEntries(Object.entries(plan.targets).map(([id, target]) => {
    assert(validId(id), 'invalid target id');
    const selector = sided(target.selector, side);
    assert(typeof selector === 'string' && selector.trim(), 'missing selector: ' + id);
    const children = Object.fromEntries(Object.entries(target.children || {}).map(([name, value]) => {
      const css = sided(value, side);
      assert(validId(name) && typeof css === 'string' && css.trim(), 'invalid child selector: ' + name);
      return [name, css];
    }));
    if (target.properties) props(target.properties);
    assert(!target.pseudos || target.pseudos.every(p => ['::after', '::before'].includes(p)), 'unsupported pseudo');
    return [id, { ...target, selector, children }];
  }));
  function sameOrigin(value) {
    const dest = new URL(sided(value, side), url);
    assert(sided(value, side)?.trim() && dest.origin === url.origin && !dest.username && !dest.password, 'expected same-origin URL');
    return dest.href;
  }
  const ids = new Set();
  assert(plan.experiments?.length, 'no experiments');
  for (const exp of plan.experiments) {
    assert(validId(exp.id) && !ids.has(exp.id) && categories.includes(exp.category), 'invalid experiment: ' + exp.id);
    ids.add(exp.id);
    assert(exp.watch?.length && exp.watch.every(id => Object.hasOwn(targets, id)), 'invalid watch list');
    assert(exp.steps?.length, 'missing steps');
    for (const [index, s] of exp.steps.entries()) {
      assert(actions.includes(s.action), 'unknown action: ' + s.action);
      if (targetActions.includes(s.action) || s.target) assert(Object.hasOwn(targets, s.target), 'missing explicit target: ' + s.action);
      if (s.action === 'direct') sameOrigin(s.url);
      if (s.expectedUrl) sameOrigin(s.expectedUrl);
      if (s.interrupt) {
        assert(s.action === 'link' && !s.expectedUrl && ['back','link','direct'].includes(exp.steps[index + 1]?.action),
          'interrupted link must be followed by explicit navigation in the same experiment');
      }
      if (s.action === 'move') { bounded(s.x, 0, width - 1, 'x'); bounded(s.y, 0, height - 1, 'y'); }
      if (s.action === 'wheel') {
        bounded(s.dy, -10000, 10000, 'dy');
        bounded(s.dx ?? 0, -10000, 10000, 'dx');
        if (s.count !== undefined) assert(Number.isInteger(s.count) && s.count > 0 && s.count <= 100, 'invalid wheel count');
        bounded(s.intervalMs ?? 0, 0, 5000, 'intervalMs');
      }
      if (s.action === 'key') {
        assert(safeKeys.includes(s.key), 'unsupported key');
        if (['Space', 'Enter'].includes(s.key)) assert(s.target, 'activation key needs explicit focused target');
      }
      bounded(s.observeMs ?? 400, 0, 60000, 'observeMs');
      assert(!s.screenshotsMs || (s.screenshotsMs.length <= 10 && s.screenshotsMs.every(ms =>
        Number.isFinite(ms) && ms >= 0 && ms <= (s.observeMs ?? 400))), 'screenshotsMs outside observation window');
    }
  }
  assert(['visit','direct'].includes(plan.experiments[0].steps[0].action), 'start with visit or direct in a fresh context');
  return { url: url.href, targets, sameOrigin };
}

// Fit only a single monotone wheel response with a stationary tail. The finite
// observation endpoint is not a source parameter. Interrupted or undersampled
// traces remain unfitted. The fit is anchored at the observed input event.
export function summarizeWheel(step) {
  const events = step.events.filter(e => e.name === 'wheel');
  if (events.length !== 1) return null;
  const event = events[0];
  const before = step.frames.filter(f => f.wallMs <= event.wallMs).at(-1);
  const after = step.frames.filter(f => f.wallMs > event.wallMs);
  if (!before || after.length < 2 || after.some(f => f.documentStartMs !== before.documentStartMs)) return null;
  const y0 = before.scroll.y, yEnd = after.at(-1).scroll.y, d = yEnd - y0;
  const samples = after.map(f => ({ t: f.wallMs - event.wallMs, y: f.scroll.y }));
  const first = samples.find(s => s.y !== y0);
  const measured = { startY: y0, lastObservedY: yEnd, deltaY: d,
    firstChangedByMs: first?.t ?? null, observationMs: samples.at(-1).t, sampleCount: samples.length };
  if (Math.abs(d) < 4 || samples.some((s, i) => i && (s.y - samples[i-1].y) * Math.sign(d) < -1)) return { measured };
  const tail = samples.filter(s => samples.at(-1).t - s.t <= 220);
  if (tail.length < 2 || tail.at(-1).t - tail[0].t < 100 || tail.some(s => Math.abs(s.y - yEnd) > 1)) return { measured };
  const usable = samples.map(s => ({ t: s.t, fraction: (s.y - y0) / d }))
    .filter(s => s.fraction >= 0.05 && s.fraction <= 0.95);
  if (usable.length < 4) return { measured };
  const rate = -usable.reduce((n, s) => n + s.t * Math.log(1 - s.fraction), 0) / usable.reduce((n, s) => n + s.t*s.t, 0);
  const rmsPx = Math.sqrt(usable.reduce((n, s) => n + (d * (s.fraction - (1 - Math.exp(-rate*s.t))))**2, 0) / usable.length);
  return { measured, fitted: { model: 'y0 + observedDelta * (1 - exp(-t/tau))', tauMs: 1/rate,
    rmsPx, samplesUsed: usable.length, endpoint: 'last observed scrollY' } };
}

// The onset lies between two observed frames. Compare the same document and
// layer, and report sampling bounds rather than a guessed exact duration.
export function layerChanges(step) {
  const trigger = { wheel: 'wheel', move: 'pointermove', hover: 'pointerover', down: 'pointerdown',
    up: 'pointerup', key: 'keydown', click: 'click', link: 'click', focus: 'focusin' }[step.action];
  const event = trigger && step.events.find(e => e.name === trigger);
  const anchorMs = event?.wallMs ?? step.startedMs;
  const documents = new Map();
  for (const f of step.frames) {
    if (f.url === 'about:blank') continue;
    if (!documents.has(f.documentStartMs)) documents.set(f.documentStartMs, []);
    documents.get(f.documentStartMs).push(f);
  }
  if (!documents.size) return null;
  const segments = [...documents.values()].map(frames => ({
    url: frames[0].url, documentStartMs: frames[0].documentStartMs, changes: documentChanges(frames, anchorMs)
  }));
  const primary = ['visit','reload','direct'].includes(step.action) ? segments.at(-1) : segments[0];
  return { anchor: event?.name ?? 'step-start', anchorMs, changes: primary.changes,
    ...(segments.length > 1 ? { documents: segments } : {}) };
}

function documentChanges(frames, anchorMs) {
  const before = frames.filter(f => f.wallMs <= anchorMs).at(-1) || frames[0];
  const changes = {};
  const prior = new Map(Object.entries(before.layers));
  let lastMs = before.wallMs;
  for (const frame of frames) {
    if (frame.wallMs <= before.wallMs) continue;
    for (const [id, value] of Object.entries(frame.layers)) {
      const old = prior.get(id);
      if (!old) continue;
      const changed = [];
      for (const k of ['rect', 'state', 'matches', 'focused', 'hovered','scrollTop','content']) {
        if (JSON.stringify(old[k]) !== JSON.stringify(value[k])) changed.push(k);
      }
      for (const k of Object.keys(value.style || {}))
        if (old.style?.[k] !== value.style[k]) changed.push('style.' + k);
      for (const k of changed) {
        changes[id] ??= {};
        const t = frame.wallMs - anchorMs;
        if (!changes[id][k]) changes[id][k] = { firstBetweenMs: [lastMs - anchorMs, t], lastChangedByMs: t };
        else changes[id][k].lastChangedByMs = t;
      }
      prior.set(id, value);
    }
    lastMs = frame.wallMs;
  }
  return changes;
}
