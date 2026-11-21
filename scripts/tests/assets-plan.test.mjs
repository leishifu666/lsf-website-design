// Synthetic source files and DOM measurements exercise validation only; none are live website evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectAssetsPlan} from '../lib/assets-plan.mjs';
import {inspectAReference} from '../lib/a-reference.mjs';
import {prototypeFixture} from './fixtures/a-prototype.mjs';
import {surveyFixture} from './fixtures/source-survey.mjs';

const components = [
  ['Disclosure', `export function mountDisclosure(root) {
  const trigger = root.querySelector('button');
  const panel = root.querySelector('[data-panel]');
  trigger.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  });
}`],
  ['Dialog', `export function mountDialog(root) {
  const dialog = root.querySelector('dialog');
  root.querySelector('[data-open]').addEventListener('click', () => dialog.showModal());
  root.querySelector('[data-close]').addEventListener('click', () => dialog.close());
}`],
  ['Tabs', `export function mountTabs(root) {
  const tabs = [...root.querySelectorAll('[role=tab]')];
  tabs.forEach((tab, index) => tab.addEventListener('click', () => {
    tabs.forEach((item, current) => item.setAttribute('aria-selected', String(current === index)));
    root.querySelectorAll('[role=tabpanel]').forEach((panel, current) => { panel.hidden = current !== index; });
  }));
}`],
  ['Counter', `export function mountCounter(root) {
  let count = 0;
  root.querySelector('button').addEventListener('click', () => {
    count += 1;
    root.querySelector('output').value = String(count);
  });
}`],
  ['Filter', `export function mountFilter(root) {
  const input = root.querySelector('input');
  input.addEventListener('input', () => {
    for (const item of root.querySelectorAll('[data-item]')) {
      item.hidden = !item.textContent.toLowerCase().includes(input.value.toLowerCase());
    }
  });
}`]
];

async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), 'lsf-assets-plan-'));
  const site = join(temp, 'site');
  t.after(() => rm(temp, {recursive:true, force:true}));
  async function write(file, data) {
    const path = join(site, file);
    await mkdir(dirname(path), {recursive:true});
    await writeFile(path, typeof data === 'string' ? data : JSON.stringify(data));
  }
  const imports = components.map(([name]) => `import { mount${name} } from './components/${name}.js';`);
  const calls = components.map(([name]) => `mount${name}(document.querySelector('#${name.toLowerCase()}'));`);
  await write('index.html', '<main>' + components.map(([name]) => `<section id="${name.toLowerCase()}"></section>`).join('') + '</main><script type="module" src="./src/app.js"></script>');
  await write('src/app.js', [...imports, ...calls].join('\n'));
  const plan = {component_reuse:{version:1,
    pages:[{id:'home', entry:'index.html', url:'http://localhost:4173/'}],
    components:components.map(([name, code], index) => ({
      id:name.toLowerCase(), page:'home', kind:'component',
      source_url:'https://components.example.test/' + name.toLowerCase(),
      source_component:name, source_file:`ref/components/${name}.js`,
      license:'Test fixture code only, no external licensing assertion', version:'synthetic-fixture-v1',
      target_file:`src/components/${name}.js`,
      usage:{file:'src/app.js', excerpt:calls[index], retained_excerpt:code},
      evidence:{file:'ref/component-observations.json', pointer:'/nodes/' + index}
    }))}};
  const observed = {fixture_only:true, url:'http://localhost:4173/', nodes:components.map(([name], index) => ({
    selector:'#' + name.toLowerCase(), tag:'section',
    rect:{x:24, y:40 + index * 120, width:600, height:100},
    style:{display:'block', visibility:'visible'}, children:[{tag:'button'}]
  }))};
  for (const [name, code] of components) {
    await write(`ref/components/${name}.js`, code);
    await write(`src/components/${name}.js`, code);
  }
  const save = async () => {
    await write('assets-plan.json', plan);
    await write('ref/component-observations.json', observed);
  };
  await save();
  return {temp, site, plan, observed, imports, calls, write, save,
    check:() => inspectAssetsPlan(site)};
}

function passed(result) {
  assert.equal(result.passed, true, result.problems.join('\n'));
  assert.deepEqual(result.problems, []);
}

function rejected(result, pattern, count = 4) {
  assert.equal(result.passed, false);
  assert.equal(result.counts.home, count, result.problems.join('\n'));
  assert.match(result.problems.join('\n'), pattern);
}

test('五个不同源码组件接入同一页，并以独立节点测量定位，可通过结构核验', async t => {
  const f = await fixture(t);
  const result = await f.check();
  passed(result);
  assert.deepEqual(result.counts, {home:5});
  assert.deepEqual(new Set(result.qualified), new Set(components.map(([name]) => name.toLowerCase())));
  for (const file of ['assets-plan.json', 'index.html', 'src/app.js', 'ref/component-observations.json',
    'ref/components/Disclosure.js', 'src/components/Disclosure.js']) {
    assert.match(result.files[file], /^[a-f0-9]{64}$/, file);
  }
});

test('静态 dist 页面通过根路径挂载组件脚本时按发布目录确认实际使用', async t => {
  const f = await fixture(t);
  const reuse = f.plan.component_reuse;
  const mount = '<script type="module" src="/components/Disclosure.js"></script>';
  await f.write('.openai/hosting.json', {static:{directory:'dist'}});
  await f.write('dist/index.html', `<main>
<section id="disclosure"><button aria-expanded="false">Toggle</button><div data-panel hidden>Details</div></section>
<section id="dialog"><button data-open>Open</button><dialog><button data-close>Close</button></dialog></section>
<section id="tabs"><button role="tab">Tab</button><div role="tabpanel">Panel</div></section>
<section id="counter"><button>Count</button><output>0</output></section>
<section id="filter"><input><div data-item>Item</div></section>
</main>${mount}<script type="module" src="/app.js"></script>`);
  await f.write('dist/app.js', [...f.imports.slice(1), ...f.calls.slice(1)].join('\n'));
  for (const [index, [name, code]] of components.entries()) {
    const row = reuse.components[index];
    row.target_file = `dist/components/${name}.js`;
    row.usage.file = index === 0 ? 'dist/index.html' : 'dist/app.js';
    if (index === 0) row.usage.excerpt = mount;
    // The directly included module mounts itself; its source is not only an unused export.
    await f.write(row.target_file, code + (index === 0 ? '\n' + f.calls[0] : ''));
  }
  reuse.pages[0].entry = 'dist/index.html';
  await rm(join(f.site, 'index.html'));
  await rm(join(f.site, 'src'), {recursive:true});
  await f.save();
  const result = await f.check();
  passed(result);
  assert.deepEqual(result.counts, {home:5});
  assert(result.qualified.includes('disclosure'));
});

test('直接接入已取得的同一本地源文件不要求制造第二份复制件', async t => {
  const f = await fixture(t);
  f.plan.component_reuse.components[0].source_file = 'src/components/Disclosure.js';
  await f.save();
  passed(await f.check());
});

test('保留对应结构的变量与主题选择器改写可由适配映射核验', async t => {
  const f = await fixture(t);
  const row = f.plan.component_reuse.components[0];
  const original = components[0][1];
  const target = original.replaceAll(/\broot\b/g, 'host').replaceAll(/\btrigger\b/g, 'toggle')
    .replaceAll(/\bpanel\b/g, 'content');
  assert.notEqual(original, target);
  delete row.usage.retained_excerpt;
  row.usage.adaptation = {source_excerpt:original, target_excerpt:target, reason:'变量与主题选择器调整，保留展开状态与面板显隐关系'};
  await f.write(row.target_file, target);
  await f.save();
  passed(await f.check());
});

test('改写为无关实现不能只靠映射字段和说明计数', async t => {
  const f = await fixture(t);
  const row = f.plan.component_reuse.components[0];
  const target = "export function mountDisclosure(root) { root.textContent = 'Different mechanism'; }";
  delete row.usage.retained_excerpt;
  row.usage.adaptation = {source_excerpt:components[0][1], target_excerpt:target, reason:'合成反例：丢失展开机制'};
  await f.write(row.target_file, target);
  await f.save();
  rejected(await f.check(), /adaptation|结构|实现关联/);
});

for (const kind of ['library', 'icon', 'candidate']) test(`${kind} 不能占用源码组件名额`, async t => {
  const f = await fixture(t);
  f.plan.component_reuse.components[0].kind = kind;
  await f.save();
  rejected(await f.check(), /不计入|库、图标|组件/);
});

test('把通用库写成 component 仍不能作为具体源组件计数', async t => {
  const f = await fixture(t);
  f.plan.component_reuse.components[0].source_component = 'GSAP';
  await f.save();
  rejected(await f.check(), /通用库|具体源组件/);
});

test('同源组件换实例、来源查询参数或锚点，在一页只计一项', async t => {
  const f = await fixture(t);
  const rows = f.plan.component_reuse.components;
  rows[4] = structuredClone(rows[0]);
  rows[4].id = 'disclosure-another-instance';
  rows[4].source_url += '?theme=blue#demo';
  await f.save();
  rejected(await f.check(), /重复|只计一项/);
});

test('相同源码改来源名称或网址不能冒充第五个不同组件', async t => {
  const f = await fixture(t);
  const rows = f.plan.component_reuse.components;
  rows[4] = {...structuredClone(rows[0]), id:'renamed-copy', source_component:'RenamedDisclosure',
    source_url:'https://different.example.test/renamed', source_file:'ref/components/Renamed.js'};
  await f.write(rows[4].source_file, '// synthetic renamed copy\n' + components[0][1]);
  await f.save();
  rejected(await f.check(), /相同源码|重复|只计一项/);
});

test('只有 import 的片段不能证明组件实际调用', async t => {
  const f = await fixture(t);
  f.plan.component_reuse.components[0].usage.excerpt = f.imports[0];
  await f.write('src/app.js', [...f.imports, ...f.calls.slice(1)].join('\n'));
  await f.save();
  rejected(await f.check(), /import|调用|挂载/);
});

test('只有 import 配无关有效语句仍不能算作实际调用', async t => {
  const f = await fixture(t);
  const unrelated = 'document.body.dataset.fixture = "loaded";';
  f.plan.component_reuse.components[0].usage.excerpt = unrelated;
  await f.write('src/app.js', [...f.imports, unrelated, ...f.calls.slice(1)].join('\n'));
  await f.save();
  rejected(await f.check(), /调用|挂载|绑定|关联/);
});

test('仅下载且落地文件未进入页面依赖链时不能计数', async t => {
  const f = await fixture(t);
  await f.write('src/app.js', [...f.imports.slice(1), ...f.calls.slice(1)].join('\n'));
  await f.save();
  rejected(await f.check(), /未接入|入口|可达|调用/);
});

test('未接入页面的调用文件不能为已下载组件提供使用证据', async t => {
  const f = await fixture(t);
  const row = f.plan.component_reuse.components[0];
  row.usage.file = 'src/unused.js';
  await f.write(row.usage.file, "import { mountDisclosure } from './components/Disclosure.js';\n" + f.calls[0]);
  await f.save();
  rejected(await f.check(), /未接入|入口|可达/);
});

for (const [field, pattern] of [['license', /缺 license/], ['version', /缺 version/], ['source_file', /缺 source_file/]]) {
  test(`缺 ${field} 的组件不能计数`, async t => {
    const f = await fixture(t);
    delete f.plan.component_reuse.components[0][field];
    await f.save();
    rejected(await f.check(), pattern);
  });
}

for (const field of ['source_file', 'target_file']) test(`${field} 登记存在但实际文件缺失时不能计数`, async t => {
  const f = await fixture(t);
  await rm(join(f.site, f.plan.component_reuse.components[0][field]));
  rejected(await f.check(), /ENOENT|不存在|文件/);
});

test('保留源码仅写 import 不能证明复用了组件机制', async t => {
  const f = await fixture(t);
  const row = f.plan.component_reuse.components[0];
  const imported = "import { syntheticLibrary } from 'synthetic-library';";
  for (const file of [row.source_file, row.target_file]) await f.write(file, imported + '\n' + components[0][1]);
  row.usage.retained_excerpt = imported;
  await f.save();
  rejected(await f.check(), /机制|结构|import/);
});

test('伪 passed/mounted 字段不能代替独立 DOM 节点测量', async t => {
  const f = await fixture(t);
  f.observed.nodes[0] = {selector:'#disclosure', passed:true, mounted:true};
  await f.save();
  rejected(await f.check(), /节点测量|rect|style/);
});

test('零面积节点与错误节点指针不能证明组件可见', async t => {
  const f = await fixture(t);
  f.observed.nodes[0].rect.width = 0;
  await f.save();
  rejected(await f.check(), /节点测量|rect/);
  f.observed.nodes[0].rect.width = 600;
  f.plan.component_reuse.components[0].evidence.pointer = '/nodes/999';
  await f.save();
  rejected(await f.check(), /找不到|节点/);
});

test('素材清单自身不能充当独立运行观察', async t => {
  const f = await fixture(t);
  f.plan.component_reuse.components[0].evidence = {file:'assets-plan.json', pointer:'/component_reuse/components/0'};
  await f.save();
  rejected(await f.check(), /独立|实际观察/);
});

test('别的页面的节点测量不能充当当前页面的运行证据', async t => {
  const f = await fixture(t);
  f.observed.nodes[0].url = 'http://localhost:4173/another-page';
  await f.save();
  rejected(await f.check(), /URL|页面不符/);
});

test('已有 scout 树与共享样式表的节点格式可直接用于核验', async t => {
  const f = await fixture(t);
  const row = f.plan.component_reuse.components[0];
  row.evidence = {file:'ref/scout-component.json', pointer:'/trees/0'};
  await f.write(row.evidence.file, {fixture_only:true, url:'http://localhost:4173/', selector:'#disclosure',
    styles:[{display:'block'}], trees:[{tag:'section', rect:{x:24, y:40, width:600, height:100}, style:0}]});
  await f.save();
  passed(await f.check());
});

test('路径穿越与指向站外的源码符号链接均不能计数', async t => {
  const f = await fixture(t);
  const row = f.plan.component_reuse.components[0];
  const outside = join(f.temp, 'outside.js');
  await writeFile(outside, components[0][1]);
  row.source_file = '../outside.js';
  await f.save();
  rejected(await f.check(), /站内|相对路径|超出/);
  row.source_file = 'ref/components/outside.js';
  await symlink(outside, join(f.site, row.source_file));
  await f.save();
  rejected(await f.check(), /符号链接|超出站点/);
});

test('每个登记页面单独满足五项，共享组件可以在实际使用的各页分别计数', async t => {
  const f = await fixture(t);
  const reuse = f.plan.component_reuse;
  await f.write('second.html', '<script type="module" src="./src/app.js"></script>');
  reuse.pages.push({id:'second', entry:'second.html', url:'http://localhost:4173/second.html'});
  const secondRows = reuse.components.map(row => ({...structuredClone(row), id:row.id + '-second', page:'second',
    evidence:{file:'ref/second-observations.json', pointer:row.evidence.pointer}}));
  reuse.components.push(...secondRows.slice(0, 4));
  await f.write('ref/second-observations.json', {...f.observed, url:'http://localhost:4173/second.html'});
  await f.save();
  const short = await f.check();
  assert.equal(short.passed, false);
  assert.deepEqual(short.counts, {home:5, second:4});
  assert.match(short.problems.join('\n'), /second.*4.*5/);
  reuse.components.push(secondRows[4]);
  await f.save();
  const full = await f.check();
  passed(full);
  assert.deepEqual(full.counts, {home:5, second:5});
});

test('五个普通组件通过不抵扣核心场景动效的独立核验', async t => {
  const f = await fixture(t);
  const {contract} = await prototypeFixture(f.site);
  const survey = await surveyFixture(f.site, contract);
  await survey.stage('paired');
  passed(await f.check());
  const checkCore = () => inspectAReference(f.site, {stage:'paired', requirePrototype:true, requireSurvey:true, requireCore:true});
  passed(await checkCore());
  const record = JSON.parse(await readFile(join(f.site, 'ref/source-survey.json'), 'utf8'));
  record.core_motion.effects = [];
  await f.write('ref/source-survey.json', record);
  passed(await f.check());
  const incomplete = await checkCore();
  assert.equal(incomplete.passed, false);
  assert.match(incomplete.problems.join('\n'), /核心动态|required.*effect/);
});
