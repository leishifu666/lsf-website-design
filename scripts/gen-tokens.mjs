// 用法：node gen-tokens.mjs <reference-spec.json> [输出目录，默认 ./tokens] [--strict-spacing]
// --strict-spacing：连 Tailwind 的 --spacing 也清空，p-4、w-4 这类数字类全部失效（宽高也得改用规格变量），只适合严格还原。
// 从锁定规格生成：tokens.css（:root 变量）、tokens.tailwind.css（Tailwind v4 @theme，清空默认色板等命名空间）、tokens.allow.json（给 check-tokens 用的变量白名单）
import { mkdir, writeFile } from 'node:fs/promises';
import { loadSpec } from './lib/spec.mjs';

const argv = process.argv.slice(2); const strict = argv.includes('--strict-spacing');
const [specPath, outDir = './tokens'] = argv.filter(a => !a.startsWith('--'));
if (!specPath) { console.error('用法：node gen-tokens.mjs <reference-spec.json> [输出目录]'); process.exit(1); }
const S = loadSpec(specPath); const sl = S.slug;
const vars = [];
const balanced = v => [...String(v)].reduce((d, c) => d < 0 ? d : d + (c === '(' ? 1 : c === ')' ? -1 : 0), 0) === 0;
const put = (name, value, ns) => { if (value == null || String(value).trim() === "") return; if (!balanced(value)) { console.warn(`跳过 ${name}：括号不配对（值可能被截断）→ ${value}`); return; } vars.push({ name, value: String(value), ns }); };
for (const [k, v] of Object.entries(S.colors)) put(`--color-${sl(k)}`, v, 'color');
for (const [k, v] of Object.entries(S.fonts)) put(`--font-${sl(k)}`, v, 'font');
for (const [k, t] of Object.entries(S.type)) {
  put(`--text-${k}`, t.size, 'text');
  if (t.line) put(`--text-${k}--line-height`, t.line, 'text');
  if (t.tracking) put(`--text-${k}--letter-spacing`, t.tracking, 'text');
  if (t.weight) put(`--text-${k}--font-weight`, t.weight, 'text');
}
for (const [k, v] of Object.entries(S.spacing)) put(`--spacing-${sl(k)}`, v, 'spacing');
for (const [k, v] of Object.entries(S.radius)) put(`--radius-${sl(k)}`, v, 'radius');
for (const [k, v] of Object.entries(S.shadows)) put(`--shadow-${sl(k)}`, v, 'shadow');
for (const [k, v] of Object.entries(S.durations)) put(`--duration-${sl(k)}`, v, 'duration');
for (const [k, v] of Object.entries(S.easings)) put(`--ease-${sl(k)}`, v, 'ease');

const head = `/* LSF-GENERATED：由 gen-tokens.mjs 从 ${S.raw.source || '参考规格'}（${S.raw.measured_at || ''}）生成。不要手改，改规格后重新生成。 */\n`;
const body = vars.map(v => `  ${v.name}: ${v.value};`).join('\n');
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/tokens.css`, `${head}:root {\n${body}\n}\n`);
// Tailwind v4：把会生成默认工具类的命名空间清空，只留规格值（--color-*: initial 写法见 https://tailwindcss.com/docs/theme ）
const resets = [...(strict ? ['--spacing'] : []), '--color-*', '--font-*', '--text-*', '--radius-*', '--shadow-*', '--inset-shadow-*', '--drop-shadow-*', '--ease-*', '--animate-*', '--tracking-*', '--leading-*'];
const tw = vars.filter(v => v.ns !== 'duration');
await writeFile(`${outDir}/tokens.tailwind.css`, `${head}/* 用法：在 app.css 里 @import "tailwindcss"; 之后 @import "./tokens.tailwind.css"; */\n@theme {\n${resets.map(r => `  ${r}: initial;`).join('\n')}\n${tw.map(v => `  ${v.name}: ${v.value};`).join('\n')}\n}\n:root {\n${vars.filter(v => v.ns === 'duration').map(v => `  ${v.name}: ${v.value};`).join('\n')}\n}\n`);
await writeFile(`${outDir}/tokens.allow.json`, JSON.stringify({ generatedFrom: specPath, vars: Object.fromEntries(vars.map(v => [v.name, v.value])) }, null, 2));
console.log(`已生成 ${outDir}/tokens.css、tokens.tailwind.css、tokens.allow.json（${vars.length} 个变量）`);
