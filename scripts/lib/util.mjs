// Shared helpers: paths, colors, escaping, deterministic randomness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSETS = path.join(SKILL_ROOT, 'assets');
export const REGISTRY = path.join(SKILL_ROOT, 'registry');

export const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const writeJSON = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };
export const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
export const pad2 = (n) => String(n).padStart(2, '0');

export class SiyaqError extends Error {
  constructor(code, message_ar, detail) { super(message_ar); this.code = code; this.detail = detail; }
}

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- color ----------
export function parseColor(c) {
  if (!c || typeof c !== 'string') return null;
  let s = c.trim().toLowerCase();
  if (/^#([0-9a-f]{3})$/.test(s)) s = '#' + s.slice(1).split('').map((x) => x + x).join('');
  let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; }
  return null;
}
export const toHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export function luminance(c) {
  const p = typeof c === 'string' ? parseColor(c) : c;
  if (!p) return 0;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b);
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function mix(a, b, t) {
  const A = parseColor(a), B = parseColor(b);
  if (!A || !B) return a;
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}
export function bestInk(bg, candidates = ['#111111', '#ffffff']) {
  return candidates.slice().sort((x, y) => contrast(y, bg) - contrast(x, bg))[0];
}
export const isDark = (c) => luminance(c) < 0.18;

// ---------- deterministic randomness ----------
export function rng(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

export function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' }[ext] || 'application/octet-stream';
}
