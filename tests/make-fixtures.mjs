// Creates test-only fixtures that simulate user uploads: a fictional brand logo and a reference design image.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fontUrl = 'file://' + path.resolve(dir, '../../assets/fonts/el-messiri/ElMessiri[wght].ttf');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 300 } });
await p.setContent(`<html><head><style>@font-face{font-family:M;src:url("${fontUrl}")}body{margin:0;background:transparent}</style></head><body>
<div style="display:flex;align-items:center;gap:28px;padding:30px 40px;direction:rtl;font-family:M;width:fit-content">
<svg width="170" height="170" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#1F4D3A"/><path d="M50 18 C72 34 72 62 50 82 C28 62 28 34 50 18Z" fill="#C8963E"/><path d="M50 26 L50 76" stroke="#1F4D3A" stroke-width="3"/></svg>
<div><div style="font-size:92px;font-weight:700;color:#1F4D3A;line-height:1.1">محمصة الريحان</div><div style="font-size:30px;color:#C8963E;font-weight:600;letter-spacing:6px;direction:ltr;text-align:right">AL-RAIHAN ROASTERY</div></div></div></body></html>`);
await p.waitForTimeout(300);
const el = await p.$('div');
await el.screenshot({ path: path.join(dir, 'logo-test-brand.png'), omitBackground: true });
const q = await b.newPage({ viewport: { width: 1080, height: 1350 } });
await q.setContent(`<html><body style="margin:0;width:1080px;height:1350px;background:#F2E8D8;position:relative;overflow:hidden;font-family:sans-serif">
<div style="position:absolute;left:-200px;top:-150px;width:900px;height:900px;border-radius:50%;background:#0F3B5F"></div>
<div style="position:absolute;right:80px;top:120px;width:260px;height:260px;border-radius:50%;background:#F26B21"></div>
<div style="position:absolute;left:0;bottom:0;width:100%;height:330px;background:repeating-linear-gradient(90deg,#0F3B5F 0 40px,#F2E8D8 40px 80px)"></div>
<div style="position:absolute;right:90px;top:560px;color:#0F3B5F;font-size:150px;font-weight:900;line-height:.95;text-align:right">GRID<br>& SUN</div>
<div style="position:absolute;right:96px;top:870px;color:#F26B21;font-size:38px;font-weight:700">VOL. 07 — 1974</div></body></html>`);
await q.screenshot({ path: path.join(dir, 'reference-design.png') });
await b.close();
console.log('fixtures ready');
