// Reminder only: mentioning a website/skill must not start a website lifecycle.
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
let input = {}; try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
const root = input.cwd || process.cwd(), prompt = String(input.prompt || '');
const active = join(root, '.lsf/active');
if (/关掉\s*LSF|关闭\s*LSF|LSF\s*门槛\s*关/i.test(prompt)) {
  if (existsSync(active)) rmSync(active);
  process.stdout.write(JSON.stringify({ systemMessage: 'LSF 可选 Hook 门槛已关闭；按本次用户要求执行流程。' })); process.exit(0);
}
const inspectOnly = /(?:只|先)(?:看[看下]?|分析|讨论|评审|给思路)|(?:优化|更新|修改)(?:这个|该)?(?:技能|skill)/i.test(prompt);
const making = /(?:制作|新建|生成|重做|设计|实现|做(?:一个|一套|一版|个)|build|create).{0,30}(?:网站|网页|落地页|官网|website|landing)/i.test(prompt);
if (!existsSync(active) && (!making || inspectOnly)) process.exit(0);
let config;
try { config = JSON.parse(readFileSync(join(root,'.lsf/workflow.json'),'utf8')); } catch {}
let action = '已有主参考的新 A 先运行 start-reference.mjs，逐页逐块实测六类行为并运行 reference-check --stage source，再实测代表样段并运行 --stage prototype，通过后才展开整站文案、素材与章节。';
if (config?.purpose === 'review') action = '当前仅做独立评审。';
else if ([33, 34].includes(config?.a_reference_version)) {
  action = !config.reference_source_hash ? '从当前原站侦察记录继续，补齐关键状态后运行 reference-check --stage source。' :
    !config.reference_prototype ? '下一步只实现代表样段，实际对照后运行 reference-check --stage prototype。' :
    !config.reference_paired_hash ? '样段已登记，现在可展开整站文案、素材和章节，完成后运行 reference-check --stage paired。' :
    '整站对照已登记，继续成品审核与 workflow-check check。';
} else if (config) action = '按现有流程登记及对应模式继续，历史项目沿用原有验收范围。';
const context = '适用本次网站制作时先读 lsf-website-design。'+action+'只分析/讨论/更新技能不启动制作或外发。Hook 不自动创建 active，也不代替完成证据。';
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }));
