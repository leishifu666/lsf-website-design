import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, symlink, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {localFile, productionSnapshot, reachableProductionFiles} from '../lib/production-snapshot.mjs';

async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), 'lsf-production-snapshot-'));
  const site = join(temp, 'site');
  await mkdir(site);
  t.after(() => rm(temp, {recursive:true, force:true}));
  const write = async (file, data) => {
    const path = join(site, file);
    await mkdir(dirname(path), {recursive:true});
    await writeFile(path, typeof data === 'string' ? data : JSON.stringify(data));
  };
  return {temp, site, write};
}

test('hosting 明确发布 dist 时，手写静态 HTML/CSS/JS 与素材进入生产快照', async t => {
  const f = await fixture(t);
  await f.write('.openai/hosting.json', {static:{directory:'dist'}});
  await f.write('dist/index.html', '<link rel="stylesheet" href="/styles.css"><script src="/app.js"></script>');
  await f.write('dist/styles.css', 'body { color: navy; }');
  await f.write('dist/app.js', 'document.body.dataset.ready = "before";');
  await f.write('dist/assets/scene.glb', 'synthetic binary asset fixture');
  const before = await productionSnapshot(f.site);
  for (const file of ['.openai/hosting.json', 'dist/index.html', 'dist/styles.css', 'dist/app.js', 'dist/assets/scene.glb'])
    assert.match(before[file], /^[a-f0-9]{64}$/, file);
  await f.write('dist/app.js', 'document.body.dataset.ready = "after";');
  const after = await productionSnapshot(f.site);
  assert.notEqual(after['dist/app.js'], before['dist/app.js']);
  assert.equal(after['dist/index.html'], before['dist/index.html']);
  await rm(join(f.site, 'dist/styles.css'));
  assert.equal((await productionSnapshot(f.site))['dist/styles.css'], undefined);
});

test('dist/build/out 目录名本身不足以把静态页面当成构建缓存', async t => {
  const f = await fixture(t);
  for (const directory of ['dist', 'build', 'out']) await f.write(directory + '/index.html', '<main>' + directory + '</main>');
  const snapshot = await productionSnapshot(f.site);
  for (const directory of ['dist', 'build', 'out']) assert(snapshot[directory + '/index.html']);
});

test('真实 Vite 源码和 build 命令存在时，dist 产物变化不冒充源码变化', async t => {
  const f = await fixture(t);
  await f.write('.openai/hosting.json', {static:{directory:'dist'}});
  await f.write('package.json', {scripts:{build:'vite build'}});
  await f.write('index.html', '<script type="module" src="/src/main.js"></script>');
  await f.write('src/main.js', 'document.body.textContent = "authored";');
  await f.write('dist/index.html', '<script src="/assets/bundle.js"></script>');
  await f.write('dist/assets/bundle.js', 'document.body.textContent="generated-v1";');
  const before = await productionSnapshot(f.site);
  assert(before['src/main.js']);
  assert(before['index.html']);
  assert(before['package.json']);
  assert(!Object.keys(before).some(file => file.startsWith('dist/')));
  await f.write('dist/assets/bundle.js', 'document.body.textContent="generated-v2";');
  assert.deepEqual(await productionSnapshot(f.site), before);
  await f.write('src/main.js', 'document.body.textContent = "authored change";');
  assert.notEqual((await productionSnapshot(f.site))['src/main.js'], before['src/main.js']);
  await assert.rejects(reachableProductionFiles(f.site, 'dist/index.html'), /生成产物|实际源码入口/);
  assert.deepEqual(await reachableProductionFiles(f.site, 'index.html'), new Set(['index.html', 'src/main.js']));
});

test('单有 build 命令但没有实际源码入口，不能抹掉现有静态发布目录', async t => {
  const f = await fixture(t);
  await f.write('package.json', {scripts:{build:'vite build'}});
  await f.write('.openai/hosting.json', {static:{directory:'dist'}});
  await f.write('dist/index.html', '<main>Only authored page</main>');
  assert((await productionSnapshot(f.site))['dist/index.html']);
});

test('自定义发布目录与已声明的 Vite 构建关系同样区分生成物', async t => {
  const f = await fixture(t);
  await f.write('package.json', {scripts:{build:'vite build'}});
  await f.write('vite.config.mjs', "export default { build: { outDir: 'release-site' } };");
  await f.write('index.html', '<script type="module" src="/src/main.js"></script>');
  await f.write('src/main.js', 'document.body.dataset.page = "authored";');
  await f.write('release-site/index.html', '<main>Generated</main>');
  const snapshot = await productionSnapshot(f.site);
  assert(snapshot['src/main.js']);
  assert(snapshot['vite.config.mjs']);
  assert(!snapshot['release-site/index.html']);
});

test('includePages=false 只保留制作与审核回执，不误收截图和研究缓存', async t => {
  const f = await fixture(t);
  const receipts = ['copy/brief.json', 'copy/approved.json', 'copy/review.json', 'copy/page-review.json',
    'copy/gemini/response.json', 'rounds/round-01/motion-evidence.json', 'rounds/round-01/final-score.json'];
  for (const file of receipts) await f.write(file, {fixture_only:true});
  for (const file of ['src/app.js', 'rounds/round-01/shots/1440.png', 'rounds/round-01/notes.json',
    'ref/observations.json', '.lsf/workflow.json', 'node_modules/cache.js']) await f.write(file, 'fixture');
  assert.deepEqual(Object.keys(await productionSnapshot(f.site, false)).sort(), receipts.sort());
});

test('HTML、模块、组件、CSS 与静态资源组成可达链，未接入文件不可达', async t => {
  const f = await fixture(t);
  await f.write('index.html', '<link rel="stylesheet" href="./styles/site.css"><script type="module" src="./src/app.js"></script>');
  await f.write('src/app.js', "import { mount } from './components/Disclosure';\nimport '@/components/Tabs.js';\nimport('./lazy.js');\nmount();");
  await f.write('src/components/Disclosure.js', "export { mount } from '../shared.js';");
  await f.write('src/shared.js', "import './app.js';\nexport function mount() { return 1; }");
  await f.write('src/components/Tabs.js', 'export const tabs = [];');
  await f.write('src/lazy.js', "export const icon = new URL('../assets/icon.svg', import.meta.url);");
  await f.write('styles/site.css', '@import "./tokens.css"; body { background: url("../assets/background.png"); }');
  await f.write('styles/tokens.css', ':root { --ink: black; }');
  await f.write('assets/icon.svg', '<svg/>');
  await f.write('assets/background.png', 'synthetic image bytes');
  await f.write('src/unconnected.js', 'export const neverMounted = true;');
  await f.write('ref/downloaded.js', 'export const candidate = true;');
  const reachable = await reachableProductionFiles(f.site, 'index.html');
  assert.deepEqual(reachable, new Set(['index.html', 'src/app.js', 'src/components/Disclosure.js', 'src/shared.js',
    'src/components/Tabs.js', 'src/lazy.js', 'styles/site.css', 'styles/tokens.css', 'assets/icon.svg', 'assets/background.png']));
  assert(!reachable.has('src/unconnected.js'));
  assert(!reachable.has('ref/downloaded.js'));
});

test('dist 静态入口中的根相对 URL 以真实发布目录解析', async t => {
  const f = await fixture(t);
  await f.write('.openai/hosting.json', {static:{directory:'dist'}});
  await f.write('dist/index.html', '<script type="module" src="/app.js"></script>');
  await f.write('dist/app.js', "import { render } from './components/Menu.js'; render();");
  await f.write('dist/components/Menu.js', 'export function render() { return "menu"; }');
  await f.write('app.js', 'throw Error("wrong root");');
  assert.deepEqual(await reachableProductionFiles(f.site, 'dist/index.html'),
    new Set(['dist/index.html', 'dist/app.js', 'dist/components/Menu.js']));
});

test('localFile 只接受站内实际文件，拒绝绝对路径、越级路径和目录', async t => {
  const f = await fixture(t);
  await f.write('src/app.js', 'export const mounted = true;');
  const selected = await localFile(f.site, 'src/app.js');
  assert.equal(selected.key, 'src/app.js');
  assert.equal(selected.path, join(f.site, 'src/app.js'));
  for (const path of [join(f.temp, 'outside.js'), '../outside.js', 'src/../../outside.js',
    '..\\outside.js', 'C:\\outside.js', '\\\\server\\outside.js'])
    await assert.rejects(localFile(f.site, path), /站内|相对路径|超出/);
  await assert.rejects(localFile(f.site, 'src'), /实际文件/);
});

test('符号链接出站时本地文件、入口依赖与显式生产根均拒绝读取', async t => {
  const f = await fixture(t);
  const outside = join(f.temp, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'secret.js'), 'export const outside = true;');
  await f.write('index.html', '<script type="module" src="./app.js"></script>');
  await f.write('app.js', "import './escaped.js';");
  await symlink(join(outside, 'secret.js'), join(f.site, 'escaped.js'));
  await assert.rejects(localFile(f.site, 'escaped.js'), /符号链接|超出站点/);
  await assert.rejects(reachableProductionFiles(f.site, 'index.html'), /符号链接|超出站点/);
  await symlink(outside, join(f.site, 'src'), 'dir');
  await assert.rejects(productionSnapshot(f.site), /符号链接|超出站点/);
});

test('站内符号链接解析为同一文件，不重复计入依赖', async t => {
  const f = await fixture(t);
  await f.write('index.html', '<script type="module" src="./app.js"></script>');
  await f.write('app.js', "import './src/actual.js'; import './alias.js';");
  await f.write('src/actual.js', 'export const shared = true;');
  await symlink(join(f.site, 'src/actual.js'), join(f.site, 'alias.js'));
  assert.equal((await localFile(f.site, 'alias.js')).key, 'src/actual.js');
  assert.deepEqual(await reachableProductionFiles(f.site, 'index.html'), new Set(['index.html', 'app.js', 'src/actual.js']));
});

test('入口依赖不能穿出站点，也不能以研究或测试文件充当生产实现', async t => {
  const f = await fixture(t);
  await f.write('index.html', '<script type="module" src="./src/app.js"></script>');
  await f.write('src/app.js', "import '../../outside.js';");
  await assert.rejects(reachableProductionFiles(f.site, 'index.html'), /超出站点/);
  await f.write('ref/downloaded.js', 'export const fixture = true;');
  await f.write('src/app.js', "import '../ref/downloaded.js';");
  await assert.rejects(reachableProductionFiles(f.site, 'index.html'), /生产依赖|研究|缓存/);
});

test('发布目录声明越出站点时拒绝快照', async t => {
  const f = await fixture(t);
  await f.write('.openai/hosting.json', {static:{directory:'../outside'}});
  await assert.rejects(productionSnapshot(f.site), /发布目录.*站点内/);
});
