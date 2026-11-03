import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const text = value => typeof value === 'string' && value.trim().length > 0;

// A source receipt proves authorship. Candidate decisions separately establish why a slot exists.
export function candidateCopyProblems(brief, approved, review) {
  const errors = [];
  if (!Array.isArray(brief?.blocks) || !Array.isArray(review?.slots)) return ['文案缺 brief.blocks 或独立逐槽必要性决定 review.slots'];
  const blocks = new Map(brief.blocks.map(b => [b.id, b]));
  const slots = new Map(review.slots.map(s => [s.id, s]));
  if (blocks.size !== brief.blocks.length || slots.size !== review.slots.length) errors.push('文案槽位 ID 重复');
  if (!blocks.size && !text(brief.empty_reason)) errors.push('空文案简报缺少任务依据');
  for (const [id, block] of blocks) {
    const slot = slots.get(id);
    if (!text(id) || !text(block.purpose) || !text(slot?.reason) || !['keep','drop'].includes(slot?.decision))
      errors.push('文案槽缺访客用途或审核决定：' + id);
    if (Object.hasOwn(approved, id) !== (slot?.decision === 'keep')) errors.push('槽位决定与定稿不一致：' + id);
    if (block.source === 'fixed' && (!text(block.origin) || !text(block.text) ||
        (slot?.decision === 'keep' && (approved[id]?.text ?? approved[id]) !== block.text)))
      errors.push('固定原文缺出处或定稿偏离原文：' + id);
  }
  for (const id of [...slots.keys(), ...Object.keys(approved).filter(id => !id.startsWith('_'))])
    if (!blocks.has(id)) errors.push('未在任务书登记的额外文案：' + id);
  return errors;
}

// Apply to the current rendered state. Historical removals stay in report.findings.
export async function pageCopyProblems(site, report) {
  const issues = [];
  const root = await realpath(site);
  try {
    if (!Array.isArray(report.coverage) || !report.coverage.length) throw Error('缺覆盖记录');
    for (const row of report.coverage) {
      if (!text(row.text_snapshot) || isAbsolute(row.text_snapshot)) throw Error('缺同屏可见文字及操作目的地快照');
      const actual = await realpath(resolve(root, row.text_snapshot));
      const local = relative(root, actual);
      if (isAbsolute(local) || local === '..' || local.startsWith('..\\') || local.startsWith('../')) throw Error('文案快照超出站点');
      const view = JSON.parse(await readFile(actual, 'utf8'));
      if (view.state !== row.state || view.viewport !== row.viewport || !text(row.state) || !Number.isInteger(row.viewport) ||
          !Array.isArray(view.items) || !Array.isArray(row.decisions)) throw Error('快照视口、状态或逐项决定不符');
      if (!view.items.length && !text(row.empty_reason)) throw Error('无可见文字的状态须给实际观察依据');
      const seen = new Set(), decisions = new Map(row.decisions.map(d => [d.id, d]));
      if (decisions.size !== row.decisions.length) throw Error('重复的文案审核 ID');
      const groups = new Map();
      for (const item of view.items) {
        if (!text(item.id) || seen.has(item.id) || !text(item.text) || !text(item.role)) throw Error('同屏文字须有唯一 ID、原文和角色');
        seen.add(item.id);
        if (['button','link','cta'].includes(item.role) && !text(item.destination)) issues.push(item.id + ' 缺真实操作结果');
        for (const group of [item.destination && 'action:' + item.destination, 'text:' + item.text.trim().replace(/\s+/g, '').toLowerCase(), item.meaning && 'meaning:' + item.meaning].filter(Boolean))
          groups.set(group, [...(groups.get(group) ?? []), item.id]);
        const decision = decisions.get(item.id);
        if (!decision || decision.action !== 'keep' || !text(decision.loss)) issues.push(item.id + ' 缺当前状态保留依据或仍应删改');
        const contextual = ['eyebrow','tagline','coordinates','clock','counter','decorative'].includes(item.role) ||
          /^\d{1,2}:\d{2}$/.test(item.text.trim()) || /\d+°.*[NSEW北南东西]/i.test(item.text);
        if (contextual && !text(decision?.basis)) issues.push(item.id + ' 须对应真实功能、信息或明确品牌要求，否则删除');
      }
      for (const id of decisions.keys()) if (!seen.has(id)) issues.push(id + ' 的审查与当前文字不符');
      for (const [group, ids] of groups) if (ids.length > 1 && ids.some(id => !text(decisions.get(id)?.distinct_use)))
        issues.push(group + ' 有同屏重复项，须合并或分别说明用途：' + ids.join('、'));
    }
  } catch (error) { issues.push(error.message); }
  return issues.map(p => '成品页面文案必要性：' + p);
}
