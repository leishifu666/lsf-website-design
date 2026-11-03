// Synthetic source and built evidence for the phase and lifecycle tests, never a live website receipt.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const frames = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQM3YHAAELAJnvd62IAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOwMXYHAAFlALexPMOzAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOIMnYHAAG/ANWJ+BYIAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOoMHYHAAIZAPNUYZgXAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOYZuwOAAJzARGX8SbdAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPYYuwOAALNAS/DiOWRAAAAAElFTkSuQmCC'
];

export async function prototypeFixture(site) {
  const write = (file, data) => writeFile(join(site,file), data);
  const json = (file, data) => write(file, JSON.stringify(data));
  const stateIds = ['ready','middle','open'];
  await mkdir(join(site,'ref'),{recursive:true});
  await mkdir(join(site,'src'),{recursive:true});
  const inventory = {discovery:'ref/sweep.json',
    states:[...stateIds.map((id,i) => ({id, trigger:'drag=' + i/2, widths:i ? [1440] : [375,768,1440]})),
      {id:'credits',trigger:'进入片尾',widths:[1440]}],
    sequences:[{id:'drag',input:'drag',states:stateIds}],
    samples:[{id:'ink',kind:'palette',state:'ready'},{id:'space',kind:'surface',state:'ready'},
      {id:'gate',kind:'asset',state:'middle'},{id:'more',kind:'control',state:'credits'}]};
  const contract = {version:1,source:'https://example.test/',inventory:'ref/inventory.json',
    prototype:{original:'ref/prototype-original.json',built:'ref/prototype-built.json'}, states:[],samples:[]};
  for (const state of inventory.states) for (const width of state.widths) {
    const row = {id:state.id,width};
    for (const side of ['original','built']) {
      const image = 'ref/' + side + '-' + state.id + '-' + width + '.png';
      const index = Math.max(0, stateIds.indexOf(state.id)) + (side === 'built' ? 3 : 0);
      await write(image,Buffer.from(frames[index],'base64'));
      row[side] = {status:'observed',image,viewport:{width,height:900},observation:state.trigger};
    }
    contract.states.push(row);
  }
  const values = [{foreground:'#fff',background:'#222',accent:'gold'},{layers:'0',boundary:'none'},
    {resource:'https://example.test/gate.svg',binding:'gate / panel',shape:'rect',motion:'drag controls x'},
    {color:'#222',background:'gold',border:'none',radius:'0',padding:'8px',type:'18px serif',feedback:'none'}];
  for (const [index,item] of inventory.samples.entries()) {
    const sample = {id:item.id,verdict:'match'};
    for (const side of ['original','built']) {
      const evidence = 'ref/' + side + '-' + item.id + '.json';
      const measured = {...values[index]};
      if (item.kind === 'asset' && side === 'built') measured.resource = 'src/gate.svg';
      sample[side] = {values:measured,evidence};
      await json(evidence,measured);
    }
    if (item.kind === 'asset') Object.assign(sample,{strategy:'reskin',keep:'drag x',change:'color',rights:'test fixture'});
    contract.samples.push(sample);
  }
  const original = {probes:[
    {id:'panel',role:'scene',width:1440,sequence:'drag',samples:['gate'],locator:'https://example.test/gate.svg#panel',
      resource:'ref/gate.svg',implementation:'ref/drag.js',driver:'drag-x',mapping:'continuous',
      range:{value:70,unit:'css-px',tolerance:4},target:'gate',
      layer:'panel',property:'translateX',frames:stateIds.map((state,i) => ({
        state,at:i/2,value:(i*48)+'px',result:['closed','half-open','open'][i]}))},
    {id:'heading',role:'heading',width:1440,sequence:null,samples:['ink'],locator:'https://example.test/#heading',
      resource:'ref/heading.html',implementation:'ref/heading.html',driver:'none',mapping:'static',target:'heading',
      layer:'glyphs',property:'visibility',frames:[{state:'ready',at:0,value:'visible',result:'whole-title'}]}]};
  const built = structuredClone(original);
  built.measured_files = {};
  const sourceCode = {'gate.svg':'<svg xmlns="http://www.w3.org/2000/svg"><path id="panel" d="M0 0 L4 0 L4 4Z"/></svg>',
    'drag.js':'export const offset = progress => progress * 96;', 'heading.html':'<h1 id="heading">Test</h1>'};
  for (const [file, code] of Object.entries(sourceCode)) {
    await write('ref/'+file,code);
    await write('src/'+file,code);
    built.measured_files['src/'+file] = createHash('sha256').update(code).digest('hex');
  }
  for (const probe of built.probes) {
    if (probe.range) delete probe.range.tolerance;
    probe.locator = '#' + probe.id;
    probe.resource = probe.resource.replace('ref/','src/');
    probe.implementation = probe.implementation.replace('ref/','src/');
  }
  await json('ref/sweep.json',{mock:'synthetic browser sweep'});
  await json(contract.inventory,inventory);
  await json(contract.prototype.original,original);
  await json(contract.prototype.built,built);
  await json('ref/a-reference.json',contract);
  return {contract,inventory,original,built};
}
