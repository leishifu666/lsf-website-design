// Synthetic source/mount receipts exercise validation; they are not browser evidence.
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function componentReuseFixture(site) {
  await mkdir(join(site,'ref/reuse'),{recursive:true});
  await mkdir(join(site,'src/reuse'),{recursive:true});
  const components = [], imports = [], calls = [], nodes = [];
  for (let i = 0; i < 5; i++) {
    const name = 'Component'+i;
    const code = `export function ${name}(node) { node.style.opacity = '${i/5}'; return node.getBoundingClientRect(); }`;
    const source_file = 'ref/reuse/'+name+'.js', target_file = 'src/reuse/'+name+'.js';
    await writeFile(join(site,source_file),code); await writeFile(join(site,target_file),code);
    imports.push(`import {${name}} from './reuse/${name}.js';`);
    const call = `${name}(document.querySelector('#component-${i}'));`; calls.push(call);
    nodes.push({selector:'#component-'+i,tag:'div',rect:{x:0,y:i*40,width:120,height:32},style:{display:'block',position:'relative'}});
    components.push({id:'component-'+i,page:'home',kind:'component',source_url:'https://components.example.test/'+name,
      source_component:name,source_file,license:'MIT (synthetic fixture)',version:'fixture-v1',target_file,
      usage:{file:'src/reuse-entry.js',excerpt:call,retained_excerpt:code},evidence:{file:'ref/reuse/nodes.json',pointer:'/nodes/'+i}});
  }
  await writeFile(join(site,'src/reuse-entry.js'),[...imports,...calls].join('\n'));
  const plan = {component_reuse:{version:1,pages:[{id:'home',entry:'src/reuse-entry.js',url:'http://localhost:4173/'}],components}};
  await writeFile(join(site,'ref/reuse/nodes.json'),JSON.stringify({url:'http://localhost:4173/',nodes}));
  await writeFile(join(site,'assets-plan.json'),JSON.stringify(plan));
  return plan;
}
