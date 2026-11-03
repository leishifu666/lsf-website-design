// Mode A uses the same inventory for research, implementation and independent review.
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { inspectSourceSurvey } from './source-survey.mjs';
import { inspectPrototype, checkFrameImages } from './a-prototype.mjs';

const widths = [375, 768, 1440];
const kinds = ['palette', 'control', 'surface', 'asset'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const imageFile = path => /\.(png|jpe?g|webp)$/i.test(path);
const fields = {
  palette: ['foreground', 'background', 'accent'],
  control: ['color', 'background', 'border', 'radius', 'padding', 'type', 'feedback'],
  surface: ['layers', 'boundary'],
  asset: ['resource', 'binding', 'shape', 'motion']
};

export async function inspectAReference(site, { reference, stage = 'paired', requirePrototype = false, requireSurvey = false } = {}) {
  const problems = [], files = {}, sourceFiles = {}, prototypeFiles = {}, images = [], drifts = [];
  const imageHashes = new Map();
  const manifest = 'ref/a-reference.json';
  const result = { problems, files, images, drifts, sourceHash: null, prototypeHash: null, contract: null, passed: false };
  const root = await realpath(site);
  async function evidence(path, source = false, focus = false) {
    if (!text(path) || isAbsolute(path)) throw Error('证据须是站点内的相对路径');
    const actual = await realpath(resolve(root, path));
    const key = relative(root, actual).replaceAll('\\', '/');
    if (key === '..' || key.startsWith('../') || isAbsolute(key)) throw Error('证据超出网站目录：' + path);
    const data = await readFile(actual);
    if (!data.length) throw Error('证据文件为空：' + path);
    files[key] = hash(data);
    if (source) sourceFiles[key] = files[key];
    if (focus) prototypeFiles[key] = files[key];
    if (imageFile(key)) imageHashes.set(path, files[key]);
    if (imageFile(key) && !images.includes(actual)) images.push(actual);
    return data;
  }
  try {
    if (!['source', 'prototype', 'paired'].includes(stage)) throw Error('stage 只能是 source、prototype 或 paired');
    const paired = stage === 'paired';
    if (requireSurvey) {
      try { result.survey = JSON.parse(await evidence('ref/source-survey.json')); }
      catch (error) { throw Error('先运行 start-reference.mjs 完成现场侦察，补齐 ref/source-survey.json：' + error.message); }
    }
    let contract;
    try { contract = JSON.parse(await evidence(manifest)); }
    catch (error) {
      if (!requireSurvey || error.code !== 'ENOENT') throw error;
      const pending = result.survey?.categories?.filter(row => row.status === '未检查').map(row => row.id) ?? [];
      throw Error('原站合同尚未建立。先按 ref/source-survey.json 实测各区块' +
        (pending.length ? '，尚未检查：' + pending.join('、') : '') +
        '；将实测状态、样本与重点样段关联至 ref/a-reference.json，再运行 source');
    }
    result.contract = contract;
    if (contract.version !== 1 || !/^https?:$/.test(new URL(contract.source).protocol) ||
        (reference && new URL(contract.source).href !== new URL(reference).href)) throw Error('主参考网址或证据版本不符');
    // Discovery is captured on the original, including states that could not be opened.
    const inventory = JSON.parse(await evidence(contract.inventory, true));
    if (!Array.isArray(inventory.states) || !inventory.states.length || !Array.isArray(inventory.samples)) throw Error('缺原站状态/样式/资产发现清单');
    await evidence(inventory.discovery, true);
    const prototype = requirePrototype || requireSurvey || stage === 'prototype'
      ? await inspectPrototype({ stage, contract, inventory, evidence, requireSurvey }) : null;
    if (prototype) {
      result.prototypeScope = { states: [...prototype.states], samples: [...prototype.samples] };
      result.prototypeEvidence = { original: prototype.original, built: prototype.built };
    }
    const prototypeRows = [];
    const sourceRows = [], expected = new Set(), coveredWidths = new Set(), itemIds = new Set();
    const shotWidths = new Map();
    const rows = new Map();
    for (const row of contract.states ?? []) {
      const key = row.id + '@' + row.width;
      if (rows.has(key)) throw Error('重复状态 ' + key);
      rows.set(key, row);
    }
    for (const state of inventory.states) {
      if (!text(state.id) || itemIds.has(state.id) || !text(state.trigger) || !Array.isArray(state.widths) || !state.widths.length) throw Error('原站状态须有唯一 ID、触发条件和实测宽度');
      itemIds.add(state.id);
      for (const width of state.widths) {
        const key = state.id + '@' + width;
        if (!widths.includes(width) || expected.has(key)) throw Error('状态宽度无效或重复 ' + key);
        expected.add(key);
        coveredWidths.add(width);
        const row = rows.get(key);
        if (!row) { problems.push('未覆盖原站状态 ' + key); continue; }
        const focus = prototype?.states.has(key);
        for (const side of paired || (stage === 'prototype' && focus) ? ['original', 'built'] : ['original']) {
          const shot = row[side];
          if (shot?.status !== 'observed' || !imageFile(shot?.image || '') || !text(shot.observation)) {
            problems.push(key + ' ' + side + ' 缺现场观察或截图'); continue;
          }
          if (shot.viewport?.width !== width || !Number.isInteger(shot.viewport?.height) || shot.viewport.height < 1)
            problems.push(key + ' ' + side + ' 缺实际 CSS 视口');
          if (side === 'built' && shot.viewport?.height !== row.original?.viewport?.height)
            problems.push(key + ' 两侧视口高度不一致');
          if (shotWidths.has(shot.image) && shotWidths.get(shot.image) !== width)
            problems.push(key + ' 不同视口重复使用同一张截图');
          shotWidths.set(shot.image, width);
          await evidence(shot.image, side === 'original', focus && side === 'built');
          if (side === 'built' && shot.image === row.original?.image) problems.push(key + ' 原站与成品须分别取证');
        }
        sourceRows.push([key, row.original]);
        if (focus) prototypeRows.push([key, row.built]);
      }
    }
    if (!Array.isArray(inventory.sequences)) throw Error('原站缺标志性转场清单');
    if (!inventory.sequences.length && !text(inventory.static_reason)) problems.push('无标志性动态过程须有现场观察依据');
    for (const sequence of inventory.sequences) {
      const steps = sequence.states;
      const discrete = prototype && sequence.mapping === 'discrete';
      if (!text(sequence.id) || !text(sequence.input) || !Array.isArray(steps) || new Set(steps).size < (discrete ? 2 : 3) ||
          !steps.every(id => itemIds.has(id))) {
        problems.push('标志性交互须关联已发现的' + (discrete ? '开关前后状态' : '起点、中段、终点') + '：' + sequence.id);
        continue;
      }
      if (!widths.some(width => steps.every(id => expected.has(id + '@' + width))))
        problems.push('转场缺可连续对照的同宽状态：' + sequence.id);
    }
    for (const width of widths) if (!coveredWidths.has(width)) problems.push('原站缺视口 ' + width);
    for (const key of rows.keys()) if (!expected.has(key)) problems.push('状态不在原站清单 ' + key);

    const sampled = new Set(), sampleKeys = new Set();
    const samples = new Map((contract.samples ?? []).map(s => [s.id, s]));
    if (samples.size !== (contract.samples ?? []).length) throw Error('重复样本 ID');
    for (const item of inventory.samples) {
      const { id, kind, state } = item;
      if (!text(id) || sampleKeys.has(id) || !kinds.includes(kind) || !itemIds.has(state)) throw Error('原站样本须有唯一 ID、有效类别与状态');
      sampled.add(kind); sampleKeys.add(id);
      const sample = samples.get(id);
      if (!sample) { problems.push('缺 ' + kind + ' 样本 ' + id); continue; }
      const focus = prototype?.samples.has(id);
      const compare = paired || (stage === 'prototype' && focus);
      for (const side of compare ? ['original', 'built'] : ['original']) {
        const measurement = sample[side];
        if (!fields[kind].every(field => text(measurement?.values?.[field]))) {
          problems.push(id + ' ' + side + ' 缺 ' + fields[kind].join('/')); continue;
        }
        await evidence(measurement.evidence, side === 'original', focus && side === 'built');
        if (side === 'built' && kind === 'asset') await evidence(measurement.values.resource, false, focus);
      }
      if (kind === 'asset' && (!['reuse', 'reskin', 'rebuild'].includes(sample.strategy) || !text(sample.keep) || !text(sample.change) || !text(sample.rights))) problems.push(id + ' 缺资产保留关系、主题替换或使用依据');
      sourceRows.push([id, sample.original, sample.strategy, sample.keep, sample.change, sample.rights]);
      if (focus) prototypeRows.push([id, sample.built, sample.verdict, sample.reason, sample.user_exception]);
      if (compare) {
        if (!['match', 'adapted', 'drift'].includes(sample.verdict)) problems.push(id + ' 缺成品对照结论');
        if (sample.verdict !== 'match' && !text(sample.reason)) problems.push(id + ' 缺差异依据');
        if (sample.verdict === 'drift') drifts.push(id);
        const invariants = kind === 'asset' ? ['binding','motion'] : fields[kind];
        const changed = invariants.some(f => sample.original?.values?.[f] !== sample.built?.values?.[f]);
        if (sample.verdict === 'match' && changed) problems.push(id + ' 实测值不同，须记录适配依据或偏离');
        if (kind === 'asset' && changed && sample.verdict === 'adapted' && !text(sample.user_exception))
          problems.push(id + ' 核心绑定或驱动不一致；须恢复原机制或引用用户明确改变目标的要求');
      }
    }
    for (const id of samples.keys()) if (!sampleKeys.has(id)) problems.push('样本不在原站清单 ' + id);
    for (const kind of kinds) if (!sampled.has(kind) && (!['control', 'asset'].includes(kind) || !text(inventory.absent?.[kind]))) problems.push('缺原站 ' + kind + ' 取证');
    if (requireSurvey) {
      const survey = await inspectSourceSurvey({survey:result.survey, inventory, contract, stage, prototype, evidence});
      sourceRows.push(survey.source);
      result.surveyGaps = survey.gaps;
      result.earlyBehaviors = survey.earlyBehaviors;
      result.surveyOutputs = survey.outputs;
      result.layoutPairs = survey.layouts;
      if (stage !== 'source') prototypeRows.push(result.survey.behaviors.filter(b => survey.earlyBehaviors.includes(b.id)));
    }
    result.sourceHash = hash(JSON.stringify([contract.source, sourceFiles, sourceRows]));
    if (prototype) {
      checkFrameImages(prototype, rows, imageHashes, problems);
      if (stage !== 'source') result.prototypeHash = hash(JSON.stringify([result.sourceHash, prototypeFiles, prototypeRows]));
    }
    result.passed = problems.length === 0;
  } catch (error) { problems.push(manifest + '：' + error.message); }
  return result;
}
