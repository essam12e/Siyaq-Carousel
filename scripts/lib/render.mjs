// Headless Chromium rendering (Playwright) + in-page measurements for QC.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SiyaqError } from './util.mjs';

const CANDIDATES = [
  process.env.SIYAQ_CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

export async function launchBrowser() {
  let pw;
  try { pw = await import('playwright'); } catch { throw new SiyaqError('NO_PLAYWRIGHT', 'حزمة playwright غير مثبتة. شغّل: npm install داخل مجلد المهارة.'); }
  const args = ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text'];
  try { return await pw.chromium.launch({ args }); } catch (e1) {
    for (const p of CANDIDATES) { if (fs.existsSync(p)) { try { return await pw.chromium.launch({ executablePath: p, args }); } catch { /* next */ } } }
    throw new SiyaqError('NO_BROWSER', `لم أجد متصفح Chromium. شغّل: npx playwright install chromium أو حدد SIYAQ_CHROME_PATH. (${e1.message.split('\n')[0]})`);
  }
}

const MEASURE = () => {
  const r2o = (r) => ({ x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
  const cs = getComputedStyle(document.documentElement);
  const px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
  const W = px('--W'), H = px('--H');
  const stage = document.querySelector('.stage');
  const tx = [...document.querySelectorAll('.tx')].map((el) => {
    const st = getComputedStyle(el); const r = el.getBoundingClientRect();
    // tight text box from line boxes
    const range = document.createRange(); range.selectNodeContents(el); const rr = range.getBoundingClientRect();
    return { f: el.dataset.f, text: el.innerText.slice(0, 300), rect: r2o(rr.width ? rr : r), box: r2o(r), fontSize: parseFloat(st.fontSize), color: st.color, family: st.fontFamily.split(',')[0].replace(/"/g, '').trim(),
      overflowX: el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2, inStage: !!el.closest('.stage'), onImage: !!el.closest('.on-image'), hidden: st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0' };
  });
  const important = [...document.querySelectorAll('[data-brand], [data-cta], .qr, .logo-big, .counter, .swipe, .handle-mini')].map((el) => ({ kind: el.dataset.brand ? 'brand' : el.dataset.cta ? 'cta-' + el.dataset.cta : el.className.split(' ')[0], rect: r2o(el.getBoundingClientRect()) }));
  const imgs = [...document.querySelectorAll('img')].map((im) => { const st = getComputedStyle(im); return { asset: im.dataset.asset || im.getAttribute('src'), ok: im.complete && im.naturalWidth > 0, nw: im.naturalWidth, nh: im.naturalHeight, rect: r2o(im.getBoundingClientRect()), fit: st.objectFit, cls: im.className }; });
  const qr = [...document.querySelectorAll('.qr')].map((q) => ({ url: q.dataset.qr, rect: r2o(q.getBoundingClientRect()) }));
  const fonts = [...document.fonts].map((f) => ({ family: f.family.replace(/"/g, ''), weight: f.weight, status: f.status }));
  return { W, H, fit: window.__siyaqFit, stage: stage ? { rect: r2o(stage.getBoundingClientRect()), sh: stage.scrollHeight, ch: stage.clientHeight } : null,
    tx, important, imgs, qr, fonts, safe: { t: px('--in-t'), r: px('--in-r'), b: px('--in-b'), l: px('--in-l') } };
};

export async function renderDocs(docs, { W, H, outPngDir, concurrency = 3, fileName = (d) => `slide-${String(d.index).padStart(2, '0')}.png` }) {
  const browser = await launchBrowser();
  const results = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'ar-SA', colorScheme: 'light' });
    const queue = [...docs];
    const work = async () => {
      while (queue.length) {
        const d = queue.shift();
        const page = await ctx.newPage();
        const consoleErrors = [];
        page.on('pageerror', (e) => consoleErrors.push(e.message));
        page.on('requestfailed', (r) => consoleErrors.push(`failed: ${decodeURIComponent(r.url()).slice(-120)}`));
        try {
          await page.goto(pathToFileURL(d.file).href, { waitUntil: 'load', timeout: 60000 });
          await page.waitForFunction(() => window.__siyaqFit && window.__siyaqFit.done, null, { timeout: 30000 });
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const m = await page.evaluate(MEASURE);
          // which fonts actually rendered each text element (detects silent fallback)
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
          const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
          const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.tx' });
          for (let k = 0; k < nodeIds.length && k < m.tx.length; k++) {
            try { const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[k] }); m.tx[k].used = fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount })); } catch { m.tx[k].used = []; }
          }
          await cdp.detach();
          const png = path.join(outPngDir, fileName(d));
          fs.mkdirSync(outPngDir, { recursive: true });
          await page.screenshot({ path: png, type: 'png', clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled' });
          // continuity-only capture: the seam check compares the shared artwork itself, not per-slide backgrounds
          let contShot = null;
          if (await page.$('.continuity')) {
            await page.addStyleTag({ content: 'html,body,.canvas{background:transparent!important} .canvas > *:not(.continuity){visibility:hidden!important} .continuity, .continuity *{visibility:visible!important}' });
            contShot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H }, omitBackground: true, animations: 'disabled' });
          }
          results.push({ ...d, png, contShot, measure: m, consoleErrors });
        } finally { await page.close(); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, docs.length) }, work));
    await ctx.close();
  } finally { await browser.close(); }
  return results.sort((a, b) => a.index - b.index);
}
