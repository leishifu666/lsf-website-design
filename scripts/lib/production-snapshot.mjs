// Find authored production inputs without treating every dist/build directory as a cache.
// This is a file/entry check, not a bundler or an interception of arbitrary writes.
import {readFile, readdir, realpath, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, extname, isAbsolute, join, relative, resolve} from 'node:path';

const sourceRoots = ['src','app','pages','components','styles','public','assets'];
const cache = new Set(['node_modules','.git','.lsf','.next','.cache','.turbo','coverage','ref','vendor','tests','__tests__','fixtures']);
const code = /\.(html?|[cm]?[jt]sx?|vue|svelte|astro|css|s[ac]ss)$/i;
const production = /\.(html?|[cm]?[jt]sx?|vue|svelte|astro|css|s[ac]ss|json|svg|png|jpe?g|webp|avif|gif|glb|gltf|bin|woff2?|ttf|otf|mp4|webm|glsl|wgsl)$/i;
const receipt = /^copy\/(brief|approved|review|page-review)\.json$|^copy\/gemini\/[^/]+\.json$|^rounds\/round-\d+\/(motion-evidence|final-score)\.json$/;
const exists = p => stat(p).then(() => true, () => false);
const text = s => typeof s === 'string' && s.trim().length > 0;
const digest = s => createHash('sha256').update(s).digest('hex');

export async function localFile(site, path) {
  if (!text(path) || isAbsolute(path) || /^[A-Za-z]:|^\\\\/.test(path) || path.replaceAll('\\','/').split('/').includes('..'))
    throw Error('须使用站内相对路径：' + path);
  const root = await realpath(site), actual = await realpath(resolve(root,path));
  const key = relative(root,actual).replaceAll('\\','/');
  if (key === '..' || key.startsWith('../') || isAbsolute(key)) throw Error('路径或符号链接超出站点：' + path);
  if (!(await stat(actual)).isFile()) throw Error('不是实际文件：' + path);
  return {path:actual,key};
}

async function scope(site) {
  const roots = new Set(), generated = new Set(), configs = [], hostRoots = new Set();
  let pkg = {}, hostBuild = '';
  for (const name of ['package.json','.openai/hosting.json','vercel.json','firebase.json']) {
    if (!await exists(join(site,name))) continue;
    const value = JSON.parse(await readFile(join(site,name),'utf8'));
    configs.push(name);
    if (name === 'package.json') pkg = value;
    const hosts = Array.isArray(value.hosting) ? value.hosting : [value.hosting ?? value];
    for (const host of hosts) for (const p of [host?.static?.directory,host?.public,host?.outputDirectory])
      if (text(p)) hostRoots.add(p.replace(/^\.\//,''));
    if (text(value.outputDirectory)) hostRoots.add(value.outputDirectory);
    hostBuild += ' ' + (value.buildCommand ?? value.hosting?.buildCommand ?? '');
  }
  for (const name of ['netlify.toml','wrangler.toml','vite.config.js','vite.config.mjs','vite.config.ts']) {
    if (!await exists(join(site,name))) continue;
    const value = await readFile(join(site,name),'utf8'); configs.push(name);
    for (const match of value.matchAll(/(?:publish|pages_build_output_dir|outDir)\s*[:=]\s*["']([^"']+)["']/g)) hostRoots.add(match[1]);
    hostBuild += ' ' + (/command\s*=\s*["']([^"']+)["']/.exec(value)?.[1] ?? '');
  }
  for (const name of sourceRoots) if (await exists(join(site,name))) roots.add(name);
  const top = await readdir(site,{withFileTypes:true});
  const rootEntries = top.filter(e => e.isFile() && (/\.html?$/i.test(e.name) || /^(app|main|index|script)\.[cm]?[jt]sx?$/i.test(e.name))).map(e => e.name);
  for (const file of top.filter(e => e.isFile() && production.test(e.name)).map(e => e.name)) roots.add(file);
  for (const key of ['source','main','browser']) if (text(pkg[key]) && await exists(join(site,pkg[key]))) roots.add(pkg[key]);
  const build = (pkg.scripts?.build ?? '') + hostBuild;
  // Only an identified producer with real source inputs makes an output generated.
  const producer = /\b(vite|webpack|rollup|parcel|astro|next|nuxt|svelte-kit)\b.*\b(build|export)\b|\b(webpack|rollup)\b/.test(build);
  const hasInputs = rootEntries.length || [...roots].some(p => ['src','app','pages'].includes(p));
  const outputs = new Set([...hostRoots,'dist','build','out']);
  for (const output of outputs) {
    if (!text(output) || isAbsolute(output) || output.replaceAll('\\','/').split('/').includes('..')) throw Error('发布目录须在站点内：'+output);
    if (producer && hasInputs && output !== '.' && !sourceRoots.includes(output)) generated.add(output.replace(/\/$/,''));
    else if (await exists(join(site,output)) && (hostRoots.has(output) || await exists(join(site,output,'index.html')))) roots.add(output);
  }
  // A declared publish directory is useful even before its first index is written.
  for (const p of hostRoots) if (!generated.has(p)) roots.add(p);
  return {roots,generated,configs,hostRoots};
}

export async function productionSnapshot(site, includePages = true) {
  const files = {}, {roots,generated,configs} = await scope(site);
  const skipped = key => [...generated].some(p => key === p || key.startsWith(p+'/'));
  async function visit(key, all = false) {
    const path = join(site,key);
    let info; try { info = await stat(path); } catch (e) { if(e.code === 'ENOENT') return; throw e; }
    if (skipped(key)) return;
    if (info.isDirectory()) {
      for (const e of await readdir(path,{withFileTypes:true})) {
        if (cache.has(e.name) || e.name.startsWith('.') || e.isSymbolicLink()) continue;
        const next = key && key !== '.' ? key+'/'+e.name : e.name;
        if (all || receipt.test(next) || ['copy','copy/gemini','rounds'].includes(next) || /^rounds\/round-\d+$/.test(next)) await visit(next,all);
      }
    } else if (info.isFile() && (receipt.test(key) || (all && production.test(key)))) {
      const file = await localFile(site,key); files[file.key] = digest(await readFile(file.path));
    }
  }
  if (includePages) {
    for (const root of roots) await visit(root,true);
    for (const config of configs) {
      const file = await localFile(site,config); files[file.key] = digest(await readFile(file.path));
    }
  }
  for (const key of ['copy','rounds']) await visit(key);
  return files;
}

const staticRootFor = (key, hostRoots) => [...hostRoots].filter(p => p !== '.' && key.startsWith(p+'/')).sort((a,b) => b.length-a.length)[0]
  ?? (/^(dist|build|out)\//.exec(key)?.[1] || '.');

export async function productionStaticRoot(site, entry) {
  return staticRootFor((await localFile(site,entry)).key,(await scope(site)).hostRoots);
}

// Follow literal local imports, HTML scripts/styles, CSS URLs and common @/ aliases.
// Nonliteral loader graphs need an explicit actual source entry; an unused file is not a mount.
export async function reachableProductionFiles(site, entry) {
  const selected = await localFile(site,entry), {hostRoots,generated} = await scope(site);
  if ([...generated].some(p => selected.key === p || selected.key.startsWith(p+'/')))
    throw Error('page.entry 指向已识别的生成产物；请登记实际源码入口：' + entry);
  const staticRoot = staticRootFor(selected.key,hostRoots);
  const visited = new Set();
  async function follow(file) {
    if (visited.has(file.key)) return;
    if (file.key.split('/').some(p => cache.has(p))) throw Error('生产依赖不能用研究、测试或依赖缓存文件充数：'+file.key);
    visited.add(file.key);
    if (!code.test(file.key)) return;
    const contents = await readFile(file.path,'utf8');
    const specs = [...contents.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\b(?:src|href)\s*=\s*|\burl\(\s*|\bnew\s+URL\(\s*)["']([^"']+)["']/g)].map(m => m[1]);
    for (const spec of specs) {
      if (/^(?:https?:|data:|#|node:)/.test(spec)) continue;
      const clean = spec.split(/[?#]/)[0];
      if (!clean || (!clean.startsWith('.') && !clean.startsWith('/') && !clean.startsWith('@/') && !/\.html?$/i.test(file.key))) continue;
      const target = clean.startsWith('@/') ? join(site,'src',clean.slice(2)) : clean.startsWith('/') ? join(site,staticRoot,clean.slice(1)) : resolve(dirname(file.path),clean);
      const rel = relative(site,target).replaceAll('\\','/');
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw Error('入口引用超出站点：'+spec);
      const variants = extname(target) ? [rel] : [rel,...['.js','.mjs','.cjs','.jsx','.ts','.tsx','.vue','.svelte','.css'].map(e=>rel+e),...['index.js','index.jsx','index.ts','index.tsx'].map(e=>rel+'/'+e)];
      for (const candidate of variants) {
        if (!await exists(join(site,candidate))) continue;
        if (!(await stat(join(site,candidate))).isFile()) continue;
        await follow(await localFile(site,candidate)); break;
      }
    }
  }
  await follow(selected);
  return visited;
}
