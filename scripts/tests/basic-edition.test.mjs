import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {skillRoot,readingPlan,reviewFiles} from '../lib/resources.mjs';

test('基础版安装器仅生成七个公开入口，移出的入口不可安装',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'lsf-basic-'));
  try{
    const catalog=JSON.parse(await readFile(join(skillRoot,'references/命令入口.json'),'utf8'));
    assert.deepEqual(catalog.map(e=>e.mode),['A','B','C','D','F','G','H']);
    const skills=join(temp,'skills');
    const result=spawnSync(process.execPath,[join(skillRoot,'scripts/install-mode-entries.mjs'),'--skills-dir',skills],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.deepEqual((await readdir(skills)).sort(),catalog.map(e=>e.name).sort());
    for(const entry of catalog)assert((await readFile(join(skills,entry.name,'SKILL.md'),'utf8')).includes(`模式${entry.mode}`));
    const removed=spawnSync(process.execPath,[join(skillRoot,'scripts/install-mode-entries.mjs'),'--skills-dir',join(temp,'removed'),'--mode','E'],{encoding:'utf8',windowsHide:true});
    assert.notEqual(removed.status,0);
    assert.match(removed.stderr,/未找到指定模式/);
    await assert.rejects(access(join(temp,'removed')));
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('基础版制作及评审入口拒绝已移出的模式，且不写入项目状态',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'lsf-basic-workflow-'));
  try{
    assert.throws(()=>readingPlan({mode:'E'}),/未知模式/);
    assert.throws(()=>reviewFiles('E'),/仅支持A\/B\/C/);
    const result=spawnSync(process.execPath,[join(skillRoot,'scripts/workflow-check.mjs'),'begin','--root',temp,'--site','.','--design-mode','E'],{encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);
    assert.match(result.stdout+result.stderr,/仅支持A\/B\/C/);
    await assert.rejects(access(join(temp,'.lsf')));
  }finally{await rm(temp,{recursive:true,force:true});}
});
