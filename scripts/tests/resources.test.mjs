import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {skillRoot,resourceMap,readingPlan,readResource,reviewFiles,markdownHeadings,listResources} from '../lib/resources.mjs';

test('每个模式与阶段的实际读取清单都可打开；只评审/提示词不加载制作流程',async()=>{
  for(const [mode,route] of Object.entries(resourceMap.modes))for(const stage of Object.keys(route.stages)){
    const plan=readingPlan({mode,stage});assert(plan.resources.length);
    for(const resource of plan.resources)assert((await readResource(resource)).text.trim(),resource);
  }
  for(const mode of ['F','G','H','I','J'])assert(!readingPlan({mode}).resources.includes('references/制作流程.md'));
  for(const stage of Object.keys(resourceMap.modes.I.stages)) {
    const files=readingPlan({mode:'I',stage}).resources;
    assert(!files.includes('references/五站调研与记忆点.md'));
    assert(!files.includes('agents/copy-reviewer.toml'));
    assert(!files.includes('references/独立评审入口.md'));
  }
  assert(readingPlan({mode:'A',stage:'research'}).resources.includes('references/动画取证与逐帧对照.md'));
  for (const file of ['references/趣味动效与交互选型.md','references/组件书签与源码复用.md'])
    assert(readingPlan({mode:'A',stage:'start'}).resources.includes(file));
  assert(!readingPlan({mode:'A',stage:'preview'}).resources.includes('references/原创构图方法库.md'));
  assert.throws(()=>readingPlan({mode:'F',stage:'build'}),/没有build阶段/);
  assert.throws(()=>readingPlan({mode:'A',topics:['made-up']}),/未知专题/);
});

test('实际生成 A/I/J 入口保留整站、局部动画与设计文档各自的范围',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'lsf-mode-entry-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const catalog=JSON.parse(await readFile(join(skillRoot,'references/命令入口.json'),'utf8'));
  for (const mode of ['A','I','J']) {
    const run=spawnSync(process.execPath,[join(skillRoot,'scripts/install-mode-entries.mjs'),'--skills-dir',dir,'--mode',mode],{encoding:'utf8',windowsHide:true});
    assert.equal(run.status,0,run.stdout+run.stderr);
    const entry=catalog.find(e=>e.mode===mode);
    const content=await readFile(join(dir,entry.name,'SKILL.md'),'utf8');
    if(mode==='A') {
      assert.match(content,/core_motion/); assert.match(content,/source 通过后.*prototype 通过后/);
      assert.match(content,/静态参考可据实 none/); assert.match(content,/每页至少五个/);
    } else if (mode==='I') {
      assert.match(content,/只复刻指定动画、区块交互或视频时段/);
      assert.match(content,/不启动整站begin.*每页五组件配额/);
      assert.match(content,/不扩成整站重做/);
    } else {
      assert.match(content,/references\/design-md\.md\)/);
      assert.match(content,/vendor\/google-design-md\/upstream\/docs\/spec\.md\)/);
      assert.match(content,/templates\/DESIGN\.md\)/);
      assert.doesNotMatch(content,/references\/制作流程\.md\)/);
      assert.deepEqual(readingPlan({mode,stage:'verify'}).resources,[
        'references/design-md.md','vendor/google-design-md/upstream/docs/spec.md','templates/DESIGN.md'
      ]);
    }
  }
  assert.deepEqual((await readdir(dir)).sort(),['lsf-web-animate','lsf-web-design-md','lsf-web-replica']);
});

test('评审按制作模式只取相应原文章节，保留共同约束并移除整份建站入口',async()=>{
  for(const mode of [null,'A','B','C']){
    const files=reviewFiles(mode);
    assert(!files.includes('SKILL.md'));
    assert(files.includes('references/评审共用约束.md'));
    const profile=files.find(f=>f.startsWith('references/评审适用范围.md#'));
    const text=(await readResource(profile)).text;
    assert.equal(markdownHeadings(text).filter(h=>h.level===2).length,1);
    assert(!text.includes(mode==='A'?'## 模式C':'## 模式A'));
    assert.equal(files.includes('references/反套路清单.md'),['B','C'].includes(mode));
  }
  assert.throws(()=>reviewFiles('C-ish'),/仅支持/);
  await assert.rejects(readResource('references/评审适用范围.md#不存在'),/章节不存在/);
});

test('专题兼容索引保留每个源章节锚点，并指向实际子文件',async()=>{
  for(const hub of resourceMap.hubs){
    const text=await readFile(join(skillRoot,hub.file),'utf8');
    const anchors=new Set(markdownHeadings(text).map(h=>h.anchor));
    assert(text.includes('generated-resource-index'));
    for(const child of hub.children){
      const original=await readFile(join(skillRoot,child),'utf8');
      for(const heading of markdownHeadings(original).filter(h=>h.level>=2)){
        assert(anchors.has(heading.anchor),`${hub.file}#${heading.anchor}`);
        assert(text.includes(child.replace('references/','')+'#'+heading.anchor));
      }
    }
  }
});

test('总索引覆盖全部可分发资源，当前生成文件与维护源同步',async()=>{
  const index=await readFile(join(skillRoot,'INDEX.md'),'utf8');
  for(const file of await listResources())assert(index.includes(']('+file+')'),file);
  const check=spawnSync(process.execPath,[join(skillRoot,'scripts/resource-index.mjs'),'--check'],{encoding:'utf8',windowsHide:true});
  assert.equal(check.status,0,check.stdout+check.stderr);
});

test('Markdown代码示例不会伪造章节；中文、重复标题可准确定位',()=>{
  const result=markdownHeadings('# 文档\n\n```md\n## 假标题\n```\n\n## 模式A\n正文\n\n## 模式A\n第二节\n');
  assert.deepEqual(result.map(h=>h.anchor),['文档','模式a','模式a-1']);
});
