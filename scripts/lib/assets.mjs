// Image asset validation and copying (originals are copied byte-for-byte; never recompressed or recolored).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { SiyaqError, exists } from './util.mjs';

const OK_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif', 'avif', 'svg']); // formats Chromium can draw (TIFF/HEIC are not)

export async function inspectImage(abs) {
  if (!exists(abs)) throw new SiyaqError('ASSET_MISSING', `الملف غير موجود: ${abs}`);
  const buf = fs.readFileSync(abs);
  if (buf.length === 0) throw new SiyaqError('ASSET_EMPTY', `الملف فارغ: ${path.basename(abs)}`);
  let meta;
  try { meta = await sharp(buf).metadata(); } catch (e) {
    const hint = /heic|heif/i.test(abs) ? ' صيغة HEIC غير مدعومة؛ حوّل الصورة إلى JPG أو PNG.' : '';
    throw new SiyaqError('ASSET_UNREADABLE', `تعذّرت قراءة الصورة «${path.basename(abs)}».${hint}`);
  }
  if (!OK_FORMATS.has(meta.format)) throw new SiyaqError('ASSET_FORMAT', `صيغة الصورة «${meta.format}» غير مدعومة في «${path.basename(abs)}».`);
  if (meta.format === 'svg' && /<script|on\w+=/i.test(buf.toString('utf8'))) throw new SiyaqError('ASSET_UNSAFE', `ملف SVG «${path.basename(abs)}» يحتوي على سكربت؛ أرسله PNG.`);
  // effective orientation (EXIF 5-8 swaps axes)
  let { width, height } = meta;
  if (meta.orientation >= 5) [width, height] = [height, width];
  let transparentEdges = false;
  if (meta.hasAlpha && meta.format !== 'svg') {
    const { data, info } = await sharp(buf).rotate().resize(64, 64, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let edge = 0, clear = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (x > 1 && y > 1 && x < info.width - 2 && y < info.height - 2) continue;
      edge++; if (data[(y * info.width + x) * 4 + 3] < 20) clear++;
    }
    transparentEdges = clear / edge > 0.6;
  }
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  return { abs, format: meta.format, width, height, orientation: meta.orientation || 1, hasAlpha: !!meta.hasAlpha, transparentEdges, bytes: buf.length, hash };
}

export class AssetStore {
  constructor(baseDir, sourceDir, named = {}) { this.baseDir = baseDir; this.sourceDir = sourceDir; this.named = named; this.cache = new Map(); this.used = []; }
  async get(ref) {
    if (!ref) return null;
    const p = this.named[ref] || ref;
    const abs = path.resolve(this.baseDir, typeof p === 'object' ? p.file : p);
    if (this.cache.has(abs)) return this.cache.get(abs);
    const info = await inspectImage(abs);
    const ext = info.format === 'jpeg' ? '.jpg' : `.${info.format}`;
    const base = path.basename(abs, path.extname(abs)).replace(/[^\w؀-ۿ-]+/g, '-').slice(0, 40) || 'img';
    info.rel = `assets/${base}-${info.hash}${ext}`;
    const dst = path.join(this.sourceDir, info.rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!exists(dst)) fs.copyFileSync(abs, dst);
    info.ref = ref;
    if (typeof p === 'object') Object.assign(info, { focus: p.focus, kind: p.kind });
    this.cache.set(abs, info); this.used.push(info);
    return info;
  }
}
