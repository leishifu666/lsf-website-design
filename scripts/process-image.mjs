// 生成图 → 可上线素材。依赖 sharp（npm install 已包含）。
// 用法：
//   抠纯色底：node process-image.mjs key   <输入> <输出目录> [--bg white|black|#rrggbb] [--tol 18] [--soft 40]
//   黑白底求精确透明：node process-image.mjs pair <白底图> <黑底图> <输出目录>
//   只做导出：node process-image.mjs export <输入（已透明或照片）> <输出目录>
// 共同的后续步骤：去色溢（半透明边缘去掉底色残留）→ 裁掉四周透明边 → 导出 640/1280/1920 宽的 WebP + AVIF（透明素材再出一份 PNG）→ 报告 alpha 覆盖率。
// 原理：
//   key：按到底色的颜色距离算 alpha，tol 以内全透明，tol+soft 以外全不透明，中间线性过渡（保留柔边，不是硬切）。只适合主体和底色反差大的图。
//   pair：同一张图分别在纯白、纯黑底上出图，alpha = 1 - (白 - 黑)/255，颜色 = 黑底值 / alpha。能保留玻璃、烟雾、发光这类半透明。前提是两张图除背景外完全一致（同 seed 或用编辑功能只换背景）。
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const [, , mode, ...rest] = process.argv;
const flag = (n, d) => { const i = rest.indexOf(n); return i > -1 ? rest[i + 1] : d; };
const pos = rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1] || '').startsWith('--'));
if (!['key', 'pair', 'export'].includes(mode)) { console.error('用法见文件头注释'); process.exit(1); }

const raw = async f => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const parseBg = s => s === 'black' ? [0, 0, 0] : s === 'white' || !s ? [255, 255, 255] : [1, 3, 5].map(i => parseInt(s.replace('#', '').padEnd(6, '0').slice(i - 1, i + 1), 16));

let img, name;
if (mode === 'key') {
  const [inp, out] = pos; name = basename(inp, extname(inp)); img = await raw(inp); img.out = out;
  const bg = parseBg(flag('--bg', 'white')), tol = +flag('--tol', 18), soft = +flag('--soft', 40);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
    const a = dist <= tol ? 0 : dist >= tol + soft ? 1 : (dist - tol) / soft;
    if (a > 0 && a < 1) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - bg[c] * (1 - a)) / a))); // 去色溢：把混进来的底色减掉
    d[i + 3] = Math.round(a * d[i + 3]);
  }
} else if (mode === 'pair') {
  const [wf, bf, out] = pos; name = basename(wf, extname(wf)).replace(/[-_]?white$/i, '');
  const W = await raw(wf), B = await raw(bf);
  if (W.w !== B.w || W.h !== B.h) { console.error('两张图尺寸不同，不能配对'); process.exit(1); }
  img = { data: Buffer.alloc(W.data.length), w: W.w, h: W.h, out };
  let mismatch = 0;
  for (let i = 0; i < W.data.length; i += 4) {
    const diffs = [0, 1, 2].map(c => W.data[i + c] - B.data[i + c]);
    if (diffs.some(x => x < -12)) mismatch++; // 白底反而更暗：说明两张图主体不一致
    const a = Math.max(0, Math.min(1, 1 - (diffs[0] + diffs[1] + diffs[2]) / 3 / 255));
    for (let c = 0; c < 3; c++) img.data[i + c] = a > 0.004 ? Math.min(255, Math.round(B.data[i + c] / a)) : 0;
    img.data[i + 3] = Math.round(a * 255);
  }
  const mm = mismatch / (W.w * W.h);
  if (mm > 0.01) console.warn(`警告：${(mm * 100).toFixed(1)}% 的像素白底比黑底更暗，两张图主体可能不一致，结果会有残影`);
} else {
  const [inp, out] = pos; name = basename(inp, extname(inp)); img = await raw(inp); img.out = out;
}

await mkdir(img.out, { recursive: true });
let base = sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });
// 裁掉四周全透明的边（照片没有透明边，trim 不会动它）
const trimmed = await base.png().toBuffer().then(b => sharp(b).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).toBuffer({ resolveWithObject: true })).catch(async () => ({ data: await base.png().toBuffer(), info: { width: img.w, height: img.h } }));
const src = trimmed.data; const tw = trimmed.info.width, th = trimmed.info.height;
const stats = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let transparent = 0, partial = 0; for (let i = 3; i < stats.data.length; i += 4) { if (stats.data[i] === 0) transparent++; else if (stats.data[i] < 255) partial++; }
const px = stats.info.width * stats.info.height;
const hasAlpha = transparent + partial > 0;
const outs = [];
for (const w of [640, 1280, 1920].filter(w => w <= tw * 1.01 || w === 640)) {
  const r = sharp(src).resize({ width: Math.min(w, tw) });
  const f1 = `${img.out}/${name}-${w}.webp`; await r.clone().webp({ quality: 82, alphaQuality: 90 }).toFile(f1); outs.push(f1);
  const f2 = `${img.out}/${name}-${w}.avif`; await r.clone().avif({ quality: 55 }).toFile(f2); outs.push(f2);
}
if (hasAlpha) { const f = `${img.out}/${name}.png`; await sharp(src).png({ compressionLevel: 9 }).toFile(f); outs.push(f); }
const report = { input: pos[0], mode, size: `${tw}x${th}`, hasAlpha, transparentPct: +(transparent / px * 100).toFixed(1), softEdgePct: +(partial / px * 100).toFixed(1), outputs: outs };
await writeFile(`${img.out}/${name}.report.json`, JSON.stringify(report, null, 2));
console.log(`${name}：${tw}x${th}，透明 ${report.transparentPct}%，半透明边 ${report.softEdgePct}%，输出 ${outs.length} 个文件`);
if (mode !== 'export' && report.transparentPct < 5) console.warn('警告：透明区域不到 5%，抠图可能失败（底色不纯或参数不对）');
