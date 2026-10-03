// Spec → per-slide editable HTML documents (source/slide-XX.html) with locally loaded fonts & assets.
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { readJSON, REGISTRY, ASSETS, SiyaqError, esc, pad2, exists } from './util.mjs';
import { md, visibleText, toArabicDigits } from './text.mjs';
import { resolveTheme } from './theme.mjs';
import { resolveFont, fontFaceCss, copyFonts, missingGlyphs, fallbackFont } from './fonts.mjs';
import { AssetStore } from './assets.mjs';
import { BUILDERS, slideStrings } from './layouts.mjs';
import { decorFor } from './decor.mjs';
import { buildContinuity, bandFor } from './continuity.mjs';

export const loadPlatforms = () => readJSON(path.join(REGISTRY, 'platforms.json'));
export const loadIcons = () => readJSON(path.join(REGISTRY, 'icons.json'));

export function resolveCanvas(canvas = {}) {
  const reg = loadPlatforms();
  if (canvas.platform) {
    const key = String(canvas.platform).toLowerCase();
    const p = reg.platforms.find((x) => x.id === key || x.aliases.some((a) => a.toLowerCase() === key));
    if (!p) throw new SiyaqError('PLATFORM_UNKNOWN', `المنصة «${canvas.platform}» غير موجودة في السجل. المتاح: ${reg.platforms.map((x) => x.id).join('، ')}، أو حدد width وheight.`);
    return { id: p.id, name_ar: p.name_ar, W: p.width, H: p.height, safe: { ...p.safe, ...(canvas.safe || {}) }, maxSlides: p.maxSlides, notes_ar: p.notes_ar, custom: false };
  }
  if (canvas.width != null || canvas.height != null) {
    const W = Number(canvas.width), H = Number(canvas.height), c = reg.custom;
    const errs = [];
    if (!Number.isInteger(W) || !Number.isInteger(H)) errs.push('العرض والارتفاع يجب أن يكونا أعدادًا صحيحة بالبكسل');
    else {
      if (W < c.minSide || H < c.minSide) errs.push(`أصغر ضلع مسموح ${c.minSide} بكسل`);
      if (W > c.maxSide || H > c.maxSide) errs.push(`أكبر ضلع مسموح ${c.maxSide} بكسل`);
      if (W * H > c.maxPixels) errs.push('عدد البكسلات كبير جدًا');
      if (Math.max(W, H) / Math.min(W, H) > 4) errs.push('النسبة بين الضلعين أكبر من 4:1 وتصعب قراءة التصميم');
    }
    if (errs.length) throw new SiyaqError('CANVAS_INVALID', `المقاس المخصص ${canvas.width}×${canvas.height} غير صالح: ${errs.join('، ')}.`);
    const d = Math.round(Math.min(W, H) * 0.045);
    return { id: 'custom', name_ar: `مقاس مخصص ${W}×${H}`, W, H, safe: { top: d, right: d, bottom: d, left: d, ...(canvas.safe || {}) }, maxSlides: canvas.maxSlides || null, notes_ar: c.notes_ar, custom: true };
  }
  throw new SiyaqError('PLATFORM_MISSING', 'المنصة أو المقاس غير محدد. اسأل المستخدم سؤالًا واحدًا: وين بتنشر؟ (إنستقرام 1080×1350 / مربع 1080×1080 / تيك توك أو ستوري 1080×1920 / مقاس مخصص).');
}

const FIT = { cover: { fill: 0.8, maxK: 1.3 }, statement: { fill: 0.72, maxK: 1.45 }, quote: { fill: 0.75, maxK: 1.4 }, cta: { fill: 0.84, maxK: 1.25 }, stat: { fill: 0.82, maxK: 1.3 }, comparison: { fill: 0.86, maxK: 1.22 } };
const PLACEHOLDER = /(lorem|ipsum|placeholder|todo|tbd|xxx+|\{\{|\}\}|\[\[|اكتب هنا|نص هنا|عنوان هنا|نص تجريبي|نص بديل|ضع .* هنا)/i;

export async function buildCarousel(spec, { specDir, outDir, only = null, mode = 'final' }) {
  const warnings = [], errors = [];
  if (!Array.isArray(spec.slides) || !spec.slides.length) throw new SiyaqError('NO_SLIDES', 'الملف لا يحتوي على شرائح (slides).');
  const canvas = resolveCanvas(spec.canvas);
  const { W, H } = canvas;
  const u = Math.min(W, H) / 1080;
  const n = spec.slides.length;
  if (canvas.maxSlides && n > canvas.maxSlides) warnings.push({ code: 'PLATFORM_SLIDE_LIMIT', msg: `عدد الشرائح ${n} أكبر من الحد الشائع للمنصة (${canvas.maxSlides}). سأصدّر كل الشرائح وأقسمها في ملفات ZIP على دفعات من ${canvas.maxSlides} للنشر.` });
  const dir = spec.meta?.dir || 'rtl';
  const lang = spec.meta?.lang || (dir === 'rtl' ? 'ar' : 'en');
  const numerals = spec.meta?.numerals || 'latn';
  const theme = resolveTheme(spec, specDir);
  warnings.push(...theme.warnings);
  const t = theme.tokens;

  // fonts: brand overrides > style
  const bf = spec.brand?.fonts || {};
  const fonts = {
    head: resolveFont(bf.heading || t.headFont, specDir, 'العناوين'),
    body: resolveFont(bf.body || t.bodyFont, specDir, 'النص'),
    accent: resolveFont(bf.accent || (bf.heading && !bf.accent ? bf.heading : t.accentFont), specDir, 'التسميات'),
  };
  // Latin-only accent fonts must not be used for Arabic labels: browser falls back per glyph to the next family (body font).
  const fb = fallbackFont();
  const sourceDir = path.join(outDir, mode === 'preview' ? 'preview/source' : 'source');
  fs.mkdirSync(sourceDir, { recursive: true });
  const allFonts = [...new Set([fonts.head, fonts.body, fonts.accent, fb])];
  copyFonts(allFonts, sourceDir);
  for (const f of ['base.css', 'styles.css']) fs.copyFileSync(path.join(ASSETS, 'css', f), path.join(sourceDir, f));
  fs.writeFileSync(path.join(sourceDir, 'fonts.css'), fontFaceCss(allFonts));

  // glyph coverage per role before rendering (uploaded fonts are never silently replaced)
  const roleText = { head: [], body: [], accent: [] };
  spec.slides.forEach((s) => slideStrings(s).forEach((x) => { roleText.head.push(visibleText(x)); roleText.body.push(visibleText(x)); }));
  const fontReport = [];
  for (const [role, f] of Object.entries(fonts)) {
    const text = numerals === 'arab' ? toArabicDigits(roleText[role === 'accent' ? 'head' : role].join(' ')) : roleText[role === 'accent' ? 'head' : role].join(' ');
    const miss = missingGlyphs(f.font, text).filter((ch) => !/\p{Extended_Pictographic}/u.test(ch));
    const latinOnly = !f.scripts.includes('arabic');
    const arabicMiss = miss.filter((ch) => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(ch));
    fontReport.push({ role, family: f.family, user: f.user, file: f.faces.map((x) => path.basename(x.abs)), missing: miss.slice(0, 40), missingCount: miss.length });
    if (f.user && miss.length) {
      const msg = `الخط المرفوع «${f.family}» (${role === 'head' ? 'العناوين' : role === 'body' ? 'النص' : 'التسميات'}) لا يحتوي على ${miss.length} حرف/رمز مستخدم في النص: ${miss.slice(0, 20).join(' ')}`;
      if (f.allowFallback) warnings.push({ code: 'USER_FONT_FALLBACK', msg: `${msg}. سمحتَ بالبديل، لذلك هذه الحروف فقط ستظهر بخط Cairo وسأذكر ذلك في التقرير.` });
      else errors.push({ code: 'USER_FONT_MISSING_GLYPHS', msg: `${msg}. لن أستبدله بصمت؛ اختر: (1) خطًا آخر، (2) السماح بالبديل لهذه الحروف فقط (allowFallback)، (3) تعديل النص.` });
    } else if (latinOnly && role !== 'accent' && arabicMiss.length) {
      errors.push({ code: 'FONT_NO_ARABIC', msg: `الخط «${f.family}» لاتيني فقط ولا يصلح للنص العربي في دور ${role}.` });
    }
  }

  // assets
  const assets = new AssetStore(specDir, sourceDir, spec.assets || {});
  const icons = loadIcons().icons;
  const iconCache = {};
  const readIcon = (file) => (iconCache[file] ||= fs.readFileSync(file, 'utf8').replace(/<!--.*?-->/gs, '').replace('<svg ', '<svg aria-hidden="true" '));
  const brandIcon = (k) => { const ic = icons[k]; if (!ic) { warnings.push({ code: 'ICON_UNKNOWN', msg: `لا توجد أيقونة للمنصة «${k}»؛ أضفها إلى registry/icons.json.` }); return ''; } return readIcon(path.join(ASSETS, 'icons', ic.file)); };
  const uiIcon = (name) => { const f = path.join(ASSETS, 'icons', 'ui', `${name}.svg`); return exists(f) ? readIcon(f) : ''; };
  const num = (k) => (numerals === 'arab' ? toArabicDigits(pad2(k)) : pad2(k));

  // continuity
  let cont = null;
  if (spec.continuity?.type) {
    let panoramaRel = null;
    if (spec.continuity.type === 'panorama') {
      const a = await assets.get(spec.continuity.image);
      panoramaRel = a.rel;
      if (a.width < W * n * 0.6) warnings.push({ code: 'PANORAMA_LOWRES', msg: `الصورة البانورامية عرضها ${a.width}px بينما الشريط الكامل ${W * n}px؛ ستُكبّر وقد تفقد حدّتها.` });
    }
    cont = buildContinuity(spec.continuity, { W, H, n, u, tokens: t, numFn: num, panoramaRel });
    if (cont?.svgStrip) fs.writeFileSync(path.join(sourceDir, 'continuity-strip.svg'), cont.svgStrip);
  }
  const band = cont ? (cont.band || 0) : 0;

  const brand = spec.brand || {};
  const logo = brand.logo ? await assets.get(brand.logo) : null;
  if (logo && (logo.width < 200 && logo.format !== 'svg')) warnings.push({ code: 'LOGO_LOWRES', msg: `الشعار صغير (${logo.width}px)؛ قد يظهر غير حاد. يفضل PNG شفاف ≥ 500px أو SVG.` });
  const chrome = { counter: true, swipeHint: true, handle: 'all', logo: 'all', ...(spec.chrome || {}) };
  const primaryHandle = (brand.handles || [])[0];

  const m = (t.margin || 80) * u;
  const ins = {
    t: Math.max(m, canvas.safe.top) + (cont && cont.zoneTop ? band : 0),
    r: Math.max(m, canvas.safe.right), l: Math.max(m, canvas.safe.left),
    b: Math.max(m, canvas.safe.bottom, cont && !cont.zoneTop ? band + 20 * u : 0),
  };
  if (cont && !cont.zoneTop && band + 20 * u > canvas.safe.bottom && band + 20 * u > m) { /* reserve band */ }

  const fontsCss = { '--f-head': `"${fonts.head.cssFamily}"`, '--f-body': `"${fonts.body.cssFamily}"`, '--f-accent': `"${fonts.accent.cssFamily}", "${fonts.body.cssFamily}"`, '--f-fallback': `"${fb.cssFamily}"` };
  const vars = {
    '--W': `${W}px`, '--H': `${H}px`, '--u': `${u}px`, '--k': 1, '--ts': t.titleScale ?? 1,
    '--bg': t.bg, '--bg2': t.bg2, '--surface': t.surface, '--surface-ink': t.surfaceInk, '--ink': t.ink, '--muted': t.muted, '--accent': t.accent, '--accent-text': t.accentText, '--accent-large': t.accentLarge,
    '--accent-ink': t.accentInk, '--accent2': t.accent2, '--accent2-ink': t.accent2Ink, '--line': t.line,
    '--w-head': t.headWeight, '--w-body': t.bodyWeight, '--lh-head': t.lhHead, '--lh-body': t.lhBody, '--radius': t.radius ?? 24,
    '--in-t': `${ins.t}px`, '--in-r': `${ins.r}px`, '--in-b': `${ins.b}px`, '--in-l': `${ins.l}px`, ...fontsCss,
  };
  const rootCss = `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
  fs.writeFileSync(path.join(sourceDir, 'theme.css'), rootCss + '\n' + (theme.style.id === 'photo' ? '' : '') + (spec.css || ''));

  const fitScript = fs.readFileSync(path.join(ASSETS, 'js', 'fit.js'), 'utf8');
  const docs = [];
  for (let i = 0; i < n; i++) {
    if (only && !only.includes(i + 1)) continue;
    const s = spec.slides[i];
    const layout = s.layout || 'statement';
    const builder = BUILDERS[layout];
    if (!builder) throw new SiyaqError('LAYOUT_UNKNOWN', `القالب «${layout}» في الشريحة ${i + 1} غير معروف. المتاح: ${Object.keys(BUILDERS).join('، ')}`);
    for (const str of slideStrings(s)) if (PLACEHOLDER.test(str)) errors.push({ code: 'PLACEHOLDER_TEXT', slide: i + 1, msg: `الشريحة ${i + 1} تحتوي نصًا يشبه النص المؤقت: «${str.slice(0, 50)}»` });
    for (const str of slideStrings(s)) if (/https?:\/\//.test(str) && !spec.allowUrlsInSlides && layout !== 'cta') warnings.push({ code: 'URL_IN_SLIDE', slide: i + 1, msg: `الشريحة ${i + 1} تحتوي رابطًا؛ الروابط في الصور غير قابلة للنقر ويفضل وضع المصادر في sources.md.` });
    const ctx = {
      i, n, spec, slide: s, canvas, unit: u, icons, brandIcon, uiIcon, num,
      md: (x) => md(x, { dir, numerals }),
      asset: async (ref) => { if (!ref) throw new SiyaqError('ASSET_REQUIRED', `الشريحة ${i + 1} (${layout}) تحتاج صورة.`); return assets.get(ref); },
      qrSvg: async (url) => {
        if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url)) throw new SiyaqError('QR_URL', `رابط QR غير صالح: ${url}. لا أنشئ QR إلا لرابط حقيقي يقدمه المستخدم.`);
        return QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
      },
    };
    const out = await builder(s, ctx);
    const isLast = i === n - 1;
    const ctaWithLogo = layout === 'cta' && logo && s.logo !== false;
    const showLogo = logo && (chrome.logo === 'all' || (chrome.logo === 'first-last' && (i === 0 || isLast)) || (chrome.logo === 'first' && i === 0)) && layout !== 'cta';
    const brandHtml = showLogo ? `<div class="brandmark" data-brand="logo"><img src="${esc(logo.rel)}" data-asset="logo" data-nw="${logo.width}" data-nh="${logo.height}" alt=""></div>`
      : (brand.name && brand.showName !== false && !ctaWithLogo ? `<div class="brandmark tx" data-f="brand.name" data-brand="name">${md(brand.name, { dir, numerals: 'latn' })}</div>` : '<div></div>');
    const counter = chrome.counter ? `<div class="counter tx" data-f="counter"><b>${num(i + 1)}</b> / ${num(n)}</div>` : '';
    const swipe = chrome.swipeHint && !isLast ? `<div class="swipe tx" data-f="swipe">${esc(chrome.swipeText || 'اسحب')}${uiIcon('arrow-left')}</div>` : '';
    const handleHtml = primaryHandle && chrome.handle === 'all' && layout !== 'cta' ? `<div class="handle-mini tx" data-f="handle">${brandIcon(primaryHandle.platform)}${md((icons[primaryHandle.platform]?.prefix === '@' && !String(primaryHandle.handle).startsWith('@') ? '@' : '') + primaryHandle.handle, { dir })}</div>` : '';
    const top = (brandHtml !== '<div></div>' || counter) ? `<header class="chrome chrome-top"><div class="start">${brandHtml}</div><div class="end">${counter}</div></header>` : '';
    const bottom = (handleHtml || swipe) ? `<footer class="chrome chrome-bottom"><div class="start">${handleHtml}</div><div class="end">${swipe}</div></footer>` : '';
    const decor = s.decor === false || spec.style?.decor === false ? '' : decorFor(theme.style.id, { W, H, u, i, n, t, seed: spec.style?.seed });
    const bodyClass = [`s-${theme.style.id}`, ...theme.traits.map((x) => `tr-${x}`), `layout-${layout}`, s.variant ? `v-${s.variant}` : '', out.bodyClass || '', s.className || ''].filter(Boolean).join(' ');
    const html = `<!DOCTYPE html>
<html lang="${esc(lang)}" dir="${esc(dir)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${W}, initial-scale=1">
<meta name="generator" content="siyaq-carousel">
<title>${esc(spec.meta?.title || 'carousel')} — ${i + 1}/${n}</title>
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="theme.css">
${s.css ? `<style>${s.css}</style>` : ''}
</head>
<body class="${esc(bodyClass)}" data-fill="${s.fill ?? FIT[layout]?.fill ?? 0.86}" data-max-k="${s.maxK ?? FIT[layout]?.maxK ?? 1.3}" data-min-k="${s.minK ?? 0.78}">
<div class="canvas" data-slide="${i + 1}">
  <div class="layer bg-layer">${decor}</div>
  ${out.bleed || ''}
  ${cont ? cont.html(i) : ''}
  <div class="layer trait-layer"></div>
  <div class="frame">
    ${top}
    <main class="stage">${out.stage}</main>
    ${bottom}
  </div>
</div>
<script>${fitScript}</script>
</body>
</html>`;
    const file = path.join(sourceDir, `slide-${pad2(i + 1)}.html`);
    fs.writeFileSync(file, html);
    docs.push({ index: i + 1, file, layout, exact: !!(s.exact ?? spec.exact) });
  }
  // the editable source package is a user download: research records (sources, notes, hook candidates) stay internal
  const { sources: _s, userProvidedFacts: _u, research: _r, ...publicSpec } = spec;
  const { hook: _h, ...publicMeta } = spec.meta || {};
  fs.writeFileSync(path.join(sourceDir, 'carousel.json'), JSON.stringify({ ...publicSpec, ...(spec.meta ? { meta: publicMeta } : {}) }, null, 2));
  if (mode !== 'preview') { const internal = path.join(outDir, '_internal'); fs.mkdirSync(internal, { recursive: true }); fs.writeFileSync(path.join(internal, 'carousel.json'), JSON.stringify(spec, null, 2)); }
  return { spec, canvas, theme, fonts, fontReport, assets: assets.used, docs, warnings, errors, n, u, band, cont, sourceDir, numerals, dir };
}
