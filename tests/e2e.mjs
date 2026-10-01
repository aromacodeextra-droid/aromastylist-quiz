// End-to-end test of the quiz in the harness (Playwright, bundled Chromium).
//  - completes the quiz 5 times at 390px and 5 times at 1440px, screenshots every screen
//  - generates the share image (checks 1080x1920), copies the link and checks it reopens the same result
//  - "Add all" -> checks the POST /cart/add.js payload is {items:[{id, quantity:1}, ...]} (mocked endpoint)
//  - checks analytics events and that they carry no personal data
//  - no-JS: quiz hidden, the rest of the page still shows
//  - screenshots the live find-your-perfume page for a look comparison
// Usage: node tests/e2e.mjs   (starts harness/server.mjs itself)
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { routeExternal } from './external.mjs';

const PORT = 8790;
const BASE = `http://localhost:${PORT}`;
const PAGE = `${BASE}/pages/find-your-perfume`;
const SHOTS = 'screenshots';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync('tests/reports', { recursive: true });

// steps: 'id' = tap that answer tile; {search, pick} = type and tap the first hit; {chip} = popular pick;
// 'skip' = no favourite perfume; {notes:[...]} = choose note families, then Continue
const RUNS = [
  ['her', { search: 'black opium' }, 'similar', 'evening', 'romance-presence', 'fills', 'cold'],
  ['him', { chip: 'dior-sauvage' }, 'complement', 'work', 'focus-flow', 'close', 'mild'],
  ['both', 'skip', { notes: ['citrus', 'green', 'aquatic'] }, 'everyday', 'morning-boost', 'noticed', 'hot'],
  ['her', { chip: 'parfums-de-marly-delina' }, 'similar', 'special', 'celebrate-indulge', 'noticed', 'cold'],
  ['him', 'skip', { notes: ['woods', 'spices'] }, 'everyday', 'move-thrive', 'close', 'hot'],
];
const BACK_RUN = 1; // run 2 also checks the back button

async function step(page, s) {
  if (typeof s === 'string' && s === 'skip') return page.click('[data-act=skip]');
  if (typeof s === 'string') return page.click(`[data-act=answer][data-a="${s}"]`);
  if (s.search) { await page.fill('[data-sq-search]', s.search); await page.click('.sq-result-item'); return; }
  if (s.chip) return page.click(`.sq-chip[data-id="${s.chip}"]`);
  if (s.notes) { for (const n of s.notes) await page.click(`[data-act=toggle][data-a="${n}"]`); return page.click('[data-act=next]'); }
}
const firstSel = (s) => (s === 'skip' ? '[data-act=skip]' : typeof s === 'string' ? `[data-act=answer][data-a="${s}"]` : s.search ? '[data-sq-search]' : s.chip ? `.sq-chip[data-id="${s.chip}"]` : `[data-act=toggle][data-a="${s.notes[0]}"]`);
const VIEWPORTS = [{ name: '390', width: 390, height: 844 }, { name: '1440', width: 1440, height: 900 }];

const report = { runs: [], checks: [], cart_payloads: [], events: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

const server = spawn(process.execPath, ['harness/server.mjs', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res) => server.stdout.on('data', (d) => { if (String(d).includes('harness:')) res(); }));

const browser = await chromium.launch();
async function newContext(opts = {}) {
  const ctx = await browser.newContext({ ...opts });
  await routeExternal(ctx);
  return ctx;
}
async function settle(page) {
  // load lazy images before a full-page screenshot, then wait for fonts
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    await document.fonts.ready;
  });
  await page.waitForTimeout(350);
}
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const resultState = (page) => page.evaluate(() => ({
  persona: document.querySelector('.sq-persona')?.textContent.trim(),
  items: [...document.querySelectorAll('.sq-card [data-act=add]')].map((b) => ({ handle: b.dataset.handle, variant: +b.dataset.variant })),
  houses: [...document.querySelectorAll('.sq-card__house')].map((e) => e.textContent.trim()),
  set: document.querySelector('.sq-set [data-act=add-set]')?.dataset.handle || null,
}));

for (const vp of VIEWPORTS) {
  for (let r = 0; r < RUNS.length; r++) {
    const answers = RUNS[r];
    const ctx = await newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const addRequests = [];
    page.on('request', (req) => { if (req.url().endsWith('/cart/add.js')) addRequests.push(JSON.parse(req.postData())); });
    await fetch(`${BASE}/cart/clear.js`);
    const tag = `${vp.name}-run${r + 1}`;
    const all = r === 0; // every screen for run 1, result screens for the other runs

    await page.goto(PAGE);
    await page.waitForSelector('.sq-intro');
    if (all) { await settle(page); await page.screenshot({ path: `${SHOTS}/${vp.name}-01-intro.png`, fullPage: true }); }
    await page.click('[data-act=start]');
    for (let i = 0; i < answers.length; i++) {
      await page.waitForSelector(firstSel(answers[i]));
      if (all || (r === 2 && i === 2)) { await settle(page); await page.screenshot({ path: `${SHOTS}/${vp.name}-${String(i + 2).padStart(2, '0')}-run${r + 1}-step${i + 1}.png`, fullPage: true }); }
      if (r === BACK_RUN && i === 3) {
        // back button: go back one question (the DNA screen) and forward again
        await page.click('[data-act=back]');
        await page.waitForSelector('.sq-dna');
        await step(page, answers[2]);
        await page.waitForSelector(firstSel(answers[3]));
      }
      await step(page, answers[i]);
    }
    await page.waitForSelector('.sq-result');
    const state = await resultState(page);
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-07-result-run${r + 1}.png`, fullPage: true });
    const okCount = state.items.length >= 3 && state.items.length <= 5;
    check(`${tag}: ${state.items.length} perfumes from ${new Set(state.houses).size} houses`, okCount && new Set(state.houses).size >= 2, state.persona);
    if (answers.some((x) => typeof x === 'object')) {
      const dna = await page.$$eval('.sq-ref--result .sq-dna__bars li', (l) => l.length);
      const tasteLines = await page.$$eval('.sq-cards .sq-card__why--taste', (l) => l.length);
      check(`${tag}: note DNA shown and every card says which notes it shares`, dna >= 1 && tasteLines === state.items.length, `${dna} families, ${tasteLines}/${state.items.length} cards`);
    }
    const url = page.url();
    check(`${tag}: URL carries the answers`, /[?&]sq=[^&]+/.test(url) && decodeURIComponent(url).split('sq=')[1].split('.').length === 8, decodeURIComponent(url.replace(BASE, '')));

    // share image
    await page.click('[data-act=share-open]');
    await page.waitForFunction(() => document.querySelector('[data-sq-preview]')?.src?.startsWith('blob:'));
    if (all || r === 1) { await settle(page); await page.screenshot({ path: `${SHOTS}/${vp.name}-08-share-run${r + 1}.png`, fullPage: true }); }
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=download]')]);
    const imgPath = `${SHOTS}/share-story-${tag}.png`;
    await download.saveAs(imgPath);
    const size = pngSize(fs.readFileSync(imgPath));
    check(`${tag}: share image is 1080x1920`, size.w === 1080 && size.h === 1920, `${size.w}x${size.h}`);

    // copy link -> open in a fresh context -> same result
    await page.click('[data-act=copy]');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const ctx2 = await newContext({ viewport: { width: vp.width, height: vp.height } });
    const page2 = await ctx2.newPage();
    await page2.goto(copied);
    await page2.waitForSelector('.sq-result');
    const state2 = await resultState(page2);
    const same = state2.persona === state.persona && JSON.stringify(state2.items) === JSON.stringify(state.items);
    check(`${tag}: shared link reopens the same result`, same && (await page2.$('.sq-shared')) != null, copied.replace(BASE, ''));
    if (all) { await settle(page2); await page2.screenshot({ path: `${SHOTS}/${vp.name}-09-shared-link.png`, fullPage: true }); }
    await ctx2.close();

    // single add, then add all
    if (r === 2) {
      await page.click('.sq-card [data-act=add]');
      await page.waitForSelector('.sq-btn--done');
      await page.waitForFunction(() => document.querySelector('#cart-count').textContent === '1');
      check(`${tag}: "Add sample" adds one item and updates the header count`, true);
      await settle(page);
      await page.screenshot({ path: `${SHOTS}/${vp.name}-10-added-sample.png`, fullPage: true });
    }
    await Promise.all([page.waitForURL(`${BASE}/cart`), page.click('[data-act=add-all]')]);
    const payload = addRequests[addRequests.length - 1];
    const expected = { items: state.items.map((i) => ({ id: i.variant, quantity: 1 })) };
    check(`${tag}: "Add all" POSTs /cart/add.js with items [{id, quantity:1}]`, JSON.stringify(payload) === JSON.stringify(expected), JSON.stringify(payload));
    report.cart_payloads.push({ run: tag, payload });
    if (all) await page.screenshot({ path: `${SHOTS}/${vp.name}-11-cart-mock.png` });

    // analytics
    await page.goBack();
    const events = await page.evaluate(() => window.__sqEvents).catch(() => []);
    report.events.push({ run: tag, names: events.map((e) => e.name) });
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    report.runs.push({ run: tag, answers, ...state, share_image: imgPath });
    await ctx.close();
  }
}

// analytics events: capture a whole session in one page (goBack above reloads the page, so re-run one)
{
  const ctx = await newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.route('**/cart', (route) => route.fulfill({ status: 200, body: 'cart' }));
  await page.goto(PAGE);
  await page.click('[data-act=start]');
  for (const s of RUNS[0]) { await page.waitForSelector(firstSel(s)); await step(page, s); }
  await page.waitForSelector('.sq-result');
  await page.click('[data-act=share-open]');
  await page.click('[data-act=copy]');
  await page.click('.sq-card [data-act=add]');
  await page.waitForSelector('.sq-btn--done');
  const events = await page.evaluate(() => window.__sqEvents);
  const names = events.map((e) => e.name);
  for (const n of ['quiz_started', 'quiz_completed', 'quiz_shared', 'quiz_add_to_cart']) check(`analytics: ${n} published`, names.includes(n));
  const blob = JSON.stringify(events);
  check('analytics: no personal data (no email / name / ip / customer fields)', !/@|email|phone|customer|first_name|last_name|"ip"/i.test(blob));
  report.analytics_sample = events;
  await ctx.close();
}

// no JavaScript: quiz stays hidden, the rest of the page is visible
{
  const ctx = await newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  const quizVisible = await page.isVisible('[data-scent-quiz]');
  const existingVisible = await page.isVisible('[data-existing-content]');
  const personasInHtml = await page.$$eval('.sq-personas__list li', (l) => l.length);
  check('no-JS: quiz hidden, existing page content visible', !quizVisible && existingVisible);
  check('no-JS: persona texts are static HTML (crawlable)', personasInHtml >= 12, `${personasInHtml} personas`);
  await page.screenshot({ path: `${SHOTS}/390-00-no-js.png`, fullPage: true });
  await ctx.close();
}

// the live page, for a look comparison
for (const vp of VIEWPORTS) {
  const ctx = await newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  try {
    await page.goto('https://aromastylist.com/pages/find-your-perfume', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/live-find-your-perfume-${vp.name}.png` });
    check(`live page screenshot ${vp.name}`, true);
  } catch (e) {
    check(`live page screenshot ${vp.name}`, false, e.message.split('\n')[0]);
  }
  await ctx.close();
}

// weight
const assets = ['scent-quiz.js', 'scent-quiz.css', 'scent-quiz-aromastylist.json', 'scent-quiz-aromastylist-taste.json'].map((f) => [f, fs.statSync(`theme-files/assets/${f}`).size]);
const total = assets.reduce((s, [, n]) => s + n, 0);
report.weight = Object.fromEntries(assets);
report.weight.total = total;
check(`added weight ${(total / 1024).toFixed(1)} KB <= 150 KB`, total <= 150 * 1024, assets.map(([f, n]) => `${f} ${(n / 1024).toFixed(1)} KB`).join(', '));
check('every theme file < 60 KB', [...assets.map(([, n]) => n), fs.statSync('theme-files/sections/scent-quiz.liquid').size, fs.statSync('theme-files/sections/scent-quiz-personas.liquid').size].every((n) => n < 60 * 1024));

await browser.close();
server.kill();
fs.writeFileSync('tests/reports/e2e.json', JSON.stringify(report, null, 2) + '\n');
const failed = report.checks.filter((c) => !c.ok);
console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
