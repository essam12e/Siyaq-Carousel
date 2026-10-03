// Renders the same short content in every style preset → one contact sheet per style (visual review aid).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJSON, REGISTRY } from '../scripts/lib/util.mjs';
const out = path.resolve(process.argv[2] || 'gallery-out');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const styles = readJSON(path.join(REGISTRY, 'styles.json')).styles.filter((s) => !only || only.includes(s.id));
const slides = [
  { layout: 'cover', kicker: 'سلسلة نصائح', title: 'كيف تبني **عادة** تستمر معك؟', subtitle: 'أربع أفكار عملية مجرّبة بدون تعقيد.' },
  { layout: 'list', title: 'ابدأ صغيرًا', items: [{ title: 'دقيقتان فقط', text: 'خلّ البداية سهلة لدرجة ما تقدر ترفضها.' }, { title: 'اربطها بعادة قائمة', text: 'بعد قهوة الصباح مباشرة.' }, { title: 'تابع تقدّمك', text: 'علامة بسيطة في تقويمك كل يوم.' }] },
  { layout: 'comparison', title: 'الفرق الحقيقي', a: { label: 'هدف كبير', points: ['حماس أسبوع', 'ثم توقف'] }, b: { label: 'عادة صغيرة', points: ['تقدّم يومي', 'نتيجة تتراكم'] }, vsLabel: 'مقابل' },
  { layout: 'cta', title: 'احفظها وجرّب من بكرة', text: 'وشاركها مع شخص يبدأ معك.', action: 'احفظ المنشور' },
];
for (const s of styles) {
  const dir = path.join(out, s.id); fs.mkdirSync(dir, { recursive: true });
  const spec = { meta: { title: s.name_ar }, canvas: { platform: 'instagram-portrait' }, style: { preset: s.id }, slides };
  if (s.id === 'photo') spec.style.preset = 'photo';
  fs.writeFileSync(path.join(dir, 'carousel.json'), JSON.stringify(spec, null, 1));
  try { execFileSync('node', [path.resolve('scripts/siyaq.mjs'), 'render', path.join(dir, 'carousel.json'), '--out', dir], { stdio: 'pipe' }); console.log('ok', s.id); }
  catch (e) { console.log('FAIL', s.id, e.stdout?.toString().slice(-600)); }
}
