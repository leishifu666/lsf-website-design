import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {skillRoot,resourceMap,readingPlan,readResource,reviewFiles,markdownHeadings,listResources} from '../lib/resources.mjs';

test('每个模式与阶段的实际读取清单都可打开；只评审/提示词不加载制作流程',async()=>{
  for(const [mode,route] of Object.entries(resourceMap.modes))for(const stage of Object.keys(route.stages)){
    const plan=readingPlan({mode,stage});assert(plan.resources.length);
    for(const resource of plan.resources)assert((await readResource(resource)).text.trim(),resource);
  }
  for(const mode of ['F','G','H'])assert(!readingPlan({mode}).resources.includes('references/制作流程.md'));
  assert(!readingPlan({mode:'A',stage:'preview'}).resources.includes('references/原创构图方法库.md'));
  assert.throws(()=>readingPlan({mode:'F',stage:'build'}),/没有build阶段/);
  assert.throws(()=>readingPlan({mode:'A',topics:['made-up']}),/未知专题/);
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
