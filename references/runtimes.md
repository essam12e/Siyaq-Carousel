# التشغيل في Claude Code وCodex

المهارة نفسها (SKILL.md + scripts) واحدة للبيئتين. أداة الرسم `scripts/siyaq.mjs` عادية تعمل بـ Node ولا تستدعي
أي نموذج أو CLI آخر ولا تحتاج مفاتيح API. الكتابة والبحث والإخراج الفني يقوم بها المساعد النشط نفسه.

| البيئة | مكان التثبيت | الاستدعاء | حالة التحقق |
|---|---|---|---|
| Claude Code | `~/.claude/skills/siyaq-carousel/` أو `.claude/skills/siyaq-carousel/` داخل المشروع | «سياق كاروسيل» أو `/siyaq-carousel` | ✅ تم تشغيله فعليًا (انظر أدناه) |
| Codex | `~/.agents/skills/siyaq-carousel/` أو `.agents/skills/siyaq-carousel/` داخل المستودع | «سياق كاروسيل» أو `$siyaq-carousel` أو `/skills` | ⚠️ غير متحقق — Codex غير متاح في بيئة البناء |

## ما تم التحقق منه في Claude Code (2026-10-03)
- الإصدار: Claude Code 2.1.288، وضع غير تفاعلي `claude -p`، المهارة مثبتة في `.claude/skills/siyaq-carousel` لمشروع تجريبي.
- `claude -p "سياق كاروسيل"` → حمّل المهارة وأعاد رسالة الترحيب حرفيًا وآخر سطر «سياق كاروسيل إحدى منتجات نطاق».
- `claude -p "صمم باستخدام سياق كاروسيل: كاروسيل إنستقرام عمودي من ٥ شرائح عن …" --allowedTools "Bash Read Write Edit Glob Grep Skill"`
  → كتب carousel.json، شغّل الرسم، فحص الصور بصريًا، اكتشف مشكلة تظليل في شريحة ٢ وأعاد رسمها وحدها
  (حُفظت النسخة السابقة في versions/)، وسلّم 5 PNG + ZIP + حزمة المصدر بدون أسئلة إضافية.
- لم يُختبر الوضع التفاعلي في الطرفية ولا تطبيق سطح المكتب، لكن آلية تحميل المهارات واحدة.

## خطوات التحقق في Codex (لم تُنفّذ بعد)
1. ثبّت Codex CLI وسجّل الدخول حسب توثيق OpenAI.
2. انسخ المجلد: `mkdir -p ~/.agents/skills && cp -r siyaq-carousel ~/.agents/skills/` ثم
   `cd ~/.agents/skills/siyaq-carousel && npm install && npx playwright install chromium && node scripts/siyaq.mjs doctor`.
3. شغّل `codex` في مجلد فارغ واكتب `/skills` → يجب أن تظهر `siyaq-carousel`.
4. اكتب «سياق كاروسيل» → المتوقع رسالة الترحيب بآخر سطر «سياق كاروسيل إحدى منتجات نطاق».
5. اكتب موجزًا كاملًا (موضوع + منصة) → المتوقع ملفات `slide-01.png…` وZIP في مجلد العمل، بدون أي استدعاء لـ Claude.
6. إذا منع وضع العزل (sandbox) تشغيل Chromium أو الكتابة، اسمح بتشغيل الأوامر في مجلد العمل أو شغّل
   `node scripts/siyaq.mjs render …` يدويًا — الأداة نفسها لا تعتمد على Codex.
7. سجّل النتيجة وحدّث جدول الحالة أعلاه.
