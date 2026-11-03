import { inspectSectionLayout } from './section-layout.mjs';
import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const behaviorCategories = ['load', 'scroll', 'hover', 'pointer', 'component', 'navigation'];
const observed = ['已测量', '已实现', '已验证'];
const sourceStatus = status => observed.includes(status) ? '已测量' : status;
const text = s => typeof s === 'string' && s.trim().length > 0;
const demand = (valid, message) => { if (!valid) throw Error('逐区块取证：' + message); };
const resolved = built => ['match','adapted','fixed'].includes(built?.verdict);
const list = a => Array.isArray(a) && a.length > 0;
const fields = (obj, keys) => keys.every(key => text(obj?.[key]) || Number.isFinite(obj?.[key]));
const relevant = e => ['page', 'anchor', 'section', 'control', 'overlay', 'template'].includes(e.kind);

export function draftSourceSurvey(topology, topologyPath = 'ref/scout/topology.json') {
  const entries = topology.entries.filter(relevant);
  const sections = entries.filter(e => e.kind === 'section');
  if (!sections.length && entries.length) sections.push(entries.find(e => e.kind === 'page') ?? entries[0]);
  return {
    version: 1, topology: topologyPath,
    coverage: entries.map(e => ({ entries: [e.id], disposition: 'pending',
      section: sections.includes(e) ? e.id : '', reason: '' })),
    sections: sections.map(e => ({ id: e.id, spec: '', states: [], samples: [], layout:{state:'', file:''} })),
    categories: behaviorCategories.map(id => ({ id, scope: '*', status: '未检查', basis: '', observation: '' })),
    behaviors: []
  };
}

function uniqueRows(rows, label) {
  demand(Array.isArray(rows), '缺 ' + label + ' 清单');
  const index = new Map();
  for (const row of rows) {
    demand(text(row?.id) && !index.has(row.id), label + ' ID 为空或重复：' + row?.id);
    index.set(row.id, row);
  }
  return index;
}

async function checkTopology(survey, reference, evidence) {
  const topology = JSON.parse(await evidence(survey.topology, true));
  const expected = new URL(reference);
  expected.hash = '';
  demand(topology.kind === 'reference-discovery' && topology.schemaVersion === 1 &&
    new URL(topology.sourceUrl).href === expected.href &&
    list(topology.states) && list(topology.entries), '缺同一主参考的真实侦察；运行 start-reference.mjs');
  const discovered = new Map(), visited = new Set(), visibleAnchors = new Set(), visibleSections = new Set();
  for (const state of topology.states) {
    const dir = posix.join(posix.dirname(survey.topology), state.path);
    const records = JSON.parse(await evidence(posix.join(dir, 'discovery.json'), true));
    const manifest = JSON.parse(await evidence(posix.join(dir, 'manifest.json'), true));
    demand(new URL(manifest.url).origin === new URL(reference).origin, state.path + ' 不是同源现场记录');
    const opened = new URL(manifest.url);
    opened.hash = '';
    if (!manifest.errors?.some(e => e.phase === 'action-or-ready')) visited.add(opened.href);
    for (const entry of records.entries ?? []) {
      const signature = JSON.stringify([entry.kind,entry.url,entry.sourceUrl]);
      discovered.set(entry.id,signature);
      if (entry.kind === 'anchor' && entry.targetInView) visibleAnchors.add(entry.url);
      if (entry.kind === 'section' && entry.inViewport) visibleSections.add(entry.id);
      if (entry.kind === 'section' && entry.domId && entry.inViewport) {
        const target = new URL(entry.sourceUrl);
        target.hash = entry.domId;
        visibleAnchors.add(target.href);
      }
    }
  }
  const entries = uniqueRows(topology.entries.filter(relevant), '侦察发现');
  // Template groups may be an aggregate over several actual browser observations.
  for (const entry of entries.values()) {
    demand(discovered.get(entry.id) === JSON.stringify([entry.kind,entry.url,entry.sourceUrl]) || (entry.kind === 'template' && list(entry.members) &&
      entry.members.every(id => discovered.has(id))), entry.id + ' 缺现场 discovery.json 对应条目');
  }
  const listed = new Set(topology.entries.map(e => e.id));
  for (const id of discovered.keys()) demand(listed.has(id),
    'topology 遗漏现场记录 ' + id);
  return {entries,visited,visibleAnchors,visibleSections};
}

async function verifyCoverage(survey, {entries,visited,visibleAnchors,visibleSections}, sections, paired, gaps, evidence) {
  demand(list(survey.coverage), '缺发现路径与范围裁定');
  const covered = new Set(), included = new Set(), sourceSections = new Set();
  for (const row of survey.coverage) {
    demand(list(row.entries) && ['included','template','out-of-scope','blocked'].includes(row.disposition),
      '仍有未处理的发现项 ' + row.entries);
    if (row.disposition !== 'included') demand(text(row.reason), row.entries + ' 须说明归类、范围或阻塞依据');
    if (row.disposition === 'blocked') gaps.push(row.entries.join(',') + '：' + row.reason);
    if (['included','template'].includes(row.disposition)) {
      demand(sections.has(row.section), row.entries + ' 须链接实际区块');
      if (row.disposition === 'included') included.add(row.section);
    }
    for (const id of row.entries) {
      demand(entries.has(id) && !covered.has(id), '发现项重复或不存在 ' + id);
      covered.add(id);
      if (row.disposition === 'included' && ['page','anchor'].includes(entries.get(id).kind)) {
        const destination = new URL(entries.get(id).url);
        destination.hash = '';
        demand(visited.has(destination.href), id + ' 的目标页面尚未实看；补侦察、按模板归类或说明范围/受阻');
      }
      const entry = entries.get(id);
      const unseen = (entry.kind === 'anchor' && !visibleAnchors.has(entry.url)) ||
        (entry.kind === 'section' && !visibleSections.has(id));
      if (row.disposition === 'included' && unseen) {
        demand(text(row.witness?.file), id + ' 的章节目标尚未出现在视口，补实际进入的 scout 状态或激活章节 witness');
        demand(row.witness.file !== survey.topology && !/(^|\/)discovery\.json$/.test(row.witness.file),
          id + ' 发现了链接不能证明已进入对应章节');
        const value = jsonValue(JSON.parse(await evidence(row.witness.file,true)),row.witness.pointer);
        const hash = new URL(entry.url).hash;
        const targets = entry.kind === 'anchor' ? [entry.id,entry.url,hash,decodeURIComponent(hash.slice(1))] :
          [entry.id,entry.domId,entry.selector];
        demand(text(value) && targets.includes(value), id + ' 的现场激活章节与目标不一致');
      }
      if (entries.get(id).kind === 'section' && row.disposition === 'included') {
        demand(!sourceSections.has(row.section), row.section + ' 合并了多个不同原站区块；重复模板须单列归类依据');
        sourceSections.add(row.section);
      }
    }
  }
  for (const id of entries.keys()) demand(covered.has(id), '遗漏原站路径/章节 ' + id);
  for (const id of sections.keys()) demand(included.has(id), id + ' 缺已实看的代表项；模板归类不能替代代表页/区块');
  demand(included.size, '没有实际纳入范围的区块');
  if (paired) demand(!gaps.length, '仍有受阻发现项：' + gaps.join('、'));
}

function checkSections(sections, inventory, paired) {
  const states = uniqueRows(inventory.states, '状态'), samples = uniqueRows(inventory.samples, '样本');
  const used = new Set();
  for (const s of sections.values()) {
    demand(text(s.spec) && list(s.states) && s.states.every(id => states.has(id)), s.id + ' 缺原站静态规格或有效截图状态');
    demand(list(s.samples) && s.samples.every(id => samples.has(id) && s.states.includes(samples.get(id).state)),
      s.id + ' 缺本区块对应的样式或素材样本');
    demand(s.samples.some(id => samples.get(id).kind === 'asset') || text(s.assetsAbsent),
      s.id + ' 须关联原站素材或说明无独立素材');
    s.states.forEach(id => used.add(id));
    if (paired) demand(resolved(s.built) && fields(s.built, ['locator','difference','action']),
      s.id + ' 须写成品定位、静态与动态差异、修复或保留依据');
  }
  for (const id of states.keys()) demand(used.has(id), '原站状态未归入区块 ' + id);
}

function jsonValue(json, pointer) {
  demand(text(pointer) && pointer.startsWith('/'), '读数须用 / 开头的 JSON pointer 定位');
  let value = json;
  for (const token of pointer.slice(1).split('/')) {
    const key = token.replaceAll('~1','/').replaceAll('~0','~');
    demand(value != null && Object.hasOwn(value, key), '找不到证据读数 ' + pointer);
    value = value[key];
  }
  demand(value !== null && (Array.isArray(value) ? value.length : typeof value !== 'object'), '须定位实际标量或非空采样数组 ' + pointer);
  demand(!/\/(result|status|verdict|observation)$/.test(pointer), '结果标签不能替代实际读数 ' + pointer);
  const scalar = v => ['string','boolean','number'].includes(typeof v);
  demand(scalar(value) || (Array.isArray(value) && value.flat(Infinity).every(scalar)),
    '请定位原始属性值而非报告对象 ' + pointer);
  return value;
}

function matches(a, b, tolerance) {
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v,i) => matches(v,b[i],tolerance));
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a-b) <= tolerance;
  if (tolerance && typeof a === 'string' && typeof b === 'string') {
    const numberWithUnit = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i;
    const left = numberWithUnit.exec(a), right = numberWithUnit.exec(b);
    if (left && right && left[2] === right[2]) return Math.abs(Number(left[1])-Number(right[1])) <= tolerance;
  }
  return isDeepStrictEqual(a,b);
}

const preview = value => Array.isArray(value) && value.length > 16 ?
  {count:value.length,first:value.slice(0,4),last:value.slice(-4)} : value;

async function compareAssertions(behavior, compare, evidence, jsonRecord, reserved, outputs) {
  demand(list(behavior.assertions), behavior.id + ' 缺可追溯的行为断言');
  const roles = new Map();
  let sampled = false;
  for (const item of behavior.assertions) {
    const label = behavior.id + '/' + item.property;
    demand(text(item.property) && ['direct','measured','fitted','unknown'].includes(item.grade), label + ' 缺断言来源等级');
    if (['fitted','unknown'].includes(item.grade)) demand(text(item.note), label + ' 须说明拟合所依测点或尚未确认的事实');
    if (item.grade === 'unknown') {
      demand(!item.critical && !item.role,label + ' 关键输出尚未确认');
      continue;
    }
    const tolerance = item.tolerance ?? 0;
    demand(Number.isFinite(tolerance) && tolerance >= 0, label + ' 容差无效');
    async function reading(ref, original) {
      demand(text(ref?.file) && !reserved.has(ref.file), label + ' 须定位实际观测文件');
      if (item.grade === 'direct' && text(ref.excerpt)) {
        demand((await evidence(ref.file,original)).toString().includes(ref.excerpt),label + ' 文件中找不到所引源码');
        return {value:ref.excerpt};
      }
      const record = await jsonRecord(ref.file,original);
      let stepIndex;
      if (record.side) demand(record.side === (original ? 'reference' : 'implementation'), label + ' 运行记录侧别不符');
      if (record.side && Array.isArray(record.experiments)) {
        const frame = /^\/experiments\/(\d+)\/steps\/(\d+)\/frames\/(\d+)\//.exec(ref.pointer);
        const summary = /^\/(direct|measured|fitted)\/(\d+)\//.exec(ref.pointer);
        let exp;
        if (frame && item.grade === 'measured') {
          exp = record.experiments[frame[1]];
          stepIndex = Number(frame[2]);
        } else if (summary && summary[1] === item.grade) {
          const row = record[summary[1]]?.[summary[2]];
          exp = record.experiments.find(e => e.id === row?.experimentId);
          stepIndex = row?.step;
        }
        demand(exp?.id === behavior.id && exp.category === behavior.category &&
          exp.steps[stepIndex]?.status === 'ok' && /^[a-f\d]{64}$/.test(record.planSha256),
          label + ' 须按真实来源等级定位该行为的成功回放或派生读数');
      }
      return {value:jsonValue(record,ref.pointer), plan:record.planSha256, stepIndex};
    }
    const src = await reading(item.source,true);
    if (tolerance > 0) demand(text(item.note),label + ' 非零容差须说明原站采样误差依据');
    if (item.grade !== 'direct') sampled = true;
    const readingPair = {ref:item.source, value:src.value, grade:item.grade};
    if (item.role) {
      const values = roles.get(item.role) ?? [];
      values.push(readingPair);
      roles.set(item.role,values);
    }
    if (!compare) continue;
    demand(text(item.built?.file) && posix.normalize(item.built.file.replaceAll('\\','/')) !== posix.normalize(item.source.file.replaceAll('\\','/')), label + ' 两侧须独立实测');
    const built = await reading(item.built,false);
    readingPair.built = item.built;
    demand(src.plan === built.plan && src.stepIndex === built.stepIndex, label + ' 两侧回放输入计划不一致');
    const pair = {behavior:behavior.id,property:item.property,grade:item.grade,
      original:preview(src.value),built:preview(built.value),tolerance};
    demand(matches(src.value,built.value,tolerance), label + ' 成品实测值与原站锁定值不同：' +
      JSON.stringify(pair).slice(0,450) + '；修复后复测');
    outputs.push(pair);
  }
  demand(sampled, behavior.id + ' 缺 measured/fitted 的实际输出');
  if (behavior.mechanism === 'model-3d') {
    const geometry = roles.get('geometry') ?? [];
    demand(geometry.some(r => r.grade !== 'direct' && numeric(r.value) &&
      /geometry|mesh|triangles|vertices|vertex|positionAttribute|skeleton|bone|camera|quaternion|matrixWorld|drawElements/i.test(r.ref.pointer)), behavior.id + ' 缺模型几何、骨骼或相机的数值观测');
  }
  if (behavior.mechanism === 'scene-composite') {
    const layers = ['outgoing','incoming'].map(role => (roles.get(role) ?? []).filter(r => r.grade !== 'direct'));
    for (const layer of layers) demand(layer.some(r => numeric(r.value)) &&
      new Set(layer.flatMap(r => [r.value].flat())).size > 1, behavior.id + ' 两幕均须有过渡中的变化读数');
    for (const side of compare ? ['ref','built'] : ['ref']) {
      const key = r => r[side].file + ':' + r[side].pointer.replace(/\/frames\/\d+\//g,'/frames/*/');
      const keys = new Set(layers[0].map(key));
      demand(layers[1].every(r => !keys.has(key(r))), behavior.id + ' 两幕引用了同一图层读数');
    }
  }
}
const numeric = v => Array.isArray(v) ? list(v) && v.every(numeric) :
  Number.isFinite(v) || (text(v) && Number.isFinite(Number(v)));

export async function inspectSourceSurvey({ survey, inventory, contract, stage, prototype, evidence }) {
  demand(survey.version === 1 && text(survey.topology), 'source-survey 版本或 topology 缺失');
  const paired = stage === 'paired', gaps = [], outputs = [], layouts = [];
  // Many assertions point into the same pair of large replay files.
  const recent = new Map();
  async function jsonRecord(file, original) {
    const key = (original ? 'source:' : 'built:') + file;
    if (!recent.has(key)) {
      if (recent.size === 4) recent.delete(recent.keys().next().value);
      recent.set(key,JSON.parse(await evidence(file,original)));
    }
    return recent.get(key);
  }
  const sections = uniqueRows(survey.sections,'区块'), behaviors = uniqueRows(survey.behaviors,'行为');
  const entries = await checkTopology(survey,contract.source,evidence);
  await verifyCoverage(survey,entries,sections,paired,gaps,evidence);
  checkSections(sections,inventory,paired);
  for (const section of sections.values()) {
    const pair = await inspectSectionLayout(section,contract,paired,jsonRecord);
    if (pair) layouts.push(pair);
  }
  const audited = new Map(), measured = new Set();
  const reserved = new Set(['ref/source-survey.json','ref/a-reference.json',contract.inventory,survey.topology]);
  for (const c of survey.categories ?? []) {
    demand(behaviorCategories.includes(c.id) && text(c.observation) && text(c.basis), c.id + ' 缺六类审计的范围、观察或依据');
    demand(!reserved.has(c.basis), c.id + ' 请引用现场输入证据，清单不能自证');
    if (/\.json$/i.test(c.basis)) {
      const record = await jsonRecord(c.basis,true);
      if (c.status !== '受阻') {
        demand(!Array.isArray(record.entries) || !record.sourceUrl, c.id + ' 侦察目录不能证明输入后有无效果；请引用实际回放或人工观察记录');
        if (record.side && Array.isArray(record.experiments))
          demand(record.side === 'reference' && record.experiments.some(e => e.category === c.id && e.status === 'ok'),
            c.id + ' 缺该类别成功的原站回放');
      }
    } else await evidence(c.basis,true);
    const scope = c.scope === '*' ? [...sections.keys()] : c.scope;
    demand(list(scope) && scope.every(s => sections.has(s)), c.id + ' 的适用区块有误');
    demand(['已确认无此效果','已测量','受阻'].includes(sourceStatus(c.status)), c.id + ' 仍未检查');
    const related = [...behaviors.values()].filter(b => b.category === c.id && scope.includes(b.section));
    if (observed.includes(c.status)) {
      demand(related.length, c.id + ' 已测量却没有行为 ID');
      if (paired) demand(c.status === '已验证', c.id + ' 尚未标为已验证');
      related.forEach(b => measured.add(b.id));
    } else if (c.status === '已确认无此效果') {
      demand(!related.length, c.id + ' 声称没有已登记行为');
    } else {
      gaps.push(c.id + '：' + c.observation);
      if (paired) demand(false, c.id + ' 仍受阻');
    }
    for (const s of scope) {
      const key = c.id + '/' + s;
      demand(!audited.has(key), key + ' 范围重复');
      audited.set(key,c.status);
    }
  }
  for (const id of sections.keys()) for (const category of behaviorCategories)
    demand(audited.has(category + '/' + id), id + ' 缺六类行为审计 ' + category);

  const sequences = new Set(inventory.sequences.map(s => s.id));
  const sequenceOf = b => b.sequence ?? (sequences.has(b.id) ? b.id : null);
  for (const id of sequences) demand([...behaviors.values()].some(b => sequenceOf(b) === id &&
    observed.includes(b.status)), '原站转场未进入六类行为实测 ' + id);
  const earlySequences = new Set(prototype?.original.probes.map(p => p.sequence).filter(Boolean));
  const earlyBehaviors = [];
  const prototypeStates = new Set(prototype?.original?.probes.flatMap(p => p.frames.map(f => f.state)) ?? []);
  for (const b of behaviors.values()) {
    demand(sections.has(b.section) && behaviorCategories.includes(b.category), b.id + ' 缺所属区块或类别');
    if (b.status === '受阻') {
      demand(audited.get(b.category+'/'+b.section) === '受阻' && text(b.reason), b.id + ' 缺受阻范围或原因');
      continue;
    }
    demand(measured.has(b.id) && observed.includes(b.status), b.id + ' 未归入相应的已测量范围');
    demand(fields(b,['target','trigger','precondition']) && fields(b.states,['initial','transition','end']) &&
      fields(b.timing,['duration','delay','easing']) && fields(b.response,['exit','reverse','repeat','responsive']),
      b.id + ' 缺目标、触发/前置、初中终态、时序或退出/反向/重复/响应式观察');
    const sequence = sequenceOf(b);
    if (sequence) {
      const transition = inventory.sequences.find(s => s.id === sequence);
      demand(transition && transition.states.some(s => sections.get(b.section).states.includes(s)),
        b.id + ' 的序列不在所属区块');
    }
    if (b.prototype) demand(sections.get(b.section).states.some(id => prototypeStates.has(id)),
      b.id + ' 标记的样段行为不在早期样段区块');
    const early = b.prototype === true || earlySequences.has(sequence);
    if (early) earlyBehaviors.push(b.id);
    const focus = stage === 'prototype' && early;
    if (paired || focus) demand(b.status === '已验证' && resolved(b.built) && fields(b.built,['difference','action']), b.id + ' 须完成双边验证并记录差异处理');
    await compareAssertions(b, paired || focus, evidence,jsonRecord,reserved,outputs);
  }
  for (const probe of prototype?.original.probes ?? []) {
    if (probe.mapping === 'static') continue;
    if (!/\.(glb|gltf)(?:$|[?#])/i.test(probe.resource) && !/\.(glb|gltf)(?:$|[?#])/i.test(probe.locator)) continue;
    const stateIds = probe.frames.map(f => f.state);
    demand([...behaviors.values()].some(b => b.mechanism === 'model-3d' && observed.includes(b.status) &&
      earlyBehaviors.includes(b.id) && sections.get(b.section).states.some(id => stateIds.includes(id))),
      probe.id + ' 已定位 3D 模型；须用样段运行时几何、相机或骨骼输出核对');
  }
  const source = {
    ...survey,
    sections:survey.sections.map(({built,...s}) => s),
    categories:survey.categories.map(c => ({...c,status:sourceStatus(c.status)})),
    behaviors:survey.behaviors.map(({built, assertions, ...b}) => ({...b,status:sourceStatus(b.status),
      assertions:assertions?.map(({built,...a}) => a)}))
  };
  return {source,gaps,earlyBehaviors,outputs,layouts};
}
