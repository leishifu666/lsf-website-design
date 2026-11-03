// Negative and positive cases use synthetic observations to exercise the evidence contract.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prototypeFixture} from './fixtures/a-prototype.mjs';
import {surveyFixture} from './fixtures/source-survey.mjs';
import {inspectAReference} from '../lib/a-reference.mjs';

async function setup(t) {
  const site = await mkdtemp(join(tmpdir(),'lsf-survey-test-'));
  t.after(() => rm(site,{recursive:true,force:true}));
  const {contract} = await prototypeFixture(site);
  const {stage,survey,topology} = await surveyFixture(site,contract);
  return {stage,survey,topology, contract, site,
    save:(file,data) => writeFile(join(site,file),JSON.stringify(data)),
    read:file => readFile(join(site,file),'utf8').then(JSON.parse),
    check:stage => inspectAReference(site,{stage,reference:contract.source,requireSurvey:true})};
}
const success = r => assert.deepEqual(r.problems,[]);
const fails = (r,pattern) => assert.match(r.problems.join('\n'),pattern);
const path = 'ref/source-survey.json';

test('完整范围逐类取证；不能只做首屏或把未访问内页写成已覆盖',async t => {
  const f = await setup(t); success(await f.check('source'));
  const scope = f.survey.coverage.pop(); await f.stage('source');
  fails(await f.check('source'),/遗漏原站路径/);
  f.survey.coverage.push(scope);
  f.survey.coverage[2].section = 'intro'; await f.stage('source');
  fails(await f.check('source'),/合并了多个/);
  f.survey.coverage[2].section = 'credits';
  const detail = {id:'course',kind:'page',url:f.contract.source+'courses',sourceUrl:f.contract.source};
  f.topology.entries.push(detail);
  await f.save('ref/scout/topology.json',f.topology);
  const raw = 'ref/scout/runs/test/states/entry/discovery.json';
  const d = await f.read(raw); d.entries.push(detail); await f.save(raw,d);
  f.survey.coverage.push({entries:['course'],disposition:'included',section:'intro'});
  await f.stage('source');
  fails(await f.check('source'),/目标页面尚未实看/);
  Object.assign(f.survey.coverage.at(-1),{disposition:'out-of-scope',reason:'用户指定仅改首页'});
  await f.stage('source'); success(await f.check('source'));
  const category = f.survey.categories.pop(); await f.stage('source');
  fails(await f.check('source'),/缺六类行为审计/);
  f.survey.categories.push({...category,status:'未检查'}); await f.stage('source');
  fails(await f.check('source'),/仍未检查/);
});

test('源锁不受成品进展影响；源文件、区块原规格或遗漏处理会改变验收',async t => {
  const f = await setup(t), initial = await f.check('source'); success(initial);
  await f.stage('prototype'); const mid = await f.check('prototype'); success(mid);
  assert.equal(mid.sourceHash,initial.sourceHash);
  const survey = await f.stage('paired'); const end = await f.check('paired'); success(end);
  assert.equal(end.sourceHash,initial.sourceHash);
  delete survey.sections[1].built.action;
  await f.save(path,survey); fails(await f.check('paired'),/差异、修复/);
  f.survey.sections[1].spec += ' 使用实测左右留白';
  await f.stage('source'); assert.notEqual((await f.check('source')).sourceHash,initial.sourceHash);
  const blocked = f.survey.coverage.at(-1);
  Object.assign(blocked,{disposition:'blocked',reason:'键盘和直达皆显示登录遮层'});
  await f.stage('source');
  const r = await f.check('source'); success(r); assert.match(r.surveyGaps[0],/登录遮层/);
  await f.stage('paired'); fails(await f.check('paired'),/仍有受阻/);
});

test('输出即使改名仍沿用结果标签，错误的运行值也无法通过',async t => {
  const f = await setup(t);
  await f.stage('prototype');
  const built = await f.read('ref/prototype-built.json');
  built.probes[0].frames[1].value = '31px';
  await f.save('ref/prototype-built.json',built);
  fails(await f.check('prototype'),/同态逐帧输出值/);
});

test('模型场景须取运行时几何，两幕转场必须保留每一幕的真实变化',async t => {
  const f = await setup(t);
  const original = await f.read('ref/prototype-original.json');
  original.probes[0].locator = f.contract.source+'gate.glb';
  await f.save('ref/prototype-original.json',original);
  fails(await f.check('source'),/已定位 3D 模型/);
  const b = f.survey.behaviors[0];
  b.mechanism = 'model-3d';
  await f.stage('source'); fails(await f.check('source'),/缺模型几何/);
  const make = (property,pointer,role) => ({property,role,grade:'measured',source:{file:'ref/layers-original.json',pointer}});
  b.assertions.push(make('三角形数','/model/triangles','geometry'));
  const run = {model:{triangles:2216},out:[1,0.6,0],in:[0,0.4,1],copy:[0,0.4,1]};
  await f.save('ref/layers-original.json',run);
  await f.save('ref/layers-built.json',{...run,model:{triangles:2}});
  await f.stage('prototype'); fails(await f.check('prototype'),/成品实测值/);
  await f.save('ref/layers-built.json',run); success(await f.check('prototype'));
  original.probes[0].locator = f.contract.source+'mask.js'; await f.save('ref/prototype-original.json',original);
  b.mechanism = 'scene-composite'; b.assertions = [make('前幕遮罩','/out','outgoing')];
  await f.stage('prototype'); fails(await f.check('prototype'),/两幕均须/);
  b.assertions.push(make('后幕显现','/in','incoming'));
  let survey = await f.stage('prototype'); success(await f.check('prototype'));
  survey.behaviors[0].assertions[1].built.pointer = '/out';
  await f.save(path,survey); fails(await f.check('prototype'),/成品实测值|同一图层/);
  b.assertions[1].source.pointer = '/out'; await f.stage('prototype');
  fails(await f.check('prototype'),/同一图层/);
});

test('来源等级和同一输入实测关联，失败/未知/拟合不能冒充现场确认',async t => {
  const f = await setup(t);
  const b = f.survey.behaviors[0];
  const record = {side:'reference',planSha256:'b'.repeat(64),experiments:[{id:'drag',category:'pointer',status:'ok',
    steps:[{status:'ok',frames:[{x:49}]},{status:'ok',frames:[{x:49}]}]}]};
  b.assertions = [{property:'门扇中点',grade:'measured',source:{file:'ref/replay-original.json',pointer:'/experiments/0/steps/0/frames/0/x'}}];
  await f.save('ref/replay-original.json',record);
  const built = {...record,side:'implementation'};
  await f.save('ref/replay-built.json',built);
  const paired = await f.stage('paired'); success(await f.check('paired'));
  paired.behaviors[0].assertions[0].built.pointer = '/experiments/0/steps/1/frames/0/x';
  await f.save(path,paired); fails(await f.check('paired'),/回放输入计划不一致/);
  b.assertions[0].grade = 'fitted'; b.assertions[0].note = '未经算式拟合';
  await f.stage('source'); fails(await f.check('source'),/真实来源等级/);
  b.assertions[0].grade = 'unknown'; await f.stage('source'); fails(await f.check('source'),/缺 measured/);
  b.assertions[0].grade = 'measured'; record.experiments[0].steps[0].status = 'failed';
  await f.save('ref/replay-original.json',record); await f.stage('source'); fails(await f.check('source'),/成功回放/);
});

test('DOM 声明锚点或当前 hash 不等于目标已呈现；可补视口状态或明确的运行激活标识',async t => {
  const f = await setup(t);
  const raw = 'ref/scout/runs/test/states/entry/discovery.json';
  const record = await f.read(raw);
  record.entries.find(e => e.kind === 'anchor').targetInView = false;
  record.url = f.contract.source + '#credits'; await f.save(raw,record);
  fails(await f.check('source'),/尚未出现在视口/);
  const row = f.survey.coverage.find(r => r.entries.includes('go-credits'));
  row.witness = {file:'ref/visible-chapter.json',pointer:'/activeSection'};
  await f.save(row.witness.file,{activeSection:'intro'}); await f.stage('source');
  fails(await f.check('source'),/与目标不一致/);
  await f.save(row.witness.file,{activeSection:'credits'}); success(await f.check('source'));
  record.entries.find(e => e.id === 'credits').inViewport = false; await f.save(raw,record);
  fails(await f.check('source'),/credits.*尚未出现在视口/);
});

test('纯静态页可完成逐区块核验，无需发明动态行为或模型',async t => {
  const f = await setup(t), inv = await f.read(f.contract.inventory);
  inv.sequences = []; inv.static_reason = '各区块在停顿和滚动前后保持排版';
  inv.states = inv.states.filter(s => ['ready','credits'].includes(s.id));
  inv.samples = inv.samples.filter(s => s.kind !== 'asset'); inv.absent = {asset:'仅有文字和留白'};
  f.contract.states = f.contract.states.filter(row => inv.states.some(s => s.id === row.id));
  f.contract.samples = f.contract.samples.filter(row => inv.samples.some(s => s.id === row.id));
  await f.save(f.contract.inventory,inv); await f.save('ref/a-reference.json',f.contract);
  for (const side of ['original','built']) {
    const filename = f.contract.prototype[side], obs = await f.read(filename);
    const heading = obs.probes[1];
    obs.probes = [{...heading,id:'article',role:'scene'},heading];
    await f.save(filename,obs);
  }
  const ledger = await f.stage('paired');
  Object.assign(ledger.sections[0],{states:['ready'],samples:['ink','space'],assetsAbsent:'文字排印'});
  ledger.behaviors = [];
  for (const c of ledger.categories) c.status = '已确认无此效果';
  await f.save(path,ledger);
  success(await f.check('paired'));
});

test('区块规格读取组件树的真实布局、样式与层序；同状态可解释主题占幅差异', async t => {
  const f = await setup(t), section = f.survey.sections[0];
  const doc = {selector:'main',viewport:{width:1440,height:900},
    styles:[{display:'grid',position:'relative','font-size':'28px'}],
    trees:[{tag:'main',children:[{tag:'section',rect:{x:130,y:48,width:1120,height:540},style:0,children:[{tag:'h1'}, {tag:'figure'}]}]}]};
  await f.save('ref/component-0.json',doc);
  section.layout = {state:'ready',file:'ref/component-0.json',pointer:'/trees/0/children/0'};
  await f.stage('source'); success(await f.check('source'));
  const node = doc.trees[0].children[0];
  delete node.children; await f.save('ref/component-0.json',doc);
  fails(await f.check('source'),/子节点或图层/);
  node.children = [{tag:'h1'},{tag:'figure'}];
  await f.save('ref/component-0.json',doc);
  const data = await f.stage('paired');
  data.sections[0].built.layout = {file:'ref/built-component.json'};
  const built = {selector:'#intro',viewport:doc.viewport,rect:{...node.rect,width:940},
    style:{display:'flex',position:'relative','font-size':'24px'},children:[{tag:'figure'},{tag:'h1'}]};
  await f.save('ref/built-component.json',built);
  data.sections[0].built.verdict = 'match';
  await f.save(path,data); fails(await f.check('paired'),/排版模式或图层顺序不同/);
  data.sections[0].built.verdict = 'adapted'; await f.save(path,data);
  const proof = await f.check('paired'); success(proof);
  assert.equal(proof.layoutPairs[0].sizeDelta.width,-180);
  built.viewport = {width:1440,height:700}; await f.save('ref/built-component.json',built);
  fails(await f.check('paired'),/成品 DOM.*视口/);
  doc.trees = [node]; await f.save('ref/component-0.json',doc);
  await f.save('ref/components.json',[{selector:'main',matched:1,file:'component-0.json'}]);
  section.layout = {state:'ready',file:'ref/components.json',pointer:'/0'};
  await f.stage('source'); success(await f.check('source'));
});
