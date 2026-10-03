// Font registry + user font validation, glyph coverage and @font-face generation.
import fs from 'node:fs';
import path from 'node:path';
import * as fontkit from 'fontkit';
import { readJSON, REGISTRY, ASSETS, SiyaqError, exists } from './util.mjs';

let _reg;
export const fontRegistry = () => (_reg ||= readJSON(path.join(REGISTRY, 'fonts.json')));
const FALLBACK_ID = 'cairo';

const MAGIC = [
  ['ttf', [0x00, 0x01, 0x00, 0x00]], ['ttf', [0x74, 0x72, 0x75, 0x65]], ['otf', [0x4f, 0x54, 0x54, 0x4f]],
  ['woff', [0x77, 0x4f, 0x46, 0x46]], ['woff2', [0x77, 0x4f, 0x46, 0x32]],
];
export function sniffFont(file) {
  const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
  for (const [fmt, m] of MAGIC) if (m.every((x, i) => b[i] === x)) return fmt;
  return null;
}
const CSS_FORMAT = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };

/** Validate a user-supplied font file. Returns {ok, format, family, glyphCount, arabic, errors[]} */
export function inspectFontFile(file) {
  const res = { file, ok: false, errors: [] };
  if (!exists(file)) { res.errors.push('الملف غير موجود'); return res; }
  const size = fs.statSync(file).size;
  if (size < 1000) { res.errors.push('حجم الملف صغير جدًا ليكون خطًا صالحًا'); return res; }
  if (size > 30 * 1024 * 1024) { res.errors.push('حجم الخط أكبر من 30MB'); return res; }
  const fmt = sniffFont(file);
  if (!fmt) { res.errors.push('صيغة غير مدعومة. الصيغ المدعومة: TTF وOTF وWOFF وWOFF2'); return res; }
  try {
    let font = fontkit.openSync(file);
    if (font.fonts) font = font.fonts[0]; // collections
    res.format = fmt; res.family = font.familyName; res.fullName = font.fullName; res.glyphCount = font.numGlyphs;
    res.arabic = font.hasGlyphForCodePoint(0x0628) && font.hasGlyphForCodePoint(0x0644);
    res.latin = font.hasGlyphForCodePoint(0x41);
    res.variable = !!(font.variationAxes && font.variationAxes.wght);
    res.weight = res.variable ? `${font.variationAxes.wght.min} ${font.variationAxes.wght.max}` : String(font['OS/2']?.usWeightClass || 400);
    res.hasGsubArabic = !!font.GSUB?.scriptList?.some?.((s) => s.tag === 'arab');
    res.ok = true;
    res._font = font;
  } catch (e) { res.errors.push(`تعذّر قراءة الخط: ${e.message}`); }
  return res;
}

/** Characters in `text` that the font cannot render (ignores whitespace and bidi/control marks) */
export function missingGlyphs(font, text) {
  const miss = new Set();
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x20 || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0xfe0f || cp === 0x0640) continue;
    if (!font.hasGlyphForCodePoint(cp)) miss.add(ch);
  }
  return [...miss];
}

const _open = new Map();
function openReg(file) { if (!_open.has(file)) _open.set(file, fontkit.openSync(path.join(ASSETS, 'fonts', file))); return _open.get(file); }

/**
 * Resolve a font reference: registry id string, or {file, family?}.
 * Returns a descriptor {key, family, cssFamily, faces:[{src, weight, format}], user, font(fontkit), info}
 */
export function resolveFont(ref, baseDir, role) {
  const reg = fontRegistry();
  if (typeof ref === 'string') {
    const f = reg.fonts.find((x) => x.id === ref || x.family.toLowerCase() === ref.toLowerCase());
    if (!f) throw new SiyaqError('FONT_UNKNOWN', `الخط «${ref}» غير موجود في الخطوط المضمّنة. استخدم أمر list fonts أو أرفق ملف الخط.`);
    return { key: f.id, family: f.family, cssFamily: `sq-${f.id}`, user: false, license: f.license, licenseFile: f.licenseFile,
      faces: f.faces.map((x) => ({ abs: path.join(ASSETS, 'fonts', x.file), rel: `fonts/${x.file}`, weight: x.weight, format: 'truetype' })),
      font: openReg(f.faces.find((x) => x.weight.includes(' ') || x.weight === '700')?.file || f.faces[0].file), scripts: f.scripts };
  }
  if (ref && typeof ref === 'object' && ref.file) {
    const abs = path.resolve(baseDir, ref.file);
    const info = inspectFontFile(abs);
    if (!info.ok) throw new SiyaqError('FONT_INVALID', `خط ${role} المرفوع «${path.basename(abs)}» غير صالح: ${info.errors.join('، ')}. لن أستبدله بخط آخر بصمت.`);
    const id = 'user-' + (ref.id || info.family || path.basename(abs, path.extname(abs))).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '');
    const faces = [{ abs, rel: `fonts/${id}${path.extname(abs).toLowerCase()}`, weight: ref.weight ? String(ref.weight) : info.weight, format: CSS_FORMAT[info.format] }];
    for (const extra of ref.extraFiles || []) {
      const a2 = path.resolve(baseDir, extra.file); const i2 = inspectFontFile(a2);
      if (!i2.ok) throw new SiyaqError('FONT_INVALID', `ملف الخط «${path.basename(a2)}» غير صالح: ${i2.errors.join('، ')}`);
      faces.push({ abs: a2, rel: `fonts/${id}-${extra.weight || i2.weight}${path.extname(a2).toLowerCase()}`, weight: String(extra.weight || i2.weight), format: CSS_FORMAT[i2.format] });
    }
    return { key: id, family: info.family, cssFamily: `sq-${id}`, user: true, faces, font: info._font, info: { ...info, _font: undefined }, allowFallback: !!ref.allowFallback, scripts: [info.arabic && 'arabic', info.latin && 'latin'].filter(Boolean) };
  }
  throw new SiyaqError('FONT_REF', `مرجع خط غير صالح للدور ${role}.`);
}

export function fallbackFont() { return resolveFont(FALLBACK_ID, '.', 'fallback'); }

export function fontFaceCss(fonts) {
  const seen = new Set(); let css = '';
  for (const f of fonts) for (const face of f.faces) {
    const k = f.cssFamily + face.rel; if (seen.has(k)) continue; seen.add(k);
    // Latin-only companions must not supply the space glyph to Arabic runs (a monospace space would stretch Arabic word gaps)
    const range = f.scripts && !f.scripts.includes('arabic') ? 'unicode-range:U+0021-007E,U+00A0-024F,U+2010-2027,U+2030-205E,U+20AC;' : '';
    css += `@font-face{font-family:"${f.cssFamily}";src:url("${face.rel}") format("${face.format}");font-weight:${face.weight};font-style:normal;font-display:block;${range}}\n`;
  }
  return css;
}

/** Copy font files into the source folder */
export function copyFonts(fonts, sourceDir) {
  for (const f of fonts) for (const face of f.faces) {
    const dst = path.join(sourceDir, face.rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!exists(dst) || fs.statSync(dst).size !== fs.statSync(face.abs).size) fs.copyFileSync(face.abs, dst);
  }
}
