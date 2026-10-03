// Content-driven slide layouts. Each returns {stage, bleed?, bodyClass?} HTML strings.
import { esc } from './util.mjs';

export const LAYOUTS = {
  cover: 'غلاف: عنوان رئيسي + تمهيد + سطر فرعي، اختياريًا صورة (variant: type | image | split | product)',
  statement: 'عبارة واحدة كبيرة (variant: start | center | quote)',
  list: 'قائمة عناصر مجمّعة (variant: stack | grid | check)',
  steps: 'خطوات متسلسلة بمسار مرقّم',
  comparison: 'مقارنة جنبًا إلى جنب أو قبل/بعد (variant: columns | stacked)',
  stat: 'إبراز رقم أو أرقام (variant: single | grid | bars)',
  quote: 'اقتباس حقيقي منسوب لقائله',
  product: 'المنتج هو البطل: صورة حقيقية + اسم + مزايا + سعر (variant: hero | side)',
  cta: 'دعوة لاتخاذ إجراء + الحسابات + التواصل + QR اختياري',
  image: 'صورة كبيرة مع عنوان/تعليق (variant: bleed | framed)',
  timeline: 'خط زمني بتواريخ',
  diagram: 'مخطط توضيحي (variant: cycle | flow)',
  html: 'HTML/CSS مخصص بالكامل (للحالات الخاصة)',
};

const T = (ctx, field, value, cls, tag = 'div') => {
  if (value == null || value === '') return '';
  return `<${tag} class="tx ${cls}" data-f="${esc(field)}">${ctx.md(value)}</${tag}>`;
};

function imgTag(a, cls, extra = '') {
  const pos = a.focus ? `object-position:${esc(a.focus)};` : '';
  if (/\bproduct\b/.test(cls) && a.format !== 'svg') extra += `max-width:min(90cqw, ${Math.round(a.width * 1.5)}px);max-height:min(90cqh, ${Math.round(a.height * 1.5)}px);`;
  return `<img src="${esc(a.rel)}" class="${cls}" data-asset="${esc(a.ref)}" data-nw="${a.width}" data-nh="${a.height}" style="${pos}${extra}" alt="">`;
}

const ICON_ALIASES = { check: 'check', x: 'xmark' };
const iconSvg = (ctx, name) => ctx.uiIcon(ICON_ALIASES[name] || name) || '';

// ------------------------------------------------------------------
async function cover(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const img = s.image ? await ctx.asset(s.image) : null;
  let variant = s.variant || (img ? (img.transparentEdges ? 'product' : 'image') : 'type');
  const head = (big) => `${T(ctx, `${p}.kicker`, s.kicker, 't-kicker f-accent')}
    ${T(ctx, `${p}.title`, s.title, `f-head ${big ? 't-display' : 't-h1'} balance`)}
    ${T(ctx, `${p}.subtitle`, s.subtitle, 't-lead muted pretty measure')}`;
  if (variant === 'image' && img) {
    return { bodyClass: 'has-bleed', bleed: `<div class="layer bleed">${imgTag(img, 'fit-cover', 'width:100%;height:100%;')}<div class="layer scrim-bottom"></div></div>`,
      stage: `<div class="spacer"></div><div class="stack gap-m on-image cover-text">${head(true)}</div>` };
  }
  if (variant === 'split' && img) {
    return { stage: `<div class="img-box grow cover-img" data-min="0.5">${imgTag(img, 'fit-cover')}</div><div class="stack gap-s cover-text" style="padding-top:calc(var(--u)*36)">${head(false)}</div>` };
  }
  if ((variant === 'product' || variant === 'split') && img) {
    return { stage: `<div class="stack gap-s cover-text">${head(false)}</div><div class="product-stage grow" data-min="${ctx.canvas.W / ctx.canvas.H >= 0.95 ? 0.48 : 0.36}"><div class="glow"></div><div class="pedestal"></div>${imgTag(img, `product ${img.transparentEdges ? 'alpha' : 'boxed'}`)}</div>` };
  }
  return { stage: `<div class="spacer"></div><div class="stack gap-m cover-text">${head(true)}</div><div class="spacer" style="flex-grow:.55!important"></div>`
    + (s.note ? T(ctx, `${p}.note`, s.note, 't-small muted') : '') };
}

function statement(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const v = s.variant || 'start';
  const q = v === 'quote' ? `<div class="qmark" aria-hidden="true">”</div>` : '';
  const size = (s.size || ((s.text || '').length > 90 ? 't-h2' : 't-h1'));
  return { bodyClass: v === 'center' ? 'v-center' : '', stage: `<div class="spacer"></div>
    <div class="stack gap-m ${v === 'center' ? 'center' : ''}">${q}
      ${T(ctx, `${p}.label`, s.label, 't-kicker f-accent')}
      ${T(ctx, `${p}.text`, s.text, `f-head ${size} balance`)}
      ${s.support ? `<div class="rule short" ${v === 'center' ? 'style="align-self:center"' : ''}></div>` : ''}
      ${T(ctx, `${p}.support`, s.support, 't-lead muted pretty measure')}
    </div><div class="spacer"></div>` };
}

function header(s, ctx, p) {
  return (s.kicker || s.title || s.intro) ? `<div class="stack gap-s section-head">${T(ctx, `${p}.kicker`, s.kicker, 't-kicker f-accent')}${T(ctx, `${p}.title`, s.title, 'f-head t-h2 balance')}${T(ctx, `${p}.intro`, s.intro, 't-body muted pretty')}</div>` : '';
}

function list(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const items = s.items || [];
  const v = s.variant || (items.length >= 4 && items.every((x) => !x.text || x.text.length < 60) ? 'grid' : 'stack');
  let body = '';
  if (v === 'grid') {
    body = `<div class="list-grid">${items.map((it, j) => `<div class="card">
      ${it.icon ? `<div class="ico">${iconSvg(ctx, it.icon)}</div>` : `<div class="badge-num">${ctx.num(j + 1)}</div>`}
      ${T(ctx, `${p}.items[${j}].title`, it.title, 'f-head t-h3')}${T(ctx, `${p}.items[${j}].text`, it.text, 't-small muted pretty')}</div>`).join('')}</div>`;
  } else if (v === 'check') {
    body = `<div class="stack gap-m">${items.map((it, j) => `<div class="check-item ${it.bad ? 'bad' : ''}"><div class="mark">${iconSvg(ctx, it.bad ? 'xmark' : 'check')}</div>
      <div class="stack gap-xs">${T(ctx, `${p}.items[${j}].title`, it.title, 'f-head t-h3')}${T(ctx, `${p}.items[${j}].text`, it.text, 't-body muted pretty')}</div></div>`).join('')}</div>`;
  } else {
    body = `<div class="list-stack">${items.map((it, j) => `<div class="item"><div class="badge-num">${it.icon ? iconSvg(ctx, it.icon) : ctx.num(j + 1)}</div>
      <div class="txt">${T(ctx, `${p}.items[${j}].title`, it.title, 'f-head t-h3')}${T(ctx, `${p}.items[${j}].text`, it.text, 't-body muted pretty')}</div></div>`).join('')}</div>`;
  }
  return { stage: `${header(s, ctx, p)}<div class="spacer" style="flex-grow:.6!important"></div>${body}<div class="spacer"></div>${T(ctx, `${p}.note`, s.note, 't-small muted')}` };
}

function steps(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const start = s.start || 1;
  return { stage: `${header(s, ctx, p)}<div class="spacer" style="flex-grow:.6!important"></div><div class="steps">${(s.steps || s.items || []).map((st, j) => `<div class="step">
    <div class="badge-num" style="position:relative">${ctx.num(start + j)}</div>
    <div class="txt">${T(ctx, `${p}.steps[${j}].title`, st.title, 'f-head t-h3')}${T(ctx, `${p}.steps[${j}].text`, st.text, 't-body muted pretty')}</div></div>`).join('')}</div><div class="spacer"></div>` };
}

function comparison(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const cols = [s.a || s.right || s.before, s.b || s.left || s.after].filter(Boolean);
  const longest = Math.max(0, ...[s.a, s.b].flatMap((c) => (c?.points || []).map((x) => String(x).length)));
  const stacked = ctx.canvas.W / ctx.canvas.H > 1.2 ? false : s.variant === 'stacked' || (!s.variant && ctx.canvas.W / ctx.canvas.H < 0.7 && longest > 30);
  const col = (c, j) => `<div class="col ${c.tone || (j === 0 ? 'bad' : 'good')}">
    ${T(ctx, `${p}.${j ? 'b' : 'a'}.label`, c.label, 'f-head t-h3')}
    ${c.text ? T(ctx, `${p}.${j ? 'b' : 'a'}.text`, c.text, 't-body pretty') : ''}
    ${(c.points || []).map((pt, k) => `<div class="check-item ${((c.tone || (j === 0 ? 'bad' : 'good')) === 'bad') ? 'bad' : ''}"><div class="mark">${iconSvg(ctx, ((c.tone || (j === 0 ? 'bad' : 'good')) === 'bad') ? 'xmark' : 'check')}</div>${T(ctx, `${p}.${j ? 'b' : 'a'}.points[${k}]`, pt, 't-body pretty')}</div>`).join('')}
  </div>`;
  return { stage: `${header(s, ctx, p)}<div class="spacer" style="flex-grow:.6!important"></div>
    <div class="compare ${stacked ? 'stacked' : ''} ${s.vs !== false ? 'has-vs' : ''}">${cols.map(col).join('')}${s.vs !== false ? `<div class="vs">${esc(s.vsLabel || 'VS')}</div>` : ''}</div><div class="spacer"></div>${T(ctx, `${p}.note`, s.note, 't-small muted')}` };
}

function stat(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const stats = s.stats || (s.value != null ? [{ value: s.value, label: s.label, note: s.note }] : []);
  const v = s.variant || (stats.length === 1 ? 'single' : 'grid');
  let body;
  if (v === 'bars') {
    const max = s.max || Math.max(...stats.map((x) => +x.amount || 0)) || 1;
    body = `<div class="bars">${stats.map((x, j) => `<div class="bar ${x.alt ? 'alt' : ''}"><div class="lbl">${T(ctx, `${p}.stats[${j}].label`, x.label, 't-body', 'span')}${T(ctx, `${p}.stats[${j}].value`, x.value, 'v t-body', 'span')}</div>
      <div class="track"><div class="fill" style="width:${Math.max(2, Math.min(100, (+x.amount / max) * 100)).toFixed(2)}%"></div></div></div>`).join('')}</div>`;
  } else if (v === 'single') {
    const x = stats[0] || {};
    body = `<div class="stack gap-s">${T(ctx, `${p}.stats[0].value`, x.value, 't-num')}${T(ctx, `${p}.stats[0].label`, x.label, 'f-head t-h2 balance')}${T(ctx, `${p}.stats[0].note`, x.note, 't-body muted pretty measure')}</div>`;
  } else {
    body = `<div class="stats n${Math.min(3, stats.length)}">${stats.map((x, j) => `<div class="stat">${T(ctx, `${p}.stats[${j}].value`, x.value, 't-num')}<div class="stack gap-xs">${T(ctx, `${p}.stats[${j}].label`, x.label, 'f-head t-h3')}${T(ctx, `${p}.stats[${j}].note`, x.note, 't-small muted pretty')}</div></div>`).join('')}</div>`;
  }
  return { stage: `${header(s, ctx, p)}<div class="spacer"></div>${body}<div class="spacer"></div>${T(ctx, `${p}.source`, s.source, 'source-note')}` };
}

function quote(s, ctx) {
  const p = `slides[${ctx.i}]`;
  return { stage: `<div class="spacer"></div><div class="stack gap-m"><div class="qmark" aria-hidden="true">”</div>
    ${T(ctx, `${p}.quote`, s.quote, `f-head ${(s.quote || '').length > 110 ? 't-h3' : 't-h2'} balance`)}
    <div class="row gap-s" style="align-items:center"><div class="rule short" style="width:calc(var(--u)*60);height:calc(var(--u)*5)"></div>
    <div class="stack">${T(ctx, `${p}.author`, s.author, 't-body', 'div')}${T(ctx, `${p}.role`, s.role, 't-small muted')}</div></div></div><div class="spacer"></div>` };
}

async function product(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const img = await ctx.asset(s.image);
  const v = s.variant || (ctx.canvas.W / ctx.canvas.H >= 0.95 ? 'side' : 'hero');
  const price = s.price ? `<div class="price">${T(ctx, `${p}.price.amount`, String(s.price.amount), 'amount', 'span')}${T(ctx, `${p}.price.currency`, s.price.currency, 'cur', 'span')}${s.price.old ? T(ctx, `${p}.price.old`, String(s.price.old), 'old', 'span') : ''}</div>${T(ctx, `${p}.price.note`, s.price.note, 't-small muted')}` : '';
  const chips = s.features?.length ? `<div class="chips">${s.features.map((f, j) => `<span class="chip">${iconSvg(ctx, s.featureIcon || 'check').replace('<svg', '<svg class="icon"')}${T(ctx, `${p}.features[${j}]`, f, '', 'span')}</span>`).join('')}</div>` : '';
  const text = `<div class="stack gap-s">${T(ctx, `${p}.badge`, s.badge, 'pill')}${T(ctx, `${p}.name`, s.name, 'f-head t-h1 balance')}${T(ctx, `${p}.tagline`, s.tagline, 't-lead muted pretty')}</div>${chips}${price}`;
  const stageImg = `<div class="product-stage grow" data-min="${ctx.canvas.W / ctx.canvas.H >= 0.95 ? 0.48 : 0.36}"><div class="glow"></div><div class="pedestal"></div>${imgTag(img, `product ${img.transparentEdges ? 'alpha' : 'boxed'}`)}</div>`;
  if (v === 'side') return { stage: `<div class="row gap-l grow" data-min="0.7" style="align-items:stretch">${stageImg.replace('grow', 'grow" style="flex:1.1')}<div class="stack gap-m" style="flex:1;justify-content:center">${text}</div></div>` };
  return { stage: `${stageImg}<div class="stack gap-m" style="padding-top:calc(var(--u)*20)">${text}</div>` };
}

async function cta(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const brand = ctx.spec.brand || {};
  const logo = s.logo !== false && brand.logo ? await ctx.asset(brand.logo) : null;
  const handles = (s.handles || brand.handles || []).filter((h) => h && h.handle);
  const contact = s.contact === false ? {} : { ...(brand.contact || {}), ...(s.contact || {}) };
  const rows = [
    ...handles.map((h) => ({ k: h.platform, v: ((ctx.icons[h.platform]?.prefix || '') && !String(h.handle).startsWith('@') && ctx.icons[h.platform]?.prefix === '@' ? '@' : '') + h.handle })),
    ...['phone', 'whatsapp', 'email', 'website', 'location'].filter((k) => contact[k]).map((k) => ({ k, v: contact[k] })),
  ];
  const handleHtml = rows.length ? `<div class="handles ${rows.length <= 2 ? '' : ''}">${rows.map((r, j) => `<div class="handle" data-cta="handle"><span class="ico">${ctx.brandIcon(r.k)}</span>${T(ctx, `${p}.handles[${j}]`, r.v, '', 'span')}</div>`).join('')}</div>` : '';
  let qr = '';
  if (s.qr?.url) {
    const size = Math.round(ctx.unit * (s.qr.size || 300));
    qr = `<div class="qr-wrap" data-cta="qr"><div class="qr" data-qr="${esc(s.qr.url)}" style="width:${size}px;height:${size}px">${await ctx.qrSvg(s.qr.url)}</div>${T(ctx, `${p}.qr.label`, s.qr.label || 'امسح الرمز بالكاميرا', 't-small muted')}</div>`;
  }
  return { stage: `${logo ? `<img class="logo-big" src="${esc(logo.rel)}" data-asset="${esc(logo.ref)}" data-nw="${logo.width}" data-nh="${logo.height}" alt="">` : ''}
    <div class="spacer"></div>
    <div class="stack gap-m">${T(ctx, `${p}.kicker`, s.kicker, 't-kicker f-accent')}${T(ctx, `${p}.title`, s.title, 'f-head t-h1 balance')}${T(ctx, `${p}.text`, s.text, 't-lead muted pretty measure')}
    ${s.action ? `<div class="cta-btn" data-cta="button">${T(ctx, `${p}.action`, s.action, '', 'span')}</div>` : ''}</div>
    <div class="spacer"></div>
    <div class="cta-foot">${handleHtml}${qr}</div>` };
}

async function image(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const img = await ctx.asset(s.image);
  if ((s.variant || 'bleed') === 'bleed') {
    const top = s.textPosition === 'top';
    return { bodyClass: 'has-bleed', bleed: `<div class="layer bleed">${imgTag(img, `fit-${s.fit || 'cover'}`, 'width:100%;height:100%;')}<div class="layer ${top ? 'scrim-top' : 'scrim-bottom'}"></div></div>`,
      stage: `${top ? '' : '<div class="spacer"></div>'}<div class="stack gap-s on-image">${T(ctx, `${p}.kicker`, s.kicker, 't-kicker f-accent')}${T(ctx, `${p}.title`, s.title, 'f-head t-h1 balance')}${T(ctx, `${p}.caption`, s.caption, 't-lead pretty measure')}</div>${top ? '<div class="spacer"></div>' : ''}` };
  }
  return { stage: `${header(s, ctx, p)}<div class="img-box grow framed" data-min="0.45" style="margin-block:calc(var(--u)*28)">${imgTag(img, `fit-${s.fit || 'cover'}`)}</div>${T(ctx, `${p}.caption`, s.caption, 't-body muted pretty')}` };
}

function timeline(s, ctx) {
  const p = `slides[${ctx.i}]`;
  return { stage: `${header(s, ctx, p)}<div class="spacer" style="flex-grow:.6!important"></div><div class="timeline">${(s.events || []).map((e, j) => `<div class="ev">${T(ctx, `${p}.events[${j}].date`, e.date, 'date t-body')}${T(ctx, `${p}.events[${j}].title`, e.title, 'f-head t-h3')}${T(ctx, `${p}.events[${j}].text`, e.text, 't-small muted pretty')}</div>`).join('')}</div><div class="spacer"></div>` };
}

function diagram(s, ctx) {
  const p = `slides[${ctx.i}]`;
  const nodes = s.nodes || [];
  if ((s.variant || 'cycle') === 'flow') {
    return { stage: `${header(s, ctx, p)}<div class="spacer" style="flex-grow:.6!important"></div><div class="flow">${nodes.map((n, j) => `${j ? `<div class="arrow">${iconSvg(ctx, 'arrow-left')}</div>` : ''}<div class="box">${T(ctx, `${p}.nodes[${j}].title`, n.title || n, 'f-head t-h3')}${T(ctx, `${p}.nodes[${j}].text`, n.text, 't-small muted')}</div>`).join('')}</div><div class="spacer"></div>` };
  }
  const R = 37, cx = 50, cy = 50;
  const pts = nodes.map((_, j) => { const a = -Math.PI / 2 + (j * 2 * Math.PI) / nodes.length; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  const links = `<svg class="links" viewBox="0 0 100 100" preserveAspectRatio="none">${pts.map(([x, y]) => `<line x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="var(--accent)" stroke-width="0.5" stroke-dasharray="1.2 1.2" vector-effect="non-scaling-stroke" style="stroke-width:calc(var(--u)*4)"/>`).join('')}</svg>`;
  return { stage: `${header(s, ctx, p)}<div class="cycle grow" data-min="0.62">${links}<div class="hub" style="width:34%;aspect-ratio:1">${T(ctx, `${p}.center`, s.center, 'f-head t-h3')}</div>
    ${nodes.map((n, j) => `<div class="node" style="left:${pts[j][0]}%;top:${pts[j][1]}%;max-width:44%">${T(ctx, `${p}.nodes[${j}].title`, n.title || n, 'f-head t-h3', 'div')}${T(ctx, `${p}.nodes[${j}].text`, n.text, 't-small muted')}</div>`).join('')}</div>` };
}

function html(s) { return { stage: s.html || '', bleed: s.bleedHtml || '' }; }

export const BUILDERS = { cover, statement, list, steps, comparison, stat, quote, product, cta, image, timeline, diagram, html };

/** All visible strings of a slide (for glyph coverage & placeholder checks) */
export function slideStrings(s) {
  const out = [];
  const walk = (v, k) => {
    if (v == null) return;
    if (typeof v === 'string') { if (!/^(layout|variant|image|icon|tone|featureIcon|textPosition|fit|html|bleedHtml|url|size|focus|logo)$/.test(k)) out.push(v); }
    else if (typeof v === 'number') { if (['amount', 'old', 'value'].includes(k)) out.push(String(v)); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
    else if (typeof v === 'object') for (const [kk, vv] of Object.entries(v)) if (!['qr', 'notes', 'src'].includes(kk) || kk === 'qr') walk(vv, kk);
  };
  walk(s, '');
  return out;
}
