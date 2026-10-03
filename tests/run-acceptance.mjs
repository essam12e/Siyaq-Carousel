#!/usr/bin/env node
// اختبارات القبول A–M لسياق كاروسيل: تشغيل فعلي للمُصيّر ثم فحص الملفات الناتجة نفسها.
// الاستخدام: node tests/run-acceptance.mjs [OUT_DIR]   (الافتراضي: ./test-output)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'test-output'));
const ACC = path.join(ROOT, 'tests', 'acceptance');
const CLI = path.join(ROOT, 'scripts', 'siyaq.mjs');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const STYLES = path.join(OUT, '_styles');
const env = { ...process.env, SIYAQ_STYLES_DIR: STYLES };

const run = (...a) => { const r = spawnSync(process.execPath, [CLI, ...a], { env, encoding: 'utf8', cwd: ROOT, maxBuffer: 64 << 20 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const readJ = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const zipNames = (f) => { const b = fs.readFileSync(f); const names = []; let i = b.length - 22; while (i > 0 && b.readUInt32LE(i) !== 0x06054b50) i--; let p = b.readUInt32LE(i + 16); const n = b.readUInt16LE(i + 10); for (let k = 0; k < n; k++) { const ln = b.readUInt16LE(p + 28), ex = b.readUInt16LE(p + 30), cm = b.readUInt16LE(p + 32); names.push(b.slice(p + 46, p + 46 + ln).toString('utf8')); p += 46 + ln + ex + cm; } return names; };

const results = [];
async function test(id, title, fn) {
  const checks = []; const t0 = Date.now();
  const ok = (cond, label, detail = '') => { checks.push({ ok: !!cond, label, detail: String(detail) }); return !!cond; };
  let error = null;
  try { await fn(ok); } catch (e) { error = e.stack || String(e); checks.push({ ok: false, label: 'استثناء أثناء الاختبار', detail: String(e.message || e) }); }
  const pass = checks.length > 0 && checks.every((c) => c.ok);
  results.push({ id, title, pass, seconds: +((Date.now() - t0) / 1000).toFixed(1), checks, error });
  console.log(`${pass ? '✅' : '❌'} ${id} ${title} (${checks.filter((c) => c.ok).length}/${checks.length})`);
  for (const c of checks) if (!c.ok) console.log(`    ✗ ${c.label} ${c.detail}`);
}

/** Render a spec and run the checks every finished carousel must pass. */
async function renderAndCheck(ok, name, specRel, extra = []) {
  const spec = path.join(ACC, specRel);
  const out = path.join(OUT, name);
  const r = run('render', spec, '--out', out, ...extra);
  fs.writeFileSync(path.join(OUT, `${name}.log`), r.out);
  ok(r.code === 0, 'أمر التصيير انتهى بنجاح (exit 0)', `exit=${r.code}`);
  const rep = readJ(path.join(out, 'qc-report.json'));
  const s = readJ(spec);
  const n = s.slides.length;
  ok(rep.pass, 'فحص الجودة الآلي بلا أخطاء', `errors=${rep.counts?.error}`);
  const pngs = fs.readdirSync(out).filter((f) => /^slide-\d+\.png$/.test(f)).sort();
  ok(pngs.length === n, `عدد الصور ${n}`, `found=${pngs.length}`);
  const { W, H } = rep.canvas;
  let dimsOk = true;
  for (const f of pngs) { const m = await sharp(path.join(out, f)).metadata(); if (m.width !== W || m.height !== H) dimsOk = false; }
  ok(dimsOk, `كل الصور بالأبعاد ${W}×${H} بالضبط`);
  const zips = rep.deliverables.zips || [];
  ok(zips.length >= 1 && zips.every((z) => fs.existsSync(z)), 'ملف ZIP للشرائح موجود');
  const mainZip = zips[0] ? zipNames(zips[0]) : [];
  ok(mainZip.length === n && mainZip.every((x) => /^slide-\d+\.png$/.test(x)), `ZIP الشرائح يحتوي ${n} صورة PNG فقط (بدون sources.md أو غيره)`, mainZip.join(','));
  ok(zips.flatMap(zipNames).every((x) => x.endsWith('.png')), 'كل ملفات ZIP للتحميل (ومنها الدفعات) صور فقط');
  ok(!fs.existsSync(path.join(out, 'sources.md')), 'لا يوجد sources.md ضمن ملفات التسليم');
  ok(rep.hook && rep.hook.text && rep.hook.words <= 12 && !rep.slides[0].issues.some((i) => /^HOOK_/.test(i.code)), 'الشريحة الأولى تبدأ بخطّاف قصير وبارز', rep.hook ? `«${rep.hook.text}» ${rep.hook.words} كلمات، ${rep.hook.fontSize}px` : 'لا يوجد');
  ok(rep.deliverables.sourcePackage && fs.existsSync(rep.deliverables.sourcePackage), 'حزمة المصدر القابلة للتعديل (HTML/CSS) موجودة');
  const htmls = fs.readdirSync(path.join(out, 'source')).filter((f) => /^slide-\d+\.html$/.test(f));
  ok(htmls.length === n, 'ملف HTML قابل للتعديل لكل شريحة');
  const all = rep.slides.flatMap((x) => x.issues);
  ok(!all.some((i) => ['SYSTEM_FONT_FALLBACK', 'USER_FONT_FALLBACK', 'FONT_LOAD_FAILED'].includes(i.code)), 'كل النصوص رُسمت بالخطوط المحددة (لا بديل نظام)');
  const htmlText = htmls.map((f) => fs.readFileSync(path.join(out, 'source', f), 'utf8')).join('\n');
  ok(!htmlText.includes('إحدى منتجات نطاق'), 'سطر «سياق كاروسيل إحدى منتجات نطاق» غير موجود في التصاميم');
  return { out, rep, spec: s, html: htmlText, pngs };
}

await test('—', 'رسالة الترحيب', async (ok) => {
  const r = run('welcome');
  const lines = r.out.trim().split('\n');
  ok(r.code === 0, 'الأمر يعمل');
  ok(lines[lines.length - 1] === 'سياق كاروسيل إحدى منتجات نطاق', 'السطر الأخير مطابق حرفيًا', lines[lines.length - 1]);
});

await test('A', 'كاروسيل عربي ٥ شرائح بدون هوية', async (ok) => {
  const spec = path.join(ROOT, 'examples', 'basic-ar', 'carousel.json');
  const rel = path.relative(ACC, spec);
  const { out, rep, html } = await renderAndCheck(ok, 'A-basic', rel);
  ok(rep.slides.length === 5, 'العدد الافتراضي ٥ شرائح');
  ok(!/class="logo|data-brand="logo/.test(html), 'لا يوجد شعار مخترع');
  ok(/dir="rtl"/.test(html), 'اتجاه RTL مفعّل');
  const v = run('verify', out);
  ok(v.code === 0, 'إعادة التصيير من المصدر تطابق الصور (اتساق التصدير)', v.out.split('\n').slice(-2).join(' '));
});

await test('B', 'ألوان هوية وشعار', async (ok) => {
  const { out, rep, html } = await renderAndCheck(ok, 'B-brand', 'B-brand/carousel.json');
  const theme = fs.readFileSync(path.join(out, 'source', 'theme.css'), 'utf8');
  ok(/#1F4D3A/i.test(theme) && /#C8963E/i.test(theme), 'ألوان الهوية مطبّقة في theme.css');
  ok(/data-brand="logo"|class="logo-big"/.test(html), 'الشعار ظاهر في الشرائح');
  ok(fs.readdirSync(path.join(out, 'source', 'assets')).some((f) => f.startsWith('logo')), 'ملف الشعار الأصلي منسوخ ضمن المصدر');
  ok(!rep.slides.flatMap((s) => s.issues).some((i) => i.code === 'QR_TOO_SMALL'), 'رمز QR بحجم قابل للمسح');
  ok(/data-qr="https:\/\/example.com\/menu"/.test(html), 'QR يشير للرابط الحقيقي المعطى فقط');
});

await test('C', 'خط عربي مرفوع من المستخدم', async (ok) => {
  const { rep } = await renderAndCheck(ok, 'C-font', 'C-font/carousel.json');
  ok(rep.fonts.every((f) => f.family === 'Mada' && f.user && f.missingCount === 0), 'خط Mada المرفوع مستخدم للعناوين والنص بدون حروف ناقصة');
  const used = new Set(rep.slides.flatMap((s) => s.text.flatMap((t) => t.used)));
  ok([...used].every((u) => /Mada|sq-/i.test(u)), 'المتصفح رسم النصوص بخط Mada فعليًا (CDP)', [...used].join(', '));
  const r2 = run('render', path.join(ACC, 'C2-font-latin-only', 'carousel.json'), '--out', path.join(OUT, 'C2-font-latin-only'));
  ok(r2.code === 2 && /USER_FONT_MISSING_GLYPHS|FONT_NO_ARABIC|لا يحتوي/.test(r2.out + fs.readFileSync(path.join(OUT, 'C2-font-latin-only', 'qc-report.json'), 'utf8')), 'خط بلا حروف عربية: يتوقف ويشرح بدل الاستبدال الصامت', `exit=${r2.code}`);
  ok(!fs.existsSync(path.join(OUT, 'C2-font-latin-only', 'slide-01.png')), 'لم تُصدَّر صور بخط بديل');
  const r3 = run('render', path.join(ACC, 'C3-font-corrupt', 'carousel.json'), '--out', path.join(OUT, 'C3-font-corrupt'));
  ok(r3.code === 2 && /FONT_/.test(r3.out), 'ملف خط تالف: يُرفض برسالة عربية', r3.out.trim().split('\n').pop());
});

await test('D', 'صورة منتج حقيقية مع الحفاظ على شكلها', async (ok) => {
  const { out, rep } = await renderAndCheck(ok, 'D-product', 'D-product/carousel.json');
  const orig = path.join(ROOT, 'tests', 'fixtures', 'espresso-cc0.png');
  const copied = fs.readdirSync(path.join(out, 'source', 'assets')).find((f) => f.startsWith('espresso'));
  ok(copied && sha1(path.join(out, 'source', 'assets', copied)) === sha1(orig), 'ملف المنتج الأصلي منسوخ بايت-ببايت (بدون تعديل)');
  const codes = rep.slides.flatMap((s) => s.issues.map((i) => i.code));
  ok(!codes.includes('IMAGE_DISTORTED') && !codes.includes('PRODUCT_CROPPED') && !codes.includes('PRODUCT_CLIPPED'), 'لا تمطيط ولا قص لصورة المنتج');
  // pixel check: the product region in the PNG matches the original photo scaled (same shape and colours)
  const { chromium } = await import('playwright');
  const b = await chromium.launch({ executablePath: process.env.SIYAQ_CHROME_PATH || undefined });
  const p = await b.newPage({ viewport: { width: rep.canvas.W, height: rep.canvas.H } });
  await p.goto(pathToFileURL(path.join(out, 'source', 'slide-02.html')).href);
  await p.waitForFunction(() => window.__siyaqFit && window.__siyaqFit.done);
  const r = await p.evaluate(() => { const i = document.querySelector('img.product'); const x = i.getBoundingClientRect(); return { x: x.left, y: x.top, w: x.width, h: x.height }; });
  await b.close();
  const m = await sharp(orig).metadata();
  ok(Math.abs(r.w / r.h - m.width / m.height) < 0.01, 'نسبة أبعاد المنتج محفوظة', `${(r.w / r.h).toFixed(3)} vs ${(m.width / m.height).toFixed(3)}`);
  const ix = Math.round(r.x + r.w * 0.1), iy = Math.round(r.y + r.h * 0.1), iw = Math.round(r.w * 0.8), ih = Math.round(r.h * 0.8);
  const a = await sharp(path.join(out, 'slide-02.png')).extract({ left: ix, top: iy, width: iw, height: ih }).removeAlpha().raw().toBuffer();
  const full = await sharp(orig).resize(Math.round(r.w), Math.round(r.h), { fit: 'fill' }).removeAlpha().png().toBuffer();
  const c = await sharp(full).extract({ left: ix - Math.round(r.x), top: iy - Math.round(r.y), width: iw, height: ih }).raw().toBuffer();
  let d = 0; for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - c[k]);
  const mae = d / a.length;
  ok(mae < 12, 'ألوان وتفاصيل المنتج مطابقة للأصل (متوسط فرق البكسل)', `MAE=${mae.toFixed(2)}`);
});

await test('E', 'وصف ستايل مخصص (محفوظ وقابل لإعادة الاستخدام)', async (ok) => {
  const s = run('save-style', path.join(ACC, 'E-custom-style', 'olive-clay.style.json'), '--dir', STYLES);
  ok(s.code === 0 && fs.existsSync(path.join(STYLES, 'olive-clay.json')), 'حفظ النمط المخصص', s.out.trim().split('\n').pop());
  const { out } = await renderAndCheck(ok, 'E-custom-style', 'E-custom-style/carousel.json');
  const st = readJ(path.join(ACC, 'E-custom-style', 'olive-clay.style.json'));
  const theme = fs.readFileSync(path.join(out, 'source', 'theme.css'), 'utf8');
  ok(Object.entries(st.tokens || {}).filter(([k]) => ['bg', 'ink', 'accent'].includes(k)).every(([, v]) => theme.toLowerCase().includes(String(v).toLowerCase())), 'ألوان النمط المخصص مطبّقة');
  const html = fs.readFileSync(path.join(out, 'source', 'slide-01.html'), 'utf8');
  ok((st.traits || []).every((t) => html.includes(`tr-${t}`)), 'سمات النمط المدموجة مفعّلة', (st.traits || []).join(','));
});

await test('F', 'تصميم موجّه بصورة مرجعية', async (ok) => {
  const ref = path.join(ROOT, 'tests', 'fixtures', 'reference-design.png');
  const a = run('analyze-ref', ref, '--out', path.join(OUT, 'F-reference-analysis.json'));
  ok(a.code === 0 && fs.existsSync(path.join(OUT, 'F-reference-analysis.json')), 'تحليل الصورة المرجعية (ألوان، كثافة، مساحات)');
  const an = readJ(path.join(OUT, 'F-reference-analysis.json'));
  const st = readJ(path.join(ACC, 'F-reference', 'grid-sun.style.json'));
  const close = (x, y) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const [A, B] = [p(x), p(y)]; return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) < 40; };
  ok(close(an.suggestedTokens.bg, st.tokens.bg) && close(an.suggestedTokens.accent, st.tokens.accent), 'ألوان النمط مستخرجة من المرجع', `${an.suggestedTokens.bg}/${an.suggestedTokens.accent} → ${st.tokens.bg}/${st.tokens.accent}`);
  run('save-style', path.join(ACC, 'F-reference', 'grid-sun.style.json'), '--dir', STYLES);
  await renderAndCheck(ok, 'F-reference', 'F-reference/carousel.json');
});

await test('G', 'عنصر بصري متصل عبر الشرائح', async (ok) => {
  for (const [name, rel] of [['G-continuity', 'G-continuity/carousel.json'], ['G2-scene', 'G2-scene/carousel.json']]) {
    const { rep } = await renderAndCheck(ok, name, rel);
    ok(rep.seams.length === rep.slides.length - 1 && rep.seams.every((s) => s.ok), `${name}: حواف العنصر المتصل متطابقة بين كل شريحتين`, rep.seams.map((s) => s.meanDiff).join(', '));
    ok(rep.deliverables.strip && fs.existsSync(rep.deliverables.strip), `${name}: صورة الشريط المتصل للمراجعة`);
  }
});

await test('H', 'موضوع مبني على بحث: المصادر سجل داخلي لا يُسلَّم تلقائيًا', async (ok) => {
  const { out, spec, rep } = await renderAndCheck(ok, 'H-research', 'H-research/carousel.json');
  ok(rep.slides.length === 5, 'مثال عربي من ٥ شرائح');
  const f = path.join(out, '_internal', 'sources.md');
  ok(fs.existsSync(f) && rep.internal?.sources === f, 'المصادر محفوظة داخليًا في _internal/sources.md');
  const md = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  ok(spec.sources.every((s) => md.includes(s.url) && md.includes(s.title)), 'كل مصدر بعنوانه ورابطه');
  ok(/تاريخ الوصول|accessed/i.test(md) && /2026-10-03/.test(md), 'تاريخ الوصول مذكور');
  ok(/الشريحة|شريحة/.test(md), 'ربط كل مصدر بالادعاء/الشريحة');
  ok(/درجة اليقين|عدم اليقين|ملاحظات/.test(md), 'توضيح حدود اليقين');
  const visible = rep.slides.flatMap((s) => s.text.map((t) => t.text)).join('\n');
  ok(!/https?:\/\/|who\.int/.test(visible), 'الروابط غير مطبوعة في الصور (النص المرئي المُقاس)');
  const zips = rep.deliverables.zips;
  ok(!zips.flatMap(zipNames).includes('sources.md'), 'sources.md غير موجود في ZIP الشرائح');
  ok(!Object.values(rep.deliverables).flat().some((x) => typeof x === 'string' && /sources\.md$/.test(x)), 'sources.md ليس ضمن قائمة الملفات المسلّمة');
  const srcZip = zipNames(rep.deliverables.sourcePackage);
  ok(!srcZip.some((x) => /sources\.md$|_internal/.test(x)), 'حزمة المصدر القابلة للتعديل بدون سجل المصادر');
  const pubSpec = readJ(path.join(out, 'source', 'carousel.json'));
  ok(!pubSpec.sources && !pubSpec.research && !pubSpec.meta?.hook, 'نسخة carousel.json في حزمة المصدر بدون بيانات البحث الداخلية');
  // export on explicit request only
  const ex = run('sources', out, '--to', path.join(OUT, 'H-sources-on-request.md'));
  ok(ex.code === 0 && fs.readFileSync(path.join(OUT, 'H-sources-on-request.md'), 'utf8') === md, 'أمر sources يصدّر المصادر عند طلب المستخدم فقط');
  // batched ZIPs (platform limit) carry images only
  const bdir = path.join(OUT, 'H-batched'); fs.mkdirSync(bdir, { recursive: true });
  const bspec = { ...spec, canvas: { width: 1080, height: 1350, maxSlides: 2 } };
  fs.writeFileSync(path.join(bdir, 'carousel.json'), JSON.stringify(bspec));
  const br = run('render', path.join(bdir, 'carousel.json'), '--out', path.join(bdir, 'out'));
  const brep = readJ(path.join(bdir, 'out', 'qc-report.json'));
  const parts = brep.deliverables.zips.filter((z) => /-part\d+\.zip$/.test(z));
  ok(br.code === 0 && parts.length === 3 && brep.deliverables.zips.flatMap(zipNames).every((x) => /^slide-\d+\.png$/.test(x)), 'ملفات الدفعات (part1–3) صور فقط بدون sources.md', brep.deliverables.zips.map((z) => path.basename(z) + ':' + zipNames(z).length).join(' '));
});

await test('N', 'خطّاف الغلاف: رفض العناوين العامة', async (ok) => {
  const dir = path.join(OUT, 'N-weak-hook'); fs.mkdirSync(dir, { recursive: true });
  const j = readJ(path.join(ROOT, 'examples', 'basic-ar', 'carousel.json'));
  j.slides[0].title = 'مقدمة عن تنظيم الوقت';
  fs.writeFileSync(path.join(dir, 'carousel.json'), JSON.stringify(j));
  const r = run('render', path.join(dir, 'carousel.json'), '--out', path.join(dir, 'out'));
  const rep = readJ(path.join(dir, 'out', 'qc-report.json'));
  ok(r.code === 1 && rep.slides[0].issues.some((i) => i.code === 'HOOK_GENERIC'), 'غلاف يبدأ بـ«مقدمة عن…» يُرفض (HOOK_GENERIC)');
  ok(!rep.deliverables.zips.length, 'لا يُنشأ ZIP لكاروسيل بخطّاف ضعيف');
});

await test('I', 'أبعاد مخصصة', async (ok) => {
  const { rep } = await renderAndCheck(ok, 'I-custom-size', 'I-custom-size/carousel.json');
  ok(rep.canvas.W === 1500 && rep.canvas.H === 1000, '1500×1000 كما طُلب');
  const r = run('render', path.join(ACC, 'I2-invalid-size', 'carousel.json'), '--out', path.join(OUT, 'I2-invalid-size'));
  ok(r.code === 2 && /CANVAS|الأبعاد|أبعاد/.test(r.out), 'أبعاد غير صالحة (100×5000) تُرفض مع شرح القيود', r.out.trim().split('\n').pop());
});

await test('J', 'أكثر من ٥ شرائح (١٢ شريحة)', async (ok) => {
  const { rep } = await renderAndCheck(ok, 'J-12-slides', 'J-12-slides/carousel.json');
  ok(rep.slides.length === 12, '١٢ شريحة بدون حد صامت');
  ok(rep.canvas.W === 1080 && rep.canvas.H === 1920, 'مقاس تيك توك 1080×1920');
});

await test('K', 'مسار المعاينة عند الطلب', async (ok) => {
  const spec = path.join(ACC, 'K-preview', 'carousel.json'), out = path.join(OUT, 'K-preview');
  const r = run('render', spec, '--out', out, '--preview', '--slides', '1');
  ok(r.code === 0, 'معاينة الغلاف فقط تعمل');
  const pv = path.join(out, 'preview');
  ok(fs.existsSync(path.join(pv, 'slide-01.png')) && !fs.existsSync(path.join(pv, 'slide-02.png')), 'المعاينة التزمت بالنطاق المطلوب (الغلاف فقط)');
  ok(!fs.readdirSync(pv).some((f) => f.endsWith('.zip')) && !fs.existsSync(path.join(out, 'slide-01.png')), 'لا تسليم نهائي قبل الموافقة');
  await renderAndCheck(ok, 'K-preview', 'K-preview/carousel.json');
});

await test('L', 'التسليم المباشر الافتراضي', async (ok) => {
  const { out } = await renderAndCheck(ok, 'L-direct', 'L-direct/carousel.json');
  ok(!fs.existsSync(path.join(out, 'preview')), 'لا توجد مرحلة معاينة أو موافقة');
});

await test('M', 'تعديل شريحة واحدة مع حفظ النسخ السابقة', async (ok) => {
  const dir = path.join(OUT, 'M-revision'); fs.mkdirSync(dir, { recursive: true });
  const spec = path.join(dir, 'carousel.json');
  fs.copyFileSync(path.join(ROOT, 'examples', 'basic-ar', 'carousel.json'), spec);
  const out = path.join(dir, 'out');
  ok(run('render', spec, '--out', out).code === 0, 'التصيير الأول');
  const before = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, sha1(path.join(out, `slide-0${i}.png`))]));
  const j = readJ(spec); j.slides[2].title = 'ثلاث عادات **تختصر** صباحك'; fs.writeFileSync(spec, JSON.stringify(j, null, 2));
  const r = run('render', spec, '--out', out, '--slides', '3');
  ok(r.code === 0, 'إعادة تصيير الشريحة ٣ فقط');
  const after = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, sha1(path.join(out, `slide-0${i}.png`))]));
  ok(before[3] !== after[3], 'الشريحة ٣ تغيّرت');
  ok([1, 2, 4, 5].every((i) => before[i] === after[i]), 'باقي الشرائح لم تُلمس (نفس البصمة)');
  const vdir = path.join(out, 'versions', 'slide-03');
  const v = fs.existsSync(vdir) ? fs.readdirSync(vdir) : [];
  ok(v.some((f) => f.endsWith('.png')) && v.some((f) => f.endsWith('.html')), 'النسخة السابقة محفوظة (PNG + HTML)', v.join(', '));
  const vp = v.find((f) => f.endsWith('.png'));
  ok(vp && sha1(path.join(vdir, vp)) === before[3], 'النسخة المحفوظة هي الصورة القديمة نفسها');
  const zips = readJ(path.join(out, 'qc-report.json')).deliverables.zips;
  ok(zips.flatMap(zipNames).filter((x) => x.endsWith('.png')).length === 5, 'ZIP بعد التعديل يحتوي الشرائح الخمس الحالية');
});

// ---------- report ----------
const passed = results.filter((r) => r.pass).length;
const meta = { date: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, passed, total: results.length };
fs.writeFileSync(path.join(OUT, 'test-report.json'), JSON.stringify({ meta, results }, null, 2));
const L = [`# تقرير اختبارات القبول — سياق كاروسيل`, '', `- التاريخ: ${meta.date}`, `- البيئة: Node ${meta.node} على ${meta.platform}`, `- النتيجة: **${passed} من ${results.length}** ناجحة`, '', '| الاختبار | الوصف | النتيجة | الفحوص |', '|---|---|---|---|'];
for (const r of results) L.push(`| ${r.id} | ${r.title} | ${r.pass ? '✅ ناجح' : '❌ فشل'} | ${r.checks.filter((c) => c.ok).length}/${r.checks.length} |`);
for (const r of results) {
  L.push('', `## ${r.id} — ${r.title}`, '');
  for (const c of r.checks) L.push(`- ${c.ok ? '✅' : '❌'} ${c.label}${c.detail ? ` — \`${c.detail.replace(/`/g, "'").slice(0, 160)}\`` : ''}`);
}
L.push('', '> كل فحص هنا ناتج عن تشغيل فعلي للمُصيّر وقراءة الملفات الناتجة (PNG/ZIP/HTML/تقارير QC)، وليس عن قراءة الكود.', '> الفحص البصري للتصميم (الجمال، التوازن) يتم بالنظر للصور الناتجة ولا يغني عنه هذا التقرير.');
fs.writeFileSync(path.join(OUT, 'test-report.md'), L.join('\n') + '\n');
console.log(`\n${passed}/${results.length} — ${path.join(OUT, 'test-report.md')}`);
process.exitCode = passed === results.length ? 0 : 1;
