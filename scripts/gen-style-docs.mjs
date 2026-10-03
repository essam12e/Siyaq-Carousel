#!/usr/bin/env node
// يولّد references/styles.md من registry/styles.json حتى يبقى التوثيق مطابقًا للسجل.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, REGISTRY, SKILL_ROOT } from './lib/util.mjs';
const r = readJSON(path.join(REGISTRY, 'styles.json'));
const L = ['# مكتبة الأنماط', '', '> مولّد آليًا من `registry/styles.json` بالأمر `node scripts/gen-style-docs.mjs`. عدّل السجل ثم أعد التوليد.', ''];
L.push('## الرموز (Tokens)', '', ...Object.entries(r.tokenDoc).map(([k, v]) => `- \`${k}\`: ${v}`), '');
L.push('## السمات القابلة للدمج (traits)', '', '| السمة | الوصف | تتعارض مع |', '|---|---|---|', ...Object.entries(r.traits).map(([k, v]) => `| \`${k}\` | ${v.name_ar} | ${v.incompatible.join('، ') || '—'} |`), '');
const labels = { layout: 'مبادئ التخطيط', typography: 'هرمية الخطوط', color: 'منهج الألوان', spacing: 'المسافات', images: 'معالجة الصور', decoration: 'الأشكال والزخرفة', contrast: 'قواعد التباين', content: 'المحتوى المناسب', accessibility: 'قيود الإتاحة', assets: 'متطلبات الأصول' };
for (const s of r.styles) {
  L.push(`## ${s.name_ar} — \`${s.id}\` (${s.name_en})`, '');
  L.push(`- **اللوحات:** ${Object.keys(s.palettes).map((p) => `\`${p}\``).join('، ')}`);
  L.push(`- **السمات الافتراضية:** ${(s.traits || []).map((t) => `\`${t}\``).join('، ') || '—'}`);
  L.push(`- **الخطوط:** عناوين \`${s.tokens.headFont}\` · نص \`${s.tokens.bodyFont}\` · تسميات \`${s.tokens.accentFont}\``);
  L.push(`- **الألوان الأساسية:** خلفية ${s.tokens.bg} · حبر ${s.tokens.ink} · مميز ${s.tokens.accent}`, '');
  for (const [k, v] of Object.entries(s.spec || {})) L.push(`- **${labels[k] || k}:** ${v}`);
  L.push('');
}
fs.writeFileSync(path.join(SKILL_ROOT, 'references', 'styles.md'), L.join('\n'));
console.log('references/styles.md', r.styles.length, 'styles');
