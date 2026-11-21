// Local synthetic receipts exercise the CLI's order, not browser observations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {surveyFixture} from './fixtures/source-survey.mjs';
import {prototypeFixture} from './fixtures/a-prototype.mjs';
import {componentReuseFixture} from './fixtures/component-reuse.mjs';
import {inspectAReference} from '../lib/a-reference.mjs';
import {inspectWorkflow} from '../workflow-check.mjs';
import {prepareReview,ledger,buildSnapshot,evidenceProblems} from '../lib/review-workflow.mjs';

const cli = fileURLToPath(new URL('../workflow-check.mjs',import.meta.url));
const writeJson = (p,value) => writeFile(p,JSON.stringify(value));
const readConfig = root => readFile(join(root,'.lsf/workflow.json'),'utf8').then(JSON.parse);
function run(root,command,...args) {
  const result = spawnSync(process.execPath,[cli,command,'--root',root,...args],{encoding:'utf8',windowsHide:true});
  return {code:result.status, text:result.stdout+result.stderr};
}
const check = (root,stage,...args) => run(root,'reference-check','--stage',stage,...args);
function succeeds(result) { assert.equal(result.code,0,result.text); return result.text; }
function fails(result,pattern) { assert.notEqual(result.code,0,result.text); assert.match(result.text,pattern); }

async function project(t,initial) {
  const temp = await mkdtemp(join(tmpdir(),'lsf-a-lifecycle-'));
  t.after(() => rm(temp,{recursive:true,force:true}));
  const root = join(temp,'site'), seed = join(temp,'evidence');
  await mkdir(root); await mkdir(seed);
  if (initial) await initial(root);
  const {contract} = await prototypeFixture(seed);
  const survey = await surveyFixture(seed, contract);
  const proof = await inspectAReference(seed,{stage:'source',requirePrototype:true});
  assert(proof.passed,proof.problems.join('\n'));
  const scope = proof.prototypeScope;
  const begin = succeeds(run(root,'begin','--reference',contract.source));
  assert.match(begin,/下一步.*--stage source/);
  await cp(join(seed,'ref'),join(root,'ref'),{recursive:true});
  const manifest = join(root,'ref/a-reference.json');
  async function stage(which) {
    // Keep the source contract immutable while adding only the observed side.
    const c = structuredClone(contract);
    if (which === 'source') delete c.prototype.built;
    if (which !== 'paired') {
      for (const row of c.states) if (which === 'source' || !scope.states.includes(row.id+'@'+row.width)) delete row.built;
      for (const row of c.samples) if (which === 'source' || !scope.samples.includes(row.id)) delete row.built;
    }
    if (which !== 'source') for (const name of await readdir(seed)) {
      if (name !== 'ref') await cp(join(seed,name),join(root,name),{recursive:true});
    }
    await writeJson(manifest,c);
    await survey.stage(which);
    await cp(join(seed,'ref/source-survey.json'),join(root,'ref/source-survey.json'));
    if (which === 'paired') await componentReuseFixture(root);
  }
  await stage('source');
  return {root,contract,stage};
}

async function reviewMaterials(root) {
  const round = 'rounds/round-01', dir = join(root,round);
  await mkdir(join(dir,'shots'),{recursive:true});
  for (const width of [375,768,1440]) await writeFile(join(dir,'shots',width+'.png'),'synthetic '+width);
  await writeFile(join(dir,'changes.md'),'合成测试轮次');
  await writeFile(join(root,'target.md'),'合成测试目标');
  const files = ['target.md'];
  await writeJson(join(dir,'motion-evidence.json'),{build_files:files,build_hash:(await buildSnapshot(root,files)).hash,
    moments:[{moment:'测试',source:'live_observation',observer:'测试',observed_at:'test',observation:'测试记录',verifies:['动效表现','禁用效果']}]});
  return {round,target:'target.md'};
}

test('新 A 只能依次锁原站、早期样段、最终同态证据，正式评审核对现版探针',async t => {
  const {root,contract,stage} = await project(t);
  fails(check(root,'prototype'),/--stage source/);
  fails(check(root,'final'),/--stage source/);
  assert.match((await inspectWorkflow(root)).problems[0],/--stage source/);
  succeeds(check(root,'source'));
  await stage('paired');
  fails(check(root,'final'),/--stage prototype/);
  fails(check(root,'prototype'),/样段以外/);
  assert.equal((await readConfig(root)).reference_prototype,undefined);
  await assert.rejects(prepareReview(root,{round:'rounds/round-01'}),/--stage prototype/);
  assert.deepEqual(await ledger(root),[]);
  await stage('prototype');
  succeeds(check(root,'prototype'));
  const early = (await readConfig(root)).reference_prototype;
  assert(early.evidence_hash && early.source_hash);
  await assert.rejects(prepareReview(root,{round:'rounds/round-01'}),/--stage paired/);
  await stage('paired');
  succeeds(check(root,'final'));
  fails(check(root,'prototype'),/样段已登记/);
  assert.deepEqual((await readConfig(root)).reference_prototype,early);
  const options = await reviewMaterials(root);
  const full = await inspectAReference(root,{stage:'paired',requirePrototype:true});
  const invalidated = structuredClone(contract);
  invalidated.states[0].built.observation += ' 成品补测';
  await writeJson(join(root,'ref/a-reference.json'),invalidated);
  await assert.rejects(prepareReview(root,options),/--stage paired/);
  assert.deepEqual(await ledger(root),[]);
  succeeds(check(root,'paired'));
  const {input} = await prepareReview(root,options);
  for (const side of ['original','built']) {
    assert(input.target.includes(JSON.stringify(full.prototypeEvidence[side])));
    assert(input.evidence.files[contract.prototype[side]]);
  }
  succeeds(check(root,'source','--reason','评审过程中重新进行现场测量'));
  assert((await evidenceProblems(root,input)).some(message => message.includes('早期样段')));
});

test('原站重测需原因并使样段和整站锁失效，final 无法代填',async t => {
  const {root,contract,stage} = await project(t);
  succeeds(check(root,'source'));
  await stage('prototype'); succeeds(check(root,'prototype'));
  await stage('paired'); succeeds(check(root,'paired'));
  contract.states[0].original.observation += ' 源站重新观察';
  await stage('paired');
  fails(check(root,'source'),/--reason/);
  fails(check(root,'paired'),/原站/);
  const stale = await inspectWorkflow(root);
  assert(stale.problems.some(message => message.includes('--stage source')));
  assert(!stale.problems.some(message => message.includes('Gemini')));
  const options = await reviewMaterials(root);
  await assert.rejects(prepareReview(root,options),/原站/);
  assert.deepEqual(await ledger(root),[]);
  succeeds(check(root,'source','--reason','实测原站的停顿已改变'));
  const config = await readConfig(root);
  assert(!config.reference_prototype && !config.reference_paired_hash);
  fails(check(root,'paired'),/--stage prototype/);
  fails(check(root,'prototype'),/样段以外/);
});

test('开工后的页面和整站文案阻止事后补录，显式已有稿入口保留文件',async t => {
  const {root,stage} = await project(t, r => writeFile(join(r,'index.html'),'旧代码'));
  await writeFile(join(root,'index.html'),'先生成的交付稿');
  fails(check(root,'source'),/index\.html/);
  fails(check(root,'source','--existing-draft'),/--reason/);
  succeeds(check(root,'source','--existing-draft','--reason','以先前完成的交付稿开始改造'));
  await stage('prototype');
  await mkdir(join(root,'copy'),{recursive:true});
  await writeJson(join(root,'copy/approved.json'),{title:'已经生成'});
  fails(check(root,'prototype'),/copy\/approved\.json/);
  await stage('source');
  succeeds(check(root,'source','--existing-draft','--reason','定稿早于样段，保留该稿作为改造起点'));
  assert.equal(await readFile(join(root,'copy/approved.json'),'utf8'),'{"title":"已经生成"}');
  await stage('prototype'); succeeds(check(root,'prototype'));
  assert.match((await inspectWorkflow(root)).existing_draft,/定稿早于样段/);
});

test('已有项目基线沿用，旧 A 的 source/paired 不能追认为 v33 样段',async t => {
  const {root} = await project(t, r => writeFile(join(r,'index.html'),'已有页面'));
  succeeds(check(root,'source'));
  const config = await readConfig(root);
  assert.match(config.reference_existing_draft,/begin/);
  delete config.a_reference_version;
  await writeJson(join(root,'.lsf/workflow.json'),config);
  fails(check(root,'prototype'),/历史 A/);
  assert.equal((await readConfig(root)).a_reference_version,undefined);
});

test('历史项目保留材料，完整制作须显式升级；失败迁移不覆盖历史锁',async t => {
  const {root,stage} = await project(t);
  const config = await readConfig(root);
  assert.equal(config.a_reference_version,36);
  config.a_reference_version = 33;
  config.reference_source_hash = 'historical-source';
  config.reference_prototype = {source_hash:'historical-source',evidence_hash:'historical-prototype'};
  config.reference_paired_hash = 'historical-paired';
  await writeJson(join(root,'.lsf/workflow.json'),config);
  fails(check(root,'paired'),/历史 A.*--upgrade/);
  const path = join(root,'ref/source-survey.json');
  const source = JSON.parse(await readFile(path,'utf8'));
  delete source.core_motion; await writeJson(path,source);
  fails(check(root,'source','--upgrade','--existing-draft','--reason','从历史稿补v36观察'),/core_motion/);
  const unchanged = await readConfig(root);
  assert.equal(unchanged.a_reference_version,33);
  assert.equal(unchanged.reference_source_hash,'historical-source');
  assert.deepEqual(unchanged.reference_prototype,config.reference_prototype);
  assert.equal(unchanged.reference_paired_hash,'historical-paired');
  await stage('source');
  assert.match(succeeds(check(root,'source','--upgrade','--existing-draft','--reason','从历史稿补v36观察')),/v36-source-prototype-paired/);
  const adopted = await readConfig(root);
  assert.equal(adopted.a_reference_version,36);
  assert(!adopted.reference_prototype && !adopted.reference_paired_hash && !adopted.reference_failure);
  for (const phase of ['prototype','paired']) {await stage(phase); succeeds(check(root,phase));}
});

test('失败 source 不能由旧锁、恢复文件或后续失败命令自动洗掉',async t => {
  const {root,stage} = await project(t);
  for (const phase of ['source','prototype','paired']) {await stage(phase); succeeds(check(root,phase));}
  const before = await readConfig(root), path = join(root,'ref/source-survey.json');
  const old = await readFile(path,'utf8'), source = JSON.parse(old);
  source.core_motion.status = 'blocked'; source.core_motion.reason = '侦察 socket 权限失败，尚未确认主场景';
  await writeJson(path,source);
  fails(check(root,'source','--reason','重新取证遇阻'),/受阻/);
  assert.equal((await readConfig(root)).reference_paired_hash,before.reference_paired_hash);
  await writeFile(path,old);
  fails(check(root,'prototype'),/上次 source 核验未通过/);
  fails(check(root,'paired'),/上次 source 核验未通过/);
  assert.match((await inspectWorkflow(root)).problems.join('\n'),/上次 source/);
  const options = await reviewMaterials(root);
  await assert.rejects(prepareReview(root,options),/上次 source/);
  assert.deepEqual(await ledger(root),[]);
  await stage('source'); succeeds(check(root,'source','--reason','已恢复浏览器并补齐原站实测'));
  assert.equal((await readConfig(root)).reference_failure,undefined);
  fails(check(root,'paired'),/--stage prototype/);
});

test('静态托管 dist 的提前制作被记录，源码与 hosting 配置不因目录名漏检',async t => {
  const {root} = await project(t,async site => {
    await mkdir(join(site,'.openai')); await mkdir(join(site,'dist'));
    await writeJson(join(site,'.openai/hosting.json'),{static:{directory:'dist'}});
    await writeFile(join(site,'dist/index.html'),'<script src="app.js"></script>');
    await writeFile(join(site,'dist/app.js'),'document.body.dataset.stage = "initial";');
  });
  await writeFile(join(root,'dist/app.js'),'document.body.dataset.stage = "premature";');
  fails(check(root,'source'),/dist\/app\.js/);
  succeeds(check(root,'source','--existing-draft','--reason','保留提前写入的静态稿，从该稿补原站对照'));
});

test('普通中文建站提示触发 A 提醒；只分析时保持安静，提醒不代办登记', async t => {
  const root = await mkdtemp(join(tmpdir(),'lsf-a-prompt-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const hook = fileURLToPath(new URL('../lsf-prompt-hook.mjs',import.meta.url));
  const submit = prompt => spawnSync(process.execPath,[hook],{
    encoding:'utf8', windowsHide:true, input:JSON.stringify({cwd:root,prompt})
  });
  const task = '参考 https://www.shopify.com/editions/winter2026 的风格，做一个介绍湖南长沙的中文网页。';
  const reminder = submit(task);
  assert.equal(reminder.status,0);
  assert.match(JSON.parse(reminder.stdout).hookSpecificOutput.additionalContext,/--stage source.*--stage prototype/);
  assert.equal(submit('先分析如何'+task).stdout,'');
  assert.equal(submit('请制作这个网站的一份 DESIGN.md。').stdout,'');
  assert.equal(submit('使用 $lsf-web-design-md 整理本地仓库的规范。').stdout,'');
  assert.match(submit('根据 DESIGN.md 制作一个新网站。').stdout,/--stage source/);
  assert.deepEqual(await readdir(root),[]);
});
