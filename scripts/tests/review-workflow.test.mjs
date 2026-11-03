// Synthetic local receipts test workflow behavior; no model or website is invoked.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {makeReviewPlan,prepareReview,finishReview,ledger,budgetFor,inspectReview,readJson,buildSnapshot,within} from '../lib/review-workflow.mjs';
import {reviewPolicy,validateDesignReview,stopReviewHook} from '../review-policy.mjs';
import {inspectWorkflow} from '../workflow-check.mjs';
import {inspectAReference} from '../lib/a-reference.mjs';
import {candidateCopyProblems,pageCopyProblems} from '../lib/copy-necessity.mjs';

const scratch=resolve(process.env.LSF_TEST_TMP||join(tmpdir(),'lsf-review-v23-tests'));
await mkdir(scratch,{recursive:true});
const roots=[];
const scripts=fileURLToPath(new URL('../',import.meta.url));
const json=(p,v)=>writeFile(p,JSON.stringify(v,null,2));
async function fixture(){
 const root=await mkdtemp(join(scratch,'case-'));roots.push(root);
 await mkdir(join(root,'.lsf'));await mkdir(join(root,'src'));
 await writeFile(join(root,'src/index.html'),'<h1>本地合成夹具</h1>');
 await writeFile(join(root,'target.md'),'合成夹具，验证工作流，不代表真实页面或独立审美质量');
 await json(join(root,'.lsf/workflow.json'),{schema:2,site:root,status:'in-progress',review_status:'in-progress',review_plan:makeReviewPlan()});
 await writeFile(join(root,'.lsf/active'),'fixture');
 return root;
}
async function evidence(root,n){
 const round=`rounds/round-${String(n).padStart(2,'0')}`,dir=join(root,round);
 await mkdir(join(dir,'shots'),{recursive:true});
 for(const width of [375,768,1440])await writeFile(join(dir,'shots',width+'.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1uoAAAAASUVORK5CYII=','base64'));
 await writeFile(join(dir,'changes.md'),'仅为测试用合成记录');
 await json(join(dir,'checks.json'),{fixture:true});
 await json(join(dir,'motion-evidence.json'),{build_files:['src'],build_hash:(await buildSnapshot(root,['src'])).hash,moments:[{moment:'合成观察记录',source:'live_observation',files:[],observer:'fixture-only',observed_at:'2026-10-31T00:00:00Z',observation:'合成输入，不冒充实际播放',verifies:['动效表现','禁用效果']}]});
 return round;
}
const dims=(scores=[25,16,16,16,12])=>reviewPolicy.dimensions.map((d,i)=>({name:d.name,max:d.max,score:scores[i],evidence:'合成证据',deductions:'合成扣分说明'}));

// Synthetic evidence exercises the contract, not a live comparison or aesthetic judgement.
async function referenceFixture(root) {
  await mkdir(join(root, 'ref'), {recursive:true});
  const siteRef = 'https://example.test/';
  const widths = [375,768,1440];
  const inventory = {discovery:'ref/sweep.json', states:[
    {id:'entry',trigger:'打开首页',widths}, {id:'entered',trigger:'开门完成',widths:[1440]}, {id:'gate-mid',trigger:'拖动后门开启一半',widths:[1440]}
  ], sequences:[{id:'gate-open',input:'拖动',states:['entry','gate-mid','entered']}], samples:[
    {id:'colors',kind:'palette',state:'entry'}, {id:'cta',kind:'control',state:'entry'},
    {id:'frame',kind:'surface',state:'entry'}, {id:'gate',kind:'asset',state:'gate-mid'}
  ]};
  const values = [
    {foreground:'#fff',background:'#102',accent:'#fc0'},
    {color:'#102',background:'#fc0',border:'none',radius:'2px',padding:'8px 12px',type:'16px/24px sans',feedback:'底色 160ms'},
    {layers:'0',boundary:'留白'}, {resource:'https://example.test/gate.glb',binding:'hinge',shape:'双扇',motion:'拖动驱动开合'}
  ];
  await json(join(root,'ref/sweep.json'), {entry:'拖动到门中段，记录输入/帧'});
  await json(join(root,'ref/inventory.json'), inventory);
  const contract = {version:1,source:siteRef,inventory:'ref/inventory.json',states:[],samples:[]};
  for (const state of inventory.states) for (const width of state.widths) {
    const row = {id:state.id,width};
    for (const side of ['original','built']) {
      const image = 'ref/'+side+'-'+state.id+'-'+width+'.png';
      const viewport = {width,height:900};
      await writeFile(join(root,image),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1uoAAAAASUVORK5CYII=','base64'));
      row[side] = {status:'observed',image,viewport,observation:state.trigger};
    }
    contract.states.push(row);
  }
  for (const [index,item] of inventory.samples.entries()) {
    const record = {id:item.id,verdict:'match'};
    for(const side of ['original','built']) {
      const evidence = 'ref/'+side+'-'+item.id+'.json';
      const v = {...values[index]};
      if (item.kind === 'asset' && side === 'built') v.resource = 'src/index.html';
      record[side] = {evidence,values:v}; await json(join(root,evidence),v);
    }
    if (item.kind === 'asset') Object.assign(record,{strategy:'rebuild',keep:'拖动门绕轴打开',change:'换长沙城门造型',rights:'自制替换素材'});
    contract.samples.push(record);
  }
  await json(join(root,'ref/a-reference.json'),contract);
  const path=join(root,'.lsf/workflow.json'),config=await readJson(path);
  config.design_mode='A';config.reference=siteRef;await json(path,config);
  const lock=spawnSync(process.execPath,[join(scripts,'workflow-check.mjs'),'reference-check','--root',root,'--stage','source'],{encoding:'utf8',windowsHide:true});
  assert.equal(lock.status,0,lock.stdout+lock.stderr);
  return contract;
}

test('成品文案审核缺失/未通过会拦截；审后变化不能沿用通过',async()=>{
 const root=await fixture();
 const configPath=join(root,'.lsf/workflow.json');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 config.requirements=['page-copy-review'];await json(configPath,config);
 const pageProblems=async()=> (await inspectWorkflow(root)).problems.filter(p=>/成品页面|独立成品文案/.test(p));
 assert((await pageProblems()).some(p=>p.includes('缺有效')));
 await mkdir(join(root,'copy'));
 const path=join(root,'copy/page-review.json');
 const receipt={mode:'page',verdict:'changes_required',coverage:[{section:'合成首屏',viewport:375,state:'default',evidence:'合成记录，非真实网页'}],findings:[{id:'R1',status:'open'}],_meta:{agent_id:'fixture-only',at:'2026-10-31',build_files:['src'],build_hash:(await buildSnapshot(root,['src'])).hash}};
 await json(path,receipt);
 assert((await pageProblems()).some(p=>p.includes('未通过')));
 assert((await pageProblems()).some(p=>p.includes('未处理')));
 receipt.verdict='passed';receipt.findings[0].status='resolved';await json(path,receipt);
 assert((await pageProblems()).some(p=>p.includes('快照')));
 receipt.coverage[0].text_snapshot='copy/screen.json';
 receipt.coverage[0].decisions=[{id:'title',action:'keep',loss:'访客失去城市标识'}];
 await json(join(root,'copy/screen.json'),{state:'default',viewport:375,items:[{id:'title',role:'heading',text:'长沙'}]});
 receipt.coverage.push({...receipt.coverage[0],viewport:1440,text_snapshot:'copy/desktop.json'});
 await json(join(root,'copy/desktop.json'),{state:'default',viewport:1440,items:[{id:'title',role:'heading',text:'长沙'}]});
 await json(path,receipt);
 assert.deepEqual(await pageProblems(),[]);
 await writeFile(join(root,'src/index.html'),'<h1>本地合成夹具</h1><p>审后新增文案</p>');
 assert((await pageProblems()).some(p=>p.includes('审核后已变化')));
});
function report({type='full_blind',scores,blocked=false,partial=false,resolved=true}={}){
 const dimensions=partial?[dims()[0]]:dims(scores);
 return {schema_version:2,review_type:type,rubric_id:reviewPolicy.id,total:partial?null:dimensions.reduce((s,d)=>s+d.score,0),dimensions,hard_gates:reviewPolicy.visual_gates.map(gate=>({gate,pass:true,note:'合成记录'})),blocking_issues:blocked?[{id:'B1',category:'score_gap',dimension:'构图与空间',where:'首屏',evidence:'合成证据',impact:'高',fix:'合成修法',acceptance:'合成条件'}]:[],suggestions:[],evidence_gaps:[],issue_results:type==='full_blind'?[]:[{id:'B1',status:resolved?'resolved':'unresolved',evidence:'合成复核证据'}],style_fidelity:[],animation_audit:['合成输入，非真实播放'],keep:'保留合成优点',engineering_notes:[],not_applicable:[],verdict:blocked?'未达标':'达标'};
}
async function returned(root,prepared,r,agent='fixture-reviewer-A'){
 const path=join(prepared.dir,'review-response.json');await json(path,r);
 return finishReview(root,{call:prepared.input.call,result:path,agent});
}
async function failedFirst(root){
 const a=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});
 await returned(root,a,report({scores:[21,16,16,16,12],blocked:true}));
 await json(join(root,'responses.json'),{scope:'local',touched_dimensions:['构图与空间'],items:[{id:'B1',decision:'accept',evidence:['new screenshot']}]});
 return a;
}
after(async()=>{for(const root of roots){assert(within(scratch,root));await rm(root,{recursive:true,force:true});}});

test('首审通过立即收尾；统一审查包包含unslop，不能再自动派发',async()=>{
 const root=await fixture(),p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});
 assert(p.prompt.includes('unslop 评审专用适配'));
 const r=await returned(root,p,report());assert.equal(r.review_status,'passed');assert.equal(r.budget.used,1);
 await assert.rejects(prepareReview(root,{round:await evidence(root,2),target:'target.md'}),/收尾/);
 const result=await inspectWorkflow(root);assert.equal(result.passed,false);assert(result.problems.some(p=>p.includes('Gemini')));assert.equal(stopReviewHook(result).decision,undefined);
});
test('真实审查包按制作模式选择资料；旧项目不误套原创且保留完整项目规则',async()=>{
 for(const mode of ['A','C',null]){
  const root=await fixture();
  await writeFile(join(root,'AGENTS.md'),'# 本项目必须保留的完整约束\n\n不要因为缩短技能材料而丢掉本段。');
  if(mode==='A') await referenceFixture(root);
  const p=await prepareReview(root,{round:await evidence(root,1),target:'target.md',...(mode==='C'?{designMode:'C'}:{})});
  assert.equal(p.input.design_mode,mode);
  assert(!p.input.method_files.includes('SKILL.md'));
  assert(p.prompt.includes('不要因为缩短技能材料而丢掉本段。'));
  assert(p.input.method_files.includes('references/评审适用范围.md#'+(mode?'模式'+mode.toLowerCase():'模式未知')));
  assert.equal(p.input.method_files.includes('references/反套路清单.md'),mode==='C');
 }
 const root=await fixture();
 await assert.rejects(prepareReview(root,{round:await evidence(root,1),target:'target.md',designMode:'invented'}),/仅支持/);
 assert.equal((await ledger(root)).length,0);
});
test('全量首审＋局部复核：不改原分，按维度来源合成85',async()=>{
 const root=await fixture();await failedFirst(root);
 const p=await prepareReview(root,{round:await evidence(root,2),target:'target.md',mode:'verify',responses:'responses.json'});
 assert.equal(p.input.review_type,'targeted_verification');assert.deepEqual(p.input.expected_dimensions,['构图与空间']);
 assert(!p.prompt.includes('"score":21'));
 const r=await returned(root,p,report({type:'targeted_verification',partial:true}),'fixture-reviewer-B');
 assert.equal(r.final.total,85);assert.equal(r.final.basis,'composite');assert.equal(r.final.dimensions[1].source,'first-review');assert.equal(r.review_status,'passed');
 assert.equal((await readJson(join(root,'rounds/round-01/review.json'))).total,81);
 assert.deepEqual(validateDesignReview(r.final),[]);
});
test('复核未解决则closed-unmet；第3次被拒绝，不由Hook继续空转',async()=>{
 const root=await fixture();await failedFirst(root);
 const p=await prepareReview(root,{round:await evidence(root,2),target:'target.md',mode:'verify',responses:'responses.json'});
 const r=await returned(root,p,report({type:'targeted_verification',partial:true,blocked:true,resolved:false}),'fixture-reviewer-B');
 assert.equal(r.review_status,'closed-unmet');assert.equal(r.budget.remaining,0);
 const inspected=await inspectWorkflow(root);assert.equal(inspected.passed,false);assert.equal(stopReviewHook(inspected).decision,undefined);
 await assert.rejects(prepareReview(root,{round:await evidence(root,3),target:'target.md'}),/收尾|预算/);
});
test('静态图缺动效证据在派发前失败，不消费调用',async()=>{
 const root=await fixture(),round=await evidence(root,1);await rm(join(root,round,'motion-evidence.json'));
 await assert.rejects(prepareReview(root,{round,target:'target.md'}));assert.equal((await ledger(root)).length,0);
});
test('各维过底线但总分84，无可见问题是无效评审并计入预算',async()=>{
 const root=await fixture(),p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});
 const r=await returned(root,p,report({scores:[24,16,16,16,12]}));assert.equal(r.status,'invalid');assert.equal(r.budget.used,1);assert(r.errors.some(e=>e.includes('分数不足')));
});
test('宿主失败与exec超时共享两次额度',async()=>{
 const root=await fixture();let p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});
 await finishReview(root,{call:p.input.call,status:'failed',reason:'合成传输失败'});
 p=await prepareReview(root,{round:await evidence(root,2),target:'target.md',channel:'exec'});
 const r=await finishReview(root,{call:p.input.call,status:'timeout',reason:'合成超时'});
 assert.equal(r.review_status,'closed-unverified');assert.equal(r.budget.used,2);assert.equal(r.budget.remaining,0);
});
test('评审后源码变动使结论过期；修改final-score不能伪造验收',async()=>{
 const root=await fixture(),p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});await returned(root,p,report());
 await json(join(p.dir,'final-score.json'),{total:100,verdict:'达标'});
 assert.equal((await inspectReview(root,await readJson(join(root,'.lsf/workflow.json')))).final.total,85);
 await writeFile(join(root,'src/index.html'),'changed');
 const r=await inspectReview(root,await readJson(join(root,'.lsf/workflow.json')));assert.equal(r.state,'changed-after-review');assert(r.problems.some(p=>p.includes('构建输入')));
});
test('回收前截图变化使本次结果无效，不能挂旧图结论',async()=>{
 const root=await fixture(),p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});
 await writeFile(join(p.dir,'shots/375.png'),'changed');const r=await returned(root,p,report());assert.equal(r.status,'invalid');assert(r.errors.some(e=>e.includes('证据已变化')));
});
test('全局修改在同一次剩余额度内扩大五维，不追加调用',async()=>{
 const root=await fixture();await failedFirst(root);await json(join(root,'responses.json'),{scope:'global',touched_dimensions:[],items:[{id:'B1',decision:'accept'}]});
 const p=await prepareReview(root,{round:await evidence(root,2),target:'target.md',mode:'verify',responses:'responses.json'});
 assert.equal(p.input.review_type,'full_rescore_with_issue_list');assert.equal(p.input.expected_dimensions.length,5);
 const r=await returned(root,p,report({type:'full_rescore_with_issue_list'}),'fixture-reviewer-B');assert.equal(r.final.basis,'full_rescore_with_issue_list');assert.equal(r.budget.used,2);
});
test('旧项目迁移保留round-05；新策略不能重复迁移归零',async()=>{
 const root=await fixture();await json(join(root,'.lsf/workflow.json'),{schema:1,site:root});await mkdir(join(root,'rounds/round-05'),{recursive:true});await writeFile(join(root,'rounds/round-05/review.json'),'historical');
 const argv=[join(scripts,'workflow-check.mjs'),'adopt-review-policy','--root',root,'--reason','合成测试迁移'];
 let r=spawnSync(process.execPath,argv,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 assert.equal(await readFile(join(root,'rounds/round-05/review.json'),'utf8'),'historical');
 assert.equal(budgetFor(await readJson(join(root,'.lsf/workflow.json')),await ledger(root)).used,0);
 r=spawnSync(process.execPath,argv,{encoding:'utf8'});assert.notEqual(r.status,0);
});
test('exec未说明外部模型不可用或当前型号时不派发、不消费预算',async()=>{
 const root=await fixture(),round=await evidence(root,1);
 const argv=[join(scripts,'review-round.mjs'),join(root,round),'--root',root,'--target',join(root,'target.md')];
 let r=spawnSync(process.execPath,argv,{encoding:'utf8'});assert.equal(r.status,2);assert.equal((await ledger(root)).length,0);
 r=spawnSync(process.execPath,[...argv,'--fallback-reason','测试夹具：无外部模型'],{encoding:'utf8'});assert.equal(r.status,2);assert.equal((await ledger(root)).length,0);
});
test('真实子进程启动失败也登记一次exec尝试，且不启动外部模型',async()=>{
 const root=await fixture(),round=await evidence(root,1);
 const r=spawnSync(process.execPath,[join(scripts,'review-round.mjs'),join(root,round),'--root',root,'--target',join(root,'target.md'),'--fallback-reason','测试夹具：无外部模型，不执行真实调用','--model','fixture-current-model'],{encoding:'utf8',env:{...process.env,LSF_CODEX_EXE:join(root,'does-not-exist.exe')}});
 assert.equal(r.status,1,r.stderr);const events=await ledger(root);assert.equal(events.filter(e=>e.event==='reserved').length,1);assert.equal(events.at(-1).status,'failed');
});
test('拒绝无引用驳回；未验证约束不能通过',async()=>{
 const root=await fixture();await failedFirst(root);await json(join(root,'responses.json'),{scope:'local',touched_dimensions:['构图与空间'],items:[{id:'B1',decision:'reject'}]});
 await assert.rejects(prepareReview(root,{round:await evidence(root,2),target:'target.md',mode:'verify',responses:'responses.json'}),/驳回须附/);
 const r=report();r.evidence_gaps=[{gate_or_item:'禁用效果',missing:'缺悬停观察',needed:'实际悬停'}];r.hard_gates[1].pass=false;
 assert(validateDesignReview(r).some(p=>p.includes('未验证')));
});
test('显式启用的获奖专项可以在默认首审达标后使用独立范围',async()=>{
 const root=await fixture();let c=await readJson(join(root,'.lsf/workflow.json'));c.review_plan=makeReviewPlan('polish');await json(join(root,'.lsf/workflow.json'),c);
 const first=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});await returned(root,first,report());
 const pending=await inspectReview(root,await readJson(join(root,'.lsf/workflow.json')));assert.equal(pending.state,'in-progress');assert(pending.problems.some(p=>p.includes('polish')));
 const next=await prepareReview(root,{round:await evidence(root,2),target:'target.md',scope:'polish'});assert.equal(next.input.scope,'polish');
 const r=await returned(root,next,report(),'fixture-polish-reviewer');assert.equal(r.budget.used,1);assert.equal(r.review_status,'passed');
 assert.equal(budgetFor(await readJson(join(root,'.lsf/workflow.json')),await ledger(root),'default').used,1);
});
test('真实Hook进程对闭合未达标只报告，其他文案缺项仍未通过',async()=>{
 const root=await fixture();let c=await readJson(join(root,'.lsf/workflow.json'));c.review_status='closed-unverified';await json(join(root,'.lsf/workflow.json'),c);
 const r=spawnSync(process.execPath,[join(scripts,'lsf-stop-gate.mjs')],{input:JSON.stringify({cwd:root}),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const output=JSON.parse(r.stdout);assert.equal(output.decision,undefined);assert(output.systemMessage.includes('未通过'));
});
test('收尾HTML展示首审结论与分数来源，不需外部模型',async()=>{
 const root=await fixture(),p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});await returned(root,p,report());
 const r=spawnSync(process.execPath,[join(scripts,'round-report.mjs'),'build',join(root,'rounds')],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const html=await readFile(join(root,'rounds/index.html'),'utf8');assert(html.includes('首审全量盲评'));assert(html.includes('85'));assert(!html.includes('undefined'));
});

test('固定审查包包含项目约束、设计与显式项目skill规则正文',async()=>{
 const root=await fixture();
 await writeFile(join(root,'AGENTS.md'),'本项目规则：页面必须保留品牌场景。');
 await writeFile(join(root,'DESIGN.md'),'项目设计基准：铜色产品实体与分层阴影。');
 await mkdir(join(root,'.agents/skills/project-rules'),{recursive:true});
 await writeFile(join(root,'.agents/skills/project-rules/SKILL.md'),'项目收藏规则：圆角与光学对齐按品牌对象适配。');
 await json(join(root,'.lsf/review-rules.json'),{files:['.agents/skills/project-rules/SKILL.md']});
 const p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});
 for(const text of ['独立视觉评审固定提示词','审查规则索引','页面必须保留品牌场景','铜色产品实体','圆角与光学对齐'])assert(p.prompt.includes(text),text);
 assert.equal(p.input.rule_sources.length,4);
 assert(p.input.rule_sources.every(r=>r.hash&&r.file&&!Object.hasOwn(r,'text')));
 assert.equal((await readJson(join(p.dir,'review-input.json'))).rule_sources.length,4);
});

test('项目规则在审后修改或新增时旧结论过期',async()=>{
 const root=await fixture();await writeFile(join(root,'DESIGN.md'),'合成项目规则A');
 const p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});await returned(root,p,report());
 await writeFile(join(root,'DESIGN.md'),'合成项目规则B');
 let checked=await inspectReview(root,await readJson(join(root,'.lsf/workflow.json')));
 assert.equal(checked.state,'changed-after-review');assert(checked.problems.some(p=>p.includes('项目规则已变化')));
 await writeFile(join(root,'DESIGN.md'),'合成项目规则A');await writeFile(join(root,'AGENTS.md'),'新加的项目约束');
 checked=await inspectReview(root,await readJson(join(root,'.lsf/workflow.json')));
 assert.equal(checked.state,'changed-after-review');
});

test('项目规则缺失或越界在派发前失败且不占模型调用预算',async()=>{
 const root=await fixture(),round=await evidence(root,1);
 await json(join(root,'.lsf/review-rules.json'),{files:['missing-rule.md']});
 await assert.rejects(prepareReview(root,{round,target:'target.md'}),/ENOENT/);
 assert.equal((await ledger(root)).length,0);
 await json(join(root,'.lsf/review-rules.json'),{files:['../outside-project.md']});
 await assert.rejects(prepareReview(root,{round,target:'target.md'}),/超出范围/);
 assert.equal((await ledger(root)).length,0);
});

test('独立评审入口可新建仅评审台账，不要求Gemini产物也不覆盖已有记录',async()=>{
 const root=await mkdtemp(join(scratch,'review-only-'));roots.push(root);
 await mkdir(join(root,'src'));await writeFile(join(root,'src/index.html'),'<h1>合成页面</h1>');
 await writeFile(join(root,'target.md'),'仅视觉评审合成测试');
 const command=[join(scripts,'workflow-check.mjs'),'begin','--root',root,'--purpose','review','--design-mode','A'];
 const started=spawnSync(process.execPath,command,{encoding:'utf8',windowsHide:true});assert.equal(started.status,0,started.stderr);
 const config=await readJson(join(root,'.lsf/workflow.json'));assert.equal(config.purpose,'review');assert.equal(config.design_mode,'A');assert.deepEqual(config.requirements,['design-review']);
 const second=spawnSync(process.execPath,command,{encoding:'utf8',windowsHide:true});assert.equal(second.status,2);
 const p=await prepareReview(root,{round:await evidence(root,1),target:'target.md'});assert.equal(p.input.design_mode,'A');
 const reply=report(); reply.style_fidelity=p.input.fidelity_aspects.map(aspect=>({aspect,status:'未验证',evidence:'仅见成品截图，原站状态未见'}));
 reply.evidence_gaps=p.input.fidelity_aspects.map(aspect=>({gate_or_item:aspect,missing:'缺原站配对',needed:'原站同态取证'}));reply.verdict='未验证';
 const receipt=await returned(root,p,reply);assert.equal(receipt.status,'returned');
 const checked=await inspectWorkflow(root);assert.equal(checked.review_only,true);assert.equal(checked.passed,false);assert(!checked.problems.some(p=>p.includes('Gemini')));
});

test('A：缺中段、未测按钮、原图冒作成品与多套边框分别被识别',async()=>{
  const root=await fixture(), base=await referenceFixture(root), path=join(root,'ref/a-reference.json');
  const check=()=>inspectAReference(root,{reference:base.source});
  assert((await check()).passed);
  const asset=base.samples.find(s=>s.id==='gate');asset.built.values.motion='只播放淡入';
  await json(path,base);assert((await check()).problems.some(p=>p.includes('gate 实测值不同')));
  asset.verdict='adapted';asset.reason='换主题';await json(path,base);assert((await check()).problems.some(p=>p.includes('核心绑定')));
  asset.verdict='match';asset.built.values.motion=asset.original.values.motion;
  const mid=base.states.pop();await json(path,base);assert((await check()).problems.some(p=>p.includes('gate-mid')));
  base.states.push(mid);const ctl=base.samples.find(s=>s.id==='cta');delete ctl.original.values.feedback;
  await json(path,base);assert((await check()).problems.some(p=>p.includes('feedback')));
  ctl.original.values.feedback='底色 160ms';mid.built.image=mid.original.image;
  const surface=base.samples.find(s=>s.id==='frame');surface.built.values.layers='3';
  await json(path,base);let result=await check();
  assert(result.problems.some(p=>p.includes('分别取证')));assert(result.problems.some(p=>p.includes('实测值不同')));
  surface.verdict='drift';surface.reason='原站以留白分组，成品有三重轮廓';
  await json(path,base);assert((await check()).drifts.includes('frame'));
});

test('A：证据缺失不占额度；审查包冻结两侧；高分空白参考报告无效',async()=>{
  const root=await fixture(), round=await evidence(root,1);
  await assert.rejects(prepareReview(root,{round,target:'target.md',designMode:'A'}),/同态/);
  assert.equal((await ledger(root)).length,0);
  const contract=await referenceFixture(root);
  const paired=await prepareReview(root,{round,target:'target.md'});
  assert(paired.input.evidence.files[contract.states[0].original.image]);
  assert(paired.input.evidence.files[contract.states[0].built.image]);
  assert(paired.prompt.includes('gate-mid'));assert.equal(paired.input.fidelity_aspects.length,5);
  assert.equal((await readJson(join(paired.dir,'review-schema.json'))).properties.style_fidelity.minItems,5);
  const receipt=await returned(root,paired,report());assert.equal(receipt.status,'invalid');
  assert(receipt.errors.some(p=>p.includes('同态对照')));
});

test('A：更改已锁原站需重测，外部素材路径不可逃逸，充分配对的报告可结算',async()=>{
  const root=await fixture(), c=await referenceFixture(root), path=join(root,'ref/a-reference.json'), round=await evidence(root,1);
  const image=c.states[0].original.image;
  c.states[0].original.image='../outside.png';await json(path,c);assert(!(await inspectAReference(root)).passed);
  c.states[0].original.image=image;await json(path,c);
  await writeFile(join(root,'ref/sweep.json'),'changed source data');
  await assert.rejects(prepareReview(root,{round,target:'target.md'}),/锁定/);
  await json(join(root,'ref/sweep.json'),{entry:'拖动到门中段，记录输入/帧'});
  const prepared=await prepareReview(root,{round,target:'target.md'});
  const reply=report();reply.style_fidelity=prepared.input.fidelity_aspects.map(aspect=>({aspect,status:'一致',evidence:'合成配对观察 [' + prepared.input.fidelity_ids[aspect][0] + ']'}));
  assert.equal((await returned(root,prepared,reply)).review_status,'passed');
  await writeFile(join(root,image),'changed image');
  assert.equal((await inspectReview(root,await readJson(join(root,'.lsf/workflow.json')))).state,'changed-after-review');
});

test('同屏文案按去向与语义检查，合法双语/同目的地的不同任务可保留',async()=>{
  const root=await fixture(), file='visible.json', items=[
    {id:'a',role:'button',text:'开始探索',destination:'chapter-2'},
    {id:'b',role:'button',text:'继续漫游',destination:'chapter-2'},
    {id:'name',role:'heading',text:'长沙',meaning:'city'},
    {id:'en',role:'label',text:'CHANGSHA',meaning:'city'}
  ];
  await json(join(root,file),{state:'hero',viewport:375,items});
  const row={section:'首屏',state:'hero',viewport:375,text_snapshot:file,decisions:items.map(i=>({id:i.id,action:'keep',loss:'测试给定独立访客用途'}))};
  assert.equal((await pageCopyProblems(root,{coverage:[row]})).length,2);
  row.decisions.pop();assert((await pageCopyProblems(root,{coverage:[row]})).some(p=>p.includes('en 缺')));
  items.splice(1,1);await json(join(root,file),{state:'hero',viewport:375,items});
  row.decisions=items.map(i=>({id:i.id,action:'keep',loss:'实际双语身份或操作',distinct_use:i.id==='en'?'对英文访客给出地名':'中文访客识别地名'}));
  assert.deepEqual(await pageCopyProblems(root,{coverage:[row]}),[]);
  items.push({id:'time',role:'label',text:'06:30'});row.decisions.push({id:'time',action:'keep',loss:'时间'});
  await json(join(root,file),{state:'hero',viewport:375,items});assert((await pageCopyProblems(root,{coverage:[row]})).some(p=>p.includes('time 须对应')));
  row.decisions.at(-1).basis='真实首班车时刻，对应本屏线路班次';assert.deepEqual(await pageCopyProblems(root,{coverage:[row]}),[]);
  const brief={blocks:[{id:'time',purpose:'候选的虚拟氛围时刻'}]}, review={slots:[{id:'time',decision:'drop',reason:'没有日程功能'}]};
  assert.deepEqual(candidateCopyProblems(brief,{},review),[]);
  assert(candidateCopyProblems(brief,{time:'06:30'},review).length);
});
