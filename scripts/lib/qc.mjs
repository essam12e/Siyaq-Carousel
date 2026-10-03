// Automated QC on the rendered PNGs + in-page measurements. Visual inspection by the agent is still required.
import fs from 'node:fs';
import sharp from 'sharp';
import { contrast, parseColor, luminance } from './util.mjs';

const inside = (r, box, tol = 1) => r.x >= box.x - tol && r.y >= box.y - tol && r.x + r.w <= box.x + box.w + tol && r.y + r.h <= box.y + box.h + tol;
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

async function raw(png) { const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, W: info.width, H: info.height }; }

function sampleContrast(img, rect, textColor) {
  const tc = parseColor(textColor); if (!tc) return null;
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.W, Math.ceil(rect.x + rect.w)), y1 = Math.min(img.H, Math.ceil(rect.y + rect.h));
  const area = (x1 - x0) * (y1 - y0); if (area <= 0) return null;
  const stride = Math.max(1, Math.floor(Math.sqrt(area / 5000)));
  const L = [];
  for (let y = y0; y < y1; y += stride) for (let x = x0; x < x1; x += stride) {
    const o = (y * img.W + x) * 3; const r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
    const d = Math.hypot(r - tc.r, g - tc.g, b - tc.b);
    if (d > 70) L.push(luminance({ r, g, b }));
  }
  if (L.length < 20) return null;
  L.sort((a, b) => a - b);
  const lt = luminance(tc);
  const med = L[Math.floor(L.length / 2)];
  // worst case = background pixels closest in luminance to the text (10th percentile toward text)
  const toward = L.map((x) => Math.abs(x - lt)).sort((a, b) => a - b);
  const worstL = lt + (toward[Math.floor(toward.length * 0.1)] || 0) * (med > lt ? 1 : -1);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return { median: +ratio(lt, med).toFixed(2), worst: +ratio(lt, worstL).toFixed(2) };
}

export async function runQC(build, results, { allRendered }) {
  const { canvas, u } = build;
  const { W, H } = canvas;
  const safeBox = { x: canvas.safe.left, y: canvas.safe.top, w: W - canvas.safe.left - canvas.safe.right, h: H - canvas.safe.top - canvas.safe.bottom };
  const full = { x: 0, y: 0, w: W, h: H };
  const userFonts = Object.values(build.fonts).filter((f) => f.user);
  const famOf = Object.fromEntries(Object.values(build.fonts).map((f) => [f.cssFamily, f]));
  const slides = [];
  for (const r of results) {
    const issues = [];
    const add = (level, code, msg, extra) => issues.push({ level, code, msg, ...(extra || {}) });
    const m = r.measure;
    // file + dimensions
    if (!fs.existsSync(r.png)) add('error', 'PNG_MISSING', 'ملف PNG لم يُنشأ');
    else {
      const meta = await sharp(r.png).metadata();
      if (meta.width !== W || meta.height !== H) add('error', 'BAD_DIMENSIONS', `المقاس ${meta.width}×${meta.height} بدل ${W}×${H}`);
      r.bytes = fs.statSync(r.png).size;
    }
    for (const e of r.consoleErrors) add('error', 'LOAD_ERROR', `تعذر تحميل مورد: ${e}`);
    // fit / overflow
    if (!m.fit?.fitted) add('error', r.exact ? 'EXACT_TEXT_CONFLICT' : 'TEXT_OVERFLOW', r.exact ? 'النص المحدد حرفيًا لا يتسع بحجم مقروء؛ يحتاج قرارًا من المستخدم (تقسيم الشريحة أو تقليل النص).' : 'النص أطول من مساحة الشريحة حتى بعد التصغير للحد الأدنى؛ اختصر النص أو قسّمه على شريحتين.', { k: m.fit?.k });
    if (m.fit?.decorHidden) add('info', 'DECOR_HIDDEN', `أُخفي ${m.fit.decorHidden} عنصر زخرفي لأنه كان سيقع خلف نص.`);
    if (m.fit?.fitted && m.fit.k < 1) add('info', 'TEXT_SCALED', `صُغّر حجم الخط إلى ${Math.round(m.fit.k * 100)}% ليتسع النص (ضمن الحد المقروء).`, { k: m.fit.k });
    // fonts loaded
    for (const f of m.fonts) if (f.status === 'error') add('error', 'FONT_LOAD_FAILED', `فشل تحميل الخط ${f.family} (${f.weight})`);
    let img = null;
    try { img = await raw(r.png); } catch { /* reported above */ }
    for (const t of m.tx) {
      if (t.hidden || !t.text.trim()) continue;
      if (t.overflowX) add('error', 'TEXT_OVERFLOW_X', `نص يتجاوز عرض حاويته: «${t.text.slice(0, 40)}»`, { field: t.f });
      const tb = { x: Math.max(t.rect.x, t.box.x), y: Math.max(t.rect.y, t.box.y), w: Math.min(t.rect.x + t.rect.w, t.box.x + t.box.w) - Math.max(t.rect.x, t.box.x), h: Math.min(t.rect.y + t.rect.h, t.box.y + t.box.h) - Math.max(t.rect.y, t.box.y) };
      if (!inside(tb, full)) add('error', 'OUT_OF_BOUNDS', `نص خارج حدود الصورة: «${t.text.slice(0, 40)}»`, { field: t.f, rect: t.rect });
      else if (!inside(tb, safeBox, 2)) add('error', 'OUTSIDE_SAFE_AREA', `نص خارج المنطقة الآمنة للمنصة: «${t.text.slice(0, 40)}»`, { field: t.f, rect: t.rect });
      // font actually used
      const used = t.used || [];
      const sys = used.filter((x) => !x.custom);
      const emoji = sys.filter((x) => /emoji/i.test(x.family));
      const realSys = sys.filter((x) => !/emoji/i.test(x.family));
      if (realSys.length) add('error', 'SYSTEM_FONT_FALLBACK', `حروف ظهرت بخط النظام (${realSys.map((x) => x.family).join('، ')}) بدل الخط المحدد: «${t.text.slice(0, 40)}»`, { field: t.f });
      if (emoji.length) add('warn', 'EMOJI_SYSTEM_FONT', 'الإيموجي يظهر بخط الإيموجي الخاص بالنظام وقد يختلف شكله بين الأجهزة.', { field: t.f });
      const want = famOf[t.family];
      if (want?.user) {
        const other = used.filter((x) => x.custom && x.family !== want.family && x.glyphs > 0);
        if (other.length) add(want.allowFallback ? 'warn' : 'error', 'USER_FONT_FALLBACK', `بعض حروف «${t.text.slice(0, 30)}» ظهرت بخط ${other.map((x) => x.family).join('، ')} بدل خطك المرفوع ${want.family}.`, { field: t.f });
      }
      // contrast
      if (img) {
        const c = sampleContrast(img, t.rect, t.color);
        if (c) {
          const large = t.fontSize >= 56 * u;
          const need = large ? 3 : 4.5;
          t.contrast = c;
          if (c.median < Math.min(need, 2.2)) add('error', 'LOW_CONTRAST', `تباين ضعيف جدًا (${c.median}:1): «${t.text.slice(0, 40)}»`, { field: t.f, contrast: c });
          else if (c.median < need) add('warn', 'LOW_CONTRAST', `تباين أقل من الموصى (${c.median}:1 والمطلوب ${need}:1): «${t.text.slice(0, 40)}»`, { field: t.f, contrast: c });
        }
      }
    }
    // overlapping text blocks
    const blocks = m.tx.filter((t) => t.inStage && !t.hidden && t.text.trim());
    for (let a = 0; a < blocks.length; a++) for (let b = a + 1; b < blocks.length; b++) {
      const A = blocks[a], B = blocks[b];
      if (!A.f || !B.f || A.f.startsWith(B.f) || B.f.startsWith(A.f)) continue;
      const ov = inter(A.box, B.box); const small = Math.min(A.box.w * A.box.h, B.box.w * B.box.h) || 1;
      if (ov / small > 0.12) add('error', 'TEXT_OVERLAP', `نصان متداخلان: «${A.text.slice(0, 25)}» و«${B.text.slice(0, 25)}»`);
    }
    // logos, CTAs, QR inside safe area
    for (const el of m.important) if (el.rect.w > 0 && !inside(el.rect, safeBox, 2)) add('error', 'IMPORTANT_OUTSIDE_SAFE', `عنصر مهم (${el.kind}) خارج المنطقة الآمنة`, { rect: el.rect });
    for (const q of m.qr) { const min = Math.max(200, 0.2 * Math.min(W, H)); if (q.rect.w < min) add('error', 'QR_TOO_SMALL', `رمز QR صغير (${Math.round(q.rect.w)}px)؛ الحد الأدنى ${Math.round(min)}px ليُمسح بسهولة.`); }
    // images
    for (const im of m.imgs) {
      if (!im.ok) { add('error', 'IMAGE_NOT_LOADED', `الصورة لم تُحمّل: ${im.asset}`); continue; }
      if (im.asset === 'panorama') continue;
      const natAR = im.nw / im.nh, boxAR = im.rect.w / im.rect.h;
      let scale;
      if (im.fit === 'cover') scale = Math.max(im.rect.w / im.nw, im.rect.h / im.nh);
      else if (im.fit === 'contain') scale = Math.min(im.rect.w / im.nw, im.rect.h / im.nh);
      else { scale = im.rect.w / im.nw; if (Math.abs(natAR - boxAR) / natAR > 0.015) add('error', 'IMAGE_DISTORTED', `الصورة ${im.asset} ممطوطة (النسبة تغيرت)`); }
      if (scale > 2.2) add('error', 'IMAGE_UPSCALED', `الصورة ${im.asset} مكبرة ${scale.toFixed(1)}× عن دقتها الأصلية وستظهر مشوشة؛ أرسل نسخة أعلى دقة.`);
      else if (scale > 1.5) add('warn', 'IMAGE_UPSCALED', `الصورة ${im.asset} مكبرة ${scale.toFixed(1)}× عن دقتها الأصلية.`);
      if (/product/.test(im.cls)) {
        if (!inside(im.rect, full, 1)) add('error', 'PRODUCT_CLIPPED', 'صورة المنتج مقصوصة عند حافة الشريحة.');
        if (im.fit === 'cover') add('error', 'PRODUCT_CROPPED', 'صورة المنتج معروضة بقص (cover)؛ المنتج يجب أن يظهر كاملًا.');
      }
    }
    slides.push({ index: r.index, file: r.png, layout: r.layout, k: m.fit?.k, issues, text: m.tx.map((t) => ({ f: t.f, text: t.text, font: t.family, used: (t.used || []).map((x) => x.family), contrast: t.contrast, fontSize: t.fontSize })) });
  }
  // continuity seams (only when consecutive slides were rendered)
  const seams = [];
  if (build.cont && build.band > 0) {
    for (let k = 0; k + 1 < results.length; k++) {
      const a = results[k], b = results[k + 1]; if (b.index !== a.index + 1) continue;
      const y0 = build.cont.zoneTop ? 0 : H - build.band, h = build.band;
      const srcA = a.contShot || a.png, srcB = b.contShot || b.png;
      const colA = await sharp(srcA).extract({ left: W - 1, top: y0, width: 1, height: h }).ensureAlpha().raw().toBuffer();
      const colB = await sharp(srcB).extract({ left: 0, top: y0, width: 1, height: h }).ensureAlpha().raw().toBuffer();
      let diff = 0; for (let j = 0; j < colA.length; j++) diff += Math.abs(colA[j] - colB[j]);
      const mean = diff / colA.length;
      seams.push({ between: [a.index, b.index], meanDiff: +mean.toFixed(2), ok: mean < 14 });
    }
  }
  const global = [];
  if (allRendered && results.length !== build.n) global.push({ level: 'error', code: 'SLIDE_COUNT', msg: `عدد الصور ${results.length} لا يطابق عدد الشرائح ${build.n}` });
  for (const s of seams) if (!s.ok) global.push({ level: 'warn', code: 'SEAM_MISMATCH', msg: `حافة الاستمرارية بين الشريحتين ${s.between.join(' و')} غير متطابقة (فرق ${s.meanDiff})` });
  const all = [...global, ...slides.flatMap((s) => s.issues.map((i) => ({ ...i, slide: s.index })))];
  return { pass: !all.some((i) => i.level === 'error'), counts: { error: all.filter((i) => i.level === 'error').length, warn: all.filter((i) => i.level === 'warn').length }, global, seams, slides };
}
