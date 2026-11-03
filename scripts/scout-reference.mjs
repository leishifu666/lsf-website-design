import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { componentTree, discoverDocument, resourceInventory } from './lib/scout-document.mjs';

const help = `node scripts/scout-reference.mjs <url> <outDir> [--selector CSS] [--actions steps.json]
  Requires the existing scripts/package.json Playwright dependency and a Chromium browser.
  Write one capture at a time to each outDir; --label keeps runs distinguishable.
  --source URL           original reference entry when supplementing another same-origin page
  --width N --height N   CSS viewport, default 1440 × 900
  --label NAME           capture label (unique run folder is always retained)
  --selector CSS         repeatable; measures subtree, pseudo-elements, box and element crop
  --max-nodes N          cap per selector (default 500; truncation explicitly recorded)
  --all-styles           store every computed CSS property in selected subtrees
  --ready CSS            wait for visible element on entry; failures retain observations
  --sweep N              probe document scroll positions after capture, 0–24 (default 5)
  --settle N             wait after navigation/action, milliseconds (default 600)
  Actions JSON example:
  [{"action":"click","selector":"#open","label":"menu-open","inspect":["#menu"]},
   {"action":"click","selector":"#chapter-link"},{"action":"back"}]
  Supported: click, hover, back, goto (url), scroll (y), wait (ms), press (Escape/Tab/Arrow keys).
  Optional step.ready waits for a visible CSS target. Discovery alone does not verify an interaction.
  Output: topology.json (union), runs/<run>/run.json and states/<step>/{manifest,discovery,components,resources,network}.json, viewport.png, crop-*.png, css/.
`;
const {values, positionals} = parseArgs({
  allowPositionals: true, options: {help:{type:'boolean'}, source:{type:'string'}, width:{type:'string'},height:{type:'string'},label:{type:'string'},
    selector:{type:'string',multiple:true},actions:{type:'string'},ready:{type:'string'},sweep:{type:'string'},settle:{type:'string'},
    'max-nodes':{type:'string'}, 'all-styles':{type:'boolean'}}
});
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,12);
const slug = value => value.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,50) || 'capture';
const message = e => String(e?.message || e);
function num(value, fallback, min, max, field) {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw Error(field + ' must be an integer in [' + min + ',' + max + ']');
  return n;
}
function http(value, base) {
  const url = new URL(value, base);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error('Expected public HTTP(S) URL');
  return url;
}
const pageIdentity = url => { const u = new URL(url); u.hash = ''; return u.href; };
async function json(file, value) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}
async function previousTopology(file) {
  try { return JSON.parse(await readFile(file,'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function normalizeEntries(raw) {
  const result = new Map();
  const groups = new Map();
  for (const entry of raw.entries) {
    const destination = ['page','anchor','external'].includes(entry.kind);
    const id = entry.kind + '-' + hash(entry.sourceUrl + '\n' + (destination ? entry.url : entry.selector));
    const existing = result.get(id);
    const source = destination ? {selector:entry.selector,label:entry.label,rendered:entry.rendered,inViewport:entry.inViewport} : null;
    if (existing) {
      if (source) {
        existing.linkSources.push(source);
        // A hidden mobile menu can precede the desktop link to the same chapter.
        if ((!existing.inViewport && entry.inViewport) || (!existing.rendered && entry.rendered)) Object.assign(existing,entry);
      }
      continue;
    }
    result.set(id, { id, ...entry, ...(source ? {linkSources:[source]} : {}) });
    if (entry.kind === 'page' && entry.url !== raw.sourceUrl) {
      const u = new URL(entry.url);
      const family = u.pathname.replace(/[^/]+\/?$/, '*');
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(id);
    }
    if (entry.kind === 'section' && entry.shape) {
      const family = 'DOM ' + entry.shape;
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(id);
    }
  }
  for (const [family,members] of groups) {
    if (members.length < 2) continue;
    const id = 'template-' + hash(raw.sourceUrl + '\n' + family);
    result.set(id, {id, kind:'template', label:family, url:raw.sourceUrl, sourceUrl:raw.sourceUrl, selector:'', members, basis:'candidate from repeated DOM shape or URL path; inspect representative before reuse'});
  }
  return [...result.values()];
}
const sensitive = /(?:\b(?:sign\s*out|logout|delete|unsubscribe|purchase|checkout|pay|send|submit|order\s+now|confirm\s+order|remove\s+account|add\s+to\s+cart)\b|购买|付款|支付|提交|发送|删除|注销|退出登录)/i;
async function applyAction(page, step, origin) {
  const locator = step.selector ? page.locator(step.selector) : null;
  switch (step.action) {
    case 'click': {
      const facts = await locator.evaluate(el => {
        const a = el.closest('a,area');
        const c = el.closest('button,input,textarea,select,[role=button]') || el;
        return {href:a?.href, download:!!a?.hasAttribute('download'), target:a?.target,
          form:!!(el.closest('form') || c.form), input:c.matches('input,textarea,select,[contenteditable=true]'),
          text:[c.innerText,c.getAttribute('aria-label'),c.getAttribute('title')].filter(Boolean).join(' ')};
      });
      const dest = facts.href ? http(facts.href) : null;
      const localFragment = dest?.hash && pageIdentity(dest.href) === pageIdentity(page.url());
      if (facts.form || facts.input || facts.download || (facts.target && facts.target !== '_self') ||
        (dest && dest.origin !== origin) || (!localFragment && (sensitive.test(facts.text) || sensitive.test(facts.href || '')))) {
        throw Error('Skipped potentially mutating/form, external or new-window action: ' + step.selector);
      }
      return locator.click({timeout:6000});
    }
    case 'hover': return locator.hover({timeout:6000});
    case 'goto': {
      if (typeof step.url !== 'string' || !step.url.trim()) throw Error('goto needs a URL');
      const target = http(step.url,page.url());
      if (target.origin !== origin || sensitive.test(target.pathname)) throw Error('Unsafe or out-of-origin goto');
      const response = await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:45000});
      if (response && response.status() >= 400) throw Error('HTTP ' + response.status());
      return;
    }
    case 'back': {
      const before = page.url();
      const response = await page.goBack({waitUntil:'domcontentloaded',timeout:20000});
      if (!response && page.url() === before) throw Error('No observable history return');
      return;
    }
    case 'scroll': return page.evaluate(y => scrollTo({top:y,behavior:'instant'}),num(step.y,undefined,0,10000000,'y'));
    case 'wait': return page.waitForTimeout(num(step.ms,undefined,0,30000,'ms'));
    case 'press':
      if (!['Escape','Tab','Shift+Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(step.key)) throw Error('Unsupported key');
      return page.keyboard.press(step.key);
    default: throw Error('Unsupported action: ' + step.action);
  }
}
async function main() {
  if (values.help) { console.log(help); return; }
  if (positionals.length !== 2) throw Error(help);
  const url = http(positionals[0]);
  const sourceUrl = pageIdentity(http(values.source || url.href).href);
  const origin = new URL(sourceUrl).origin;
  if (url.origin !== origin) throw Error('Supplemental page must share the reference origin');
  const out = path.resolve(positionals[1]);
  const topologyFile = path.join(out,'topology.json');
  const previous = await previousTopology(topologyFile);
  if (previous && (previous.sourceUrl !== sourceUrl || previous.kind !== 'reference-discovery')) throw Error('Output belongs to a different reference; use --source for the original entry or choose another directory');
  const width = num(values.width,1440,200,10000,'width'), height = num(values.height,900,200,10000,'height');
  const settle = num(values.settle,600,0,30000,'settle'), sweep = num(values.sweep,5,0,24,'sweep');
  const limit = num(values['max-nodes'],500,1,20000,'max-nodes');
  const actions = values.actions ? JSON.parse((await readFile(values.actions,'utf8')).replace(/^\uFEFF/,'')) : [];
  if (!Array.isArray(actions)) throw Error('actions must be a JSON array');
  const runId = new Date().toISOString().replace(/[:.]/g,'-') + '-' + slug(values.label || 'scout') + '-' + randomUUID().slice(0,8);
  const runPath = 'runs/' + runId;
  const root = path.join(out,runPath);
  const cssDir = path.join(root,'css');
  await mkdir(cssDir,{recursive:true});
  const run = {runId,sourceUrl,requestedUrl:url.href,viewport:{width,height},started:new Date().toISOString(),status:'running',states:[],warnings:[]};
  run.settings = {ready:values.ready || null,settleMs:settle,sweep,maxNodes:limit,allStyles:!!values['all-styles'],selectors:values.selector || []};
  const runLog = () => json(path.join(root,'run.json'),run);
  await runLog();
  let browser;
  try {
    const {launch} = await import('./lib/browser.mjs');
    browser = await launch();
    const context = await browser.newContext({viewport:{width,height},acceptDownloads:false,serviceWorkers:'block'});
    const page = await context.newPage();
    page.setDefaultTimeout(6500);
    const network = [], cssJobs = new Set(), cssBodies = new Map();
    let mainResponse = null;
    context.on('request',r => network.push({event:'request',type:r.resourceType(),method:r.method(),url:r.url()}));
    context.on('requestfailed',r => network.push({event:'failed',type:r.resourceType(),url:r.url(),error:r.failure()?.errorText}));
    context.on('response',r => {
      const item = {event:'response',url:r.url(),type:r.request().resourceType(),status:r.status()};
      network.push(item);
      if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) {
        mainResponse = {url:r.url(),status:r.status()};
      }
      if (item.type !== 'stylesheet') return;
      const job = (async () => {
        try {
          if (!r.ok()) throw Error('HTTP ' + item.status);
          const body = await r.body();
          item.cssFile = 'css/' + hash(body) + '.css';
          await writeFile(path.join(root,item.cssFile),body);
          cssBodies.set(item.url,{url:item.url,file:item.cssFile,body:body.toString('utf8')});
        } catch(e) { item.cssError = message(e); }
      })();
      cssJobs.add(job); job.finally(() => cssJobs.delete(job));
    });
    await context.route('**/*', async route => {
      const r = route.request();
      const foreignDocument = r.isNavigationRequest() && new URL(r.url()).origin !== origin;
      // Keep iframe media readable; never follow an external top-level action.
      let topLevel = false;
      if (foreignDocument) {
        try { topLevel = !r.frame().parentFrame(); }
        catch { topLevel = true; } // A new window's initial document may not yet have a frame.
      }
      if (topLevel || !['GET','HEAD','OPTIONS'].includes(r.method()) || (r.isNavigationRequest() && sensitive.test(new URL(r.url()).pathname))) {
        network.push({event:'blocked',url:r.url(),method:r.method(),reason:topLevel?'external navigation':'read-only guard'});
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => {
      network.push({event:'blocked',url:socket.url(),type:'websocket',reason:'read-only guard'});
      return socket.close();
    });
    page.on('dialog',dialog => dialog.dismiss().catch(() => {}));
    context.on('page',other => { if (other !== page) other.close().catch(() => {}); });
    const allEntries = new Map((previous?.entries || []).map(e=>[e.id,e]));
    const allStates = [...(previous?.states || [])];
    async function checkpoint() {
      const topo = {kind:'reference-discovery',schemaVersion:1,status:'discovered',sourceUrl,runId,viewport:{width,height},entries:[...allEntries.values()],states:allStates};
      await json(path.join(root,'topology.json'),topo);
      await json(topologyFile,topo);
      await runLog();
    }
    async function capture(step, actionError=null) {
      const index = run.states.length;
      const short = String(index).padStart(3,'0') + '-' + slug(step.label || step.action);
      const statePath = runPath + '/states/' + short;
      const dir = path.join(out,statePath);
      await mkdir(dir,{recursive:true});
      const state = {id:runId + '/' + short,path:statePath,url:page.url(),action:step,status:'capturing',viewport:{width,height},files:[],errors:[]};
      if (actionError) state.errors.push({phase:'action-or-ready',error:message(actionError)});
      run.states.push(state);
      const log = () => json(path.join(dir,'manifest.json'),state);
      await log(); await runLog();
      async function part(name, fn) {
        try {
          await fn(path.join(dir,name)); state.files.push(name);
        } catch(e) { state.errors.push({phase:name,error:message(e)}); }
        await log();
      }
      if (mainResponse && pageIdentity(state.url) === pageIdentity(mainResponse.url)) {
        state.documentResponse = mainResponse;
        if (mainResponse.status >= 400) state.errors.push({phase:'document',error:'HTTP ' + mainResponse.status});
      }
      if (page.url().startsWith(origin + '/') && !(state.documentResponse?.status >= 400) && !step.httpError) {
        await part('discovery.json',async f => {
          const snapshot = await page.evaluate(discoverDocument);
          snapshot.entries = normalizeEntries(snapshot);
          await json(f,snapshot);
          const summary = {id:state.id,url:snapshot.url,path:state.path,viewport:snapshot.viewport};
          allStates.push(summary);
          for (const entry of snapshot.entries) {
            const old = allEntries.get(entry.id);
            if (old && entry.members) entry.members = [...new Set([...old.members,...entry.members])];
            allEntries.set(entry.id,{...entry,seenIn:[...new Set([...(old?.seenIn || []),state.id])]});
          }
          await checkpoint();
        });
        if (step.action !== 'sweep') {
          await part('viewport.png',f=>page.screenshot({path:f,timeout:12000}));
          const selectors = [...new Set([...(values.selector || []),...(step.inspect || [])])];
          if (!selectors.length) {
            selectors.push('h1','button:enabled','canvas,video');
            if (!await page.locator(selectors.join(',')).count()) selectors.push('main, [role=main], body > div');
          }
          const components = [];
          for (const [i,selector] of selectors.entries()) {
            // Default samples measure one representative; explicit CSS is used exactly as given.
            const explicit = values.selector?.includes(selector) || step.inspect?.includes(selector);
            const actual = explicit ? selector : await page.evaluate(s => {
              const items = [...document.querySelectorAll(s)];
              const el = items.find(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height) || items[0];
              if (!el) return null;
              const chain = [];
              for (let n=el;n;n=n.parentElement) {
                if (n.id) {chain.unshift('#' + CSS.escape(n.id)); break;}
                chain.unshift(n.localName + ':nth-child(' + (n.parentElement ? [...n.parentElement.children].indexOf(n)+1 : 1) + ')');
              }
              return chain.join(' > ');
            },selector);
            if (!actual) continue;
            await part('component-' + i + '.json',async f=>{
              const tree = await page.evaluate(componentTree,{selector:actual,limit,allStyles:!!values['all-styles']});
              await json(f,tree);
              const item = {selector:actual,matched:tree.matched,nodes:tree.nodes,truncated:tree.truncated,file:'component-' + i + '.json'};
              components.push(item);
              if (!tree.matched && explicit) state.errors.push({phase:'selector',error:'No DOM match: ' + selector});
            });
          }
          await part('components.json',f=>json(f,components));
          await part('resources.json',async f=>json(f,await page.evaluate(resourceInventory,[...cssBodies.values()])));
          for (const [i,c] of components.entries()) {
            if (!c.matched) continue;
            // An element screenshot can scroll it into view. Restore document position before the next input.
            const pos = await page.evaluate(()=>[scrollX,scrollY]);
            const el = page.locator(c.selector).first();
            if (await el.isVisible()) {
              const name = 'crop-' + i + '.png';
              await part(name,f=>el.screenshot({path:f,timeout:4500}));
              if (state.files.includes(name)) { c.crop = name; c.cropMatchIndex = 0; }
            }
            await page.evaluate(([left,top])=>scrollTo({left,top,behavior:'instant'}),pos);
          }
          await json(path.join(dir,'components.json'),components);
        }
      }
      await part('network.json',f=>json(f,network));
      state.status = state.errors.length ? 'partial' : 'captured';
      await log(); await runLog();
      return state;
    }
    let resp;
    let entryError;
    try {
      resp = await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
      if (resp && resp.status() >= 400) throw Error('Entry HTTP ' + resp.status());
      if (values.ready) await page.locator(values.ready).first().waitFor({state:'visible',timeout:20000});
      await page.waitForTimeout(settle);
    } catch(e) { entryError = e; }
    const entry = await capture({action:'entry',...(resp ? {httpStatus:resp.status(),httpError:resp.status()>=400}: {})},entryError);
    if (entryError || !entry.files.includes('discovery.json')) throw Error('Entry incomplete. See ' + entry.path + '/manifest.json');
    for (const step of actions) {
      let actionError;
      try {
        if (!step || typeof step.action !== 'string' || (step.inspect && (!Array.isArray(step.inspect) || !step.inspect.every(s=>typeof s==='string')))) throw Error('Malformed action/inspect');
        await applyAction(page,step,origin);
        if (step.ready) await page.locator(step.ready).first().waitFor({state:'visible',timeout:12000});
        await page.waitForTimeout(settle);
      } catch(e) { actionError = e; }
      const seen = await capture(step || {action:'invalid'},actionError);
      if (actionError || !seen.files.includes('discovery.json')) throw Error('Action incomplete. See ' + seen.path + '/manifest.json');
    }
    if (sweep) {
      const pos = await page.evaluate(()=>[scrollX,scrollY]);
      const visited = new Set([Math.round(pos[1])]);
      for (let i=1;i<=sweep;i++) {
        await page.evaluate(p=>scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*p,behavior:'instant'}),i/sweep);
        await page.waitForTimeout(Math.min(settle,300));
        const y = Math.round(await page.evaluate(()=>scrollY));
        if (visited.has(y)) continue;
        visited.add(y);
        await capture({action:'sweep',label:'sweep-' + i,actualScrollY:y});
      }
      run.sweep = {requested:sweep,positions:[...visited],note:'Document scroll discovery only. Nested scrollers, gated chapters and manual gestures require explicit inspection.'};
      await page.evaluate(([left,top])=>scrollTo({left,top,behavior:'instant'}),pos);
    }
    run.status = run.states.some(s=>s.errors.length) ? 'partial' : 'completed';
    if (run.status === 'partial') process.exitCode = 2;
    await Promise.race([Promise.allSettled([...cssJobs]),page.waitForTimeout(4000)]);
    if (cssJobs.size) run.warnings.push(cssJobs.size + ' stylesheet response bodies still pending');
    await json(path.join(root,'network.json'),network);
    await runLog();
    console.log(JSON.stringify({status:run.status,run:path.join(root,'run.json'),topology:topologyFile,entries:allEntries.size,states:run.states.length}));
  } catch(e) {
    run.status = 'failed'; run.error = message(e); await runLog();
    let diagnostic = message(e);
    if (e.code === 'ERR_MODULE_NOT_FOUND' && diagnostic.includes('playwright')) diagnostic += '\nInstall the dependencies declared in scripts/package.json from the scripts directory (npm install).';
    if (diagnostic.includes("Executable doesn't exist")) diagnostic += '\nInstall the Playwright Chromium browser or set CHROME_PATH to the installed Chromium/Chrome executable.';
    throw Error(diagnostic + '\nRun log: ' + path.join(root,'run.json'));
  } finally { await browser?.close(); }
}

main().catch(e=>{console.error(message(e));process.exitCode=1;});
