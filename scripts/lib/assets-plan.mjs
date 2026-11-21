// Verify traceable source reuse and observed mounts, not authorship, licensing law or visual fidelity.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {localFile, productionStaticRoot, reachableProductionFiles} from './production-snapshot.mjs';

const text = s => typeof s === 'string' && s.trim().length > 0;
const hash = s => createHash('sha256').update(s).digest('hex');
const check = (ok, message) => { if (!ok) throw Error(message); };
const libraries = /^(?:gsap|three(?:\.js)?|lenis|react(?:-dom)?|@theatre\/\w+|theatre(?:\.js)?|pixi(?:\.js)?|lucide(?:-react)?|heroicons)$/i;
const cleanCode = s => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/<!--[\s\S]*?-->/g,'').replace(/^\s*\/\/.*$/gm,'').trim();
const compact = s => cleanCode(s).replace(/\s+/g,'');
const structure = s => compact(s).replace(/(["'`])(?:\\.|(?!\1)[^\\])*?\1/g,'$value')
  .replace(/\b(?:\d+(?:\.\d+)?|[A-Za-z_$][\w$]*)\b/g,token=>/^(?:if|else|for|while|switch|case|return|function|const|let|var|new|class|extends|async|await|throw|try|catch|import|export|from)$/.test(token)?token:'$');

function invokesTarget(usage, target, excerpt, staticRoot) {
  const source = cleanCode(usage.body), invoked = cleanCode(excerpt).replace(/\b(?:function|class)\s+[\w$]+/g,'declaration');
  const strip = s => s.replace(/\.[cm]?[jt]sx?$|\.(?:vue|svelte|astro)$/i,'').replace(/\/index$/,'');
  const pointsToTarget = spec => {
    const file = spec.split(/[?#]/)[0];
    const local = file.startsWith('@/') ? 'src/'+file.slice(2) : file.startsWith('/') ? posix.join(staticRoot,file.slice(1)) : posix.normalize(posix.join(posix.dirname(usage.key),file));
    return strip(local) === strip(target.key);
  };
  const names = new Set();
  if (usage.key === target.key) {
    for (const match of source.matchAll(/\b(?:function|class|const|let)\s+([\w$]+)/g)) names.add(match[1]);
    if (/\.(?:append|appendChild|replaceChildren|insertAdjacentHTML|addEventListener|setProperty)\s*\(/.test(invoked)) return true;
  }
  for (const match of source.matchAll(/\bimport\s+([^;]+?)\s+from\s*["']([^"']+)["']/g)) {
    if (!pointsToTarget(match[2])) continue;
    const clause = match[1].trim();
    const namespace = /^\*\s+as\s+([\w$]+)$/.exec(clause);
    if (namespace) names.add(namespace[1]);
    else {
      const normal = /^([\w$]+)/.exec(clause); if (normal) names.add(normal[1]);
      const named = /\{([^}]+)\}/.exec(clause)?.[1] ?? '';
      for (const binding of named.split(',')) {const name = binding.trim().split(/\s+as\s+/).at(-1); if (/^[\w$]+$/.test(name)) names.add(name);}
    }
  }
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*require\s*\(\s*["']([^"']+)["']/g))
    if (pointsToTarget(match[2])) names.add(match[1]);
  for (const name of names) {
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if (new RegExp('(?:\\b'+safe+'(?:\\.[\\w$]+)?\\s*\\(|<'+safe+'(?:\\.[\\w$]+)?(?:[\\s/>])|\\bcreateElement\\s*\\(\\s*'+safe+'\\b)').test(invoked)) return true;
  }
  // Script/style modules that execute on inclusion can use their actual HTML mount.
  return [...invoked.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/g)].some(m=>pointsToTarget(m[1]));
}

function at(record, pointer) {
  check(text(pointer) && pointer.startsWith('/'),'evidence.pointer 须定位实际 DOM 节点');
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replaceAll('~1','/').replaceAll('~0','~');
    check(record != null && Object.hasOwn(record,key),'找不到实际 DOM 节点 '+pointer);
    record = record[key];
  }
  return record;
}

export async function inspectAssetsPlan(site) {
  const problems = [], files = {}, counts = {}, qualified = [];
  async function read(path) {
    const file = await localFile(site,path), bytes = await readFile(file.path);
    check(bytes.length,'文件为空：'+path);
    files[file.key] = hash(bytes);
    return {key:file.key,body:bytes.toString('utf8'),digest:files[file.key]};
  }
  try {
    const plan = JSON.parse((await read('assets-plan.json')).body);
    const reuse = plan.component_reuse;
    check(reuse?.version === 1 && Array.isArray(reuse.pages) && reuse.pages.length && Array.isArray(reuse.components),
      '旧格式或缺 component_reuse.version=1/pages/components；保留原素材条目，按模板补按页源码复用记录后重查');
    const pages = new Map(), keys = new Map(), sourceHashes = new Map();
    for (const page of reuse.pages) {
      check(text(page.id) && !pages.has(page.id) && text(page.entry) && text(page.url),'页面须有唯一 id、实际源码 entry 和成品 url');
      const url = new URL(page.url); check(/^https?:$/.test(url.protocol),'页面 url 须为实际 HTTP(S) 成品入口');
      const reachable = await reachableProductionFiles(site,page.entry);
      for (const file of reachable) await read(file);
      pages.set(page.id,{...page,reachable,staticRoot:await productionStaticRoot(site,page.entry)}); keys.set(page.id,new Set()); sourceHashes.set(page.id,new Set()); counts[page.id] = 0;
    }
    const ids = new Set();
    for (const row of reuse.components) {
      const label = row?.id || '(无 ID)';
      try {
        check(text(row.id) && !ids.has(row.id),'条目 ID 为空或重复'); ids.add(row.id);
        check(pages.has(row.page),'page 未在 pages 登记');
        check(row.kind === 'component','kind='+row.kind+' 不计入源码组件；库、图标和候选须放回普通素材清单');
        for (const key of ['source_url','source_component','source_file','license','version','target_file']) check(text(row[key]),'缺 '+key);
        check(!libraries.test(row.source_component.trim()),'通用库或图标集不是具体源组件');
        const source = new URL(row.source_url); check(/^https?:$/.test(source.protocol),'source_url 须是具体来源 HTTP(S) URL');
        source.hash = ''; source.search = '';
        const identity = source.href.replace(/\/$/,'').toLowerCase()+'#'+row.source_component.trim().toLowerCase();
        const original = await read(row.source_file), target = await read(row.target_file);
        check(/\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?|css|s[ac]ss|glsl|wgsl)$/i.test(original.key),
          'source_file 须为具体组件/动效源码，图标和图片素材不能计数');
        check(!/^(?:ref|rounds|vendor|node_modules)\//.test(target.key),'target_file 须是实际生产实现');
        const retained = row.usage?.retained_excerpt, adapted = row.usage?.adaptation;
        const from = text(retained) ? retained : adapted?.source_excerpt, to = text(retained) ? retained : adapted?.target_excerpt;
        check(text(from) && text(to) && cleanCode(from).length >= 24 && !/^\s*(?:import\b[^;]*;?|export\s+(?:\*|\{[^}]*\})\s+from\b[^;]*;?)\s*$/.test(cleanCode(from)),
          'usage.retained_excerpt 或 adaptation 须含实际机制/结构源码，不能只有署名、import 或库导出');
        check(compact(original.body).includes(compact(from)) && compact(target.body).includes(compact(to)),
          '保留片段或映射片段未出现在 source_file 与 target_file');
        check(text(retained) || (text(adapted.reason) && structure(from) === structure(to)),
          'adaptation 须说明改动，并保留可对应的源码结构；字段齐全不能代替实现关联');
        check(text(row.usage?.file) && text(row.usage?.excerpt),'缺 usage.file/excerpt 实际调用或挂载');
        const usage = await read(row.usage.file), page = pages.get(row.page);
        check(page.reachable.has(usage.key) && page.reachable.has(target.key),'无法从该页入口静态确认使用/落地文件；未接入文件不计数，框架或动态加载须补可核对的实际源码入口');
        check(cleanCode(usage.body).includes(cleanCode(row.usage.excerpt)) && cleanCode(row.usage.excerpt).length > 2,
          'usage.excerpt 未出现在调用文件的有效代码中');
        check(!/^\s*(?:import\b[^;]*;?|export\s+(?:\*|\{[^}]*\})\s+from\b[^;]*;?)\s*$/.test(cleanCode(row.usage.excerpt)),
          '只有 import/export 不能证明实际调用或挂载');
        const usedFrom = usage.key === target.key ? new Set([target.key]) : await reachableProductionFiles(site,usage.key);
        check(usedFrom.has(target.key),'usage.file 未静态关联 target_file；非字面量/框架入口需登记可核对的实际调用入口后重查，当前条目尚不能计数');
        check(invokesTarget(usage,target,row.usage.excerpt,page.staticRoot),'usage.excerpt 未实际调用 target 的导入绑定或挂载模块；只有 import 加无关语句不能计数');
        check(text(row.evidence?.file) && row.evidence.file !== 'assets-plan.json','缺独立 evidence.file 实际观察');
        const observed = JSON.parse((await read(row.evidence.file)).body);
        let node = at(observed,row.evidence.pointer), doc = observed;
        // Existing scout component indexes point at a sibling component-N.json.
        if (Array.isArray(observed) && text(node?.file)) {
          const base = row.evidence.file.replace(/[^/]+$/,'');
          doc = JSON.parse((await read(base+node.file)).body); node = doc;
        }
        const selector = node?.selector ?? doc.selector;
        if (node?.trees) { check(node.trees.length === 1,'用 pointer 选定一个实际节点'); node = node.trees[0]; }
        const style = Number.isInteger(node?.style) ? doc.styles?.[node.style] : node?.style;
        check(text(selector) && text(node?.tag) && ['x','y','width','height'].every(k => Number.isFinite(node?.rect?.[k])) && node.rect.width > 0 && node.rect.height > 0 &&
          style && Object.values(style).some(text),'证据须含真实 selector/tag/rect/style；passed、mounted 或说明文字不能替代节点测量');
        const observedUrl = node.url ?? doc.url;
        if (observedUrl) check(new URL(observedUrl).pathname === new URL(page.url).pathname,'观察 URL 与登记页面不符');
        const sourceHash = hash(cleanCode(original.body).replace(/\s+/g,' '));
        check(!keys.get(row.page).has(identity) && !sourceHashes.get(row.page).has(sourceHash),'同一源组件或相同源码重复实例化，当前页只计一项');
        keys.get(row.page).add(identity); sourceHashes.get(row.page).add(sourceHash);
        counts[row.page]++; qualified.push(row.id);
      } catch (error) { problems.push('组件 '+label+'：'+error.message); }
    }
    for (const [page,count] of Object.entries(counts)) if (count < 5) problems.push(page+' 仅有 '+count+' 个可核对的不同适用源码组件，至少需要 5 个');
  } catch (error) { problems.push(error.message); }
  return {passed:problems.length === 0,problems:problems.map(s=>'源码复用：'+s),counts,qualified,files};
}
