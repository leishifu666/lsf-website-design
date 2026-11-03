// Start or resume source research in an existing A project. Never marks an observation verified.
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { draftSourceSurvey } from './lib/source-survey.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const usage = 'node scripts/start-reference.mjs <参考URL> --root <原项目> [--site <已有网站目录>] [--refresh]';
async function readOptional(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function run(script, args) {
  const result = spawnSync(process.execPath, [join(scripts, script), ...args], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(script + ' 未完成，请从已保存的证据继续，或修复报告的问题后重试。');
}
function samePage(a, b) {
  const left = new URL(a), right = new URL(b);
  left.hash = ''; right.hash = '';
  return left.href === right.href;
}
async function runResearch([address, ...args]) {
  if (address === '--help') { console.log(usage); return; }
  if (!URL.canParse(address)) throw Error(usage);
  const reference = new URL(address);
  if (!['http:','https:'].includes(reference.protocol) || reference.username || reference.password) throw Error(usage);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--refresh') { options.refresh = true; continue; }
    if (!['--root', '--site'].includes(key) || !args[i+1] || args[i+1].startsWith('--')) throw Error(usage);
    options[key] = args[++i];
  }
  const root = await realpath(resolve(options['--root'] || '.'));
  const configFile = join(root, '.lsf/workflow.json');
  const config = await readOptional(configFile);
  const site = await realpath(resolve(root, options['--site'] || config?.site || '.'));
  const nested = relative(root, site);
  if (nested === '..' || nested.startsWith('../') || nested.startsWith('..\\') || isAbsolute(nested))
    throw Error('网站目录必须在原项目内');
  if (config) {
    if (config.design_mode !== 'A' || config.purpose !== 'website' || config.a_reference_version !== 34 ||
        await realpath(resolve(root,config.site)) !== site || (config.reference && new URL(config.reference).href !== reference.href)) {
      throw Error('已有流程的版本、站点或主参考与本次不符，请使用原流程或在本次原项目的独立目录开展测试');
    }
  } else {
    run('workflow-check.mjs', ['begin','--root',root,'--site',site,'--design-mode','A','--reference',address]);
  }
  const output = join(site,'ref','scout');
  const topologyFile = join(output,'topology.json'), surveyFile = join(site,'ref','source-survey.json');
  let topology = await readOptional(topologyFile);
  if (topology && !samePage(topology.sourceUrl,address)) throw Error('现有侦察属于另一主参考，已保留原记录');
  if (!topology || options.refresh || !topology.states?.length) {
    run('scout-reference.mjs', [address, output]);
    topology = await readOptional(topologyFile);
  }
  if (!topology?.states?.length || !topology.entries?.length) throw Error('未获得可用的原站页面状态，请检查实际加载与侦察输出');
  const draft = draftSourceSurvey(topology);
  let survey = await readOptional(surveyFile);
  if (!survey) {
    await mkdir(dirname(surveyFile), { recursive:true });
    try { await writeFile(surveyFile, JSON.stringify(draft,null,2)+'\n', {flag:'wx'}); survey=draft; }
    catch (error) { if (error.code !== 'EEXIST') throw error; survey=await readOptional(surveyFile); }
  }
  const covered = new Set(survey.coverage.flatMap(row=>row.entries));
  const newIds = draft.coverage.flatMap(row=>row.entries).filter(id=>!covered.has(id));
  console.log(JSON.stringify({stage:'research', survey:surveyFile, topology:topologyFile, discovered:topology.entries.length,
    entries_pending:survey.coverage.filter(row=>row.disposition==='pending').reduce((sum,row)=>sum+row.entries.length,0),
    categories_unchecked:survey.categories.filter(row=>row.status==='未检查').map(row=>row.id),
    new_entries_to_classify:newIds, next:'检查可达页面和区块，逐类回放六类输入，记录尚未确认的行为。完成原站取证后运行 reference-check --stage source。'},null,2));
}
runResearch(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode=1; });
