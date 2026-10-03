// Measurable traits of a reference image: palette, tone, saturation, contrast, density, whitespace.
// Composition and typography character are read visually by the assistant (this tool cannot read type).
import sharp from 'sharp';
import { inspectImage } from './assets.mjs';
import { toHex, luminance, contrast, bestInk } from './util.mjs';

function kmeans(px, k = 6, iters = 12) {
  let C = []; for (let i = 0; i < k; i++) C.push(px[Math.floor((i + 0.5) * px.length / k)].slice());
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < iters; it++) {
    for (let p = 0; p < px.length; p++) { let best = 0, bd = 1e9; for (let c = 0; c < k; c++) { const d = (px[p][0] - C[c][0]) ** 2 + (px[p][1] - C[c][1]) ** 2 + (px[p][2] - C[c][2]) ** 2; if (d < bd) { bd = d; best = c; } } assign[p] = best; }
    const S = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let p = 0; p < px.length; p++) { const s = S[assign[p]]; s[0] += px[p][0]; s[1] += px[p][1]; s[2] += px[p][2]; s[3]++; }
    C = S.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : C[c]));
  }
  const counts = new Array(k).fill(0); for (const a of assign) counts[a]++;
  return C.map((c, i) => ({ hex: toHex({ r: c[0], g: c[1], b: c[2] }), share: counts[i] / px.length, rgb: c })).filter((x) => x.share > 0.01).sort((a, b) => b.share - a.share);
}
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255; return mx === 0 ? 0 : (mx - mn) / mx; };

export async function analyzeReference(file) {
  const info = await inspectImage(file);
  const { data, info: i2 } = await sharp(file).rotate().resize(96, 96, { fit: 'inside', kernel: 'nearest' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = []; for (let k = 0; k < data.length; k += 3) px.push([data[k], data[k + 1], data[k + 2]]);
  const raw = kmeans(px, 8);
  // merge near-duplicate clusters
  const palette = [];
  for (const c of raw) { const m = palette.find((x) => Math.hypot(x.rgb[0] - c.rgb[0], x.rgb[1] - c.rgb[1], x.rgb[2] - c.rgb[2]) < 30); if (m) m.share += c.share; else palette.push({ ...c }); }
  palette.sort((a, b) => b.share - a.share);
  const L = px.map((p) => luminance({ r: p[0], g: p[1], b: p[2] }));
  const meanL = L.reduce((a, b) => a + b, 0) / L.length;
  const sdL = Math.sqrt(L.reduce((a, b) => a + (b - meanL) ** 2, 0) / L.length);
  const meanSat = px.reduce((a, p) => a + sat(p), 0) / px.length;
  // edge density on grayscale (Sobel) → visual density
  const { data: g, info: gi } = await sharp(file).rotate().resize(160, 160, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let edges = 0, tot = 0;
  for (let y = 1; y < gi.height - 1; y++) for (let x = 1; x < gi.width - 1; x++) {
    const at = (xx, yy) => g[yy * gi.width + xx];
    const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
    const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
    if (Math.hypot(gx, gy) > 110) edges++; tot++;
  }
  const density = edges / tot;
  // background: a calm (low-saturation) colour with a large share beats a saturated shape that happens to be big
  const bg = palette.find((c) => sat(c.rgb) < 0.2 && c.share >= 0.25) || palette[0];
  const whitespace = px.filter((p) => Math.hypot(p[0] - bg.rgb[0], p[1] - bg.rgb[1], p[2] - bg.rgb[2]) < 28).length / px.length;
  const accentCand = palette.filter((c) => c !== bg).filter((c) => sat(c.rgb) > 0.35 && contrast(c.hex, bg.hex) > 1.6).sort((a, b) => sat(b.rgb) - sat(a.rgb));
  const inkCand = palette.filter((c) => c !== bg).sort((a, b) => contrast(b.hex, bg.hex) - contrast(a.hex, bg.hex))[0];
  const dark = luminance(bg.hex) < 0.2;
  const tokens = {
    bg: bg.hex, ink: contrast(inkCand.hex, bg.hex) >= 7 ? inkCand.hex : bestInk(bg.hex),
    accent: accentCand[0]?.hex || palette[1]?.hex, accent2: accentCand[1]?.hex || palette[2]?.hex,
  };
  const hints = [];
  if (density < 0.06 && whitespace > 0.45) hints.push('minimal', 'editorial', 'luxury');
  if (density > 0.16) hints.push('collage', 'comic', 'photo');
  if (meanSat > 0.45) hints.push('bold', 'playful', 'comic');
  if (dark && meanSat > 0.3) hints.push('tech', 'glass');
  if (dark && meanSat <= 0.3) hints.push('luxury', 'photo');
  if (!dark && meanSat < 0.2) hints.push('minimal', 'swiss', 'editorial');
  return {
    file: info.abs, size: `${info.width}x${info.height}`, aspect: +(info.width / info.height).toFixed(3),
    palette: palette.map((c) => ({ hex: c.hex, share: +c.share.toFixed(3), saturation: +sat(c.rgb).toFixed(2) })),
    tone: dark ? 'dark' : meanL > 0.6 ? 'light' : 'mid', meanLuminance: +meanL.toFixed(3), tonalContrast: +sdL.toFixed(3),
    saturation: +meanSat.toFixed(2), density: +density.toFixed(3), densityLabel: density < 0.06 ? 'منخفضة (مساحات فارغة كثيرة)' : density < 0.14 ? 'متوسطة' : 'عالية (تفاصيل كثيرة)',
    whitespace: +whitespace.toFixed(2), suggestedTokens: tokens, styleHints: [...new Set(hints)].slice(0, 4),
    note_ar: 'هذه قياسات آلية للألوان والكثافة فقط. التكوين، نوع الخط، والملمس يجب أن يقرأها المساعد بصريًا من الصورة نفسها ثم يكتبها في نمط مخصص.',
  };
}
