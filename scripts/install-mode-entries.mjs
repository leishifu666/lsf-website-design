// Register thin mode entries and optional legacy slash adapters; rules stay in this skill.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readingPlan} from './lib/resources.mjs';

const core=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const opt=(name,fallback=null)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const skills=resolve(opt('--skills-dir',dirname(core)));
const prompts=opt('--prompts-dir');
const marker='<!-- lsf-website-design:generated-mode-entry -->';
const catalog=JSON.parse(await readFile(join(core,'references/命令入口.json'),'utf8'));
const selectedMode=opt('--mode');
const entries=selectedMode ? catalog.filter(e=>e.mode===selectedMode) : catalog;
if (!entries.length) throw new Error('未找到指定模式：'+selectedMode);
const referencePrompt=/```text\r?\n([\s\S]*?)\r?\n```/.exec(await readFile(join(core,'templates/风格参考统一提示词.md'),'utf8'))?.[1];
if(!referencePrompt)throw new Error('风格参考统一提示词缺少text正文，保留现有入口并停止');
const quote=s=>JSON.stringify(s);
const read=p=>readFile(p,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const path=p=>p.replaceAll('\\','/');
const pending=[];
for(const e of entries){
  const dir=join(skills,e.name),base=path(relative(dir,core));
  const displayName='LSF-网站设计｜'+e.mode+' '+e.title;
  const description='网站设计｜模式'+e.mode+' '+e.description;
  const scope=e.kind==='review'?'默认只评审现有页面，不改稿；独立Agent通过Ego Lite现场取证，优先Gemini/Claude评分，无可用渠道才用当前模型的新子Agent，同一预算。':e.kind==='copy-review'?'只执行成品页面page模式的独立文案审核，不默认重写文案或删模块，不启用制作流程。':e.kind==='prompt'?'只按模式F委派专属反推子Agent并交付提示词和素材方案，不自动建站或运行评分。':e.kind==='discover'?'先展示至少五个真实候选及特色/技术分析；用户选站与处理方式后再转模式B或A，不默认代选制作。':'根据本次请求直接推进本模式；用户只要分析则停在分析范围，不另加完整六版或不适用阶段。';
  const links=readingPlan({mode:e.mode,stage:'start'}).resources.map(file=>`[${file.split('/').at(-1).replace(/\.md$/,'')}](${base}/${file})`).join('、');
  const preview=e.mode==='A'?'默认由当前对话主Agent直接制作一套，不另派构建Agent或另开用户聊天；用户明确想比较时才先出三个预览，三份使用统一提示词、相同主题和同一主参考网址，不另设不同设计任务。子任务范围为完成一个方向预览时只做一个，不递归派发三版。\n':e.mode==='C'?'原创探索首批做三个高质量产品方向预览；用户明确只做一套时由当前对话主Agent直接制作。用户全不满意时按反馈继续新方案，确认后只展开一个方向。\n':'';
  const skill=`---\nname: ${e.name}\ndescription: ${quote(description)}\n---\n\n${marker}\n# ${displayName}\n\n本次固定进入模式${e.mode}（${e.title}），不再让用户选择模式。\n先读取共享[网站设计入口](${base}/SKILL.md)与本模式start资料：${links}；后续阶段按[阅读导航](${base}/references/模式阅读导航.md)补读，使用当前文件版本，不凭记忆复制规则。\n${scope}\n${preview}延续用户最新更正、原项目改动与主技能的真实机制、素材、文案审核和预算要求。入口仅锁定本次工作模式，不额外授权发布、安装全局工具或外发资料。\n`;
  const defaultPrompt=e.mode==='A'?referencePrompt:`使用 $${e.name} 完成本次${e.title}任务，按用户提供的参考、主题或项目范围执行。`;
  const ui=`interface:\n  display_name: ${quote(displayName)}\n  short_description: ${quote(description)}\n  default_prompt: ${quote(defaultPrompt)}\n`;
  pending.push([join(dir,'SKILL.md'),skill],[join(dir,'agents/openai.yaml'),'# '+marker+'\n'+ui]);
  if(prompts){
    const text=`---\ndescription: ${quote(displayName+'：'+e.description.split('：').slice(1).join('：'))}\nargument-hint: "[网址或项目路径] [主题或要求]"\n---\n\n${marker}\n本次使用 $$${e.name} 入口，固定进入模式${e.mode}（${e.title}）。读取 ${path(join(core,'SKILL.md'))}，按该入口及共享规则执行。${scope}\n\n用户参数：$ARGUMENTS\n`;
    pending.push([join(resolve(prompts),e.name+'.md'),text]);
  }
}
// Check every target before writing any of them. Never replace a user's unrelated entry.
for(const [p] of pending){const previous=await read(p);if(previous!==null&&!previous.includes(marker))throw new Error('已有非本生成器维护的文件，保留并停止：'+p);}
for(const [p,text] of pending){if(await read(p)===text)continue;await mkdir(dirname(p),{recursive:true});await writeFile(p,text,'utf8');}
console.log(JSON.stringify({entries:entries.map(e=>({name:e.name,title:e.title,mode:e.mode})),skills_dir:skills,prompts_dir:prompts?resolve(prompts):null,legacy_slash_scope:'Codex CLI/IDE；不宣称桌面支持'},null,2));
