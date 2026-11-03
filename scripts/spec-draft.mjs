// 用法：node spec-draft.mjs <url> <tokens.json...> [--motion motion.json] > ref/reference-spec.draft.json
// 把 extract-tokens / extract-motion 的高频值整理成锁定规格草稿。草稿里每个值都标“实测草稿”，必须人工过一遍
// （删掉第三方组件、广告、Cookie 弹窗带进来的值），确认后另存为 reference-spec.json。
import { readFileSync } from 'node:fs';
import { parseColor, splitTop, toMs, normEase } from './lib/values.mjs';

const args = process.argv.slice(2); const url = args[0];
const mi = args.indexOf('--motion'); const motion = mi > -1 ? JSON.parse(readFileSync(args[mi + 1], 'utf8')) : null;
const tokFiles = args.slice(1).filter((a, i, arr) => a !== '--motion' && arr[i] !== args[mi + 1]);
if (!url || !tokFiles.length) { console.error('用法：node spec-draft.mjs <url> <tokens.json...> [--motion motion.json]'); process.exit(1); }
const T = tokFiles.map(f => JSON.parse(readFileSync(f, 'utf8')));
const top = (k, min = 2, max = 20) => { const m = new Map(); for (const t of T) for (const { value, n } of t.tokens[k] || []) m.set(value, (m.get(value) || 0) + n); return [...m].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v); };
const pxSort = a => [...new Set(a)].sort((x, y) => parseFloat(x) - parseFloat(y));

const colors = {}; const seen = [];
const addC = (role, v) => { const c = parseColor(v); if (!c || c[3] === 0) return; if (seen.some(s => s.every((x, i) => Math.abs(x - c[i]) <= (i === 3 ? 0.01 : 1)))) return; seen.push(c); colors[`${role}-${Object.keys(colors).filter(k => k.startsWith(role)).length + 1}`] = v.replace(/\s+/g, ''); };
top('textColor', 20, 8).forEach(v => addC('text', v)); top('backgroundColor', 3, 8).forEach(v => addC('bg', v)); top('borderColor', 3, 6).forEach(v => addC('line', v));

const fams = top('fontFamily', 50, 3);
const type = {}; top('typePair', 30, 14).forEach((p, i) => { const [sl, weight, tracking] = p.split(' '); const [size, line] = sl.split('/'); type[`t${i + 1}`] = { size, line, weight, ...(tracking !== 'normal' ? { tracking } : {}) }; });
const spacing = pxSort([...top('padding', 4), ...top('gap', 4), ...top('margin', 6)].filter(v => /^\d+(\.\d+)?px$/.test(v) && parseFloat(v) <= 400));
const radius = pxSort(top('borderRadius', 3).flatMap(v => v.split(' ')).filter(v => /px$|%$/.test(v)));
const bal = v => (v.match(/\(/g) || []).length === (v.match(/\)/g) || []).length;
const shadows = top('boxShadow', 2, 8).filter(bal);
const dur = new Set(), ease = new Set();
const trans = motion ? Object.keys(motion.transitions || {}) : top('transition', 2).map(t => t.replace(/^(\S+) (\S+) (.*)$/, '$1 | $2 | $3'));
for (const k of trans) { const [, d, e] = k.split(' | '); splitTop(d || '').forEach(x => { const ms = toMs(x); if (ms) dur.add(`${ms}ms`); }); splitTop(e || '').forEach(x => x && ease.add(normEase(x))); }

const spec = {
  source: url, measured_at: new Date().toISOString().slice(0, 10), viewports: T.map(t => t.viewport), _状态: '实测草稿：人工确认后另存为 reference-spec.json',
  colors, fonts: Object.fromEntries(fams.map((f, i) => [i === 0 ? 'sans' : `font-${i + 1}`, f])), type_scale: type,
  spacing, radius, shadows, layout: { max_width: top('maxWidth', 2, 3) },
  motion: {
    libs: motion ? Object.fromEntries(Object.entries(motion.libs).filter(([, v]) => v)) : {}, smooth_scroll: motion?.smoothScroll || null, lenis_options: motion?.runtime?.lenisOptions || null,
    durations: [...dur].sort((a, b) => parseFloat(a) - parseFloat(b)), easings: [...ease],
    hover: (motion?.interactions || []).filter(x => !x.noFeedback).slice(0, 12).map(x => ({ target: `${x.kind}「${x.text}」`, hover: x.hover, children: x.hoverChildren, press: x.press, transition: x.transition })),
    scroll: [], page_transition: motion?.libs?.viewTransitions ? 'View Transitions（需人工确认用在哪里）' : '',
    rendering: motion?.rendering?.contexts?.length ? motion.rendering : null,
  },
  exceptions: [],
};
console.log(JSON.stringify(spec, null, 2));
