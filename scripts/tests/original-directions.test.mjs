import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {drawOriginal,imageQuality} from '../draw-original.mjs';

const scripts=fileURLToPath(new URL('../',import.meta.url));
const brief={mode:'C',subject:'回归测试虚构主题',goal:'验证候选机制，不是实际建站',sector:'product',tone:'luxury',have:['imagegen'],keep:['palette','type'],references:Array.from({length:5},(_,i)=>({url:`https://fixture-${i}.invalid`,observation:'测试输入，不冒称真实调研'}))};
test('同种子复现候选、构图和提示词，不把候选当已完成预览',()=>{
  const a=drawOriginal(brief,'fixed-seed');
  assert.deepEqual(a,drawOriginal(brief,'fixed-seed'));
  assert.equal(new Set(a.candidates.map(c=>c.method)).size,3);
  for(const c of a.candidates){assert(c.hero);assert(c.reading_path);assert(c.mobile);assert(c.image_request.prompt.endsWith(imageQuality));assert.match(c.palette,/保留/);assert.match(c.typography,/保留/);}
  assert(a.limits.some(l=>l.includes('不代表已完成预览')));
});
test('不同种子改变候选或构图；没有产品UI时不会抽到产品演示',()=>{
  assert.notDeepEqual(drawOriginal(brief,'seed-a').candidates,drawOriginal(brief,'seed-b').candidates);
  for(let i=0;i<15;i++)assert(!drawOriginal(brief,String(i)).candidates.some(c=>c.method==='product-performs'));
});
test('不会把A参考风格带进原创抽签，资源未知时不计划生图',()=>{
  assert.throws(()=>drawOriginal({...brief,mode:'A'}),/仅适用于模式C/);
  const a=drawOriginal({...brief,have:[]},'none');
  assert(a.candidates.every(c=>c.image_request===null));
});
test('同站多个页面或无观察记录不能充当五站研究',()=>{
  assert.throws(()=>drawOriginal({...brief,references:brief.references.map((r,i)=>({...r,url:`https://same.invalid/${i}`}))}),/不同网站/);
  assert.throws(()=>drawOriginal({...brief,references:brief.references.map(r=>({...r,observation:''}))}),/实际观察/);
});
test('后续候选排除已否定方法，可补单版并保持资源与提示词要求',()=>{
  const first=drawOriginal(brief,'first');
  assert.equal(new Set(first.candidates.map(c=>c.family)).size,3);
  const excluded=first.candidates.map(c=>c.method);
  const next=drawOriginal({...brief,count:1,exclude_methods:excluded},'next');
  assert.equal(next.candidates.length,1);
  assert(!excluded.includes(next.candidates[0].method));
  assert(next.candidates[0].image_request.prompt.endsWith(imageQuality));
  assert.throws(()=>drawOriginal({...brief,count:4}),/count须为1到3/);
  assert.throws(()=>drawOriginal({...brief,exclude_methods:['invented-id']}),/未知方法/);
});
test('用户选定的适用方法不被种子替换；缺真实条件不能使用产品证据方法',()=>{
  const method='configuration-compare';
  assert.throws(()=>drawOriginal({...brief,count:1,allow_methods:[method]},'none'),/可行方法不足/);
  const next=drawOriginal({...brief,count:1,allow_methods:[method],have:['imagegen','verified-specs'],product_object:'已确认的合成测试对象'},'available');
  assert.equal(next.candidates[0].method,method);
  assert.equal(next.candidates[0].product_anchor.object,'已确认的合成测试对象');
});
test('命令行保存真实候选，不覆盖用户已有输出',async()=>{
  const base=resolve(process.env.LSF_TEST_TMP||tmpdir());
  const root=await mkdtemp(join(base,'lsf-original-test-'));
  try{
    const input=join(root,'brief.json'),output=join(root,'candidates.json');
    await writeFile(input,JSON.stringify(brief));
    const args=[join(scripts,'draw-original.mjs'),'--brief',input,'--seed','cli','--out',output];
    const first=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true});
    assert.equal(first.status,0,first.stderr);
    const content=await readFile(output,'utf8');
    assert.equal(JSON.parse(content).seed,'cli');
    assert.equal(spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true}).status,1);
    assert.equal(await readFile(output,'utf8'),content);
  }finally{assert(root.startsWith(base));await rm(root,{recursive:true,force:true});}
});
test('图标检查允许明确立体示意，但手写箭头和伪装图标仍失败',async()=>{
  const base=resolve(process.env.LSF_TEST_TMP||tmpdir());
  const root=await mkdtemp(join(base,'lsf-icon-test-'));
  try{
    const file=join(root,'drawing.html');
    const run=()=>spawnSync(process.execPath,[join(scripts,'check-icons.mjs'),'--src',root],{encoding:'utf8',windowsHide:true});
    await writeFile(file,'<svg data-lsf-illustration="isometric" viewBox="0 0 300 200"><polygon points="0,30 50,0 100,30 50,60"/></svg>');
    assert.equal(run().status,0);
    await writeFile(file,'<svg aria-label="arrow" viewBox="0 0 24 24"><path d="M0 0L12 12"/></svg>');
    assert.equal(run().status,1);
    await writeFile(file,'<svg data-lsf-illustration="isometric" aria-label="arrow" viewBox="0 0 24 24"><path d="M0 0L12 12"/></svg>');
    assert.equal(run().status,1);
  }finally{assert(root.startsWith(base));await rm(root,{recursive:true,force:true});}
});
