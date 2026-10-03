// Per-style background art, generated deterministically per slide (seeded) so re-renders are stable.
import { rng, mix } from './util.mjs';

const svg = (W, H, inner, extra = '') => `<svg class="layer" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${extra} xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

function blobPath(cx, cy, r, R, pts = 7, jitter = 0.28) {
  const a = []; for (let i = 0; i < pts; i++) { const ang = (i / pts) * Math.PI * 2; const rr = r * (1 + (R() - 0.5) * jitter * 2); a.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]); }
  let d = ''; for (let i = 0; i < pts; i++) {
    const p0 = a[(i - 1 + pts) % pts], p1 = a[i], p2 = a[(i + 1) % pts], p3 = a[(i + 2) % pts];
    if (i === 0) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
function tornPoly(x, y, w, h, R, step = 26, amp = 9) {
  const pts = [];
  for (let i = 0; i <= w; i += step) pts.push([x + i, y + (R() - 0.5) * amp]);
  for (let i = 0; i <= h; i += step) pts.push([x + w + (R() - 0.5) * amp, y + i]);
  for (let i = w; i >= 0; i -= step) pts.push([x + i, y + h + (R() - 0.5) * amp]);
  for (let i = h; i >= 0; i -= step) pts.push([x + (R() - 0.5) * amp, y + i]);
  return pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
}

export function decorFor(styleId, ctx) {
  const { W, H, u, i, n, t } = ctx; // t = tokens
  const R = rng(`${styleId}-${i}-${ctx.seed || ''}`);
  const s = Math.min(W, H);
  const corner = i % 2 === 0 ? 1 : -1;
  switch (styleId) {
    case 'editorial':
      // a magazine column rule on the outer edge; never behind text
      return svg(W, H, `<rect x="${34 * u}" y="${H * 0.18}" width="${2 * u}" height="${H * 0.64}" fill="${t.ink}" opacity=".35"/><rect x="${30 * u}" y="${H * 0.18}" width="${10 * u}" height="${60 * u}" fill="${t.accent}"/>`);
    case 'swiss': {
      const bx = Math.round(R() * 4) * (W / 6);
      return `<div class="layer" style="background:linear-gradient(${t.accent},${t.accent}) ${bx}px 0/${W / 6}px ${18 * u}px no-repeat"></div>`;
    }
    case 'bold': {
      // candidates in priority order; the page keeps the first one that doesn't touch text
      const r = s * 0.3;
      const spots = [[W * 0.04, H * 0.97], [W * 0.96, H * 0.97], [W * 0.02, H * 0.5], [W * 0.98, H * 0.04]];
      return svg(W, H, spots.map(([x, y]) => `<g data-g="a"><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${t.ink}" stroke-width="${16 * u}"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${t.accent2}"/></g>`).join(''));
    }
    case 'product':
      return `<div class="layer" style="background:radial-gradient(120% 70% at 50% 38%, ${mix(t.bg, '#ffffff', 0.55)} 0%, ${t.bg} 55%, ${t.bg2} 100%)"></div>`;
    case 'luxury':
      return svg(W, H, `<g fill="none" stroke="${t.accent}" opacity=".9"><rect x="${30 * u}" y="${30 * u}" width="${W - 60 * u}" height="${H - 60 * u}" stroke-width="${2 * u}"/><rect x="${42 * u}" y="${42 * u}" width="${W - 84 * u}" height="${H - 84 * u}" stroke-width="${1 * u}" opacity=".55"/></g>
        <g fill="${t.accent}"><rect x="${W / 2 - 7 * u}" y="${30 * u - 7 * u}" width="${14 * u}" height="${14 * u}" transform="rotate(45 ${W / 2} ${30 * u})"/><rect x="${W / 2 - 7 * u}" y="${H - 30 * u - 7 * u}" width="${14 * u}" height="${14 * u}" transform="rotate(45 ${W / 2} ${H - 30 * u})"/></g>`)
        + `<div class="layer" style="background:radial-gradient(90% 60% at 50% 0%, ${mix(t.bg2, t.accent, 0.1)} 0%, transparent 70%)"></div>`;
    case 'collage': {
      const cols = [t.accent, t.accent2, mix(t.accent, t.accent2, 0.5)];
      const piece = (x, y, w, h, c) => `<polygon points="${tornPoly(x, y, w, h, R)}" fill="${c}" transform="rotate(${((R() - 0.5) * 16).toFixed(1)} ${x + w / 2} ${y + h / 2})" filter="url(#sh)"/>`;
      const w = s * 0.34, h = s * 0.22;
      const spots = [[-w * 0.45, -h * 0.35], [W - w * 0.55, -h * 0.35], [-w * 0.45, H - h * 0.6], [W - w * 0.55, H - h * 0.6], [-w * 0.6, H * 0.45], [W - w * 0.4, H * 0.45]];
      let g = spots.map(([x, y], k) => `<g data-g="${k % 2 ? 'a' : 'b'}">${piece(x, y, w, h, cols[(k + i) % 3])}</g>`).join('');
      g += [W * 0.35, W * 0.55, W * 0.7].map((x) => `<g data-g="t"><rect x="${x}" y="${12 * u}" width="${150 * u}" height="${44 * u}" fill="#fffbe8" opacity=".75" transform="rotate(${((R() - 0.5) * 10).toFixed(1)} ${x + 75 * u} ${34 * u})"/></g>`).join('');
      return svg(W, H, `<defs><filter id="sh" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="${6 * u}" dy="${8 * u}" stdDeviation="${2 * u}" flood-color="#000" flood-opacity=".22"/></filter></defs>${g}`);
    }
    case 'playful': {
      const spots = [[W * 0.92, H * 0.06], [W * 0.08, H * 0.06], [W * 1.0, H * 0.5], [W * 0.0, H * 0.5]];
      const spots2 = [[W * 0.06, H * 0.95], [W * 0.94, H * 0.95], [W * 0.5, H * 1.02]];
      let g = spots.map(([x, y]) => `<g data-g="a"><path d="${blobPath(x, y, s * 0.2, R)}" fill="${t.accent}" opacity=".9"/></g>`).join('');
      g += spots2.map(([x, y]) => `<g data-g="b"><path d="${blobPath(x, y, s * 0.17, R)}" fill="${t.accent2}" opacity=".85"/></g>`).join('');
      for (let k = 0; k < 6; k++) { const x = W * (0.08 + R() * 0.84), y = H * (0.04 + R() * 0.92), r = (10 + R() * 12) * u;
        g += `<path d="M${x},${y - r} L${x + r * 0.3},${y - r * 0.3} L${x + r},${y} L${x + r * 0.3},${y + r * 0.3} L${x},${y + r} L${x - r * 0.3},${y + r * 0.3} L${x - r},${y} L${x - r * 0.3},${y - r * 0.3}Z" fill="${t.ink}" opacity=".85"/>`; }
      return svg(W, H, g);
    }
    case 'comic': {
      const burst = (cx, cy, rad) => { let d = ''; const spikes = 14; for (let k = 0; k < spikes * 2; k++) { const r = (k % 2 ? 0.58 : 1) * rad * (1 + (R() - 0.5) * 0.25); const a = (k / (spikes * 2)) * Math.PI * 2; d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`; } return `<path d="${d}Z" fill="${t.accent}" stroke="${t.ink}" stroke-width="${6 * u}"/>`; };
      const spots = [[W * 0.06, H * 0.95], [W * 0.94, H * 0.95], [W * 0.02, H * 0.45], [W * 0.98, H * 0.45], [W * 0.92, H * 0.05]];
      let g = spots.map(([x, y]) => `<g data-g="a">${burst(x, y, s * 0.16)}</g>`).join('');
      for (let k = 0; k < 9; k++) { const y = H * (0.5 + k * 0.05); g += `<line x1="${corner > 0 ? 0 : W}" y1="${y}" x2="${corner > 0 ? W * (0.05 + R() * 0.08) : W * (0.95 - R() * 0.08)}" y2="${y}" stroke="${t.ink}" stroke-width="${5 * u}" opacity=".5"/>`; }
      return svg(W, H, g);
    }
    case 'retro': {
      const cols = [t.accent, t.accent2, mix(t.accent, t.ink, 0.35), mix(t.accent2, '#ffffff', 0.3)];
      const sun = (cx, cy, S) => cols.map((c, k) => `<circle cx="${cx}" cy="${cy}" r="${S * (1 - k * 0.2)}" fill="${c}"/>`).join('');
      const spots = [[corner > 0 ? W * 0.85 : W * 0.15, H + s * 0.05, s * 0.5], [corner > 0 ? W * 0.15 : W * 0.85, H + s * 0.05, s * 0.42], [W * 0.5, H + s * 0.12, s * 0.38], [W * 0.98, H * 0.02, s * 0.3]];
      return svg(W, H, spots.map(([x, y, S]) => `<g data-g="a" opacity=".92">${sun(x, y, S)}</g>`).join(''));
    }
    case 'infographic':
      return svg(W, H, `<circle cx="${corner > 0 ? W : 0}" cy="0" r="${s * 0.22}" fill="${t.accent}" opacity=".08"/><circle cx="${corner > 0 ? 0 : W}" cy="${H}" r="${s * 0.3}" fill="${t.accent2}" opacity=".07"/>`);
    case 'tech':
      return `<div class="layer" style="background:radial-gradient(45% 35% at ${corner > 0 ? '85%' : '15%'} 8%, ${t.accent}55 0%, transparent 70%), radial-gradient(40% 30% at ${corner > 0 ? '10%' : '90%'} 96%, ${t.accent2}40 0%, transparent 70%)"></div>`;
    case 'gradient': {
      const p = () => `${Math.round(R() * 100)}% ${Math.round(R() * 100)}%`;
      return `<div class="layer" style="background:radial-gradient(60% 50% at ${p()}, ${t.accent}55 0%, transparent 70%), radial-gradient(55% 45% at ${p()}, ${t.accent2}50 0%, transparent 70%), radial-gradient(70% 60% at ${p()}, ${t.bg2} 0%, transparent 75%), ${t.bg}"></div>`;
    }
    case 'glass': {
      const b = (c, x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
      return `<div class="layer" style="background:linear-gradient(160deg, ${t.bg} 0%, ${t.bg2} 100%)"></div>` + svg(W, H, `<defs><filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${60 * u}"/></filter></defs><g filter="url(#bl)" opacity=".8" data-keep="1">${b(t.accent, W * (0.2 + R() * 0.6), H * (0.12 + R() * 0.2), s * 0.28)}${b(t.accent2, W * (0.2 + R() * 0.6), H * (0.6 + R() * 0.3), s * 0.3)}${b(mix(t.accent, t.accent2, 0.5), W * R(), H * (0.35 + R() * 0.3), s * 0.18)}</g>`) + `<div class="layer" style="background:linear-gradient(to top, ${t.bg2} 0%, transparent 16%), linear-gradient(to bottom, ${t.bg} 0%, transparent 12%)"></div>`;
    }
    case 'geometric': {
      const cols = [t.accent, t.accent2, mix(t.accent, '#f4c430', 0.6)];
      const S = s * 0.3; const c = (k) => cols[(k + i) % 3];
      const shapes = [
        `<circle cx="${W}" cy="0" r="${S}" fill="${c(0)}"/>`,
        `<path d="M0,0 h${S} a${S},${S} 0 0 1 ${-S},${S} z" fill="${c(1)}"/>`,
        `<path d="M${W},${H} v${-S} l${-S},${S} z" fill="${c(2)}"/>`,
        `<circle cx="${S * 0.35}" cy="${H - S * 0.35}" r="${S * 0.28}" fill="none" stroke="${c(0)}" stroke-width="${18 * u}"/>`,
        `<rect x="0" y="${H * 0.45}" width="${S * 0.18}" height="${S * 0.9}" fill="${c(1)}"/>`,
        `<path d="M${W},${H * 0.4} a${S * 0.5},${S * 0.5} 0 0 0 0,${S}z" fill="${c(2)}"/>`,
      ];
      const order = [(i) % 6, (i + 2) % 6, (i + 4) % 6, (i + 1) % 6, (i + 3) % 6, (i + 5) % 6];
      return svg(W, H, order.map((k, j) => `<g data-g="${j < 3 ? 'a' : 'b'}">${shapes[k]}</g>`).join(''));
    }
    case 'sketch': {
      const star = (x, y, r) => `<path d="M${x},${y - r} L${x + r * 0.3},${y - r * 0.25} L${x + r},${y - r * 0.2} L${x + r * 0.45},${y + r * 0.2} L${x + r * 0.6},${y + r} L${x},${y + r * 0.5} L${x - r * 0.6},${y + r} L${x - r * 0.45},${y + r * 0.2} L${x - r},${y - r * 0.2} L${x - r * 0.3},${y - r * 0.25}Z"/>`;
      const r = 30 * u;
      const stars = [[W * 0.5, H * 0.05], [W * 0.06, H * 0.5], [W * 0.94, H * 0.5], [W * 0.5, H * 0.95]];
      const sq = (x) => `<path d="M${x},${H - 50 * u} q${60 * u},${-40 * u} ${120 * u},${-6 * u} t${120 * u},${-10 * u}" stroke="${t.accent2}" stroke-width="${7 * u}"/>`;
      return svg(W, H, `<defs><filter id="wob"><feTurbulence baseFrequency="0.03" numOctaves="2" seed="${i + 3}"/><feDisplacementMap in="SourceGraphic" scale="${6 * u}"/></filter></defs>
        ${stars.map(([x, y]) => `<g data-g="a" filter="url(#wob)" fill="none" stroke="${t.accent}" stroke-width="${5 * u}" stroke-linejoin="round">${star(x, y, r)}</g>`).join('')}
        ${[W * 0.4, W * 0.6, W * 0.75].map((x) => `<g data-g="b" filter="url(#wob)" fill="none" stroke-linecap="round">${sq(x)}</g>`).join('')}`);
    }
    default: return '';
  }
}
