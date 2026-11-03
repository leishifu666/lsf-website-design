// Compare one playable slice against the source. Screens and samples live in the shared inventory.
import { createHash } from 'node:crypto';

const text = value => typeof value === 'string' && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fields = ['role', 'width', 'sequence', 'driver', 'mapping', 'target', 'layer', 'property'];
const fail = reason => { throw Error('重点样段：' + reason); };

function checkFrames(probe, inventory) {
  const { frames, id, width, sequence, mapping } = probe;
  if (!Array.isArray(frames) || !frames.length) fail(id + ' 缺运行帧');
  const stateIds = frames.map(f => f.state);
  if (frames.some(f => !inventory.states.some(s => s.id === f.state && s.widths.includes(width)) ||
      !Number.isFinite(f.at) || !text(f.value) || !text(f.result)))
    fail(id + ' 各帧须引用同宽原站状态、输入进度、实测值和可观察结果');
  if (mapping === 'static') {
    if (sequence != null || frames.length !== 1 || frames[0].at !== 0)
      fail(id + ' 静态项使用单帧 at=0，无转场 sequence');
    return;
  }
  const transition = inventory.sequences?.find(s => s.id === sequence);
  const steps = transition?.states;
  const discrete = transition?.mapping === 'discrete';
  if (transition?.mapping != null && transition.mapping !== mapping)
    fail(id + ' 的 mapping 与原站发现清单不同');
  if (!Array.isArray(steps) || new Set(stateIds).size < (discrete ? 2 : 3) ||
      stateIds[0] !== steps[0] || stateIds.at(-1) !== steps.at(-1) ||
      stateIds.some((s, i) => !steps.includes(s) || (i && steps.indexOf(s) <= steps.indexOf(stateIds[i - 1]))))
    fail(id + ' 须覆盖同一原站转场的实际首尾' + (discrete ? '' : '和中段'));
  if (frames[0].at !== 0 || frames.at(-1).at !== 1 ||
      frames.some((f, i) => i && f.at <= frames[i - 1].at))
    fail(id + ' 动态输入进度须从 0 递增到 1');
  const minValues = mapping === 'continuous' ? 3 : 2;
  if (new Set(frames.map(f => f.value.trim())).size < minValues)
    fail(id + ' 运行读数未呈现原驱动的状态变化');
}

function checkProbe(probe, inventory) {
  const { id, role, mapping, frames, samples } = probe;
  if (!text(id) || !['scene', 'heading'].includes(role) ||
      !['continuous', 'discrete', 'timed', 'static'].includes(mapping) ||
      !['locator', 'resource', 'implementation', 'driver', 'target', 'layer', 'property'].every(key => text(probe[key])))
    fail('缺角色、素材定位、实现、驱动、作用对象、图层或属性');
  checkRange(probe);
  checkFrames(probe, inventory);
  if (!Array.isArray(samples) || !samples.length || samples.some(id =>
    !inventory.samples.some(s => s.id === id && frames.some(f => f.state === s.state))))
    fail(id + ' 缺对应实测状态的样式/资产样本');
}

function checkRange({id, mapping, range}) {
  if (range == null) {
    if (mapping === 'continuous' || mapping === 'timed') fail(id + ' 缺输入行程或播放时长 range 实测');
    return;
  }
  if (mapping === 'continuous' && text(range.unbounded) && range.value == null && range.unit == null) return;
  if (!Number.isFinite(range.value) || range.value <= 0 || !text(range.unit) ||
      /^(%|progress|normalized|归一化进度)$/i.test(range.unit.trim()))
    fail(id + ' 的 range 须报告实际行程或时长的正数和单位');
  if (mapping === 'timed' && range.unit !== 'ms') fail(id + ' 的 timed mapping 须实测毫秒');
  const tolerance = range.tolerance ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance >= range.value)
    fail(id + ' 的 range.tolerance 须为非负数且小于原行程');
}

function compareProbe(source, built, requireSurvey) {
  for (const field of fields) if (source[field] !== built[field])
    fail(source.id + ' 的 ' + field + ' 与原站不一致');
  if (!same(source.samples, built.samples)) fail(source.id + ' 两侧样本不同');
  // The locked source measurement alone sets allowable sampling jitter.
  const baseline = source.range, measured = built.range;
  if (Boolean(baseline) !== Boolean(measured) || baseline?.unit !== measured?.unit)
    fail(source.id + ' 成品 range 与原站测量尺度不一致');
  if (baseline?.value != null && Math.abs(baseline.value - measured.value) > (baseline.tolerance ?? 0))
    fail(source.id + ' 成品 range 的行程或时长超出原站实测范围');
  // Stable result labels describe observable relations; value retains the raw DOM/renderer reading.
  const outcomes = probe => probe.frames.map(({state, at, result}) => [state, at, result]);
  if (requireSurvey) {
    // Compare the actual renderer/DOM outputs, in addition to semantic frame labels.
    const tolerance = source.outputTolerance ?? 0;
    if (!Number.isFinite(tolerance) || tolerance < 0) fail(source.id + ' 的原站输出容差无效');
    for (const [i, frame] of source.frames.entries()) {
      const value = built.frames[i]?.value;
      if (value === frame.value) continue;
      const from = /^(-?[\d.]+)([a-z%]*)$/i.exec(frame.value);
      const to = /^(-?[\d.]+)([a-z%]*)$/i.exec(value);
      if (!from || !to || from[2] !== to[2] || !(Math.abs(Number(from[1])-Number(to[1])) <= tolerance))
        fail(source.id + ' 的同态逐帧输出值与原站实测不同：' + frame.state);
    }
  }
  if (!same(outcomes(source), outcomes(built))) fail(source.id + ' 的同态输入进度或逐帧结果不同');
}

export async function inspectPrototype({ stage, contract, inventory, evidence, requireSurvey = false }) {
  const paths = contract.prototype;
  if (!text(paths?.original)) fail('缺 prototype.original 原站运行记录');
  const original = JSON.parse(await evidence(paths.original, true));
  if (!Array.isArray(original.probes) || !original.probes.some(p => p.role === 'scene'))
    fail('至少取主场景');
  if (!original.probes.some(p => p.role === 'heading') && !text(original.absent_heading))
    fail('缺标题探针；原站确无标题时记录 absent_heading 现场依据');
  if (inventory.sequences?.length && original.probes.every(p => p.mapping === 'static'))
    fail('已发现标志性转场，重点样段须包含实际动态');
  const receipts = new Set([contract.inventory, inventory.discovery, paths.original,
    ...(contract.states ?? []).map(row => row.original?.image),
    ...(contract.samples ?? []).map(sample => sample.original?.evidence)]);
  const sources = new Map(), states = new Set(), samples = new Set();
  for (const probe of original.probes) {
    checkProbe(probe, inventory);
    if (sources.has(probe.id)) fail('重复原站探针 ' + probe.id);
    if (!/^https?:\/\//i.test(probe.locator) || !new URL(probe.locator).hostname)
      fail(probe.id + ' 缺原站具体资源/节点的公开 URL 定位');
    if (receipts.has(probe.resource) || receipts.has(probe.implementation))
      fail(probe.id + ' 须提供实际素材与实现文件，状态截图/测量报告不能替代原件');
    await evidence(probe.resource, true);
    if (probe.resource !== probe.implementation) await evidence(probe.implementation, true);
    probe.frames.forEach(f => states.add(f.state + '@' + probe.width));
    probe.samples.forEach(id => samples.add(id));
    sources.set(probe.id, probe);
  }
  if (stage === 'source') return {original, built:null, states, samples};
  if (!text(paths.built) || paths.built === paths.original) fail('缺独立的 prototype.built 成品运行记录');
  const built = JSON.parse(await evidence(paths.built, false, true));
  if (!Array.isArray(built.probes) || !built.measured_files || typeof built.measured_files !== 'object' ||
      Array.isArray(built.measured_files)) fail('缺成品探针与 measured_files 运行版本');
  for (const [file, digest] of Object.entries(built.measured_files)) {
    if (/(^|[\\/])(ref|rounds|\.lsf)([\\/]|$)/i.test(file)) fail('measured_files 须指向实际运行文件：' + file);
    const bytes = await evidence(file, false, true);
    if (createHash('sha256').update(bytes).digest('hex') !== digest) fail(file + ' 已变化，须重新运行并采集成品证据');
  }
  for (const probe of built.probes) {
    const source = sources.get(probe.id);
    if (!source) fail('成品探针重复或未在原站取证：' + probe.id);
    checkProbe(probe, inventory);
    compareProbe(source, probe, requireSurvey);
    if (![probe.resource, probe.implementation].every(file => Object.hasOwn(built.measured_files, file)))
      fail(probe.id + ' 的素材和驱动/样式实现须绑定 measured_files 中的运行版本');
    const assets = probe.samples.filter(id => inventory.samples.some(s => s.id === id && s.kind === 'asset'));
    if (assets.length && !assets.some(id => contract.samples?.find(s => s.id === id)?.built?.values?.resource === probe.resource))
      fail(probe.id + ' 的运行素材与所选成品资产样本不一致');
    sources.delete(probe.id);
  }
  if (sources.size) fail('缺成品探针 ' + [...sources.keys()].join('、'));
  return {original, built, states, samples};
}

export function checkFrameImages(prototype, rows, hashes, problems) {
  const seenByProbe = new Map();
  for (const side of ['original','built']) for (const probe of prototype[side]?.probes ?? []) {
    const seen = seenByProbe.get(probe.id) ?? new Map();
    seenByProbe.set(probe.id, seen);
    for (const frame of probe.frames) {
      const shot = rows.get(frame.state + '@' + probe.width)?.[side]?.image;
      const digest = hashes.get(shot);
      if (!digest) continue; // The state inventory reports missing images.
      if (seen.has(digest) && seen.get(digest) !== frame.value.trim()) {
        problems.push(probe.id + ' ' + side + ' 运行读数不同却复用相同截图内容');
        break;
      }
      seen.set(digest, frame.value.trim());
    }
  }
}
