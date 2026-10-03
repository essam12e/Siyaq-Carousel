#!/usr/bin/env node
// سياق كاروسيل — runtime-neutral CLI. Works the same under Claude Code, Codex, or a plain terminal.
// It never calls an LLM, a Claude/Codex CLI, or any paid API: the active assistant writes carousel.json,
// this tool turns it into real PNG/ZIP files and a QC report.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { readJSON, writeJSON, REGISTRY, ASSETS, SKILL_ROOT, SiyaqError, pad2, exists } from './lib/util.mjs';
import { buildCarousel, loadPlatforms, loadIcons } from './lib/build.mjs';
import { renderDocs, launchBrowser } from './lib/render.mjs';
import { runQC } from './lib/qc.mjs';
import { archiveSlides, contactSheet, strip, zipFiles, writeSources, writeQcMarkdown } from './lib/output.mjs';
import { loadStyles, validateCustomStyle, userStylesDir } from './lib/theme.mjs';
import { fontRegistry, inspectFontFile, missingGlyphs } from './lib/fonts.mjs';
import { LAYOUTS } from './lib/layouts.mjs';
import { CONTINUITY_TYPES } from './lib/continuity.mjs';
import { analyzeReference } from './lib/reference.mjs';

const WELCOME = `أهلًا بك في سياق كاروسيل 👋
أرسل موضوعك والمنصة اللي تبي تنشر فيها، وحدد الاستايل أو أرفق تصميمًا مرجعيًا إذا عندك.
تقدر تضيف هويتك، خطوطك، صور منتجاتك، وأي نصوص أو بيانات تبي تظهر في التصميم.
العدد الافتراضي ٥ صور، ونقدر نزيده حسب طلبك.

سياق كاروسيل إحدى منتجات نطاق`;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); if (v !== undefined) out[k] = v; else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i]; else out[k] = true; }
    else out._.push(a);
  }
  return out;
}
const log = (...a) => console.log(...a);
const parseSlides = (s) => (s ? String(s).split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]; }) : null);

async function cmdRender(o) {
  const specPath = path.resolve(o._[1] || '');
  if (!o._[1] || !exists(specPath)) throw new SiyaqError('SPEC_MISSING', 'مرّر مسار ملف carousel.json: siyaq render carousel.json --out ./out');
  const spec = readJSON(specPath);
  const specDir = path.dirname(specPath);
  const outRoot = path.resolve(o.out || path.join(specDir, 'out'));
  const preview = !!o.preview;
  const only = parseSlides(o.slides);
  const outDir = preview ? path.join(outRoot, 'preview') : outRoot;
  fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  const build = await buildCarousel(spec, { specDir, outDir: outRoot, only, mode: preview ? 'preview' : 'final' });
  for (const w of build.warnings) log(`⚠️  ${w.msg}`);
  if (build.errors.length) {
    for (const e of build.errors) log(`❌ ${e.msg}`);
    if (!o.force) { writeJSON(path.join(outDir, 'qc-report.json'), { pass: false, blocked: true, errors: build.errors, warnings: build.warnings }); process.exitCode = 2; return; }
  }
  const archived = !preview ? archiveSlides(outDir, build.docs.map((d) => d.index), build.sourceDir) : [];
  const results = await renderDocs(build.docs, { W: build.canvas.W, H: build.canvas.H, outPngDir: outDir, concurrency: Number(o.concurrency || 3) });
  const allRendered = !only;
  const report = await runQC(build, results, { allRendered });

  // Collect the current full set (a single-slide revision keeps the other slides as they were)
  const pngs = Array.from({ length: build.n }, (_, k) => path.join(outDir, `slide-${pad2(k + 1)}.png`)).filter(exists);
  const sheet = pngs.length ? await contactSheet(pngs, path.join(outDir, preview ? 'preview-sheet.png' : 'contact-sheet.png'), { W: build.canvas.W, H: build.canvas.H }) : null;
  const stripFile = build.cont && pngs.length > 1 ? await strip(pngs, path.join(outDir, 'continuity-strip.png'), { W: build.canvas.W, H: build.canvas.H }) : null;
  const deliver = { slides: pngs, sheet, strip: stripFile, zips: [], sources: null, sourcePackage: null };
  if (!preview) {
    deliver.sources = writeSources(spec, outDir);
    const slug = (spec.meta?.slug || spec.meta?.title || 'carousel').toString().toLowerCase().replace(/[^\w؀-ۿ]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'carousel';
    const complete = pngs.length === build.n;
    if (complete && (report.pass || o.force)) {
      const max = build.canvas.maxSlides && build.n > build.canvas.maxSlides ? build.canvas.maxSlides : null;
      const zipName = path.join(outDir, `${slug}-slides.zip`);
      await zipFiles([...pngs.map((f) => ({ file: f })), ...(deliver.sources ? [{ file: deliver.sources }] : [])], zipName); deliver.zips.push(zipName);
      if (max) for (let p = 0; p * max < pngs.length; p++) { const z = path.join(outDir, `${slug}-part${p + 1}.zip`); await zipFiles(pngs.slice(p * max, (p + 1) * max).map((f) => ({ file: f })), z); deliver.zips.push(z); }
      // editable source package (bundled OFL fonts + licenses; user fonts only when marked redistributable)
      const userFontsBlocked = Object.values(build.fonts).filter((f) => f.user && !(spec.brand?.fonts && Object.values(spec.brand.fonts).some((r) => r?.file && r.redistributable)));
      const srcZip = path.join(outDir, `${slug}-source.zip`);
      const entries = [{ dir: build.sourceDir, prefix: 'source' }, { file: path.join(SKILL_ROOT, 'LICENSE'), name: 'licenses/siyaq-carousel-LICENSE.txt' }, { file: path.join(SKILL_ROOT, 'NOTICE.md'), name: 'licenses/NOTICE.md' }, { file: path.join(ASSETS, 'icons', 'FONT-AWESOME-LICENSE.txt'), name: 'licenses/FONT-AWESOME-LICENSE.txt' }];
      const ofl = new Set(Object.values(build.fonts).concat([]).filter((f) => !f.user).map((f) => f.licenseFile).concat(['cairo/OFL.txt']));
      for (const l of ofl) entries.push({ file: path.join(ASSETS, 'fonts', l), name: `licenses/fonts/${l.replace('/', '-')}` });
      await zipFiles(entries, srcZip);
      if (userFontsBlocked.length) {
        // rebuild without user font binaries
        const tmp = srcZip + '.tmp'; fs.renameSync(srcZip, tmp);
        const filtered = entries.filter((e) => !e.dir);
        const files = [];
        for (const f of walkSync(build.sourceDir)) if (!userFontsBlocked.some((uf) => uf.faces.some((x) => f.endsWith(path.basename(x.rel))))) files.push({ file: f, name: 'source/' + path.relative(build.sourceDir, f).split(path.sep).join('/') });
        await zipFiles([...files, ...filtered], srcZip); fs.rmSync(tmp);
        deliver.sourceNote = 'الخطوط التي رفعتها لم تُضمّن في حزمة المصدر لأن ترخيص إعادة توزيعها غير معروف؛ ضع ملفاتها في مجلد source/fonts عند التعديل.';
      }
      deliver.sourcePackage = srcZip;
    } else if (!complete) deliver.zipNote = `لم يُنشأ ZIP لأن ${build.n - pngs.length} شريحة لم تُرسم بعد.`;
    else deliver.zipNote = 'لم يُنشأ ZIP لأن فحص الجودة فيه أخطاء؛ أصلحها ثم أعد الرسم.';
  }
  const full = { ...report, mode: preview ? 'preview' : 'final', rendered: results.map((r) => r.index), archived, warnings: build.warnings, fonts: build.fontReport,
    assets: build.assets.map((a) => ({ ref: a.ref, file: path.basename(a.abs), format: a.format, width: a.width, height: a.height, transparentEdges: a.transparentEdges })),
    canvas: { ...build.canvas, unit: build.u }, style: { id: build.theme.style.id, traits: build.theme.traits, tokens: build.theme.tokens },
    deliverables: deliver, seconds: +((Date.now() - t0) / 1000).toFixed(1) };
  writeJSON(path.join(outDir, 'qc-report.json'), full);
  writeQcMarkdown(report, build, path.join(outDir, 'qc-report.md'));
  log(`\n${report.pass ? '✅' : '❌'} ${preview ? 'معاينة' : 'تصدير'}: ${results.length} شريحة ${build.canvas.W}×${build.canvas.H} — أخطاء ${report.counts.error}، تنبيهات ${report.counts.warn} (${full.seconds} ث)`);
  for (const s of report.slides) for (const i of s.issues.filter((x) => x.level !== 'info')) log(`   ${i.level === 'error' ? '❌' : '⚠️ '} شريحة ${s.index}: ${i.msg}`);
  for (const g of report.global) log(`   ${g.level === 'error' ? '❌' : '⚠️ '} ${g.msg}`);
  log(`📁 ${outDir}`);
  if (deliver.zips.length) log(`📦 ${deliver.zips.map((z) => path.basename(z)).join('، ')}`);
  if (deliver.zipNote) log(`ℹ️  ${deliver.zipNote}`);
  if (!report.pass) process.exitCode = 1;
}
function* walkSync(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walkSync(p); else yield p; } }

async function cmdValidate(o) {
  const specPath = path.resolve(o._[1]);
  const spec = readJSON(specPath);
  const tmp = fs.mkdtempSync(path.join(path.dirname(specPath), '.siyaq-validate-'));
  try {
    const b = await buildCarousel(spec, { specDir: path.dirname(specPath), outDir: tmp, mode: 'final' });
    log(JSON.stringify({ ok: !b.errors.length, slides: b.n, canvas: `${b.canvas.W}x${b.canvas.H}`, style: b.theme.style.id, traits: b.theme.traits, fonts: b.fontReport, errors: b.errors, warnings: b.warnings }, null, 2));
    if (b.errors.length) process.exitCode = 2;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function cmdVerify(o) {
  // Export consistency: re-render the editable source HTML in a fresh browser and compare pixels with the delivered PNGs.
  const outDir = path.resolve(o._[1]);
  const srcDir = path.join(outDir, 'source');
  const files = fs.readdirSync(srcDir).filter((f) => /^slide-\d+\.html$/.test(f)).sort();
  const first = await sharp(path.join(outDir, files[0].replace('.html', '.png'))).metadata();
  const tmp = fs.mkdtempSync(path.join(outDir, '.verify-'));
  const docs = files.map((f) => ({ index: Number(f.match(/\d+/)[0]), file: path.join(srcDir, f) }));
  const res = await renderDocs(docs, { W: first.width, H: first.height, outPngDir: tmp });
  const out = [];
  for (const r of res) {
    const a = await sharp(r.png).raw().toBuffer(), b = await sharp(path.join(outDir, `slide-${pad2(r.index)}.png`)).raw().toBuffer();
    let diff = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diff++;
    out.push({ slide: r.index, identicalBytes: a.length === b.length, differingChannelValues: diff, pct: +(100 * diff / a.length).toFixed(4) });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  log(JSON.stringify(out, null, 2));
  if (out.some((x) => x.pct > 0.5)) process.exitCode = 1;
}

function cmdList(o) {
  const what = o._[1] || 'styles';
  if (what === 'styles') { for (const s of loadStyles().styles) log(`${s.id.padEnd(12)} ${s.name_ar} — لوحات: ${Object.keys(s.palettes).join(', ')} — خط العناوين: ${s.tokens.headFont}`); const d = userStylesDir(); if (exists(d)) for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json'))) log(`custom:${f.replace('.json', '')}`); }
  else if (what === 'traits') for (const [k, v] of Object.entries(loadStyles().traits)) log(`${k.padEnd(12)} ${v.name_ar}${v.incompatible.length ? ` (يتعارض مع: ${v.incompatible.join(', ')})` : ''}`);
  else if (what === 'platforms') { const r = loadPlatforms(); for (const p of r.platforms) log(`${p.id.padEnd(20)} ${p.width}×${p.height}  حتى ${p.maxSlides} — ${p.name_ar}`); log(`custom              width/height من ${r.custom.minSide} إلى ${r.custom.maxSide}`); }
  else if (what === 'layouts') for (const [k, v] of Object.entries(LAYOUTS)) log(`${k.padEnd(12)} ${v}`);
  else if (what === 'fonts') for (const f of fontRegistry().fonts) log(`${f.id.padEnd(22)} ${f.scripts.join('+').padEnd(13)} ${f.note_ar}`);
  else if (what === 'icons') { for (const [k, v] of Object.entries(loadIcons().icons)) log(`${k.padEnd(10)} ${v.label_ar}`); log(`\nأيقونات عامة: ${fs.readdirSync(path.join(ASSETS, 'icons', 'ui')).map((f) => f.replace('.svg', '')).join(', ')}`); }
  else if (what === 'continuity') for (const [k, v] of Object.entries(CONTINUITY_TYPES)) log(`${k.padEnd(10)} ${v}`);
  else throw new SiyaqError('LIST', 'list styles|traits|platforms|layouts|fonts|icons|continuity');
}

function cmdSaveStyle(o) {
  const file = path.resolve(o._[1]);
  const data = readJSON(file);
  const errs = validateCustomStyle(data);
  if (errs.length) throw new SiyaqError('STYLE_INVALID', `النمط غير صالح: ${errs.join('، ')}`);
  const dst = path.join(o.dir ? path.resolve(o.dir) : userStylesDir(), `${data.id}.json`);
  writeJSON(dst, data);
  log(`✅ حُفظ النمط «${data.name_ar || data.id}» في ${dst}\nاستخدمه في carousel.json: "style": { "custom": "${data.id}" }`);
}

async function cmdFontCheck(o) {
  const info = inspectFontFile(path.resolve(o._[1]));
  const res = { ...info, _font: undefined };
  if (info.ok && o.text) res.missing = missingGlyphs(info._font, o.text);
  log(JSON.stringify(res, null, 2));
  if (!info.ok || (res.missing && res.missing.length)) process.exitCode = 1;
}

async function cmdDoctor() {
  const checks = [];
  const [maj] = process.versions.node.split('.').map(Number);
  checks.push({ name: 'Node.js ≥ 20', ok: maj >= 20, detail: process.versions.node });
  for (const m of ['playwright', 'sharp', 'fontkit', 'qrcode', 'yazl']) { try { await import(m); checks.push({ name: `حزمة ${m}`, ok: true }); } catch (e) { checks.push({ name: `حزمة ${m}`, ok: false, detail: 'شغّل npm install داخل مجلد المهارة' }); } }
  try { const b = await launchBrowser(); checks.push({ name: 'متصفح Chromium', ok: true, detail: b.version() }); await b.close(); } catch (e) { checks.push({ name: 'متصفح Chromium', ok: false, detail: e.message }); }
  const missing = fontRegistry().fonts.flatMap((f) => f.faces).filter((x) => !exists(path.join(ASSETS, 'fonts', x.file)));
  checks.push({ name: 'الخطوط المضمنة', ok: !missing.length, detail: missing.length ? `${missing.length} ملف ناقص` : `${fontRegistry().fonts.length} عائلة` });
  for (const c of checks) log(`${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

async function cmdAnalyzeRef(o) {
  const res = await analyzeReference(path.resolve(o._[1]));
  if (o.out) writeJSON(path.resolve(o.out), res);
  log(JSON.stringify(res, null, 2));
}

function cmdInit(o) {
  const dir = path.resolve(o._[1] || '.');
  fs.mkdirSync(dir, { recursive: true });
  const ex = path.join(SKILL_ROOT, 'examples', 'basic-ar', 'carousel.json');
  const dst = path.join(dir, 'carousel.json');
  if (exists(dst)) throw new SiyaqError('EXISTS', `${dst} موجود مسبقًا`);
  fs.copyFileSync(ex, dst);
  log(`✅ أنشأت ${dst}`);
}

const HELP = `سياق كاروسيل — أداة الرسم
الاستخدام:
  node scripts/siyaq.mjs welcome                         رسالة الترحيب
  node scripts/siyaq.mjs render carousel.json --out DIR  رسم وتصدير PNG + ZIP + تقرير جودة
        [--slides 3]      إعادة رسم شريحة/شرائح محددة فقط (مع حفظ النسخة السابقة)
        [--preview]       معاينة فقط (بدون ZIP) في DIR/preview
        [--force]         التصدير رغم الأخطاء (للتشخيص فقط)
  node scripts/siyaq.mjs validate carousel.json          فحص الملف والأصول والخطوط بدون رسم
  node scripts/siyaq.mjs verify DIR                      إعادة رسم المصدر القابل للتعديل ومقارنته بالصور
  node scripts/siyaq.mjs analyze-ref image.jpg           تحليل صورة مرجعية (ألوان، سطوع، كثافة)
  node scripts/siyaq.mjs font-check font.ttf --text "…" فحص خط مرفوع ودعمه للحروف
  node scripts/siyaq.mjs save-style my-style.json        حفظ نمط مخصص لإعادة الاستخدام
  node scripts/siyaq.mjs list styles|traits|platforms|layouts|fonts|icons|continuity
  node scripts/siyaq.mjs doctor                          فحص الاعتماديات
  node scripts/siyaq.mjs init DIR                        إنشاء carousel.json مثال`;

const o = args(process.argv.slice(2));
const cmd = o._[0];
const map = { render: cmdRender, validate: cmdValidate, verify: cmdVerify, list: cmdList, 'save-style': cmdSaveStyle, 'font-check': cmdFontCheck, doctor: cmdDoctor, 'analyze-ref': cmdAnalyzeRef, init: cmdInit, welcome: () => log(WELCOME) };
if (!cmd || !map[cmd]) { log(HELP); process.exit(cmd ? 1 : 0); }
try { await map[cmd](o); } catch (e) {
  if (e instanceof SiyaqError) { console.error(`❌ [${e.code}] ${e.message}`); process.exitCode = 2; }
  else { console.error(e); process.exitCode = 3; }
}
