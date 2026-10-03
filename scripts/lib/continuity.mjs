// Cross-slide visual continuity. One strip-wide SVG (N × W) is generated once and every slide
// shows its own window of it (offset -i·W), so elements crossing slide boundaries align exactly.
// Swipe order on every platform is left→right (slide 2 sits to the right of slide 1), even for Arabic.
import { rng, mix, esc } from './util.mjs';

export const CONTINUITY_TYPES = {
  ribbon: 'شريط موجي متصل يعبر حدود الشرائح',
  path: 'مسار منقّط بمحطات مرقمة يتقدم عبر الشرائح (ممتاز للخطوات)',
  shape: 'أشكال كبيرة تقع على حدود الشرائح فيظهر نصفها في كل شريحة',
  scene: 'مشهد بانورامي (تلال وشمس) يتكشف تدريجيًا حتى آخر شريحة',
  panorama: 'صورة بانورامية حقيقية من المستخدم موزعة على كل الشرائح',
  motif: 'عنصر متكرر يتطور (دائرة تقدم تمتلئ تدريجيًا) مع شريط واصل',
};

/** Height (px) of the band the continuity art occupies at the bottom (or top) of each slide */
export function bandFor(cont, W, H, u) {
  if (!cont || cont.type === 'panorama') return 0;
  return Math.round(cont.band ? cont.band * H : (cont.type === 'scene' ? 0.24 : 0.17) * H);
}

export function buildContinuity(cont, { W, H, n, u, tokens, numFn, panoramaRel }) {
  if (!cont) return null;
  const SW = W * n;
  const R = rng(`cont-${cont.type}-${cont.seed || 1}`);
  const band = bandFor(cont, W, H, u);
  const zoneTop = cont.zone === 'top';
  const y0 = zoneTop ? 0 : H - band; // band top
  const color = cont.color || tokens.accent;
  const color2 = cont.color2 || tokens.accent2;
  let inner = '';
  switch (cont.type) {
    case 'ribbon': {
      const mid = y0 + band * 0.5, amp = band * 0.28, thick = cont.thickness ? cont.thickness * u : Math.max(26 * u, band * 0.22);
      let d = `M${-W * 0.1},${mid}`;
      const seg = W / 2;
      for (let x = 0; x < SW + W * 0.1; x += seg) { const k = Math.round(x / seg); d += ` Q${x + seg / 2},${mid + (k % 2 ? amp : -amp)} ${x + seg},${mid}`; }
      inner = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${thick}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${color2}" stroke-width="${thick * 0.18}" stroke-linecap="round" transform="translate(0 ${thick * 0.62})" opacity=".9"/>`;
      break;
    }
    case 'path': {
      const mid = y0 + band * 0.48; const pts = [];
      for (let i = 0; i < n; i++) pts.push([i * W + W * 0.5, mid + (i % 2 ? band * 0.18 : -band * 0.18)]);
      let d = `M${-W * 0.05},${mid}`;
      let prev = [-W * 0.05, mid];
      for (const p of [...pts, [SW + W * 0.05, mid]]) { const cx = (prev[0] + p[0]) / 2; d += ` C${cx},${prev[1]} ${cx},${p[1]} ${p[0]},${p[1]}`; prev = p; }
      const r = Math.min(band * 0.26, 46 * u);
      inner = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${8 * u}" stroke-dasharray="${2 * u} ${22 * u}" stroke-linecap="round"/>`
        + pts.map((p, i) => `<g><circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${color}"/><circle cx="${p[0]}" cy="${p[1]}" r="${r + 10 * u}" fill="none" stroke="${color}" stroke-width="${3 * u}" opacity=".45"/>
          <text x="${p[0]}" y="${p[1]}" dy=".35em" text-anchor="middle" font-family="var(--f-accent), var(--f-head)" font-weight="800" font-size="${r * 0.95}" fill="${tokens.accentInk}">${esc(numFn(i + 1))}</text></g>`).join('')
        + `<path d="M${SW - W * 0.12},${mid - 22 * u} l${30 * u},${22 * u} l${-30 * u},${22 * u}" fill="none" stroke="${color}" stroke-width="${8 * u}" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    }
    case 'shape': {
      const r = Math.min(band * 0.95, W * 0.2);
      for (let b = 1; b < n; b++) {
        const cx = b * W, cy = y0 + band * (b % 2 ? 0.62 : 0.5);
        inner += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${b % 2 ? color : color2}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="${tokens.bg}" stroke-width="${10 * u}" opacity=".9"/>`;
      }
      inner += `<rect x="0" y="${y0 + band * 0.86}" width="${SW}" height="${8 * u}" fill="${color}" opacity=".5"/>`;
      break;
    }
    case 'scene': {
      // layered hills rise along the carousel; the sun appears fully only on the last slide
      const layers = [mix(color, tokens.bg, 0.55), mix(color, tokens.bg, 0.25), color];
      layers.forEach((c, li) => {
        let d = `M0,${H}`; const steps = n * 6;
        for (let k = 0; k <= steps; k++) {
          const x = (k / steps) * SW; const prog = x / SW;
          const base = H - band * (0.25 + prog * 0.55) * (1 - li * 0.18);
          const y = base - Math.sin(k * (0.9 + li * 0.35) + li) * band * 0.12 - R() * band * 0.04;
          d += ` L${x.toFixed(1)},${Math.max(y0 - band * 0.2, y).toFixed(1)}`;
        }
        inner += `<path d="${d} L${SW},${H} Z" fill="${c}"/>`;
      });
      const sunX = SW - W * 0.5, sunY = y0 + band * 0.05;
      inner = `<circle cx="${sunX}" cy="${sunY}" r="${band * 0.42}" fill="${color2}"/>` + inner;
      for (let k = 0; k < n * 2; k++) { const bx = W * 0.3 + R() * (SW - W * 0.6), by = y0 - band * (0.0 + R() * 0.2); if (by < H * 0.6) continue; inner += `<path d="M${bx},${by} q${10 * u},${-10 * u} ${20 * u},0 q${10 * u},${-10 * u} ${20 * u},0" fill="none" stroke="${tokens.ink}" stroke-width="${3 * u}" opacity=".5"/>`; }
      break;
    }
    case 'motif': {
      const mid = y0 + band * 0.5, rr = Math.min(band * 0.32, 60 * u);
      inner = `<rect x="0" y="${mid - 4 * u}" width="${SW}" height="${8 * u}" fill="${color}" opacity=".35"/>`;
      for (let i = 0; i < n; i++) {
        const cx = i * W + W * 0.5, frac = (i + 1) / n, c = 2 * Math.PI * rr;
        inner += `<circle cx="${cx}" cy="${mid}" r="${rr}" fill="${tokens.bg}" stroke="${color}" stroke-opacity=".25" stroke-width="${12 * u}"/>
          <circle cx="${cx}" cy="${mid}" r="${rr}" fill="none" stroke="${color}" stroke-width="${12 * u}" stroke-dasharray="${(c * frac).toFixed(1)} ${c}" transform="rotate(-90 ${cx} ${mid})" stroke-linecap="round"/>`;
      }
      break;
    }
    case 'panorama': {
      if (!panoramaRel) return null;
      const scrim = cont.scrim ?? 0.45;
      return { band: 0, html: (i) => `<div class="continuity" style="left:${-i * W}px;width:${SW}px"><img src="${esc(panoramaRel)}" data-asset="panorama" style="width:${SW}px;height:${H}px;object-fit:cover;object-position:${esc(cont.focus || 'center')}" alt=""><div class="layer" style="background:rgba(0,0,0,${scrim})"></div></div>`, svgStrip: null };
    }
    default: return null;
  }
  const strip = `<svg width="${SW}" height="${H}" viewBox="0 0 ${SW} ${H}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  return { band, zoneTop, svgStrip: strip, html: (i) => `<div class="continuity" data-cont="${cont.type}" style="left:${-i * W}px;width:${SW}px">${strip}</div>` };
}
