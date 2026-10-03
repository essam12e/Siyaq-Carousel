# Notices and attribution / الإشعارات والإسناد

## Open Carrusel (MIT)
سياق كاروسيل مبني على الأفكار والتقنيات المجرَّبة في مشروع Open Carrusel:
https://github.com/Hainrixz/open-carrusel — Copyright (c) 2026 Open Carrusel Contributors — MIT License.

ما أُعيد استخدامه وتكييفه من Open Carrusel:
- عقد الرسم: شريحة = مستند HTML/CSS كامل بأبعاد ثابتة، يُستخدم نفسه للمعاينة والتصدير (`wrapSlideHtml` → `scripts/lib/build.mjs`).
- التصدير: لقطة متصفح Chromium بلا واجهة بالأبعاد الدقيقة مع `deviceScaleFactor: 1` وانتظار تحميل الخطوط قبل اللقطة (`export-slides.ts` → `scripts/lib/render.mjs`، باستخدام Playwright بدل Puppeteer).
- تحويل مسارات الصور إلى مسارات محلية حتى يعمل التصدير دون خادم.
- التحقق من الملفات المرفوعة بالبايتات السحرية (magic bytes) للصور والخطوط (`api/upload/route.ts` → `scripts/lib/assets.mjs` و`fonts.mjs`) مع توسيع الدعم إلى OTF وWOFF.
- إعدادات الهوية (ألوان، خطوط، شعار، كلمات أسلوب) وفكرة الأنماط المحفوظة والقوالب وسجل النسخ لكل شريحة.
- فكرة المناطق الآمنة (SafeZoneOverlay) وتحويلها إلى فحص آلي.

ما تغيّر جذريًا: لا يوجد خادم Next.js ولا واجهة ولا استدعاء لـ Claude CLI؛ المهارة تعمل داخل المساعد النشط (Claude Code أو Codex) وأداة الرسم مستقلة عن أي نموذج.

## Fonts — SIL Open Font License 1.1
كل الخطوط في `assets/fonts/` من مستودع Google Fonts (https://github.com/google/fonts) وترخيصها SIL OFL 1.1، وملف الترخيص الخاص بكل عائلة موجود بجانبها (`OFL.txt`). يجوز تضمينها وإعادة توزيعها مع التصاميم وفق شروط الترخيص، ولا يجوز بيع الخطوط منفردة.

## Icons — Font Awesome Free 7.3.1 (CC BY 4.0)
الأيقونات في `assets/icons/` من Font Awesome Free (https://fontawesome.com) — Icons: CC BY 4.0. تعليق الترخيص محفوظ داخل كل ملف SVG، والنص الكامل في `assets/icons/FONT-AWESOME-LICENSE.txt`.
شعارات المنصات علامات تجارية لأصحابها وتُستخدم فقط للإشارة إلى حسابات المستخدم.

## Node dependencies
playwright (Apache-2.0)، sharp (Apache-2.0)، fontkit (MIT)، qrcode (MIT)، yazl (MIT).
