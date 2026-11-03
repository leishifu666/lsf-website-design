#!/usr/bin/env node
// 检查 PNG 是否真的有透明通道（不依赖第三方库）。
// 用法：node scripts/check-alpha.mjs a.png b.png
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function check(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) return { file, ok: false, reason: '不是 PNG' };
  let off = 8, colorType, bitDepth, width, height, hasTRNS = false; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'tRNS') hasTRNS = true;
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (colorType !== 6 && colorType !== 4) {
    return { file, ok: hasTRNS, reason: hasTRNS ? '调色板透明（tRNS）' : `无 alpha 通道（colorType=${colorType}）` };
  }
  if (bitDepth !== 8) return { file, ok: true, reason: `有 alpha 通道（${bitDepth} 位，未逐像素检查）` };
  // 逐行解码，统计透明像素占比
  const bpp = colorType === 6 ? 4 : 2; const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp; let prev = Buffer.alloc(stride), p = 0, transparent = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[p++]; const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[x] = v & 255;
    }
    for (let x = bpp - 1; x < stride; x += bpp) if (line[x] < 250) transparent++;
    prev = line;
  }
  const ratio = transparent / (width * height);
  return { file, ok: ratio > 0.01, reason: `透明像素占比 ${(ratio * 100).toFixed(1)}%` };
}

const files = process.argv.slice(2);
if (!files.length) { console.error('用法：node scripts/check-alpha.mjs <png...>'); process.exit(2); }
let fail = 0;
for (const f of files) { const r = check(f); console.log(`${r.ok ? '通过' : '失败'}  ${r.file}  ${r.reason}`); if (!r.ok) fail++; }
process.exit(fail ? 1 : 0);
