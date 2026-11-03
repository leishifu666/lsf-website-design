// 读取 reference-spec.json，统一成「名字 → 值」的形式，并给出每一类的允许值集合
import { readFileSync } from 'node:fs';
import { parseColor, toPx, toMs, normEase, normShadow } from './values.mjs';

const asMap = (v, prefix) => Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [`${prefix}-${i + 1}`, x])) : Object.fromEntries(Object.entries(v || {}).filter(([k]) => !k.startsWith('_')));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'x';

export function loadSpec(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const colors = asMap(raw.colors, 'color');
  for (const [k, v] of Object.entries(raw.color_roles || {})) if (!k.startsWith('_') && v && !Object.values(colors).includes(v)) colors[k] = v;
  const fonts = asMap(raw.fonts, 'font');
  // type_scale 兼容旧写法 {"1440": ["14px/1.5", ...]} 和新写法 {"body": {size, line, weight, tracking}}
  const type = {};
  for (const [k, v] of Object.entries(raw.type_scale || {})) {
    if (k.startsWith('_')) continue;
    if (Array.isArray(v)) v.forEach((s, i) => { const m = /^([\d.]+(?:px|rem))(?:\/([\d.]+(?:px|rem)?))?(?:\s+(-?[\d.]+(?:em|px)))?/.exec(s); if (m) type[`${slug(k)}-${i + 1}`] = { size: m[1], line: m[2], tracking: m[3] }; });
    else type[slug(k)] = v;
  }
  const spacing = asMap(raw.spacing, 'space'), radius = asMap(raw.radius, 'radius'), shadows = asMap(raw.shadows, 'shadow');
  const m = raw.motion || {};
  const durations = asMap(m.durations, 'dur'), easings = asMap(m.easings, 'ease');
  const exc = (raw.exceptions || []).filter(e => e.value && e.reason);
  const ex = c => exc.filter(e => !e.category || e.category === c).map(e => e.value);

  const allow = {
    colors: [...Object.values(colors), ...ex('colors')].map(parseColor).filter(Boolean),
    fontFamilies: Object.values(fonts).map(f => String(f).split(',')[0].trim().replace(/['"]/g, '').toLowerCase()),
    fontSize: new Set([...Object.values(type).map(t => toPx(t.size)), ...ex('fontSize').map(toPx)].filter(x => x != null)),
    lineHeight: new Set([...Object.values(type).flatMap(t => { if (!t.line) return []; const px = toPx(t.line); if (px != null) return [`${px}px`]; const r = parseFloat(t.line); const fs = toPx(t.size); return [String(r), fs != null ? `${+(r * fs).toFixed(2)}px` : null]; }), ...ex('lineHeight')].filter(Boolean)),
    letterSpacing: new Set([...Object.values(type).map(t => t.tracking).filter(Boolean).flatMap(t => { if (/^-?[\d.]+em$/.test(String(t).trim())) { const em = parseFloat(t); return Object.values(type).map(x => toPx(x.size)).filter(Boolean).map(fs => +(em * fs).toFixed(2)); } const px = toPx(t); return px == null ? [] : [px]; }), 0, ...ex('letterSpacing').map(toPx)].filter(x => x != null)),
    spacing: new Set([...Object.values(spacing), ...ex('spacing')].map(toPx).filter(x => x != null)),
    radius: new Set([...Object.values(radius), ...ex('radius')].map(v => (String(v).endsWith('%') ? v : toPx(v))).filter(x => x != null)),
    shadows: new Set([...Object.values(shadows), ...ex('shadows')].map(normShadow)),
    durations: new Set([...Object.values(durations), ...ex('durations')].map(toMs).filter(x => x != null)),
    easings: new Set([...Object.values(easings), ...ex('easings')].map(normEase)),
  };
  return { raw, colors, fonts, type, spacing, radius, shadows, durations, easings, allow, slug };
}
