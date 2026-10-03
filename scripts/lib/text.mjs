// Inline text markup → safe HTML with correct bidi isolation for Arabic.
// Markup:  **accent emphasis**   ==highlighter==   line breaks with \n
import { esc } from './util.mjs';

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
// numeric ranges with Latin digits (20–30%, 150-300): kept as one LTR, non-breaking run
const RANGE = /[+\-−]?\d[\d.,]*\s?[–—\-]\s?\d[\d.,]*(?:\s?%)?/y;
const PROTECT = [
  /https?:\/\/[^\s،؛]+/y,
  /www\.[^\s،؛]+/y,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]/y,
  /@[A-Za-z0-9_.]*[A-Za-z0-9_]/y,
  /\+?\d[\d \-]{6,}\d/y, // phone-like digit groups that would otherwise be reordered in RTL
  /[A-Za-z][A-Za-z0-9&'’+\-./#:]*(?:[ ][A-Za-z0-9][A-Za-z0-9&'’+\-./#:]*)*(?:[ ]?[%])?/y,
];

/** Split a plain string into [{t:'txt'|'ltr', v}] */
export function bidiSegments(s) {
  const out = [];
  let i = 0, buf = '';
  outer: while (i < s.length) {
    RANGE.lastIndex = i;
    const PHONE = /\+?\d[\d \-]{6,}\d/y; PHONE.lastIndex = i;
    const rm = (i === 0 || !/[\d.,]/.test(s[i - 1])) && !PHONE.test(s) ? RANGE.exec(s) : null;
    if (rm) {
      if (buf) { out.push({ t: 'txt', v: buf }); buf = ''; }
      out.push({ t: 'range', v: rm[0] }); i += rm[0].length; continue;
    }
    for (const re of PROTECT) {
      re.lastIndex = i;
      const m = re.exec(s);
      if (m && m[0].length > 0) {
        // keep sentence punctuation outside the isolated run
        let v = m[0];
        const trail = v.match(/[.,:;!?)]+$/);
        if (trail) v = v.slice(0, -trail[0].length);
        if (!v) break;
        if (buf) { out.push({ t: 'txt', v: buf }); buf = ''; }
        out.push({ t: 'ltr', v });
        i += v.length;
        continue outer;
      }
    }
    buf += s[i++];
  }
  if (buf) out.push({ t: 'txt', v: buf });
  return out;
}

function numeralize(s, numerals) {
  if (numerals !== 'arab') return s;
  return s.replace(/\d/g, (d) => AR_DIGITS[+d]).replace(/%/g, '٪').replace(/([٠-٩]),(?=[٠-٩])/g, '$1٬').replace(/([٠-٩])\.(?=[٠-٩])/g, '$1٫');
}

function plain(s, opts) {
  if (opts.dir === 'ltr') return esc(numeralize(s, opts.numerals)).replace(/\n/g, '<br>');
  return bidiSegments(s).map((seg) => seg.t === 'range'
    ? (opts.numerals === 'arab' ? `<span class="nw">${esc(numeralize(seg.v, 'arab'))}</span>` : `<bdi dir="ltr" class="ltr nw">${esc(seg.v)}</bdi>`)
    : seg.t === 'ltr'
    ? `<bdi dir="ltr" class="ltr">${esc(seg.v)}</bdi>`
    : esc(numeralize(seg.v, opts.numerals)).replace(/\n/g, '<br>')).join('');
}

/** Render inline markup. opts: {dir:'rtl'|'ltr', numerals:'latn'|'arab'} */
export function md(s, opts = {}) {
  if (s == null) return '';
  s = String(s);
  const o = { dir: opts.dir || 'rtl', numerals: opts.numerals || 'latn' };
  const re = /\*\*([^*]+)\*\*|==([^=]+)==/g;
  let out = '', last = 0, m;
  while ((m = re.exec(s))) {
    out += plain(s.slice(last, m.index), o);
    if (m[1] != null) out += `<strong class="em">${plain(m[1], o)}</strong>`;
    else out += `<mark class="hl">${plain(m[2], o)}</mark>`;
    last = re.lastIndex;
  }
  return out + plain(s.slice(last), o);
}

/** Plain visible text (markup removed) for QC and glyph checks */
export function visibleText(s) {
  return String(s ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/==([^=]+)==/g, '$1');
}

export const toArabicDigits = (s) => numeralize(String(s), 'arab');
