// 值的解析与归一：颜色（hex/rgb/hsl/oklch/oklab/lab/lch）→ [r,g,b,a]；长度 → px；时长 → ms；缓动 → 标准写法
const clamp = (x, a = 0, b = 255) => Math.min(b, Math.max(a, x));
const num = (s, pctScale = 1) => (String(s).trim().endsWith('%') ? parseFloat(s) / 100 * pctScale : parseFloat(s));
const hue = s => { s = String(s).trim(); const v = parseFloat(s); if (s.endsWith('turn')) return v * 360; if (s.endsWith('rad')) return v * 180 / Math.PI; if (s.endsWith('grad')) return v * 0.9; return v; };
const lin2srgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(c => clamp(Math.round(lin2srgb(c) * 255)));
}
function labToRgb(L, a, b) { // CIE Lab D50 → XYZ D50 → D65 → sRGB
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, e = 216 / 24389, k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k, yr = L > k * e ? fy ** 3 : L / k, zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const X = xr * 0.96422, Y = yr, Z = zr * 0.82521;
  const x = 0.9554734527042182 * X - 0.023098536874261423 * Y + 0.0632593086610217 * Z, y = -0.028369706963208136 * X + 1.0099954580058226 * Y + 0.021041398966943008 * Z, z = 0.012314001688319899 * X - 0.020507696433808525 * Y + 1.3303659366080753 * Z;
  return [3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z, -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z, 0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z].map(c => clamp(Math.round(lin2srgb(c) * 255)));
}
function hslToRgb(h, s, l) { h = ((h % 360) + 360) % 360; const f = n => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map(c => Math.round(c * 255)); }

export const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', brown: '#a52a2a', beige: '#f5f5dc', gold: '#ffd700', indigo: '#4b0082', violet: '#ee82ee', coral: '#ff7f50', salmon: '#fa8072', tomato: '#ff6347', crimson: '#dc143c', khaki: '#f0e68c', ivory: '#fffff0', lavender: '#e6e6fa', tan: '#d2b48c', whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc', slategray: '#708090', darkgray: '#a9a9a9', lightgray: '#d3d3d3', dimgray: '#696969' };
export const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\([^()]*(?:\([^()]*\)[^()]*)*\)/g;

// 返回 [r,g,b,a]（a 保留两位小数）或 null（无法解析）
export function parseColor(str) {
  let s = String(str).trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s.startsWith('#')) {
    let h = s.slice(1); if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2) || 'ff', 16));
    return [n[0], n[1], n[2], +(n[3] / 255).toFixed(2)];
  }
  const m = /^([a-z]+)\((.*)\)$/.exec(s); if (!m) return null;
  const [, fn, body] = m; if (/var\(|calc\(|from /.test(body)) return null;
  const [main, alphaPart] = body.includes('/') ? body.split('/') : [body, null];
  const p = main.replace(/,/g, ' ').trim().split(/\s+/);
  let a = alphaPart != null ? num(alphaPart) : (p.length === 4 ? num(p[3]) : 1); if (isNaN(a)) a = 1;
  let rgb;
  if (fn === 'rgb' || fn === 'rgba') rgb = p.slice(0, 3).map(x => clamp(Math.round(num(x, 255))));
  else if (fn === 'hsl' || fn === 'hsla') rgb = hslToRgb(hue(p[0]), num(p[1]) / (p[1].endsWith('%') ? 1 : 100), num(p[2]) / (p[2].endsWith('%') ? 1 : 100));
  else if (fn === 'oklch') { const L = num(p[0]), C = num(p[1], 0.4), H = hue(p[2]) * Math.PI / 180; rgb = oklabToRgb(L, C * Math.cos(H || 0), C * Math.sin(H || 0)); }
  else if (fn === 'oklab') rgb = oklabToRgb(num(p[0]), num(p[1], 0.4), num(p[2], 0.4));
  else if (fn === 'lab') rgb = labToRgb(num(p[0], 100), num(p[1], 125), num(p[2], 125));
  else if (fn === 'lch') { const H = hue(p[2]) * Math.PI / 180; const C = num(p[1], 150); rgb = labToRgb(num(p[0], 100), C * Math.cos(H || 0), C * Math.sin(H || 0)); }
  else if (fn === 'color' && p[0] === 'srgb') rgb = p.slice(1, 4).map(x => clamp(Math.round(num(x) * 255)));
  else return null;
  if (rgb.some(isNaN)) return null;
  return [...rgb, +(+a).toFixed(2)];
}
export const colorKey = c => (c ? c.join(',') : null);
export const sameColor = (x, y, tol = 2) => x && y && Math.abs(x[0] - y[0]) <= tol && Math.abs(x[1] - y[1]) <= tol && Math.abs(x[2] - y[2]) <= tol && Math.abs(x[3] - y[3]) <= 0.02;

// 长度 → px（rem/em 按 16px；无单位 0 → 0）；无法换算返回 null
export function toPx(v) {
  v = String(v).trim(); if (v === '0') return 0;
  const m = /^(-?[\d.]+)(px|rem|em)$/.exec(v); if (!m) return null;
  return +(parseFloat(m[1]) * (m[2] === 'px' ? 1 : 16)).toFixed(2);
}
export function toMs(v) { const m = /^(-?[\d.]+)(ms|s)$/.exec(String(v).trim()); return m ? +(parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1)).toFixed(1) : null; }
const EASE_KW = { ease: 'cubic-bezier(0.25,0.1,0.25,1)', 'ease-in': 'cubic-bezier(0.42,0,1,1)', 'ease-out': 'cubic-bezier(0,0,0.58,1)', 'ease-in-out': 'cubic-bezier(0.42,0,0.58,1)', linear: 'linear' };
export function normEase(v) {
  v = String(v).trim().toLowerCase().replace(/\s+/g, '');
  if (EASE_KW[v]) return EASE_KW[v];
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(v); if (m) return 'cubic-bezier(' + m[1].split(',').map(x => +parseFloat(x).toFixed(3)).join(',') + ')';
  return v; // steps()、linear(...) 原样比较
}
// 拆分逗号分隔但不拆括号里的逗号
export function splitTop(v, sep = ',') { const out = []; let d = 0, cur = ''; for (const ch of String(v)) { if (ch === '(') d++; if (ch === ')') d--; if (ch === sep && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
export const normShadow = v => splitTop(String(v).toLowerCase()).map(part => {
  const color = part.match(COLOR_RE)?.[0]; if (!color) return part.replace(/\s+/g, ' ').trim();
  const rgba = parseColor(color); if (!rgba) return part.replace(/\s+/g, ' ').trim();
  const inset = /\binset\b/.test(part); const lengths = part.replace(color, '').replace(/\binset\b/g, '').trim().split(/\s+/).filter(Boolean).map(x => x === '0' ? '0px' : x);
  while (lengths.length < 4) lengths.push('0px'); return [inset ? 'inset' : '', rgba.join(','), ...lengths].filter(Boolean).join(' ');
}).join(',');
