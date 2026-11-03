import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const skillRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const resourceMap=JSON.parse(await readFile(join(skillRoot,'references/资源路由.json'),'utf8'));
const policy=JSON.parse(await readFile(join(skillRoot,'references/design-review-policy.json'),'utf8'));
export const slug=text=>text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu,'').replace(/\s/g,'-');

// Ignore fenced code so examples cannot become navigation or section boundaries.
export function markdownHeadings(text){
  const result=[],used=new Map();let offset=0,fence=null;
  for(const line of text.match(/[^\n]*\n|[^\n]+$/g)??[]){
    const marker=/^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence=null;}
    else if(!fence){
      const match=/^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trimEnd());
      if(match){const base=slug(match[2]),n=used.get(base)??0;used.set(base,n+1);result.push({level:match[1].length,title:match[2],anchor:base+(n?'-'+n:''),offset});}
    }
    offset+=line.length;
  }
  return result;
}

export async function readResource(resource){
  const [file,anchor]=resource.split('#');
  const text=await readFile(join(skillRoot,file),'utf8');
  if(!anchor)return {file:resource,text};
  const headings=markdownHeadings(text),index=headings.findIndex(h=>h.anchor===decodeURIComponent(anchor));
  if(index<0)throw new Error('资料章节不存在：'+resource);
  const start=headings[index],end=headings.slice(index+1).find(h=>h.level<=start.level)?.offset??text.length;
  return {file:resource,text:text.slice(start.offset,end).trimEnd()+'\n'};
}

export function reviewFiles(designMode=null){
  if(designMode!==null&&!['A','B','C'].includes(designMode))throw new Error('视觉评审的 --design-mode 仅支持A/B/C；未知时省略并按目标卡核对');
  const loop=policy.review_loop;
  return [...new Set(['agents/design-reviewer.toml','templates/评审评分表.md',...loop.method_files,...(loop.method_files_by_design_mode?.[designMode??'unknown']??[])])];
}

export function readingPlan({mode,stage='start',topics=[],designMode=null}){
  const route=resourceMap.modes[mode];
  if(!route)throw new Error('未知模式：'+mode);
  if(!route.stages[stage])throw new Error(`模式${mode}没有${stage}阶段；可用：${Object.keys(route.stages).join('、')}`);
  const groups=[...route.stages[stage]];
  for(const topic of topics){if(!resourceMap.topics[topic])throw new Error('未知专题：'+topic);groups.push(resourceMap.topics[topic]);}
  const resources=[...new Set(groups.flatMap(id=>{
    const group=resourceMap.groups[id];if(!group)throw new Error('索引缺少资料组：'+id);
    return group.review_methods?reviewFiles(designMode):group.files;
  }))];
  return {mode,title:route.title,stage,resources,scope:route.scope,note:'这是本阶段读取清单，不是新增执行、委派或确认要求；已经读取且未变化的规则不重复加载。'};
}

export async function listResources(dir=skillRoot,prefix=''){
  const files=[];
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    if(entry.name.startsWith('.')||['node_modules','__pycache__'].includes(entry.name))continue;
    const file=prefix+entry.name;
    if(entry.isDirectory())files.push(...await listResources(join(dir,entry.name),file+'/'));
    else if(/\.(md|mjs|py|json|toml|yaml|css)$/.test(entry.name))files.push(file);
  }
  return files;
}
