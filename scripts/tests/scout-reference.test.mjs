import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const scout = fileURLToPath(new URL('../scout-reference.mjs', import.meta.url));
const css = ':root {--ink:rgb(20, 40, 60)} @media(min-width: 640px){#open{color:var(--ink)}} #open::before {content:"+"} @keyframes rise{from{opacity:0}to{opacity:1}}';

async function serve(handler) {
  const server = createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:' + server.address().port, close:()=>server.close()};
}

test('live discovery, recursive source, explicit interaction, cross-origin CSS and retained evidence', async t => {
  const base = process.env.SCOUT_TEST_OUT || tmpdir();
  await mkdir(base,{recursive:true});
  const out = await mkdtemp(path.join(base,'scout-'));
  t.diagnostic('Evidence: ' + out);
  const get = async rel => JSON.parse(await readFile(path.join(out,rel),'utf8'));
  let mutationRequests = 0, externalVisits = 0;
  const cdn = await serve((req,res) => {
    if (req.url === '/asset.css') res.writeHead(200,{'Content-Type':'text/css'}).end(css);
    else { externalVisits++; res.end('External'); }
  });
  const site = await serve((req,res) => {
    if (req.url === '/mutate') {mutationRequests++; res.end(); return;}
    if (req.url === '/missing') {res.writeHead(404).end('<h1>Not found</h1>'); return;}
    if (req.url === '/details/a') {res.end('<h1>Details A</h1>'); return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(`<!doctype html>
      <link rel="stylesheet" href="${cdn.url}/asset.css"><title>Reference</title>
      <main><section id="hero" style="height:130vh"><h1>Reference</h1>
      <button id="open" aria-controls="sheet" onclick="sheet.showModal();fetch('/mutate',{method:'POST'}).catch(()=>{})"><b><i>Explore</i></b></button>
      <dialog id="sheet"><b>Overlay entered</b></dialog>
      <a hidden href="#more">Hidden target</a><a id="jump" href="#more">More</a><a id="missing" href="/missing">Missing</a><a id="inside" href="/details/a">Details A</a>
      <a href="/details/b">Details B</a><a id="outside" href="${cdn.url}/forbidden">Outside</a></section>
      <section id="more" style="height:100vh"><h2>More</h2></section></main>`);
  });
  t.after(()=>{site.close();cdn.close();});
  const url = site.url + '/';
  const env = {...process.env,LSF_PROXY:'',HTTPS_PROXY:'',https_proxy:''};
  const run = (...args) => exec(process.execPath,[scout,url,out,'--settle','50',...args],{env});
  const actions = path.join(out,'actions.json');
  await writeFile(actions,JSON.stringify([
    {action:'click',selector:'#open',label:'open',ready:'dialog[open]',inspect:['#sheet']},
    {action:'press',key:'Escape',label:'closed'},{action:'click',selector:'#inside',label:'detail'},
    {action:'back',label:'back'},{action:'scroll',y:1200,label:'scrolled'}]));
  await run('--actions',actions,'--sweep','1');
  const first = await get('topology.json');
  const entry = first.states[0].path;
  const entryDoc = await get(entry+'/discovery.json');
  assert(first.entries.some(e=>e.kind==='template' && e.members.length===2));
  assert(first.entries.some(e=>e.kind==='anchor' && e.targetSelector==='#more'));
  assert(first.entries.some(e=>e.kind==='external' && e.url===cdn.url+'/forbidden'));
  assert(first.states.some(s=>s.url===url+'details/a'));
  assert((await get(first.states[4].path+'/manifest.json')).url===url);
  assert((await get(first.states[5].path+'/discovery.json')).scroll.y > 0);
  const expanded = await get(first.states[1].path+'/discovery.json');
  assert.equal(entryDoc.entries.find(e=>e.kind==='overlay').rendered,false);
  assert.equal(expanded.entries.find(e=>e.kind==='overlay').rendered,true);
  const resource = await get(entry+'/resources.json');
  const sheet = resource.stylesheets.find(s=>s.url===cdn.url+'/asset.css');
  assert(sheet.cssomError && sheet.networkSource);
  assert.equal(sheet.networkRules.keyframes[0].name,'rise');
  assert(sheet.networkRules.mediaRules[0].matches);
  assert.equal(sheet.networkRules.variables[0].name,'--ink');
  assert.equal((await readFile(path.join(out,'runs',first.runId,sheet.networkSource),'utf8')),css);
  assert.equal(mutationRequests,0);

  await run('--selector','#open','--all-styles','--sweep','0');
  const second = await get('topology.json');
  assert(second.states.length > first.states.length);
  const measured = await get(second.states.at(-1).path+'/component-0.json');
  const button = measured.trees[0];
  assert.deepEqual(button.children[0].children[0].children,['Explore']);
  assert(button.rect.width > 0);
  assert.equal(measured.styles[button.style].color,'rgb(20, 40, 60)');
  assert.equal(button.pseudo['::before'].content,'"+"');
  assert.equal(measured.styleProperties,'all');
  const png = await readFile(path.join(out,second.states.at(-1).path,'crop-0.png'));
  assert.equal(png.readUInt32BE(0),0x89504e47);

  await writeFile(actions,JSON.stringify([{action:'click',selector:'#outside'}]));
  await assert.rejects(run('--actions',actions,'--sweep','0'),/Action incomplete/);
  const after = await get('topology.json');
  assert(after.states.some(s=>s.id===first.states[0].id));
  assert.equal((await get('runs/'+after.runId+'/run.json')).status,'failed');
  assert.equal(externalVisits,0);
  const link = entryDoc.entries.find(e=>e.kind==='anchor');
  assert.equal(link.selector,'#jump');
  assert.equal(link.linkSources.length,2);
  assert.equal(link.targetInView,false);
  const scrolled = await get(first.states[5].path+'/discovery.json');
  assert(scrolled.entries.find(e=>e.kind==='anchor').targetInView);
  assert(scrolled.entries.find(e=>e.kind==='section' && e.domId==='more').inViewport);

  await writeFile(actions,JSON.stringify([{action:'click',selector:'#missing'}]));
  await assert.rejects(run('--actions',actions,'--sweep','0'),/Action incomplete/);
  const failed = await get('topology.json');
  assert(!failed.states.some(s=>s.url===url+'missing'));
  const report = await get('runs/'+failed.runId+'/run.json');
  assert.equal(report.states.at(-1).documentResponse.status,404);
});
