// Mode C only: reproducible construction briefs, never an automatic choice of the final design.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const imageQuality='画面干净通透，材质完整自然，纹理平滑统一，主体清晰，避免过度锐化、色斑、噪点、碎纹、崩坏和畸变。';
const library=JSON.parse(await readFile(new URL('../library/original-directions.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex');

export function drawOriginal(brief,seed=randomBytes(12).toString('hex')){
  if(brief.mode!=='C')throw new Error('构图方法库仅适用于模式C，不能改写A的参考风格');
  for(const key of ['subject','goal','sector'])if(typeof brief[key]!=='string'||!brief[key].trim())throw new Error('缺少原创任务字段：'+key);
  for(const key of ['product_object','user_task'])if(brief[key]!==undefined&&(typeof brief[key]!=='string'||!brief[key].trim()))throw new Error(key+'须为非空文本');
  for(const key of ['have','keep','allow_methods','exclude_methods'])if(brief[key]!==undefined&&(!Array.isArray(brief[key])||brief[key].some(v=>typeof v!=='string')))throw new Error(key+'须为字符串数组');
  const count=brief.count??3;
  if(!Number.isInteger(count)||count<1||count>3)throw new Error('count须为1到3；首批默认三个，后续按反馈补充');
  const ids=new Set(library.directions.map(d=>d.id));
  for(const key of ['allow_methods','exclude_methods'])for(const id of brief[key]??[])if(!ids.has(id))throw new Error(key+'包含未知方法：'+id);
  if(!Array.isArray(brief.references)||brief.references.length<5)throw new Error('先完成五站调研，将URL与实际观察写入references');
  const sources=brief.references.map(ref=>{
    if(!ref||typeof ref.observation!=='string'||!ref.observation.trim())throw new Error('每站须有实际观察，不能只报站名');
    const url=new URL(ref.url);
    if(!['https:','http:'].includes(url.protocol))throw new Error('调研来源须为网页URL');
    return url.hostname.replace(/^www\./,'');
  });
  if(new Set(sources).size<5)throw new Error('五站须来自不同网站，同站不同页面不能凑数');
  seed=String(seed);
  const have=brief.have??[],keep=brief.keep??[];
  const pool=library.directions.filter(d=>d.needs.every(n=>have.includes(n))&&(!brief.allow_methods||brief.allow_methods.includes(d.id))&&!brief.exclude_methods?.includes(d.id));
  if(pool.length<count)throw new Error('可行方法不足所需数量；核对真实资源，补找产品与参考并形成新构图，不重复已否定的方法或假设资源存在');
  const score=d=>(d.sectors.includes(brief.sector)?2:0)+(d.tones.includes(brief.tone)?1:0);
  const rank=d=>score(d)+Number.parseInt(digest(seed+'|candidate|'+d.id).slice(0,8),16)/0x100000000;
  const pick=(id,slot,values)=>values[Number.parseInt(digest(seed+'|'+id+'|'+slot).slice(0,8),16)%values.length];
  const ranked=[...pool].sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id)),selected=[];
  // Prefer different composition mechanisms, then fill only if the feasible pool is narrow.
  for(const d of ranked)if(!selected.some(p=>p.family===d.family)&&selected.length<count)selected.push(d);
  for(const d of ranked)if(!selected.includes(d)&&selected.length<count)selected.push(d);
  const candidates=selected.map((d,i)=>({
    label:['甲','乙','丙'][i],method:d.id,family:d.family,name:d.name,
    subject:brief.subject,goal:brief.goal,
    product_anchor:{object:brief.product_object??'待Agent从产品真实内容确定专属对象',user_task:brief.user_task??brief.goal},
    sector_fit:d.sectors.includes(brief.sector)?'行业适用；仍须核对本项目内容':'跨行业方法；须明确迁移理由，不能冒称同类产品',
    why_available:d.needs.length?'已声明可用：'+d.needs.join('、'):'不依赖未声明的素材或产品UI',
    idea:'待Agent从本项目真实内容填写：什么专属对象，以什么构图方式被感知；不能直接把方法名称当概念',
    hero:pick(d.id,'hero',d.hero),reading_path:pick(d.id,'flow',d.flow),
    typography:keep.includes('type')?'保留项目既有字体角色与令牌；'+d.type:d.type,
    palette:keep.includes('palette')?'保留项目既有配色与角色比例':'从主题与五站研究确定颜色角色，不由抽签生成业务含义',
    materials:d.materials,mobile:d.mobile,interaction:d.interaction,pitfall:d.pitfall,
    technology:'待Agent按实际构图选择渲染接口、资源与驱动；方法条目不是技术取证',
    image_request:have.includes('imagegen')?{
      tool:'Codex内置image_gen（用户指定GPT Image 2.5，后台版本以实际回执为准）',
      transparent_background:d.transparent,
      prompt:`为${brief.subject}的网站制作${d.transparent?'完整独立主体，真实透明背景与干净alpha边缘':'主题场景配图，按网页内容留出排版空间'}。构图用途：${d.materials}。保持统一镜头、光线、材质与主体比例；不把网页文字或可交互UI烘焙进图片，不添加未经确认的业务事实。${imageQuality}`
    }:null,
    adaptation:'待Agent结合实际五站证据与内容完善；若不合适记录原因，不强行迁就候选'
  }));
  return {schema:1,mode:'C',seed,count,library_version:library.version,library_hash:digest(JSON.stringify(library)),
    input:brief,candidates,provenance:library.provenance,
    limits:['只生成候选规格，不代表已完成预览、生图或用户选定','固定种子只复现候选与参数，不承诺模型输出逐像素一致','不导入Taste的固定图片/动画数量或风格禁令']};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
    if(!opt('--brief'))throw new Error('用法：node draw-original.mjs --brief <JSON> [--seed <记录值>] --out <候选JSON>');
    const output=drawOriginal(JSON.parse(await readFile(resolve(opt('--brief')),'utf8')),opt('--seed'));
    const dest=resolve(opt('--out')??'.lsf/original-candidates.json');
    await mkdir(dirname(dest),{recursive:true});
    await writeFile(dest,JSON.stringify(output,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    console.log(JSON.stringify({mode:'C',seed:output.seed,path:dest,candidates:output.candidates.map(c=>({label:c.label,method:c.method,name:c.name}))}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
