import { validateDesignReview } from './review-policy.mjs';
import { makeReviewPlan, prepareReview, finishReview, inspectReview, reviewConfig, ledger, budgetFor, buildSnapshot, within, requiresAPrototype, referenceLockProblem, currentAPairs, pairedHash } from './lib/review-workflow.mjs';
import { appendFile } from 'node:fs/promises';
import { inspectAReference } from './lib/a-reference.mjs';
import { candidateCopyProblems, pageCopyProblems } from './lib/copy-necessity.mjs';
// Website lifecycle checks also work without installed/trusted native hooks.
// begin --root <workspace> --site <site-directory> [--reference <URL>]
// check --root <workspace> [--site <site-directory>] [--url <local-preview>]
// wait/resume --root <workspace> [--reason <actual pending user question>]
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const exists = p => stat(p).then(() => true, () => false);
const readJson = p => readFile(p, 'utf8').then(JSON.parse);
const digest = async p => createHash('sha256').update(await readFile(p)).digest('hex');
function inside(root, target) {
  const r = relative(root, target);
  return r !== '..' && !r.startsWith('..\\') && !r.startsWith('../') && !isAbsolute(r);
}

// Compare known production outputs with begin, not with timestamps. Existing
// projects may already contain a working site. Ignore tooling, research and caches.
async function productionSnapshot(site, includePages) {
  const files = {};
  const pageRoots = new Set(['src','app','pages','components','styles','public']);
  const skip = new Set(['node_modules','dist','build','coverage','ref','vendor','__tests__','tests','fixtures']);
  async function visit(dir = '') {
    for (const entry of await readdir(join(site, dir), {withFileTypes:true})) {
      const name = entry.name, key = dir ? dir+'/'+name : name;
      if (name.startsWith('.') || skip.has(name)) continue;
      const inPage = includePages && pageRoots.has(key.split('/')[0]);
      if (entry.isDirectory()) {
        if (inPage || ['copy','copy/gemini','rounds'].includes(key) || /^rounds\/round-\d+$/.test(key))
          await visit(key);
      } else if (entry.isFile()) {
        const receipt = /^copy\/(brief|approved|review|page-review)\.json$|^copy\/gemini\/[^/]+\.json$|^rounds\/round-\d+\/(motion-evidence|final-score)\.json$/.test(key);
        const pageFile = inPage && /\.(html?|[cm]?[jt]sx?|vue|svelte|astro|css|s[ac]ss)$/i.test(name);
        const entryPoint = includePages && !dir && (/\.(html?|css)$/i.test(name) || /^(app|main|index|script)\.[cm]?[jt]sx?$/i.test(name));
        if (receipt || pageFile || entryPoint) files[key] = await digest(join(site,key));
      }
    }
  }
  await visit();
  return files;
}

function firstBuiltOutside(contract, scope = {states:[], samples:[]}) {
  const state = contract.states.find(row => row.built?.status === 'observed' && !scope.states.includes(row.id+'@'+row.width));
  const sample = contract.samples.find(item => item.built?.evidence && !scope.samples.includes(item.id));
  return state ? state.id+'@'+state.width : sample?.id;
}

function referenceWorkflow(config) {
  return requiresAPrototype(config) ? 'v' + config.a_reference_version + '-source-prototype-paired' : 'legacy-source-paired';
}
async function recordAReference(config, site, stage, proof, reason, existingDraft) {
  if (!proof.passed) return;
  if (stage !== 'source') {
    const problem = referenceLockProblem(config, stage, proof);
    if (problem) throw Error(problem);
    if (proof.drifts.length) throw Error('未解决参考偏离：' + proof.drifts.join('、'));
  }
  if (stage === 'paired') {
    config.reference_paired_hash = pairedHash(proof);
    return;
  }
  if (stage === 'prototype' && config.reference_prototype) throw Error('样段已登记；成品用 paired 对照。原站确有变化时从 source 重新实测并记录 --reason');
  if (stage === 'source' && config.reference_source_hash && !reason) {
    if (config.reference_source_hash !== proof.sourceHash || config.reference_prototype)
      throw Error('重新实测原站须提供 --reason；重测会使已有样段及整站对照失效');
  }
  const baseline = config.reference_start;
  const current = await productionSnapshot(site, stage === 'source');
  const changed = Object.keys(current).filter(key => baseline[key] !== current[key]);
  const remeasure = stage === 'source' && config.reference_prototype && reason;
  if (changed.length && !existingDraft && !remeasure)
    throw Error('早于'+(stage === 'source'?'原站锁定':'样段通过')+'的制作记录：'+changed.join('、')+'。保留文件，用 --stage source --existing-draft --reason <原因> 登记为已有稿再实测，结论从该稿起算');
  if (stage === 'source') {
    // Already observed final pairs cannot establish a first, source-only checkpoint.
    if (!config.reference_prototype) {
      const premature = proof.survey && (proof.survey.sections.some(s => s.built) ||
        proof.survey.categories.some(c => ['已实现','已验证'].includes(c.status)) ||
        proof.survey.behaviors.some(b => b.built || ['已实现','已验证'].includes(b.status) || b.assertions?.some(a => a.built)));
      if (premature) throw Error('原站阶段的逐区块台账已带成品观察；先单独锁原站');
      const built = firstBuiltOutside(proof.contract);
      if (built || proof.contract.prototype?.built) throw Error('原站阶段已带成品观察 '+(built || 'prototype.built')+'；保留旧材料另存，当前合同先只登记原站');
    }
    if (existingDraft || remeasure) {
      config.reference_start = current;
      config.reference_existing_draft = reason;
    }
    config.reference = proof.contract.source;
    config.reference_source_hash = proof.sourceHash;
    if (reason) config.reference_change_reason = reason;
    delete config.reference_prototype;
    delete config.reference_paired_hash;
  } else {
    const survey = proof.survey;
    if (survey && (survey.sections.some(s => s.built) ||
        survey.behaviors.some(b => !proof.earlyBehaviors.includes(b.id) && (b.built || b.assertions?.some(a => a.built) || ['已实现','已验证'].includes(b.status)))))
      throw Error('样段以外已出现逐区块成品观察；整站差异留到 paired');
    const extra = firstBuiltOutside(proof.contract, proof.prototypeScope);
    if (extra) throw Error('样段以外已出现成品观察 '+extra+'；请保留旧稿，独立实测所选片段，不能从最终配对补录早期样段');
    config.reference_prototype = {source_hash:proof.sourceHash, evidence_hash:proof.prototypeHash, checked_at:new Date().toISOString()};
  }
}

export async function inspectWorkflow(root, { site: override, url } = {}) {
  root = resolve(root);
  const problems = [];
  let config = {};
  try { config = await readJson(join(root, '.lsf/workflow.json')); }
  catch { problems.push('缺 .lsf/workflow.json：先运行 workflow-check.mjs begin，明确项目与网站目录'); }
  const site = resolve(root, override || config.site || '.');
  if (!inside(root, site)) return { passed: false, root, site, problems: ['网站目录超出项目范围'] };
  if(config.purpose==='review'){
    let review;
    try{review=await inspectReview(root,config);problems.push(...review.problems);}catch(e){problems.push('评审核验失败：'+e.message);}
    return {passed:problems.length===0,root,site,purpose:'review',review_only:true,problems,review_status:review?.state||'unverified',review_budget_exhausted:review?review.budget.remaining===0:false};
  }
  const strictA = requiresAPrototype(config);
  const workflow = config.design_mode === 'A' ? {reference_workflow:referenceWorkflow(config)} : {};
  const existingDraft = strictA && config.reference_existing_draft ? {existing_draft:config.reference_existing_draft} : {};
  if (strictA) {
    const locked = await currentAPairs(site,config);
    if (locked.problems.length) return {passed:false,root,site,...workflow,...existingDraft,problems:locked.problems,review_status:config.review_status};
  }
  const missing = async (file, label) => {
    if (!await exists(join(site, file))) { problems.push(label || `缺 ${file}`); return true; }
    return false;
  };
  await missing('copy/brief.json', '缺 Gemini 文案任务书 copy/brief.json');
  let brief, briefHash;
  try {
    brief = await readJson(join(site, 'copy/brief.json'));
    briefHash = createHash('sha256').update(JSON.stringify(brief)).digest('hex');
  } catch {}
  const authored = !Array.isArray(brief?.blocks) || brief.blocks.some(b => b.source !== 'fixed');
  let candidates = [];
  try {
    for (const f of await readdir(join(site, 'copy/gemini'))) if (f.endsWith('.json')) {
      const r = await readJson(join(site, 'copy/gemini', f));
      const validReceipt = r.via === 't8star' ? r.receipt?.ok === true && r.receipt?.response?.trim() && r.observed_model === r.receipt.observed_model : r.recovery_evidence;
      if (r.by === 'gemini' && r.candidates && Object.keys(r.candidates).length && r.via && r.at && r.briefHash === briefHash && validReceipt) candidates.push(r);
    }
  } catch {}
  if (authored && !candidates.length) problems.push('缺真实 Gemini 回收记录 copy/gemini/*.json；不能由 GPT 补写候选');
  const approvedMissing = await missing('copy/approved.json', '缺独立文案审核后的 copy/approved.json');
  try {
    const r = await readJson(join(site, 'copy/review.json'));
    if (!['approved', '通过', '达标'].includes(r.verdict) || !r._meta?.agent_id)
      problems.push('copy/review.json 缺通过结论或实际 copy_reviewer 的 agent_id');
    if (!approvedMissing) {
      const approved = await readJson(join(site, 'copy/approved.json'));
      problems.push(...candidateCopyProblems(brief, approved, r));
    }
    if (!approvedMissing && r._meta?.approved_hash !== await digest(join(site, 'copy/approved.json')))
      problems.push('文案审核后的定稿已变化或缺 approved_hash，需重新独立审核');
  } catch { problems.push('缺 copy/review.json：独立文案审核未回收'); }
  if (!approvedMissing) {
    const r = spawnSync(process.execPath, [join(here, 'check-copy.mjs'), '--approved', join(site, 'copy/approved.json')], { cwd: site, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) problems.push('文案来源检查未通过：' + (r.stdout || r.stderr || '').split('\n').filter(s => s.startsWith('✗')).slice(0, 3).join('；'));
  }
  if (config.requirements?.includes('page-copy-review')) {
    try {
      const report = await readJson(join(site, 'copy/page-review.json'));
      if (report.mode !== 'page' || report.verdict !== 'passed' || !report._meta?.agent_id)
        problems.push('成品页面冗余文案审核未通过或缺独立审核来源');
      if (!Array.isArray(report.coverage) || !report.coverage.length)
        problems.push('成品页面文案审核缺实际区块/视口/状态覆盖');
      if (!Array.isArray(report.findings) || report.findings.some(item => item.status !== 'resolved' && item.status !== 'kept'))
        problems.push('成品页面仍有未处理的冗余文案项');
      problems.push(...await pageCopyProblems(site, report));
      const views = Array.isArray(report.coverage) ? report.coverage : [];
      if (!views.some(row => row.viewport <= 480) || !views.some(row => row.viewport >= 1024))
        problems.push('成品页面须有手机与桌面的同屏文案观察');
      const current = await buildSnapshot(site, report._meta?.build_files);
      if (report._meta?.build_hash !== current.hash)
        problems.push('成品页面在文案审核后已变化，需复查当前版本');
    } catch (error) { problems.push('缺有效的独立成品文案审核 copy/page-review.json：' + error.message); }
  }
  let latest = null;
  let reviewState = null;
  if (config.review_plan) {
    try {
      reviewState = await inspectReview(root, config);
      problems.push(...reviewState.problems);
      const reservations = (await ledger(root)).filter(e => e.event === 'reserved');
      latest = reservations.at(-1)?.round?.split('/').at(-1) || null;
    } catch (e) { problems.push('评审核验失败：' + e.message); }
  } else {
  let rounds = [];
  try { rounds = (await readdir(join(site, 'rounds'))).filter(s => /^round-\d+$/.test(s)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))); } catch {}
  latest = rounds.at(-1);
  if (!latest) problems.push('缺轮次记录与独立 design_reviewer 结果 rounds/round-NN');
  else {
    const round = join(site, 'rounds', latest);
    if (!await exists(join(round, 'changes.md'))) problems.push(`${latest} 缺 changes.md`);
    try {
      const checks = await readJson(join(round, 'checks.json'));
      if (!checks || typeof checks !== 'object') problems.push(`${latest} 缺检查记录；工程结果不计设计分`);
    } catch { problems.push(`${latest} 缺有效 checks.json`); }
    for (const width of [375, 768, 1440]) if (!await exists(join(round, 'shots', `${width}.png`))) problems.push(`${latest} 缺 ${width}px 实际截图`);
    try {
      const r = await readJson(join(round, 'review.json'));
      problems.push(...validateDesignReview(r).map(message => `${latest} ${message}`));
      if (!r._meta?.agent_id && r._meta?.by !== 'codex exec（独立进程）') problems.push(`${latest} 缺实际独立评审来源`);
      if (!r._meta?.shot_hashes) problems.push(`${latest} 缺评审所见截图摘要`);
      else for (const width of [375, 768, 1440]) {
        const file = join(round, 'shots', `${width}.png`);
        if (await exists(file) && r._meta.shot_hashes[`${width}.png`] !== await digest(file)) problems.push(`${latest} ${width}px 截图在评审后变化，需重新评审`);
      }
    } catch { problems.push(`${latest} 独立 design_reviewer 未回收有效 review.json`); }
  }
  }
  if (config.design_mode === 'A' && !strictA) {
    const proof = await inspectAReference(site, { reference: config.reference });
    problems.push(...proof.problems);
    if (!config.reference_source_hash || proof.sourceHash !== config.reference_source_hash)
      problems.push('缺本版原站取证锁定，或参考证据已变；先运行 reference-check --stage source');
    if (proof.drifts.length) problems.push('A 模式仍有参考偏离：' + proof.drifts.join('、'));
  }
  // v34 consumes per-section source observations and replay values above.
  if (config.reference && !(strictA && config.a_reference_version === 34)) {
    let motion;
    for (const file of ['ref/motion/motion.json', 'ref/motion-measured.json']) {
      try { motion = await readJson(join(site, file)); break; } catch {}
    }
    if (!motion || (motion.source || motion.url) !== config.reference) problems.push('缺当前参考站的动效取证：滚动曲线、导航前后状态和场景触发方式必须记录');
  }
  await missing('assets-plan.json', '缺 assets-plan.json：逐项记录库图标、生成图片、实际动态组件及来源');
  if (url) {
    const style = spawnSync(process.execPath, [join(here, 'check-copy.mjs'), '--style-only', '--url', url], { cwd: site, encoding: 'utf8', windowsHide: true });
    if (style.status !== 0) problems.push('页面标题/按钮标点检查未通过：' + (style.stdout || style.stderr || '').split('\n').filter(s => s.startsWith('✗')).slice(0, 3).join('；'));
  }
  return { passed: problems.length === 0, root, site, ...workflow,...existingDraft, latest: latest || null, problems, review_status: reviewState?.state || 'legacy', review_budget_exhausted: reviewState ? reviewState.budget.remaining === 0 : false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';
  const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const root = resolve(opt('--root', process.cwd()));
  const configPath = join(root, '.lsf/workflow.json');
  try {
    if (command === 'begin') {
      const site = resolve(root, opt('--site', '.'));
      const purpose=opt('--purpose','website');
      const designMode=opt('--design-mode', purpose === 'website' ? 'A' : null);
      if(designMode!==null&&!['A','B','C'].includes(designMode))throw new Error('--design-mode仅支持A/B/C；与评审类型--mode分开');
      if(!['website','review'].includes(purpose))throw new Error('--purpose仅支持website或review');
      if (!inside(root, site) || !await exists(site)) throw new Error('网站目录必须已存在且处于原项目内');
      if (await exists(configPath)) throw new Error('已有流程记录；先读现有配置，不覆盖正在进行的任务');
      const strictA = purpose === 'website' && designMode === 'A';
      const baseline = strictA ? await productionSnapshot(site,true) : {};
      const aConfig = strictA ? {a_reference_version:34, reference_start:baseline} : {};
      if (Object.keys(baseline).length) aConfig.reference_existing_draft = 'begin 时已有制作文件，见 reference_start 清单';
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, JSON.stringify({ schema: 2, purpose, design_mode:designMode, ...aConfig, review_plan: makeReviewPlan(opt('--review-plan', 'default')), review_status: 'in-progress', site, reference: opt('--reference', null), status: 'in-progress', requirements: purpose==='review'?['design-review']:['gemini-copy', 'copy-review', 'page-copy-review', 'design-review', 'visual-checks'], created_at: new Date().toISOString() }, null, 2));
      await writeFile(join(root, '.lsf/active'), new Date().toISOString());
      if (strictA) console.log('✓ A 制作已登记。下一步运行 start-reference.mjs（可恢复本次登记）进行现场侦察，完成逐区块台账后运行 reference-check --stage source，再做真实样段。prototype 通过才展开整站文案、素材和章节。');
      else console.log(purpose==='review'?'✓ 仅视觉评审已登记；不启动建站或Gemini，结论不代表完整网站制作验收。':'✓ 网站流程已开始。文案先 Gemini → copy_reviewer，页面完成后 design_reviewer；未通过不得作为完成交付。');
    } else if (command === 'reference-check') {
      const config = await readJson(configPath);
      const site = resolve(root, config.site);
      if (!inside(root, site) || config.design_mode !== 'A' || config.purpose === 'review')
        throw Error('此命令用于当前原项目内的 A 模式制作');
      const requested = opt('--stage', 'paired'), stage = requested === 'final' ? 'paired' : requested;
      const strictA = requiresAPrototype(config);
      if (!['source','prototype','paired'].includes(stage)) throw Error('stage 只能是 source、prototype、paired（final）');
      if (stage === 'prototype' && !strictA) throw Error('旧 A 制作保留原有 source/paired 记录，不能追认为 v33 早期样段');
      const existingDraft = args.includes('--existing-draft'), reason = (opt('--reason') || '').trim();
      if (args.includes('--reason') && (!reason || reason.startsWith('--'))) throw Error('--reason 须填写重测或已有稿的具体依据');
      if (existingDraft && (!strictA || stage !== 'source' || !reason))
        throw Error('--existing-draft 仅用于新 A 的 source，须记录已有稿的 --reason');
      if (strictA && stage !== 'source') {
        const missing = referenceLockProblem(config, stage);
        if (missing) throw Error(missing);
      }
      const proof = await inspectAReference(site, { reference: config.reference, stage, requirePrototype:strictA, requireSurvey:config.a_reference_version === 34 });
      if (strictA) {
        await recordAReference(config, site, stage, proof, reason, existingDraft);
        if (proof.passed) await writeFile(configPath, JSON.stringify(config, null, 2));
      } else if (proof.passed && stage === 'source') {
        if (config.reference_source_hash && config.reference_source_hash !== proof.sourceHash && !opt('--reason'))
          throw Error('原站锁定内容已变；核对差异后用 --reason 记录重新实测的具体依据');
        config.reference = proof.contract.source;
        config.reference_source_hash = proof.sourceHash;
        if (opt('--reason')) config.reference_change_reason = opt('--reason');
        await writeFile(configPath, JSON.stringify(config, null, 2));
      } else if (stage === 'paired') {
        if (!config.reference_source_hash || config.reference_source_hash !== proof.sourceHash)
          proof.problems.push('须先锁定相同的原站取证');
        if (proof.drifts.length) proof.problems.push('未解决参考偏离：' + proof.drifts.join('、'));
      }
      const next = {source:'实测代表样段后运行 reference-check --stage prototype', prototype:'展开整站文案、素材与章节，再运行 reference-check --stage paired', paired:'核对当前成品并准备独立评审'};
      console.log(JSON.stringify({ stage, reference_workflow:referenceWorkflow(config), passed: !proof.problems.length, problems: proof.problems, ...(proof.surveyGaps?.length ? {source_gaps:proof.surveyGaps} : {}), ...(strictA && proof.passed ? {next:next[stage], existing_draft:config.reference_existing_draft || null} : {}) }, null, 2));
      process.exitCode = proof.problems.length ? 1 : 0;
    } else if (command === 'adopt-review-policy') {
      const config = await readJson(configPath);
      if (config.review_plan) throw new Error('已有新策略，不能重置调用预算');
      if (!opt('--reason')) throw new Error('迁移须记录 --reason，保留历史报告');
      config.review_plan = makeReviewPlan(opt('--review-plan', 'default'));
      config.review_status = 'in-progress';
      config.review_policy_adopted_at = new Date().toISOString();
      config.review_policy_reason = opt('--reason');
      await writeFile(configPath, JSON.stringify(config, null, 2));
      console.log('已切入两次评审预算，历史轮次保留且不计入新预算');
    } else if (command === 'prepare-review') {
      const prepared = await prepareReview(root, { round: opt('--round'), channel: opt('--channel', 'host'), mode: opt('--mode', 'full'), scope: opt('--scope', 'default'), target: opt('--target'), responses: opt('--responses'), designMode:opt('--design-mode',null) });
      console.log(JSON.stringify({call:prepared.input.call,type:prepared.input.review_type,prompt:join(prepared.dir,'reviewer-prompt.md'),input:join(prepared.dir,'review-input.json')}, null, 2));
    } else if (command === 'record-review') {
      console.log(JSON.stringify(await finishReview(root, { call: Number(opt('--call')), result: opt('--result'), agent: opt('--agent'), status: opt('--status', 'returned'), reason: opt('--reason', '') }), null, 2));
    } else if (command === 'evidence-hash') {
      const config = await reviewConfig(root);
      const site = resolve(root, config.site), round = resolve(site, opt('--round', '.'));
      if (!within(root, site) || !within(site, round)) throw new Error('证据路径超出项目');
      const manifest = await readJson(join(round, 'motion-evidence.json'));
      console.log(JSON.stringify(await buildSnapshot(site, manifest.build_files), null, 2));
    } else if (command === 'extend-review') {
      const config = await reviewConfig(root), scope = opt('--scope', 'default');
      if (!opt('--reason')) throw new Error('仅在用户明确要求继续时记录其原话 --reason');
      budgetFor(config, await ledger(root), scope);
      await appendFile(join(root,'.lsf/review-ledger.jsonl'), JSON.stringify({event:'extension',scope,reason:opt('--reason'),at:new Date().toISOString()})+'\n');
      config.review_status = 'in-progress';
      await writeFile(configPath, JSON.stringify(config,null,2));
      console.log('已按用户明确要求追加一次修改和一次复核额度');
    } else if (command === 'close-review') {
      const config = await reviewConfig(root), status = opt('--status');
      if (!['closed-unmet','closed-unverified','changed-after-review'].includes(status) || !opt('--reason')) throw new Error('收尾须给真实状态与 --reason，不能设为passed');
      config.review_status = status; config.review_close_reason = opt('--reason');
      await writeFile(configPath, JSON.stringify(config,null,2));
      console.log('评审已如实收尾；其他产物仍按check检查，不等于全部通过');
    } else if (command === 'wait' || command === 'resume') {
      const config = await readJson(configPath);
      const reason = opt('--reason', '');
      if (command === 'wait' && !reason.trim()) throw new Error('等待状态必须写明已向用户提出的实际问题');
      config.status = command === 'wait' ? 'waiting-for-user' : 'in-progress';
      config.wait_reason = command === 'wait' ? reason : null;
      await writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(command === 'wait' ? '等待用户输入；网站未完成，门槛未通过' : '继续网站流程');
    } else if (command === 'check') {
      const result = await inspectWorkflow(root, { site: opt('--site'), url: opt('--url') });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.passed ? 0 : 1;
    } else throw new Error('用法：workflow-check.mjs begin|reference-check|check|prepare-review|record-review|evidence-hash|adopt-review-policy|extend-review|close-review|wait|resume --root <项目> [--site <网站目录>]');
  } catch (e) { console.error('✗ ' + e.message); process.exitCode = 2; }
}
