import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectAReference } from '../lib/a-reference.mjs';
import { prototypeFixture } from './fixtures/a-prototype.mjs';

async function setup(t) {
  const site = await mkdtemp(join(tmpdir(), 'lsf-prototype-'));
  t.after(() => rm(site, {recursive:true,force:true}));
  const data = await prototypeFixture(site);
  const write = (file, value) => writeFile(join(site,file), JSON.stringify(value));
  const save = async () => {
    await write('ref/a-reference.json', data.contract);
    await write(data.contract.inventory, data.inventory);
    await write('ref/prototype-original.json', data.original);
    await write('ref/prototype-built.json', data.built);
  };
  const check = stage => inspectAReference(site, {stage,requirePrototype:true});
  return {...data, site, save, check};
}
function passed(result) {
  assert.deepEqual(result.problems, []);
  assert.equal(result.passed, true);
}
function fails(result, pattern) {
  assert.equal(result.passed, false);
  assert.match(result.problems.join('\n'), pattern);
}

test('样段只需指定宽度和样本的成品，原站始终完整，最终检查所有成品', async t => {
  const f = await setup(t);
  const source = await f.check('source'), full = await f.check('paired');
  passed(source); passed(full);
  assert.deepEqual(source.prototypeScope.states, ['ready@1440','middle@1440','open@1440']);
  delete f.contract.states.find(s => s.width === 375).built;
  delete f.contract.samples.find(s => s.id === 'more').built;
  await f.save();
  const prototype = await f.check('prototype');
  passed(prototype);
  assert.equal(prototype.sourceHash, source.sourceHash);
  assert.equal(prototype.prototypeHash, full.prototypeHash);
  fails(await f.check('paired'), /ready@375 built/);
  delete f.contract.states.find(s => s.id === 'credits').original;
  await f.save();
  fails(await f.check('prototype'), /credits@1440 original/);
});

test('旧 v1 配对仍可使用原格式；新 A 锁源要求已采原素材及真正驱动', async t => {
  const f = await setup(t);
  const paths = f.contract.prototype;
  delete f.contract.prototype;
  await f.save();
  passed(await inspectAReference(f.site));
  fails(await f.check('source'), /prototype.original/);
  f.contract.prototype = paths;
  const probe = f.original.probes[0];
  probe.resource = f.contract.states[0].original.image;
  await f.save();
  fails(await f.check('source'), /实际素材与实现文件/);
  probe.resource = 'ref/gate.svg';
  probe.implementation = 'ref/missing-implementation.js';
  await f.save();
  fails(await f.check('source'), /missing-implementation/);
});

test('重命名同图伪造三态和只有三张图没有跑出连续状态均不能通过', async t => {
  const f = await setup(t);
  const moving = f.built.probes[0];
  moving.frames[1].value = moving.frames[0].value;
  await f.save();
  fails(await f.check('prototype'), /运行读数/);
  moving.frames[1].value = f.original.probes[0].frames[1].value;
  await f.save();
  const images = f.contract.states.filter(row => row.width === 1440).map(row => row.built.image);
  await copyFile(join(f.site, images[0]), join(f.site, images[1]));
  fails(await f.check('paired'), /复用相同截图内容/);
});

test('同画面可如实复用原物，不能拿不同读数的原站帧冒充成品', async t => {
  const f = await setup(t);
  const middle = f.contract.states.find(row => row.id === 'middle');
  await copyFile(join(f.site,middle.original.image), join(f.site,middle.built.image));
  passed(await f.check('prototype'));
  f.built.probes[0].frames[1].value = '82px'; await f.save();
  fails(await f.check('prototype'), /复用相同截图内容/);
});

test('只有已实测的离散转场允许两态；区间不得漏掉原站起点或终点', async t => {
  const f = await setup(t);
  const transition = f.inventory.sequences[0];
  for (const observation of [f.original, f.built]) {
    observation.probes[0].mapping = 'discrete';
    observation.probes[0].frames.splice(1,1);
  }
  f.inventory.samples.find(s => s.id === 'gate').state = 'open';
  transition.states = ['ready','open']; await f.save();
  fails(await f.check('source'), /实际首尾和中段/);
  transition.mapping = 'discrete'; await f.save();
  passed(await f.check('prototype'));
  transition.states = ['middle','ready','open']; await f.save();
  fails(await f.check('source'), /实际首尾/);
  transition.states = ['ready','open','middle']; await f.save();
  fails(await f.check('source'), /实际首尾/);
});

test('标题和场景逐项对照，整章淡入、贴图透明度、错输入与错结果分别拦截', async t => {
  const f = await setup(t);
  for (const record of [f.original, f.built]) {
    const title = record.probes[1], scene = record.probes[0];
    Object.assign(title,{sequence:scene.sequence,driver:'wheel',mapping:'continuous',range:scene.range,layer:'glyph-mask',
      property:'clip-path',frames:structuredClone(scene.frames)});
  }
  await f.save();
  passed(await f.check('prototype'));
  const title = f.built.probes[1];
  for (const [key,replacement] of [['target','chapter'],['layer','overlay-image'],['property','opacity'],
    ['driver','chapter-enter'],['mapping','timed']]) {
    const observed = title[key];
    title[key] = replacement; await f.save();
    fails(await f.check('paired'), new RegExp(key));
    title[key] = observed;
  }
  title.frames[1].at = 0.7; await f.save();
  fails(await f.check('prototype'), /输入进度或逐帧结果/);
  title.frames[1].at = 0.5; title.frames[1].result = '整章消失'; await f.save();
  fails(await f.check('paired'), /输入进度或逐帧结果/);
});

test('样段后可扩建其余章节；更改被测运行代码会使最终运行记录过期', async t => {
  const f = await setup(t);
  const prototype = await f.check('prototype');
  passed(prototype);
  await writeFile(join(f.site,'src/credits.html'),'<h2>新增片尾</h2>');
  const expanded = await f.check('paired');
  passed(expanded); assert.equal(expanded.prototypeHash, prototype.prototypeHash);
  f.built.probes[0].resource = 'src/heading.html'; await f.save();
  fails(await f.check('paired'), /成品资产样本不一致/);
  f.built.probes[0].resource = f.contract.samples.find(s => s.id === 'gate').built.values.resource;
  await f.save();
  await writeFile(join(f.site,'src/drag.js'),'export const fadeSection = () => 0;');
  fails(await f.check('paired'), /drag\.js.*已变化/);
});

test('归一化三帧相同仍会拦下十倍行程或时长，波动容差从原站锁定', async t => {
  const f = await setup(t);
  const source = f.original.probes[0], built = f.built.probes[0];
  built.range.value = 74; await f.save(); passed(await f.check('prototype'));
  built.range = {value:700,unit:'css-px',tolerance:650}; await f.save();
  fails(await f.check('paired'), /行程或时长超出/);
  delete built.range; await f.save();
  fails(await f.check('prototype'), /缺输入行程或播放时长/);
  for (const probe of [source,built]) {
    probe.mapping = 'timed';
    probe.driver = 'playback';
  }
  source.range = {value:300,unit:'ms',tolerance:16};
  built.range = {value:308,unit:'ms'}; await f.save();
  passed(await f.check('prototype'));
  built.range.value = 3000; await f.save();
  fails(await f.check('paired'), /行程或时长超出/);
});

test('静态页使用实测单帧；无标题按观察登记，已有动态不能整体降为静态', async t => {
  const f = await setup(t);
  for (const observation of [f.original, f.built]) {
    const scene = observation.probes[0];
    Object.assign(scene, {sequence:null, driver:'none', mapping:'static',samples:['ink'],
      frames:[{state:'ready',at:0,value:'visible',result:'whole-scene'}]});
    delete scene.range;
    observation.probes = [scene];
  }
  f.original.absent_heading = '仅展示一段正文，DOM 和画面均无标题';
  await f.save();
  fails(await f.check('source'), /已发现标志性转场/);
  f.inventory.sequences = [];
  f.inventory.static_reason = '滚动与触摸前后正文相同';
  f.inventory.states = f.inventory.states.filter(s => s.id === 'ready');
  f.inventory.samples = f.inventory.samples.filter(s => ['palette','surface'].includes(s.kind));
  f.inventory.absent = {control:'这一屏无操作入口',asset:'仅排印与留白，无独立视觉素材'};
  f.contract.states = f.contract.states.filter(s => s.id === 'ready');
  f.contract.samples = f.contract.samples.filter(s => f.inventory.samples.some(item => item.id === s.id));
  const article = '<main id="body">仅有正文</main>';
  for (const record of [f.original,f.built]) {
    const scene = record.probes[0], folder = record === f.original ? 'ref' : 'src';
    const path = folder + '/article.html';
    await writeFile(join(f.site,path),article);
    Object.assign(scene, {target:'正文', layer:'text', property:'visibility',resource:path,implementation:path,
      locator:record === f.original ? 'https://example.test/#body' : '#body'});
  }
  f.built.measured_files = {'src/article.html':createHash('sha256').update(article).digest('hex')};
  await f.save();
  passed(await f.check('prototype'));
  passed(await f.check('paired'));
  delete f.original.absent_heading; await f.save();
  fails(await f.check('source'), /缺标题/);
});
