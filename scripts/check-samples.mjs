#!/usr/bin/env node
// 上线前检查：构建产物里不能有示例图（别人的图只能本地当示例，不能上线）。
// 用法：node scripts/check-samples.mjs dist   （默认 dist）
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2] || 'dist';
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml']);
const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name === '_samples') hits.push(`目录：${p}`); walk(p); continue; }
    if (/^sample-/i.test(name)) hits.push(`文件：${p}`);
    if (TEXT.has(extname(name).toLowerCase())) {
      const t = readFileSync(p, 'utf8');
      if (/\/_samples\/|[\/"'(]sample-[\w-]+\.(png|jpe?g|webp|avif|gif)/i.test(t)) hits.push(`引用：${p}`);
    }
  }
}
try { walk(root); } catch (e) { console.error(`读不到目录 ${root}：${e.message}`); process.exit(2); }
if (hits.length) { console.log('失败：构建产物里还有示例图，上线前必须替换：'); hits.forEach(h => console.log('  ' + h)); process.exit(1); }
console.log(`通过：${root} 里没有示例图。`);
