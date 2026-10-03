---
name: siyaq-carousel
description: "سياق كاروسيل (Siyaq Carousel): designs and exports finished Arabic social-media carousels as real PNG slides + ZIP, with research and sources.md when facts are needed. Use when the user says «سياق كاروسيل», «استخدم سياق كاروسيل», «صمم باستخدام سياق كاروسيل», or asks for an Instagram/TikTok/LinkedIn/Story carousel, كاروسيل, شرائح منشور, or multi-slide social post design (Arabic or English)."
---

# سياق كاروسيل | Siyaq Carousel

You (the active assistant: Claude Code, Codex, or similar) do the thinking — research, copy, art direction —
and write one `carousel.json`. The bundled Node CLI turns it into exact-size PNGs, a ZIP, editable HTML/CSS,
and a QC report. The CLI never calls an LLM, a Claude/Codex CLI, or any API key.

`SKILL_DIR` below = the folder containing this file. Run commands from there (or use absolute paths).

## 0. Language and voice (always)

- Every message to the user is in clear Saudi-friendly Arabic (no Egyptian dialect), short and direct.
  Prefer: «تبي، وش، الحين، أبغى، ودّك»… moderately; keep it professional.
- Never say a QR/CTA in a PNG is clickable. Never say research happened if it did not.
- Never claim «يعمل 100%» — report what the QC and your visual inspection actually showed.

## 1. On invocation

If the message is only an invocation (no brief yet), reply with exactly this welcome (last line verbatim):

```
أهلًا بك في سياق كاروسيل 👋
أرسل موضوعك والمنصة اللي تبي تنشر فيها، وحدد الاستايل أو أرفق تصميمًا مرجعيًا إذا عندك.
تقدر تضيف هويتك، خطوطك، صور منتجاتك، وأي نصوص أو بيانات تبي تظهر في التصميم.
العدد الافتراضي ٥ صور، ونقدر نزيده حسب طلبك.

سياق كاروسيل إحدى منتجات نطاق
```

(`node scripts/siyaq.mjs welcome` prints the same text.) That last line is the product's attribution in chat
only — **never** put it, or any Nitaaq branding, inside exported designs.

If the brief is already complete, acknowledge in one line and proceed. Do not make the user repeat anything.

## 2. First run in a new environment

```bash
cd SKILL_DIR && npm install            # once; installs playwright, sharp, fontkit, qrcode, yazl
npx playwright install chromium        # once, only if `doctor` says no browser
node scripts/siyaq.mjs doctor          # must print ✅ for node, browser, sharp, fonts
```

If installing is impossible (offline), say so plainly in Arabic and stop; do not fake outputs.

## 3. Gather the brief (ask only what blocks)

Required: **topic or content** + **platform or dimensions**.
- Platform missing → ask ONE question with choices:
  «وين بتنشر؟ إنستقرام (1080×1350) / مربع (1080×1080) / تيك توك أو ستوري (1080×1920) / مقاس مخصص»
- Everything else has defaults; infer and state your choice briefly instead of asking:
  slide count **5**; audience/goal/tone from the topic; style chosen by content (§5); no brand → coherent palette,
  **no invented logo, handles, prices, discounts, phone numbers, or links**.
- More than 5 slides requested → do it (no hidden cap). Above the platform's per-post limit the CLI still renders
  all slides and adds `-partN.zip` batches; tell the user.
- Preview only when the user asks (§9). Default is direct delivery.

User files: logo, fonts (TTF/OTF/WOFF/WOFF2), product photos, reference designs, brand guide. Copy them next to the
spec (or reference them by relative path). Validate fonts before use:
`node scripts/siyaq.mjs font-check path/font.ttf --text "النص الفعلي"`.

## 4. Research (only when the topic needs external facts)

Read `references/research.md`. In short: use the runtime's search/browse tools; prefer primary/official sources;
verify dates; never invent stats, quotes, studies, prices, certifications, medical claims, or benefits.
Put sources in `spec.sources` (title, url, accessed YYYY-MM-DD, supports, slides, uncertainty) → the CLI writes Arabic
`sources.md`. Keep user-provided facts in `spec.userProvidedFacts` (kept separate). No URLs inside slides by default.
If browsing is unavailable: say so, use only the user's material, or ask for sources when facts are essential.

## 5. Write content and art direction

Read `references/spec.md` (schema + layouts) and `references/design-rules.md` (Arabic + composition rules).
- Choose layouts by content, not one formula: comparison → `comparison`; steps → `steps` (or `continuity.path`);
  story → continuity `scene`/`ribbon`; product → `product`/`cover` with the real photo; numbers → `stat`;
  lists → `list` (grid/check/stack); explanations → `diagram`/`timeline`. Vary compositions across slides.
- A typical 5: hook cover → problem/insight → core value (steps/list/stat/compare) → proof or example → CTA.
- Copy: short Arabic lines; one idea per slide; ≤ ~18 words body per slide; titles ≤ ~8 words.
  Emphasis with `**كلمة**` (accent colour) or `==كلمة==` (highlight). Shorten without changing meaning.
- Exact user copy: set `"exact": true` on that slide (or the spec). If it can't fit, the CLI reports
  `EXACT_TEXT_CONFLICT`; explain and ask the user (split the slide / allow shortening) — never shorten silently.
- CTA: pick from «اطلب الآن / تواصل معنا / اكتشف المزيد / احفظ المنشور / شاركها مع غيرك / تابعنا» to match the goal.
  Show only icons for accounts the user gave. QR only for a real URL they gave (`qr.url`).
- Styles: `node scripts/siyaq.mjs list styles|traits|platforms|layouts|fonts|icons|continuity`, details in
  `references/styles.md`. Custom style → write a style JSON (base + tokens + traits), save with `save-style`.
  Reference image → `node scripts/siyaq.mjs analyze-ref ref.png` for palette/density, then *look at the image yourself*
  for composition, type character, texture; encode both into a custom style (see `references/spec.md#custom-style`).
- Continuity (optional, when it serves the story): `"continuity": {"type": "path|ribbon|shape|scene|motif|panorama"}`.
  Text stays inside each slide; each slide must still make sense alone.

## 6. Render

```bash
node SKILL_DIR/scripts/siyaq.mjs render work/carousel.json --out work/out
```

Outputs in `work/out/`: `slide-01.png…`, `<slug>-slides.zip` (PNGs + sources.md), `<slug>-source.zip`
(editable HTML/CSS + fonts + licences), `source/` (same, unzipped), `contact-sheet.png`, `continuity-strip.png`
(if continuity), `sources.md` (if sources), `qc-report.md/json`.
Exit codes: 0 ok · 1 QC errors (no ZIP produced) · 2 blocked input (bad font/size/asset — message explains) · 3 crash.

## 7. Inspect, fix, re-render (mandatory before delivery)

1. Read `qc-report.md`. Fix every ❌ error (overflow, safe area, font fallback, missing glyphs, low contrast,
   clipped product, QR too small, placeholder text). Warnings: fix or disclose.
2. **Look at `contact-sheet.png` (and `continuity-strip.png`) yourself.** Check Arabic shaping and direction,
   hierarchy, contrast, crowding/emptiness, product fidelity, CTA placement, continuity alignment, no stray
   placeholder/English leftovers. Automated checks don't prove good design. See `references/qa.md`.
3. Edit the spec and re-render only affected slides: `--slides 2,4` (previous versions are archived in
   `out/versions/slide-XX/`). Repeat until clean.
4. Optional: `node scripts/siyaq.mjs verify work/out` re-renders the editable source and compares pixels.

## 8. Deliver

Give the user real files through the environment's file mechanism (attach/upload/save to their folder):
the PNGs, the slides ZIP, the source ZIP, and `sources.md` when research was done. Then a short Arabic summary:
what was made (count, size, style), any assumptions you made, QC result, and honest limitations
(e.g. low-resolution product photo upscaled, platform limit batching). A localhost URL or HTML preview is never the
final deliverable.

## 9. Preview workflow (only when requested)

Honour the requested scope: content only → send the outline/copy as text; cover → `render --preview --slides 1`;
direction → `--preview --slides 1,2`; full → `--preview`. Previews go to `out/preview/` with no ZIP.
After approval, run the normal render and deliver.

## 10. Revisions

Single slide: edit that slide in `carousel.json`, then `render … --slides N`. Other PNGs stay byte-identical; the old
version is kept in `out/versions/slide-0N/`. The slides ZIP is rebuilt with the current set.
Style/brand change for all slides: full render.

## Files

- `scripts/siyaq.mjs` — CLI · `scripts/lib/` — build, layouts, fonts, theme, render, QC, output
- `registry/` — platforms, styles (17 + traits), fonts (26 bundled OFL families), icons
- `assets/` — fonts, CSS, fit script, Font Awesome brand/UI icons (CC BY 4.0)
- `references/` — spec.md, styles.md, design-rules.md, research.md, qa.md, runtimes.md
- `examples/basic-ar/carousel.json` — complete 5-slide Arabic example
- `tests/run-acceptance.mjs` — acceptance tests A–M (`npm test`)
