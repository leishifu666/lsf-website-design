// Synthetic receipts test the evidence rules; they do not assert a live browser visit.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prototypeFixture} from './fixtures/a-prototype.mjs';
import {surveyFixture} from './fixtures/source-survey.mjs';
import {componentReuseFixture} from './fixtures/component-reuse.mjs';
import {inspectAReference} from '../lib/a-reference.mjs';
import {inspectAssetsPlan} from '../lib/assets-plan.mjs';

async function setup(t) {
  const site = await mkdtemp(join(tmpdir(),'lsf-core-motion-'));
  t.after(()=>rm(site,{recursive:true,force:true}));
  const {contract,inventory} = await prototypeFixture(site);
  const {survey,stage} = await surveyFixture(site,contract);
  return {site,contract,inventory,survey,stage,
    save:(file,value)=>writeFile(join(site,file),JSON.stringify(value)),
    read:file=>readFile(join(site,file),'utf8').then(JSON.parse),
    check:stage=>inspectAReference(site,{stage,reference:contract.source,requirePrototype:true,requireSurvey:true,requireCore:true})};
}
const ok = result=>assert.deepEqual(result.problems,[]);
const bad = (result,pattern)=>assert.match(result.problems.join('\n'),pattern);

test('动态 A 必须先明确核心适用，unknown/blocked/漏字段均不能锁 source',async t=>{
  const f = await setup(t); ok(await f.check('source'));
  for (const status of ['unknown','blocked']) {
    f.survey.core_motion.status = status; await f.stage('source');
    bad(await f.check('source'),/尚未确认或受阻/);
  }
  f.survey.core_motion.status = 'none'; f.survey.core_motion.effects = [];
  await f.stage('source'); bad(await f.check('source'),/标志性动态序列/);
  delete f.survey.core_motion; await f.stage('source'); bad(await f.check('source'),/v36/);
});

test('代表样段只绑定选中核心，其余核心保留 source 观察并在 paired 验证',async t=>{
  const f = await setup(t);
  f.inventory.sequences.push({id:'scroll-scene',input:'scroll',states:['ready','middle','open']});
  await f.save(f.contract.inventory,f.inventory);
  const later = structuredClone(f.survey.behaviors[0]);
  Object.assign(later,{id:'scroll-scene',category:'scroll',trigger:'滚轮'});
  later.assertions = [{property:'第二场景进度',grade:'measured',source:{file:'ref/later-original.json',pointer:'/progress'}}];
  f.survey.behaviors.push(later);
  f.survey.categories.find(c=>c.id === 'scroll').status = '已测量';
  f.survey.core_motion.effects.push({id:'later',behavior:'scroll-scene',assets:['gate']});
  await f.save('ref/later-original.json',{progress:[0,0.5,1]});
  await f.save('ref/later-built.json',{progress:[0,0.5,1]});
  await f.stage('source'); ok(await f.check('source'));
  await f.stage('prototype'); const sample = await f.check('prototype'); ok(sample);
  assert.deepEqual(sample.earlyBehaviors,['drag']);
  assert(!sample.survey.behaviors.find(b=>b.id==='scroll-scene').built);
  await componentReuseFixture(f.site); await f.stage('paired'); ok(await f.check('paired'));
  const full = await f.read('ref/source-survey.json'); delete full.behaviors[1].assertions[0].built;
  await f.save('ref/source-survey.json',full); bad(await f.check('paired'),/两侧须独立实测/);
});

test('五个源码组件不能抵核心模型；GLB 研究与 DOM 自写必须分开',async t=>{
  const f = await setup(t);
  await componentReuseFixture(f.site); ok(await inspectAssetsPlan(f.site));
  f.contract.samples.find(s=>s.id==='gate').original.values.resource = 'https://example.test/gate.glb';
  await f.save('ref/a-reference.json',f.contract);
  bad(await f.check('source'),/动态模型资源.*model-3d/);
  const b = f.survey.behaviors[0]; b.mechanism = 'model-3d';
  await f.stage('source'); bad(await f.check('source'),/缺模型几何/);
  b.assertions.push({property:'三角形数',role:'geometry',grade:'measured',source:{file:'ref/model-original.json',pointer:'/mesh/geometry/triangles'}});
  await f.save('ref/model-original.json',{mesh:{geometry:{triangles:2216}},renderer:{context:'webgl2'}});
  await f.save('ref/model-built.json',{mesh:{geometry:{triangles:2}},renderer:{context:'webgl2'}});
  await f.stage('source'); bad(await f.check('source'),/renderer/);
  b.assertions.push({property:'上下文',role:'renderer',grade:'measured',source:{file:'ref/model-original.json',pointer:'/renderer/context'}});
  await f.stage('source'); ok(await f.check('source'));
  await f.stage('prototype'); bad(await f.check('prototype'),/成品实测值/);
  await f.save('ref/model-built.json',{mesh:{geometry:{triangles:2216}},renderer:{context:'webgl2'}});
  ok(await f.check('prototype'));
});

test('WebGL 正常环境与 fallback 单独记录；双方降级不能满足主场景',async t=>{
  const f = await setup(t), b = f.survey.behaviors[0];
  b.mechanism = 'webgl'; b.variant = 'fallback';
  await f.stage('source'); bad(await f.check('source'),/fallback/);
  b.variant = 'primary';
  b.assertions.push({property:'上下文',role:'renderer',grade:'measured',source:{file:'ref/context-original.json',pointer:'/context'}});
  await f.save('ref/context-original.json',{context:'canvas2d'});
  await f.save('ref/context-built.json',{context:'canvas2d'});
  await f.stage('source'); bad(await f.check('source'),/正常环境.*fallback/);
  await f.save('ref/context-original.json',{context:'webgl2'}); await f.stage('prototype');
  bad(await f.check('prototype'),/成品实测值/);
  await f.save('ref/context-built.json',{context:'webgl2'}); ok(await f.check('prototype'));
});

test('静态 A 依据 none 仍走三阶段；静态 Canvas 线索不强制 Three',async t=>{
  const f = await setup(t);
  Object.assign(f.inventory,{sequences:[],static_reason:'停顿、滚动与输入后主体无动态变化'});
  f.inventory.states = f.inventory.states.filter(s=>['ready','credits'].includes(s.id));
  f.inventory.samples = f.inventory.samples.filter(s=>s.kind!=='asset'); f.inventory.absent={asset:'文字与静态 Canvas 背景'};
  f.contract.states = f.contract.states.filter(s=>f.inventory.states.some(i=>i.id===s.id));
  f.contract.samples = f.contract.samples.filter(s=>f.inventory.samples.some(i=>i.id===s.id));
  await f.save(f.contract.inventory,f.inventory); await f.save('ref/a-reference.json',f.contract);
  for (const side of ['original','built']) {
    const path=f.contract.prototype[side], record=await f.read(path), heading=record.probes[1];
    record.probes=[{...heading,id:'article',role:'scene'},heading]; await f.save(path,record);
  }
  Object.assign(f.survey.sections[0],{states:['ready'],samples:['ink','space'],assetsAbsent:'文字与静态 Canvas 背景'});
  f.survey.behaviors=[];
  for (const c of f.survey.categories) c.status='已确认无此效果';
  f.survey.core_motion={status:'none',reason:'真实输入不产生场景动画，Canvas 只画固定背景',basis:'ref/input-observations.json',effects:[]};
  await f.save('ref/input-observations.json',{canvases:[{width:1440,height:900}],observations:['真实输入后背景保持不动']});
  for (const phase of ['source','prototype']) {await f.stage(phase);ok(await f.check(phase));}
  await componentReuseFixture(f.site); await f.stage('paired'); ok(await f.check('paired'));
});
