// Deliverables: versioning, contact sheet, continuity strip, ZIPs, sources.md, QC report.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import yazl from 'yazl';
import { pad2, timestamp, exists, SiyaqError, esc } from './util.mjs';

/** Move the current slide PNG + HTML into versions/ before they are overwritten */
export function archiveSlides(outDir, indices, sourceDir) {
  const stamp = timestamp(); const moved = [];
  for (const i of indices) {
    const png = path.join(outDir, `slide-${pad2(i)}.png`);
    if (!exists(png)) continue;
    const vdir = path.join(outDir, 'versions', `slide-${pad2(i)}`);
    fs.mkdirSync(vdir, { recursive: true });
    const k = fs.readdirSync(vdir).filter((f) => f.endsWith('.png')).length + 1;
    const base = `v${k}-${stamp}`;
    fs.copyFileSync(png, path.join(vdir, `${base}.png`));
    const html = path.join(sourceDir, `slide-${pad2(i)}.html`);
    if (exists(html)) fs.copyFileSync(html, path.join(vdir, `${base}.html`));
    moved.push({ slide: i, version: base });
  }
  return moved;
}

export async function contactSheet(pngs, outFile, { cols, W, H, gap = 24, thumbW = 360, bg = '#e9e9e4', labels = true }) {
  const th = Math.round((thumbW * H) / W);
  cols = cols || Math.min(5, pngs.length);
  const rows = Math.ceil(pngs.length / cols);
  const SW = cols * thumbW + (cols + 1) * gap, SH = rows * (th + (labels ? 40 : 0)) + (rows + 1) * gap;
  const comps = [];
  for (let k = 0; k < pngs.length; k++) {
    const c = k % cols, r = Math.floor(k / cols);
    const left = gap + c * (thumbW + gap), top = gap + r * (th + gap + (labels ? 40 : 0));
    comps.push({ input: await sharp(pngs[k]).resize(thumbW, th).png().toBuffer(), left, top });
    if (labels) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${thumbW}" height="36"><text x="${thumbW / 2}" y="26" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#333">${esc(path.basename(pngs[k]))}</text></svg>`), left, top: top + th + 4 });
  }
  await sharp({ create: { width: SW, height: SH, channels: 3, background: bg } }).composite(comps).png().toFile(outFile);
  return outFile;
}

/** Slides side by side at true relative scale — reveals cross-slide continuity */
export async function strip(pngs, outFile, { W, H, height = 540 }) {
  const w = Math.round((W * height) / H);
  const comps = await Promise.all(pngs.map(async (p, k) => ({ input: await sharp(p).resize(w, height).png().toBuffer(), left: k * w, top: 0 })));
  await sharp({ create: { width: w * pngs.length, height, channels: 3, background: '#000' } }).composite(comps).png().toFile(outFile);
  return outFile;
}

export function zipFiles(entries, outFile) {
  return new Promise((resolve, reject) => {
    const z = new yazl.ZipFile();
    for (const e of entries) {
      if (e.dir) { for (const f of walk(e.dir)) z.addFile(f, path.join(e.prefix || '', path.relative(e.dir, f)).split(path.sep).join('/'), { compress: !/\.(png|jpg|jpeg|webp|woff2)$/i.test(f) }); }
      else z.addFile(e.file, e.name || path.basename(e.file), { compress: !/\.(png|jpg|jpeg|webp|woff2)$/i.test(e.file) });
    }
    z.outputStream.pipe(fs.createWriteStream(outFile)).on('close', () => resolve(outFile)).on('error', reject);
    z.end();
  });
}
function* walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else yield p; } }

export function writeSources(spec, outDir) {
  const src = spec.sources || [];
  if (!src.length) return null;
  const bad = src.filter((s) => !s.url || !/^https?:\/\//.test(s.url) || !s.title || !s.accessed);
  if (bad.length) throw new SiyaqError('SOURCES_INCOMPLETE', `بعض المصادر ناقصة (العنوان/الرابط/تاريخ الوصول): ${bad.map((b) => b.id || b.title || '?').join('، ')}`);
  const lines = [`# المصادر — ${spec.meta?.title || 'الكاروسيل'}`, '',
    'هذا الملف يرافق التصميم ولا يظهر داخل الصور. كل معلومة واقعية في الشرائح مرتبطة بمصدرها هنا.', ''];
  if (spec.research?.note) lines.push(`> ${spec.research.note}`, '');
  for (const s of src) {
    lines.push(`## [${s.id}] ${s.title}`, '',
      `- **الرابط:** ${s.url}`,
      s.publisher ? `- **الجهة الناشرة:** ${s.publisher}` : null,
      `- **تاريخ الوصول:** ${s.accessed}`,
      `- **يدعم:** ${s.supports || '—'}${s.slides?.length ? ` (الشريحة ${s.slides.join('، ')})` : ''}`,
      `- **درجة اليقين / ملاحظات:** ${s.uncertainty || 'لا توجد ملاحظات'}`, '');
  }
  const userFacts = spec.userProvidedFacts || [];
  if (userFacts.length) { lines.push('## معلومات قدّمها المستخدم (لم يتم التحقق منها بشكل مستقل)', ''); for (const f of userFacts) lines.push(`- ${f}`); lines.push(''); }
  const file = path.join(outDir, 'sources.md');
  fs.writeFileSync(file, lines.filter((l) => l !== null).join('\n'));
  return file;
}

const LV = { error: '❌ خطأ', warn: '⚠️ تنبيه', info: 'ℹ️ معلومة' };
export function writeQcMarkdown(report, build, file) {
  const L = [`# تقرير الجودة — سياق كاروسيل`, '', `- المقاس: ${build.canvas.W}×${build.canvas.H} (${build.canvas.name_ar})`, `- النمط: ${build.theme.style.name_ar} (${build.theme.style.id})${build.theme.traits.length ? ` + ${build.theme.traits.join('، ')}` : ''}`,
    `- الخطوط: ${build.fontReport.map((f) => `${f.role}=${f.family}${f.user ? ' (مرفوع من المستخدم)' : ''}`).join('، ')}`,
    `- النتيجة الآلية: ${report.pass ? '✅ ناجح' : '❌ فيه أخطاء'} — أخطاء: ${report.counts.error}، تنبيهات: ${report.counts.warn}`, '',
    '> الفحص الآلي لا يثبت جودة التصميم؛ يجب فحص الصور بصريًا أيضًا.', ''];
  for (const w of build.warnings) L.push(`- ${LV.warn}: ${w.msg}`);
  for (const g of report.global) L.push(`- ${LV[g.level]}: ${g.msg}`);
  if (report.seams.length) L.push('', '## الاستمرارية بين الشرائح', ...report.seams.map((s) => `- الشريحتان ${s.between.join(' ← ')}: فرق الحافة ${s.meanDiff} ${s.ok ? '✅' : '⚠️'}`));
  L.push('', '## الشرائح');
  for (const s of report.slides) {
    L.push('', `### الشريحة ${s.index} (${s.layout})${s.k < 1 ? ` — مقياس الخط ${Math.round(s.k * 100)}%` : ''}`);
    if (!s.issues.length) L.push('- ✅ لا ملاحظات آلية');
    for (const i of s.issues) L.push(`- ${LV[i.level]} [${i.code}]: ${i.msg}`);
  }
  fs.writeFileSync(file, L.join('\n'));
}
