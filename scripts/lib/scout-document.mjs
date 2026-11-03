/** Browser-side observations. Keep these functions self-contained for page.evaluate(). */
export function discoverDocument() {
  const page = new URL(location.href);
  page.hash = '';
  const sourceUrl = page.href;
  const entries = [];
  const cachedPaths = new Map();
  function path(el) {
    if (!el) return '';
    if (cachedPaths.has(el)) return cachedPaths.get(el);
    const tag = el.localName;
    let result;
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) result = '#' + CSS.escape(el.id);
    else if (!el.parentElement) result = tag;
    else {
      let pos = 1;
      for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.localName === tag) pos++;
      result = path(el.parentElement) + ' > ' + CSS.escape(tag) + ':nth-of-type(' + pos + ')';
    }
    cachedPaths.set(el, result);
    return result;
  }
  const label = e => (e?.getAttribute('aria-label') || e?.getAttribute('title') || e?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  function geometry(el) {
    const {x,y,width,height,top,left,right,bottom} = el.getBoundingClientRect();
    const rendered = width > 0 && height > 0 && (typeof el.checkVisibility === 'function'
      ? el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})
      : getComputedStyle(el).visibility !== 'hidden') && !el.closest('[hidden],[inert]');
    return {rect:{x,y,width,height},rendered,inViewport:rendered && right > 0 && bottom > 0 && left < innerWidth && top < innerHeight};
  }
  function add(kind, element, name, url = sourceUrl, extra = {}) {
    if (element?.matches('a,area')) {
      const {rendered,inViewport} = geometry(element);
      extra = {...extra,rendered,inViewport};
    }
    entries.push({ kind, label: name, url, selector: path(element), sourceUrl, ...extra });
  }
  add('page', document.documentElement, document.title, sourceUrl);
  const sections = new Set(document.querySelectorAll('section,article,header,nav,main,footer,aside,[role="region"],[data-section],[data-section-id]'));
  for (const e of document.querySelectorAll('a[href],area[href]')) {
    let target;
    try { target = new URL(e.getAttribute('href'), document.baseURI); } catch { continue; }
    if (!['http:', 'https:'].includes(target.protocol) || target.origin !== page.origin) {
      // Do not store executable or inline payloads as external URLs.
      if (!['javascript:', 'data:', 'blob:'].includes(target.protocol)) add('external', e, label(e), target.href);
      continue;
    }
    const anchor = target.hash;
    const documentUrl = new URL(target); documentUrl.hash = '';
    if (!anchor || documentUrl.href !== sourceUrl) add('page', e, label(e), documentUrl.href);
    if (!anchor) continue;
    let targetEl = null;
    if (documentUrl.href === sourceUrl) {
      let id = anchor.slice(1);
      try { id = decodeURIComponent(id); } catch { /* preserve the literal fragment */ }
      targetEl = document.getElementById(id) || document.getElementsByName(id)[0];
    }
    const targetBox = targetEl ? geometry(targetEl) : null;
    add('anchor', e, label(e), target.href, { targetSelector:path(targetEl), targetInView:targetBox?.inViewport ?? false, targetRect:targetBox?.rect ?? null });
    if (targetEl) sections.add(targetEl);
  }
  // A site can divide scroll chapters with plain divs and headings.
  for (const h of document.querySelectorAll('h1,h2')) {
    const nearest = h.closest('section,article,header,footer,aside,[role="region"],[data-section],[data-section-id]');
    if (!nearest && h.parentElement) sections.add(h.parentElement);
  }
  if (!document.querySelector('section,article,[role=region],h1,h2')) {
    // Some visual sites use only anonymous divs for each full-height panel.
    let container = document.querySelector('main') || document.body;
    while (container) {
      const panels = [...container.children].filter(el => el.getBoundingClientRect().height >= innerHeight / 4);
      if (panels.length !== 1) { panels.forEach(el => sections.add(el)); break; }
      container = panels[0];
      if (!container.children.length) sections.add(container);
    }
  }
  for (const el of sections) {
    const title = label(el.querySelector('h1,h2,h3,[role=heading]')) || el.getAttribute('aria-label') || el.id || el.localName;
    add('section', el, title, sourceUrl, { domId:el.id || null, ...geometry(el), top: Math.round(el.getBoundingClientRect().top + scrollY), shape: el.localName + ' > ' + [...el.children].slice(0, 10).map(c=>c.localName).join(' + ') });
  }
  const candidates = 'button,summary,select,input:not([type=hidden]),textarea,[role=button],[role=tab],[role=switch],[role=combobox],[aria-expanded],[aria-haspopup],[aria-controls]';
  for (const el of document.querySelectorAll(candidates)) {
    add('control', el, label(el) || el.getAttribute('placeholder') || el.name || el.localName, sourceUrl, {
      role: el.getAttribute('role') || el.localName, controls: el.getAttribute('aria-controls'), expanded: el.getAttribute('aria-expanded')
    });
  }
  for (const el of document.querySelectorAll('dialog,[role=dialog],[role=alertdialog],[role=menu],[aria-modal=true],[popover]')) {
    add('overlay', el, el.getAttribute('aria-label') || el.id || el.localName, sourceUrl, { rendered: !!el.getClientRects().length });
  }
  return {
    url:location.href, title:document.title, sourceUrl, viewport:{width:innerWidth,height:innerHeight},
    devicePixelRatio, zoom:visualViewport?.scale, focus:path(document.activeElement),
    scroll:{x:scrollX,y:scrollY,height:document.documentElement.scrollHeight}, entries
  };
}

export function componentTree({ selector, limit, allStyles }) {
  const roots = [...document.querySelectorAll(selector)];
  const styles = [];
  const styleIds = new Map();
  const props = ('display position inset z-index visibility opacity overflow overflow-x overflow-y box-sizing width height min-width min-height max-width max-height aspect-ratio margin padding border border-radius box-shadow background-color background-image background-size background-position background-repeat color font-family font-weight font-size font-style font-variation-settings line-height letter-spacing text-align text-transform text-decoration white-space writing-mode gap flex flex-flow justify-content align-items align-self grid-template-columns grid-template-rows grid-auto-flow place-items object-fit object-position transform transform-origin perspective filter backdrop-filter clip-path mask-image mix-blend-mode pointer-events cursor transition animation animation-timeline content fill stroke stroke-width').split(' ');
  function styleId(style) {
    const record = Object.fromEntries((allStyles ? [...style] : props).map(p => [p, style.getPropertyValue(p)]));
    const key = JSON.stringify(record);
    if (!styleIds.has(key)) { styleIds.set(key, styles.length); styles.push(record); }
    return styleIds.get(key);
  }
  let nodes = 0, truncated = false;
  function walk(el) {
    if (nodes >= limit) { truncated = true; return null; }
    nodes++;
    const tag = el.localName, css = getComputedStyle(el);
    const rect = el.getBoundingClientRect().toJSON();
    const attrs = {};
    for (const a of el.attributes) {
      if (!/^on/i.test(a.name) && !['nonce','value','srcdoc'].includes(a.name)) attrs[a.name] = a.value;
    }
    const pseudo = {};
    for (const name of ['::before', '::after']) {
      const style = getComputedStyle(el, name);
      pseudo[name] = ['normal','none'].includes(style.content) ? { content: style.content } : { style: styleId(style), content: style.content };
    }
    const result = { tag, attrs, rect, style: styleId(css), pseudo, children: [] };
    if (el.currentSrc) result.currentSrc = el.currentSrc;
    if (el.matches('script,style,textarea,template,noscript')) return result;
    // Text nodes are interleaved with elements so inline structure and reading order survive.
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) result.children.push(n.textContent);
      if (n.nodeType === Node.ELEMENT_NODE) {
        const child = walk(n);
        if (!child) break;
        result.children.push(child);
      }
    }
    if (el.shadowRoot) result.openShadowChildren = [...el.shadowRoot.children].map(walk).filter(Boolean);
    if (tag === 'iframe') result.frameBoundary = el.src || 'about:blank';
    return result;
  }
  const trees = roots.map(walk).filter(Boolean);
  return { selector, matched: roots.length, nodes, limit, truncated, scrollX, scrollY, viewport: {width: innerWidth, height: innerHeight}, styleProperties: allStyles ? 'all' : props, styles, trees };
}

export function resourceInventory(networkCss = []) {
  const assets = [], stylesheets = [];
  for (const e of document.querySelectorAll('img,video,audio,source,track,object,embed,iframe,svg use,svg image,link[rel~=preload],link[rel=icon]')) {
    const attrs = {};
    for (const k of ['src','srcset','sizes','poster','data','href','xlink:href','type','media','as']) if (e.hasAttribute(k)) attrs[k] = e.getAttribute(k);
    assets.push({tag: e.localName, ...attrs, currentSrc: e.currentSrc || null, baseURI: e.baseURI});
  }
  function walkSheet(sheet) {
    const entry = { url: sheet.href, media: sheet.media?.mediaText, disabled: sheet.disabled, variables: [], mediaRules: [], keyframes: [], fontFaces: [], imports: [] };
    stylesheets.push(entry);
    if (sheet.ownerNode?.localName === 'style') entry.rawInlineCss = sheet.ownerNode.textContent;
    function walk(rules) {
      for (const r of rules) {
        if (r.type === CSSRule.MEDIA_RULE) entry.mediaRules.push({query:r.conditionText, matches: matchMedia(r.conditionText).matches});
        if (r.type === CSSRule.KEYFRAMES_RULE) entry.keyframes.push({name:r.name, css:r.cssText});
        if (r.type === CSSRule.FONT_FACE_RULE) entry.fontFaces.push(r.cssText);
        if (r.type === CSSRule.IMPORT_RULE) {
          entry.imports.push(r.href);
          if (r.styleSheet) walkSheet(r.styleSheet);
        }
        if (r.style) for (const p of r.style) if (p.startsWith('--')) entry.variables.push({ selector:r.selectorText || r.keyText, name:p, value:r.style.getPropertyValue(p) });
        if (r.cssRules) walk(r.cssRules);
      }
    }
    try {
      const rules = sheet.cssRules;
      entry.ruleCount = rules.length;
      if (sheet.href && !networkCss.some(source=>source.url===sheet.href)) entry.cssomText = [...rules].map(r=>r.cssText).join('\n');
      if (!sheet.ownerNode && !sheet.href) entry.constructedCss = [...rules].map(r => r.cssText).join('\n');
      walk(rules);
    } catch (error) { entry.cssomError = String(error); }
  }
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) walkSheet(sheet);
  for (const sheet of stylesheets.filter(s => s.cssomError)) {
    const source = networkCss.find(s => s.url === sheet.url);
    if (!source) continue;
    // Parse the observed response without attaching it to the live page. The raw file also preserves @imports.
    try {
      const decoded = new CSSStyleSheet();
      decoded.replaceSync(source.body);
      walkSheet(decoded);
      const parsed = stylesheets.pop();
      delete parsed.constructedCss;
      sheet.networkRules = parsed;
      sheet.networkSource = source.file;
    } catch (error) { sheet.networkParseError = String(error); }
  }
  const fonts = [...document.fonts].map(({family,style,weight,stretch,status}) => ({family,style,weight,stretch,status}));
  return { baseURI: document.baseURI, assets, fonts, stylesheets, resources: performance.getEntriesByType('resource').map(({name,initiatorType,duration,transferSize}) => ({url:name, initiatorType,duration,transferSize})) };
}
