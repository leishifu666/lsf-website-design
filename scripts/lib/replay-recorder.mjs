// Runs in the main document, including newly committed documents. Data is streamed to
// the runner so a navigation does not erase exit frames from the previous document.
export function installRecorder({ targets, properties }) {
  if (window !== window.top || window.__lsfReplay) return;
  let current = null;
  let raf = 0;
  let ticks = 0;
  let lastSample = 0;
  let clockStart = 0;
  const pending = new Set();
  let effects = new WeakMap(), nextEffect = 1;
  function emit(item) {
    const delivery = window.__lsfReplayEmit(current.token, item);
    pending.add(delivery);
    delivery.finally(() => pending.delete(delivery)).catch(() => {});
  }

  function layer(el, selector, pseudo, fields) {
    const css = getComputedStyle(el, pseudo);
    const style = Object.fromEntries(fields.map(key => [key, css.getPropertyValue(key)]));
    if (pseudo) return { selector, style, rect: null, content: css.content };
    const { x, y, width, height } = el.getBoundingClientRect();
    const state = Object.fromEntries(['aria-expanded', 'aria-selected', 'aria-hidden', 'aria-current', 'hidden', 'open']
      .filter(k => el.hasAttribute(k)).map(k => [k, el.getAttribute(k)]));
    return { selector, tag: el.localName, rect: { x, y, width, height }, scrollTop: el.scrollTop,
      style, state, focused: el === document.activeElement, hovered: el.matches(':hover') };
  }

  function capture(reason) {
    if (!current) return;
    const layers = {};
    for (const id of current.watch) {
      const spec = targets[id];
      const matches = document.querySelectorAll(spec.selector);
      if (matches.length !== 1) {
        layers[id] = { selector: spec.selector, matches: matches.length };
        continue;
      }
      const el = matches[0];
      const fields = spec.properties || properties;
      layers[id] = layer(el, spec.selector, null, fields);
      if (spec.animations) layers[id].animations = animations(el,id);
      for (const pseudo of spec.pseudos || []) {
        layers[id + pseudo] = layer(el, spec.selector + pseudo, pseudo, fields);
      }
      for (const [key, selector] of Object.entries(spec.children || {})) {
        const children = el.querySelectorAll(selector);
        layers[id + '/' + key] = children.length === 1
          ? layer(children[0], selector, null, fields) : { selector, matches: children.length };
        if (children.length === 1 && spec.animations)
          layers[id + '/' + key].animations = animations(children[0], id + '/' + key);
      }
    }
    const now = performance.now();
    emit({ kind: 'frame', wallMs: performance.timeOrigin + now, url: location.href,
      documentStartMs: performance.timeOrigin, reason, scroll: { x: scrollX, y: scrollY }, layers });
    lastSample = now;
  }

  function animations(el, layerId) {
    return el.getAnimations().map(animation => {
      const effect = animation.effect;
      if (!effects.has(animation)) {
        const id = nextEffect++;
        effects.set(animation, id);
        const timing = effect?.getTiming?.();
        if (timing?.iterations === Infinity) timing.iterations = 'Infinity';
        emit({ kind: 'effect', id, layerId, documentStartMs: performance.timeOrigin,
          wallMs: performance.timeOrigin + performance.now(), url: location.href,
          type: animation.constructor.name, name: animation.animationName || animation.transitionProperty || animation.id,
          pseudo: effect?.pseudoElement || null, timing, keyframes: effect?.getKeyframes?.() });
      }
      return { id: effects.get(animation), state: animation.playState,
        timeMs: Number.isFinite(animation.currentTime) ? animation.currentTime : null,
        progress: effect?.getComputedTiming?.().progress ?? null };
    });
  }

  function tick() {
    const elapsed = performance.now() - clockStart;
    // Keep the first rendered frames individually; decimate only the later tail.
    const interval = ticks < 8 ? 0 : elapsed < 1000 ? 40 : 150;
    if (performance.now() - lastSample >= interval) capture('raf');
    ticks++;
    raf = requestAnimationFrame(tick);
  }

  function start(config) {
    cancelAnimationFrame(raf);
    current = config;
    if (!config) return;
    effects = new WeakMap();
    clockStart = performance.now();
    ticks = 0;
    capture('baseline');
    raf = requestAnimationFrame(tick);
  }

  for (const name of ['wheel', 'pointermove', 'pointerover', 'pointerout', 'pointerdown', 'pointerup',
    'click', 'focusin', 'keydown', 'keyup', 'hashchange', 'popstate', 'pagehide', 'pageshow', 'DOMContentLoaded', 'load']) {
    window.addEventListener(name, event => {
      if (!current || !event.isTrusted) return;
      const { clientX, clientY, deltaX, deltaY, key } = event;
      emit({ kind: 'event', name, wallMs: performance.timeOrigin + performance.now(),
        url: location.href, clientX, clientY, deltaX, deltaY, key,
        target: event.target?.localName, targetId: event.target?.id || undefined });
      clockStart = performance.now();
      ticks = 0;
      if (name === 'pagehide' || name === 'pointerdown' || name === 'keydown') capture(name);
    }, { capture: true, passive: true });
  }

  let explicitlyConfigured = false;
  window.__lsfReplay = { start(config) {
    explicitlyConfigured = true;
    start(config);
  }, async finish() {
    explicitlyConfigured = true;
    capture('end');
    start(null);
    await Promise.allSettled([...pending]);
  } };
  window.__lsfReplayConfig().then(config => {
    if (!explicitlyConfigured && config) start(config);
  }).catch(() => {});
}

// Values reported by a live API or the CSS engine. These are distinct from a
// frame-derived onset or fitted curve. Absent runtime globals stay absent.
export function runtimeDirect() {
  const st = window.ScrollTrigger || window.gsap?.core?.globals?.()?.ScrollTrigger;
  const lenis = window.lenis || window.__lenis;
  const primitives = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, value]) =>
    typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)));
  return { url: location.href, wallMs: performance.timeOrigin + performance.now(),
    readyState: document.readyState, devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    gsapVersion: window.gsap?.version || null,
    scrollTriggers: st?.getAll?.().map(t => ({ id: t.vars.id || null, start: t.start, end: t.end,
      scrub: t.vars.scrub ?? null, pin: !!t.pin })) ?? null,
    lenisOptions: lenis?.options ? primitives(lenis.options) : null,
    canvases: [...document.querySelectorAll('canvas')].map(el => ({ width: el.width, height: el.height,
      internalState: null })) };
}
