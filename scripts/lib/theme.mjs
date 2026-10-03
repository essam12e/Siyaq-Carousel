// Resolve style preset + palette + traits + custom style + brand identity → design tokens.
import path from 'node:path';
import os from 'node:os';
import { readJSON, REGISTRY, exists, SiyaqError, parseColor, contrast, bestInk, mix, isDark, toHex } from './util.mjs';

export const loadStyles = () => readJSON(path.join(REGISTRY, 'styles.json'));
export const userStylesDir = () => process.env.SIYAQ_STYLES_DIR || path.join(os.homedir(), '.siyaq-carousel', 'styles');

export function findCustomStyle(ref, baseDir) {
  const candidates = [path.resolve(baseDir, ref), path.join(userStylesDir(), ref), path.join(userStylesDir(), `${ref}.json`)];
  for (const c of candidates) if (exists(c) && c.endsWith('.json')) return { file: c, data: readJSON(c) };
  throw new SiyaqError('STYLE_NOT_FOUND', `لم أجد النمط المخصص «${ref}». احفظه أولًا بأمر save-style أو مرّر مسار ملف JSON.`);
}

/**
 * @returns {{style, tokens, traits, warnings, sources}}
 */
export function resolveTheme(spec, baseDir) {
  const reg = loadStyles();
  const st = spec.style || {};
  const warnings = [];
  let custom = null;
  if (st.custom) custom = findCustomStyle(st.custom, baseDir).data;
  const presetId = st.preset || custom?.base || 'editorial';
  const style = reg.styles.find((s) => s.id === presetId);
  if (!style) throw new SiyaqError('STYLE_UNKNOWN', `النمط «${presetId}» غير موجود. الأنماط المتاحة: ${reg.styles.map((s) => s.id).join('، ')}`);

  let tokens = { ...style.tokens };
  const paletteId = st.palette || custom?.palette;
  if (paletteId) {
    if (!style.palettes?.[paletteId]) warnings.push({ code: 'PALETTE_UNKNOWN', msg: `لوحة الألوان «${paletteId}» غير موجودة في نمط ${style.id}؛ استخدمت الافتراضية.` });
    else tokens = { ...tokens, ...style.palettes[paletteId] };
  }
  if (custom?.tokens) tokens = { ...tokens, ...custom.tokens };

  // traits: style defaults + custom + requested; drop incompatible combos with a warning
  const want = [...new Set([...(style.traits || []), ...(custom?.traits || []), ...(st.traits || [])])].filter((t) => ![...(st.removeTraits || []), ...(custom?.removeTraits || [])].includes(t));
  const traits = [];
  for (const t of want) {
    const def = reg.traits[t];
    if (!def) { warnings.push({ code: 'TRAIT_UNKNOWN', msg: `السمة «${t}» غير معروفة وتم تجاهلها.` }); continue; }
    const clash = traits.find((x) => def.incompatible.includes(x) || reg.traits[x].incompatible.includes(t));
    if (clash) {
      // the explicitly requested trait wins over the preset default
      if ((st.traits || []).includes(t) && !(st.traits || []).includes(clash)) { traits.splice(traits.indexOf(clash), 1); traits.push(t); warnings.push({ code: 'TRAIT_CONFLICT', msg: `السمة «${t}» تتعارض مع «${clash}» فاستبدلتها.` }); }
      else warnings.push({ code: 'TRAIT_CONFLICT', msg: `السمة «${t}» تتعارض مع «${clash}» وتم تجاهلها.` });
      continue;
    }
    traits.push(t);
  }

  // brand identity
  const bc = spec.brand?.colors || {};
  const sources = {};
  const setC = (k, v, src) => { if (v) { if (!parseColor(v)) throw new SiyaqError('BAD_COLOR', `اللون «${v}» غير صالح. استخدم صيغة HEX مثل #1A2B3C.`); tokens[k] = v; sources[k] = src; } };
  setC('accent', bc.primary || bc.accent, 'brand');
  setC('accent2', bc.secondary, 'brand');
  if (bc.background) { setC('bg', bc.background, 'brand'); if (!bc.background2) tokens.bg2 = mix(bc.background, isDark(bc.background) ? '#ffffff' : '#000000', 0.06); }
  setC('bg2', bc.background2, 'brand');
  setC('ink', bc.text, 'brand');
  setC('surface', bc.surface, 'brand');
  if (bc.background && !bc.text) {
    if (contrast(tokens.ink, tokens.bg) < 4.5) { tokens.ink = bestInk(tokens.bg, ['#121212', '#FFFFFF']); tokens.muted = mix(tokens.ink, tokens.bg, 0.35); tokens.line = tokens.ink; }
  }
  if (st.tokens) Object.assign(tokens, st.tokens);

  // derived tokens
  const opaque = (c) => (parseColor(c)?.a ?? 1) > 0.95;
  tokens.accentInk = tokens.accentInk || bestInk(tokens.accent, [tokens.ink, tokens.bg, '#111111', '#FFFFFF']);
  tokens.accent2Ink = tokens.accent2Ink || bestInk(tokens.accent2, [tokens.ink, tokens.bg, '#111111', '#FFFFFF']);
  tokens.surfaceInk = tokens.surfaceInk || (opaque(tokens.surface) ? bestInk(tokens.surface, [tokens.ink, '#111111', '#FFFFFF']) : tokens.ink);
  tokens.dark = isDark(tokens.bg);

  // accent used as text on bg? choose a readable variant
  if ((parseColor(tokens.bg)?.a ?? 1) > 0.95 && contrast(tokens.accent, tokens.bg) < 5.2) {
    let t = 0, c = tokens.accent;
    const target = tokens.dark ? '#ffffff' : tokens.ink;
    while (contrast(c, tokens.bg) < 5.2 && t < 0.95) { t += 0.08; c = mix(tokens.accent, target, t); }
    tokens.accentText = c;
    if (sources.accent === 'brand') warnings.push({ code: 'ACCENT_LOW_CONTRAST', msg: `لون هويتك ${tokens.accent} تباينه منخفض مع الخلفية للنصوص الصغيرة؛ استخدمت درجة أغمق/أفتح منه (${c}) للنصوص الملونة فقط، وأبقيت لونك الأصلي للأشكال والأزرار.` });
  } else tokens.accentText = tokens.accent;

  // large display text (≥56px at 1080) only needs 3:1, so keep the true accent there when it qualifies
  if ((parseColor(tokens.bg)?.a ?? 1) > 0.95) {
    let t = 0, c = tokens.accent; const target = tokens.dark ? '#ffffff' : tokens.ink;
    while (contrast(c, tokens.bg) < 3.4 && t < 0.95) { t += 0.05; c = mix(tokens.accent, target, t); }
    tokens.accentLarge = c;
  } else tokens.accentLarge = tokens.accentText;
  const ratio = contrast(tokens.ink, opaque(tokens.bg) ? tokens.bg : '#000');
  if (ratio < 4.5) warnings.push({ code: 'INK_LOW_CONTRAST', msg: `تباين النص مع الخلفية ${ratio.toFixed(2)}:1 أقل من 4.5:1.` });
  if (opaque(tokens.surface) && contrast(tokens.surfaceInk, tokens.surface) < 4.5) warnings.push({ code: 'SURFACE_LOW_CONTRAST', msg: 'تباين النص على البطاقات منخفض.' });

  return { style, tokens, traits, warnings, sources, customName: custom?.name_ar };
}

export function validateCustomStyle(data) {
  const reg = loadStyles();
  const errs = [];
  if (!data.id || !/^[a-z0-9-]+$/.test(data.id)) errs.push('id مطلوب بحروف لاتينية صغيرة وأرقام وشرطة');
  if (data.base && !reg.styles.find((s) => s.id === data.base)) errs.push(`base غير معروف: ${data.base}`);
  for (const [k, v] of Object.entries(data.tokens || {})) {
    if (['bg', 'bg2', 'surface', 'ink', 'muted', 'accent', 'accent2', 'line'].includes(k) && !parseColor(v)) errs.push(`لون غير صالح ${k}: ${v}`);
  }
  for (const t of data.traits || []) if (!reg.traits[t]) errs.push(`سمة غير معروفة: ${t}`);
  return errs;
}

export { toHex };
