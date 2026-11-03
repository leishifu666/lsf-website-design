// Model routing and credential handling belong to lsf-ai-agent.
// Optional API adapter: node gemini-copy.mjs copy/brief.json --via t8star
// Website copy defaults to the AI Studio browser workflow; this script does not automate it.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const briefPath = args[0] && !args[0].startsWith('--') ? resolve(args[0]) : null;
if (!briefPath) { console.error('用法（仅用户明确指定API时）：node gemini-copy.mjs copy/brief.json --via t8star'); process.exit(2); }
const defaults = JSON.parse(await readFile(join(here, '../references/workflow-defaults.json'), 'utf8'));
const via = opt('--via', defaults.gemini_mode);
if (via === 'aistudio') { console.error('网站文案默认入口为 Google AI Studio。请按 lsf-ai-agent 的 AI Studio 浏览器流程生成并保存真实候选；本脚本未发送请求。只有用户明确指定贞贞 API 时才使用 --via t8star，不自动兜底。'); process.exit(3); }
if (via !== 't8star') { console.error('本适配器只执行贞贞 API；中转或浏览器请按 lsf-ai-agent 回收并记录真实候选，不自动切换入口。'); process.exit(3); }
if (args.includes('--model')) { console.error('型号由 lsf-ai-agent 的 copywriting 路由统一管理，不在此处覆盖。'); process.exit(3); }
const brief = JSON.parse(await readFile(briefPath, 'utf8'));
if (!Array.isArray(brief.blocks) || new Set(brief.blocks.map(b => b.id)).size !== brief.blocks.length ||
    brief.blocks.some(b => !b.id || !b.purpose?.trim())) throw new Error('blocks 须提供唯一 id 与访客用途 purpose');
const requested = brief.blocks.filter(b => b.source !== 'fixed');
if (!requested.length) {
  if (!brief.blocks.length && !brief.empty_reason?.trim()) throw new Error('空简报须注明实际依据');
  console.log('本次没有需新写的槽位，直接交独立审核。'); process.exit(0);
}
const timeout = Number(opt('--timeout', '300')), maxTokens = Number(opt('--max-tokens', '8192'));
if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 65536) throw new Error('timeout / max-tokens 参数无效');
const prompt = `你是中文网页文案作者，仅为下列有明确用途的槽位写候选，不新增眉题、英语标语、坐标、虚拟计数、操作解释或重复按钮。
只使用 facts 中的信息，不编造业务数据、承诺或实体；概念网站可按给定主题表达情绪。
短句、直接、具体，不写赋能、打造、极致、匠心、一站式、无缝、让我们等空话。
所有标题的每一独立行、按钮、导航、标签结尾均不加标点；正文按正常语法使用标点。
默认长度：hero_title≤14字，hero_subtitle≤40字，section_title/card_title≤8字，card_body≤40字，button 2～6字且含动词。block 指定上限时遵守该值。
voice：${JSON.stringify(brief.voice || {})}
facts：${JSON.stringify(brief.facts || {})}
blocks：${JSON.stringify(requested)}
独立审核反馈（如有，修复这些问题）：${JSON.stringify(brief.review_feedback || [])}
不要堆关键词或逐项硬串阶段，逐句朗读必须像自然中文。用户固定文案按原样保留。
只输出 JSON：{"candidates":{"块id":["候选1","候选2","候选3"]}}`;
const executor = resolve(here, '../../lsf-ai-agent/scripts/gemini_agent.py');
const r = spawnSync(opt('--python', 'python'), ['-B', '-X', 'utf8', executor, 'ask', '--task', 'copywriting', '--cwd', dirname(briefPath), '--timeout', String(timeout), '--max-tokens', String(maxTokens)], { input: prompt, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 24, timeout: (timeout + 60) * 1000 });
let receipt;
try { receipt = JSON.parse(r.stdout || '{}'); } catch { console.error('✗ Gemini 执行器未返回有效 JSON；没有创建候选，不自动重发。'); process.exit(4); }
if (r.error || r.status !== 0 || receipt.ok !== true || !receipt.response?.trim() || !receipt.observed_model) {
  console.error('✗ Gemini 调用未完成：' + (receipt.error || r.error?.message || `执行器退出 ${r.status}`)); process.exit(4);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const text = receipt.response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
let candidates;
try { const data = JSON.parse(text); candidates = data.candidates || data.候选; } catch {}
const missing = requested.filter(b => !Array.isArray(candidates?.[b.id]) || !candidates[b.id].length || candidates[b.id].some(t => typeof t !== 'string' || !t.trim())).map(b => b.id);
if (missing.length) {
  const dir = join(dirname(briefPath), 'attempts'); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${stamp}.json`), JSON.stringify({ by: 'gemini', via, receipt, incomplete_blocks: missing }, null, 2));
  console.error('✗ 已实际调用，但候选格式不完整：' + missing.join('、') + '；原始回执保存在 copy/attempts，不能由 GPT 补写。'); process.exit(5);
}
const dir = join(dirname(briefPath), 'gemini'); await mkdir(dir, { recursive: true });
const record = { by: 'gemini', via, model: receipt.model, observed_model: receipt.observed_model, model_verification: receipt.model_verification, at: new Date().toISOString(), briefHash: createHash('sha256').update(JSON.stringify(brief)).digest('hex'), candidates, receipt };
const file = join(dir, `${stamp}.json`); await writeFile(file, JSON.stringify(record, null, 2));
console.log(JSON.stringify({ ok: true, file, blocks: requested.length, model: record.model, observed_model: record.observed_model, verification: record.model_verification, next: '交给独立 copy_reviewer，回收 approved.json 与 review.json' }, null, 2));
