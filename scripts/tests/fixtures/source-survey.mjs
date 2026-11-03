// Synthetic observations exercise the lifecycle; these files do not claim a real website visit.
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {draftSourceSurvey} from '../../lib/source-survey.mjs';

export async function surveyFixture(site, contract) {
  const write = (file,value) => writeFile(join(site,file),JSON.stringify(value));
  const url = contract.source;
  const entries = ['page','section','section','anchor'].map((kind,i) =>
    ({id:['home','intro','credits','go-credits'][i],kind,url:i === 3 ? url+'#credits' : url,sourceUrl:url,...(kind === 'anchor' ? {targetInView:true} : {inViewport:true})}));
  const topology = {schemaVersion:1,kind:'reference-discovery',sourceUrl:url,entries,
    states:[{id:'entry',url,path:'runs/test/states/entry'}]};
  const dir = 'ref/scout/runs/test/states/entry';
  await mkdir(join(site,dir),{recursive:true});
  await write(dir+'/manifest.json',{status:'ok',url});
  await write(dir+'/discovery.json',{url,sourceUrl:url,entries});
  await write('ref/input-observations.json',{observations:[
    '冷启动直接显示；滚轮只滚动文档；悬停按钮无样式变化；指针拖动门扇；无可切换面板；片尾链接直接进入目标。'
  ]});
  await write('ref/scout/topology.json',topology);
  const survey = draftSourceSurvey(topology);
  for (const row of survey.coverage) Object.assign(row,{disposition:'included',
    section:['intro','home'].includes(row.entries[0]) ? 'intro' : 'credits'});
  Object.assign(survey.sections[0],{spec:'标题悬于门上，双扇向边缘打开',states:['ready','middle','open'],samples:['ink','space','gate']});
  Object.assign(survey.sections[1],{spec:'片尾单行导航及来源',states:['credits'],samples:['more'],assetsAbsent:'片尾没有独立图片'});
  for (const section of survey.sections) {
    const file = 'ref/layout-original-'+section.id+'.json';
    section.layout = {state:section.states[0],file};
    const node = {selector:'#'+section.id,viewport:{width:1440,height:900},tag:'section',
      rect:{x:40,y:0,width:1360,height:420},style:{display:'grid',position:'relative'},children:[{tag:'h2'}]};
    await write(file,node); await write(file.replace('original','built'),node);
  }
  for (const c of survey.categories) Object.assign(c,{status:c.id === 'pointer' ? '已测量' : '已确认无此效果',
    basis:'ref/input-observations.json', observation:c.id === 'pointer' ? '拖动门时两扇移动' : '测试环境已运行此类输入，未发现变化'});
  const record = {id:'drag',section:'intro',category:'pointer',target:'两扇门',trigger:'拖动',precondition:'入口出现',
    states:{initial:'闭合',transition:'横移',end:'打开'},timing:{duration:'用户驱动',delay:0,easing:'线性'},
    response:{exit:'松手停住',reverse:'反向合上',repeat:'可重复',responsive:'窄屏触摸'},
    status:'已测量',assertions:[{property:'左扇位移',grade:'measured',
      source:{file:'ref/prototype-original.json',pointer:'/probes/0/frames/1/value'}}]};
  survey.behaviors.push(record);
  async function stage(which) {
    const result = structuredClone(survey);
    if (which !== 'source') {
      const b = result.behaviors[0];
      b.built = {verdict:'match',difference:'中点位移相同',action:'保持实测映射'};
      b.status = '已验证';
      for (const a of b.assertions) if (a.grade !== 'unknown')
        a.built = {file:a.source.file.replace('original','built'),pointer:a.source.pointer};
    }
    if (which === 'paired') {
      result.categories.find(c => c.id === 'pointer').status = '已验证';
      for (const s of result.sections) s.built = {verdict:'adapted',layout:{file:s.layout.file.replace('original','built')},locator:'#'+s.id,difference:'相同输入下排版与变化关系吻合',action:'保留中文文本适配'};
    }
    await write('ref/source-survey.json',result);
    return result;
  }
  await stage('source');
  return {stage,survey,topology};
}
