// Edit the route manifest and topic sources; this command regenerates their hubs and indexes.
import {readFile,writeFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import {skillRoot,resourceMap,markdownHeadings,listResources,readingPlan,readResource,reviewFiles} from './lib/resources.mjs';

const marker='<!-- lsf-website-design:generated-resource-index -->';
const link=(from,to,label)=>`[${label??to}](${posix.relative(posix.dirname(from),to)})`;
const generated=new Map();
for(const hub of resourceMap.hubs){
  const boundary=await readFile(join(skillRoot,hub.boundary),'utf8');
  // Boundary sources live two directories below references; restore their relative links.
  const intro=boundary.slice(boundary.indexOf('\n')+1).replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g,(all,a,target,b)=>{
    if(/^(?:[a-z][\w+.-]*:|\/)/i.test(target))return all;
    const [file,anchor]=target.split('#');
    const resolved=posix.normalize(posix.join(posix.dirname(hub.boundary),file));
    return a+posix.relative(posix.dirname(hub.file),resolved)+(anchor?'#'+anchor:'')+b;
  }).trim();
  const parts=[`# ${hub.title}`,marker,'本文件是按需索引，由 `scripts/resource-index.mjs` 生成。细则在下列专题源文件；按当前问题读取，不通读全部。',intro,'## 按任务选读',...hub.children.map(child=>'- '+link(hub.file,child,posix.basename(child,'.md'))),'## 旧章节链接兼容'];
  for(const child of hub.children){
    const headings=markdownHeadings(await readFile(join(skillRoot,child),'utf8'));
    for(const h of headings.filter(h=>h.level>=2))parts.push(`${'#'.repeat(h.level)} ${h.title}\n\n${link(hub.file,child+'#'+h.anchor,'读取本节')}。`);
  }
  generated.set(hub.file,parts.join('\n\n')+'\n');
}

const navigation='references/模式阅读导航.md';
const nav=['# 模式与阶段阅读导航',marker,'只读取当前阶段这一行。`start`用于确定边界；走到下一阶段再补读，不把表中所有资料当成开工条件。用户只要分析、局部修改或技能更新时，按范围停止。',
  '可查询：`node <技能>/scripts/read-plan.mjs --mode A --stage preview`；需要时加 `--topic motion`。命令只列文件，不运行建站、浏览器、生图或评审。'];
for(const [mode,route] of Object.entries(resourceMap.modes)){
  nav.push(`## 模式${mode} ${route.title}`,route.scope,'| 当前阶段 | 按需读取 |\n|---|---|');
  for(const stage of Object.keys(route.stages)){
    const plan=readingPlan({mode,stage});
    nav.push(`| ${stage} | ${plan.resources.map(f=>link(navigation,f,posix.basename(f.split('#')[0],'.md')+(f.includes('#')?' · 对应节':''))).join('、')} |`);
  }
}
nav.push('## 专题入口','遇到具体问题再补读；专题入口会继续指向对应章节。','| 问题 | 入口 |\n|---|---|');
for(const [topic,id] of Object.entries(resourceMap.topics))nav.push(`| ${topic}：${resourceMap.groups[id].purpose} | ${resourceMap.groups[id].files.map(f=>link(navigation,f)).join('、')} |`);
nav.push('视觉评审包另按制作模式A/B/C选择对应口径；未登记模式时只带共同规则，按目标卡核对，不能默认套用C原创标准。完整技能文件见[总索引](../INDEX.md)。');
const render=parts=>parts.join('\n\n').replace(/\|\n\n(?=\|)/g,'|\n')+'\n';
generated.set(navigation,render(nav));

// Validate real paths and fragments, including every mode/profile, before replacing generated output.
const referenced=new Set(Object.values(resourceMap.groups).flatMap(g=>g.files??[]));
for(const mode of [null,'A','B','C'])for(const f of reviewFiles(mode))referenced.add(f);
for(const file of referenced){
  const [path,anchor]=file.split('#');
  if(generated.has(path)){
    if(anchor&&!markdownHeadings(generated.get(path)).some(h=>h.anchor===decodeURIComponent(anchor)))throw new Error('索引缺少章节：'+file);
  }else await readResource(file);
}
const files=[...new Set([...await listResources(),...generated.keys(),'INDEX.md'])].sort();
const categories=[['入口与说明',f=>!f.includes('/')],['按需资料',f=>f.startsWith('references/')&&!f.startsWith('references/topics/')],['拆分专题源文件',f=>f.startsWith('references/topics/')],['角色与模板',f=>/^(agents|templates)\//.test(f)],['方法数据与案例',f=>/^(library|examples)\//.test(f)],['脚本与测试',f=>f.startsWith('scripts/')]];
const index=['# 网站设计技能总索引',marker,'先从[主入口](SKILL.md)判断任务，再用[模式与阶段导航](references/模式阅读导航.md)选择当前资料。本页只负责查找，不要求一次加载所有文件。',
  '维护入口：`references/资源路由.json`管理模式、阶段、专题和拆分映射；专题源文件可直接编辑，生成的总索引、阅读导航及旧文件索引运行 `node scripts/resource-index.mjs` 更新，用 `--check` 校验。大体量数据按条件查询，不把整个组件库或方法库塞进提示词。',
  '制作、文案审核、视觉评审、反推提示词有独立边界。`examples/`是历史证据；`scripts/tests/`是合成回归测试；二者不覆盖当前用户要求。'];
for(const [name,select] of categories){
  index.push(`## ${name}`,'| 文件 | 用途或阅读时机 |\n|---|---|');
  for(const file of files.filter(select)){
    const groups=Object.values(resourceMap.groups).filter(g=>g.files?.some(r=>r.split('#')[0]===file));
    let purpose=resourceMap.purposes[file]??groups.map(g=>g.purpose).filter((v,i,a)=>a.indexOf(v)===i).join('；');
    if(!purpose){
      if(file.startsWith('scripts/tests/'))purpose='修改对应实现后运行的回归测试';
      else if(file.startsWith('scripts/lib/'))purpose='脚本内部实现；维护对应功能时读取';
      else if(file.endsWith('.md')){
        const text=generated.get(file)??await readFile(join(skillRoot,file),'utf8');
        purpose=markdownHeadings(text)[0]?.title??'按需阅读的说明';
      }else purpose=file.startsWith('library/')?'按条件筛选的方法数据；不整份加载':file.startsWith('templates/')?'对应任务的模板；采用时再读取':'对应功能的配置或实现；见脚本说明';
    }
    index.push(`| ${link('INDEX.md',file,file)} | ${purpose.replaceAll('|','／')} |`);
  }
}
generated.set('INDEX.md',render(index));
const check=process.argv.includes('--check'),stale=[];
for(const [file,text] of generated){
  const existing=await readFile(join(skillRoot,file),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(existing!==null&&!existing.includes(marker))throw new Error('已有非生成器维护的文件，保留并停止：'+file);
  if(existing!==text)stale.push(file);
}
if(!check)for(const file of stale)await writeFile(join(skillRoot,file),generated.get(file));
console.log(JSON.stringify({files:files.length,generated:[...generated.keys()],stale,check}));
if(check&&stale.length)process.exitCode=1;
