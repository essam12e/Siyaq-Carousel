# صيغة ملف carousel.json

الملف الوحيد الذي يكتبه المساعد. المسارات النسبية (صور، خطوط، شعار، أنماط) تُحسب من مجلد الملف نفسه.

```jsonc
{
  "version": 1,
  "meta": {
    "title": "عنوان داخلي",          // يظهر في سجل المصادر الداخلي وتقرير الجودة فقط
    "topic": "تنظيم الوقت",           // اسم الموضوع المجرد — QC يرفض غلافًا يكرره حرفيًا
    "audience": "…", "goal": "…",
    "hook": {                         // سجل داخلي لاختيار الخطّاف (يُحذف من حزمة المصدر)
      "candidates": ["خطّاف ١", "خطّاف ٢", "خطّاف ٣"], "chosen": 0, "why": "سبب الاختيار"
    },
    "slug": "plan-your-day",         // اسم ملفات ZIP (اختياري)
    "lang": "ar", "dir": "rtl",      // الافتراضي عربي RTL
    "numerals": "latn"               // latn = 123 (افتراضي) | arab = ١٢٣ (ويحوّل % إلى ٪)
  },
  "canvas": { "platform": "instagram-portrait" },   // أو { "width": 1500, "height": 1000 } — انظر platforms
  "style": {
    "preset": "editorial",           // أحد الأنماط الـ17 (list styles)
    "palette": "classic",            // لوحة من لوحات النمط (اختياري)
    "traits": ["grain", "rounded"],  // سمات تُدمج فوق النمط (list traits)، المتعارضة تُستبعد مع تنبيه
    "removeTraits": ["sharp"],       // إزالة سمة افتراضية للنمط
    "tokens": { "accent": "#0F766E" },// تعديل مباشر لأي رمز
    "custom": "my-style",            // نمط محفوظ (save-style) أو مسار JSON — يحل محل preset
    "decor": true                    // false لإلغاء الزخارف
  },
  "brand": {                         // كله اختياري — لا تخترع شيئًا غير موجود
    "name": "اسم العلامة",            // يظهر صغيرًا أعلى الشرائح إن لم يوجد شعار (showName:false لإخفائه)
    "logo": "assets/logo.png",       // PNG شفاف ≥500px أو SVG
    "colors": { "primary": "#1F4D3A", "secondary": "#C8963E", "background": "#F6F1E7", "text": "#111", "surface": "#fff" },
    "fonts": {
      "heading": { "file": "fonts/MyFont-Bold.ttf", "weight": "700" },   // أو معرف خط مضمن مثل "tajawal"
      "body":    { "file": "fonts/MyFont.ttf", "weight": "400", "redistributable": false, "allowFallback": false },
      "accent":  "ibm-plex-sans-arabic"
    },
    "handles": [ { "platform": "instagram", "handle": "brand" }, { "platform": "whatsapp", "handle": "+966 5x xxx xxxx" } ],
    "contact": { "phone": "…", "email": "…", "website": "example.com", "location": "…" }
  },
  "assets": { "espresso": "photos/espresso.png" },   // أسماء مختصرة للصور تُستخدم في الشرائح
  "chrome": {
    "counter": true,                 // 01 / 05
    "swipeHint": true, "swipeText": "اسحب",
    "handle": "all",                 // "all" | "none" — الحساب الأول صغيرًا أسفل الشرائح
    "logo": "all"                    // "all" | "first-last" | "first"
  },
  "continuity": { "type": "path", "color": "#…" },   // اختياري: ribbon | path | shape | scene | motif | panorama(+image)
  "exact": false,                    // true = كل النصوص حرفية (لا تُختصر). يمكن وضعه على شريحة واحدة
  "sources": [ { "id": "1", "title": "…", "publisher": "…", "url": "https://…", "accessed": "2026-10-03",
                 "supports": "الادعاء المدعوم", "slides": [2], "uncertainty": "حدود اليقين" } ],
  "userProvidedFacts": ["سعر الكوب 14 ر.س (من المستخدم)"],
  "research": { "note": "ملخص ما تم بحثه ومتى" },
  "slides": [ … ]
}
```

## التنسيق داخل النص

- `**كلمة**` لون التمييز · `==كلمة==` تظليل (هايلايت) · `\n` سطر جديد مقصود.
- الروابط، الإيميلات، @الحسابات، الأرقام الهاتفية، الكلمات الإنجليزية، والنطاقات الرقمية (20–30%) تُعزل تلقائيًا
  باتجاه LTR فلا تنقلب داخل الجملة العربية.
- نص الشريحة لا يحتوي روابط مصادر؛ المصادر في `sources`.

## القوالب (layouts)

كل شريحة: `{ "layout": "...", "variant": "...", ...الحقول }`. حقول اختيارية عامة: `exact`, `decor:false`,
`className`, `logo:false` (في cta).

| layout | الاستخدام | الحقول |
|---|---|---|
| `cover` | الغلاف/الخطّاف | `kicker`, `title`, `subtitle`, `note`, `image`; variant: `type` (افتراضي) · `image` (صورة كاملة مع تظليل) · `split` · `product` (تلقائي لصورة بخلفية شفافة) |
| `statement` | فكرة واحدة كبيرة | `label`, `text`, `support`, `size` (`t-h1`/`t-h2`); variant: `start` · `center` · `quote` |
| `list` | عناصر مجمعة | `kicker`, `title`, `intro`, `items:[{title,text,icon,bad}]`, `note`; variant: `stack` · `grid` (تلقائي لـ4+ قصيرة) · `check` |
| `steps` | خطوات متسلسلة | `kicker`, `title`, `steps:[{title,text}]`, `start` |
| `comparison` | مقارنة/قبل-بعد | `title`, `a:{label,points[],text,tone}`, `b:{…}`, `vs` (false لإخفاء الدائرة), `vsLabel` ("مقابل"), `note`; variant: `columns` · `stacked` (تلقائي في المقاسات الطولية مع نقاط طويلة). `a` = الضعيف (bad) و`b` = الأفضل (good) افتراضيًا |
| `stat` | أرقام | `title`, `stats:[{value,label,note,amount,alt}]` أو `value/label/note`, `source` (نص قصير مثل «المصدر: منظمة الصحة العالمية 2024»), `max`; variant: `single` · `grid` · `bars` (يتطلب `amount`) |
| `quote` | اقتباس حقيقي فقط | `quote`, `author`, `role` |
| `product` | المنتج هو البطل | `image` (صورة المستخدم), `badge`, `name`, `tagline`, `features[]`, `featureIcon`, `price:{amount,currency,old,note}`; variant: `hero` · `side` |
| `cta` | الدعوة للإجراء | `kicker`, `title`, `text`, `action` (نص الزر), `handles[]` (وإلا من brand), `contact{}`, `qr:{url,label,size}` (size بوحدة 1080، الافتراضي 300، الحد الأدنى المقبول ≈200px أو 20% من الضلع الأقصر) |
| `image` | صورة كبيرة | `image`, `kicker`, `title`, `caption`, `fit` (`cover`/`contain`), `textPosition` (`top`/`bottom`); variant: `bleed` · `framed` |
| `timeline` | تواريخ | `title`, `events:[{date,title,text}]` |
| `diagram` | شرح بصري | `title`, `center`, `nodes:[{title,text}]`; variant: `cycle` · `flow` |
| `html` | حالات خاصة | `html`, `bleedHtml` — HTML/CSS حر داخل منطقة المحتوى (استخدم الكلاس `tx` و`data-f` للنصوص حتى يفحصها QC) |

أيقونات `icon` المتاحة: `node scripts/siyaq.mjs list icons` (مجلد `assets/icons/ui`).

## الصور

- تُقبل PNG/JPEG/WebP/GIF/AVIF/SVG (SVG بدون سكربت). HEIC وTIFF تُرفض مع طلب تحويلها لأن المتصفح لا يرسمها.
- كل صورة تُفحص فعليًا (sharp): الأبعاد، الاتجاه EXIF، الشفافية. تُنسخ بايتاتها الأصلية بدون تعديل إلى `source/assets`.
- صورة المنتج تُعرض `contain` دائمًا (لا قص ولا تمطيط)، ولا تُكبّر أكثر من 1.5× من دقتها؛ QC ينبّه عند التكبير الزائد.
- `focus` على مرجع الصورة يغيّر نقطة القص في `cover`: `"assets": {"hero": {"file": "x.jpg", "focus": "30% 40%"}}`.

## custom style

```json
{
  "id": "grid-sun", "name_ar": "شمس الشبكة", "base": "geometric",
  "description_ar": "مستوحى من الصورة المرجعية: شبكة جريئة، شمس برتقالية، خطوط عريضة",
  "tokens": { "bg": "#F2E8D8", "ink": "#0F3B5F", "accent": "#F26B22", "headFont": "alexandria", "headWeight": 900 },
  "traits": ["stripes", "sharp"], "removeTraits": ["rounded"]
}
```

احفظه: `node scripts/siyaq.mjs save-style grid-sun.style.json` (يُحفظ في `~/.siyaq-carousel/styles` أو `SIYAQ_STYLES_DIR`)،
ثم استخدمه بـ `"style": {"custom": "grid-sun"}` في أي كاروسيل لاحق.

## الخطوط

- المضمنة (OFL): `node scripts/siyaq.mjs list fonts`.
- خط المستخدم: يُفحص التوقيع (TTF/OTF/WOFF/WOFF2)، القراءة بـ fontkit، ووجود كل حرف مستخدم في النص قبل الرسم.
  نقص حروف = إيقاف مع خيارات واضحة، إلا إذا `allowFallback: true` (وحينها تُذكر الحروف البديلة في التقرير).
  بعد الرسم يتحقق QC عبر المتصفح من الخط الذي رُسم به كل عنصر.
- خطوط المستخدم لا تُضمّن في حزمة المصدر إلا بـ `redistributable: true`.
