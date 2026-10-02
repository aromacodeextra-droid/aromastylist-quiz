// End-to-end test of the v3 quiz in the harness (Playwright, bundled Chromium), at 390 and 1440 px:
//  run A  named perfume: popular tile + fuzzy search ("bacarat"), taboos, week, full wardrobe ... -> result
//  run B  "I don't have one" -> note families -> day & night -> result with 2 slots
//  run C  deep link with preview_theme_id -> opens the result; "Copy link" keeps preview_theme_id
// Checks: one card per slot (biggest first), in stock, chosen perfumes as chips with notes under the box, share image 1080x1920, copied link
// reopens the same result, "Add all" POSTs {items:[{id,quantity:1}...]}, analytics carry no personal data,
// no email field anywhere, no-JS leaves the page as is, weight budgets. Screenshots -> screenshots/.
// Usage: node tests/e2e.mjs   (starts harness/server.mjs itself)
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { routeExternal } from './external.mjs';

const PORT = 8790;
const BASE = `http://localhost:${PORT}`;
const PAGE = `${BASE}/pages/find-your-perfume`;
const SHOTS = 'screenshots';
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync('tests/reports', { recursive: true });
const VIEWPORTS = [{ name: '390', width: 390, height: 844 }, { name: '1440', width: 1440, height: 900 }];

const report = { checks: [], runs: [], cart_payloads: [] };
// one-answer screens: tap the answer, then Continue (no auto-advance since v3.9)
// a full-page capture would freeze the floating Continue mid-page: show it in its place for the capture
const fullShot = async (page, file) => {
  await page.evaluate(() => { const st = document.createElement('style'); st.id = 'sq-shot'; st.textContent = '.sq-next.is-floating{position:static!important;box-shadow:none!important;padding:0!important}'; document.head.append(st); });
  await page.screenshot({ path: file, fullPage: true });
  await page.evaluate(() => document.getElementById('sq-shot')?.remove());
};
const choose = async (page, sel) => { await page.click(sel); await page.click('[data-act=next]'); };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
};

const server = spawn(process.execPath, ['harness/server.mjs', String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill()); // a failed run must not leave the harness holding the port
await new Promise((res) => server.stdout.on('data', (d) => { if (String(d).includes('harness:')) res(); }));
const browser = await chromium.launch();
async function newContext(opts = {}) {
  const ctx = await browser.newContext({ ...opts });
  await routeExternal(ctx);
  return ctx;
}
async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
    window.scrollTo(0, 0);
    const pending = [...document.images].filter((i) => !i.complete && i.offsetParent !== null);
    await Promise.race([Promise.all(pending.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 5000))]);
    await document.fonts.ready;
  });
  await page.waitForTimeout(300);
}
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const resultState = (page) => page.evaluate(() => ({
  persona: document.querySelector('.sq-persona')?.textContent.trim(),
  slots: [...document.querySelectorAll('.sq-card--slot .sq-shelf__name')].map((e) => e.textContent.trim()),
  items: [...document.querySelectorAll('.sq-card--slot > .sq-card__body > [data-act=add]')].map((b) => ({ handle: b.dataset.handle, variant: +b.dataset.variant })),
  houses: [...document.querySelectorAll('.sq-card--slot .sq-card__house')].map((e) => e.textContent.trim()),
  why: [...document.querySelectorAll('[data-sq-why]')].map((e) => e.textContent.trim()),
  shares: [...document.querySelectorAll('[data-sq-shares]')].map((e) => e.textContent.trim()),
  profile: document.querySelectorAll('.sq-ref--result .sq-dna__bars li').length,
  set: document.querySelector('.sq-set [data-act=add-set]')?.dataset.handle || null,
}));

for (const vp of VIEWPORTS) {
  const shot = async (page, name) => { await settle(page); await fullShot(page, `${SHOTS}/${vp.name}-${name}.png`); };
  // ---------------------------------------------------------------- run A: with a named perfume
  {
    const tag = `${vp.name}-A`;
    const ctx = await newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [], adds = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (req) => { if (req.url().endsWith('/cart/add.js')) adds.push(JSON.parse(req.postData())); });
    await fetch(`${BASE}/cart/clear.js`);
    await page.goto(PAGE);
    await page.waitForSelector('.sq-intro');
    await shot(page, '01-intro');
    await page.click('[data-act=start]');
    await shot(page, '02-for');
    // v3.9: a tap selects, Continue moves on; the page's own sections wait while a question is on screen
    await page.click('[data-act=answer][data-a=her]');
    const v39 = await page.evaluate(() => ({ still: !!document.querySelector('.sq-q[data-q=for]'), pressed: document.querySelector('[data-a=her]').getAttribute('aria-pressed'),
      hint: document.querySelector('.sq-q .sq-sub')?.textContent, enabled: !document.querySelector('[data-act=next][data-q=for]').disabled,
      pageHidden: getComputedStyle(document.querySelector('[data-existing-content]')).display === 'none' }));
    check(`${tag}: screen 1 = "Which fragrances do you prefer?" For Her / For Him / Unisex`, await page.evaluate(() => document.querySelector('.sq-q .sq-title').textContent === 'Which fragrances do you prefer?' && [...document.querySelectorAll('.sq-tile__label')].map((e) => e.textContent).join('|') === 'For Her|For Him|Unisex'));
    check(`${tag}: one-answer screen stays after a tap ("Pick one.", Continue enabled), page sections below hidden while asking`, v39.still && v39.pressed === 'true' && v39.hint === 'Pick one.' && v39.enabled && v39.pageHidden, JSON.stringify(v39));
    await page.click('[data-act=next][data-q=for]');
    await page.waitForSelector('.sq-pop__tile');
    const tiles = await page.$$eval('.sq-pop__tile', (l) => l.length);
    check(`${tag}: 12 bottle tiles under the name box`, tiles === 12, `${tiles} tiles`);
    const imgSrc = await page.getAttribute('.sq-pop__tile img', 'src');
    check(`${tag}: bottle images carry a version (?v=), so a replaced image reaches phones at once`, /sq-ref-.*\.webp\?v=[0-9a-f]{8}$/.test(imgSrc), imgSrc);
    await shot(page, '03-ref');
    await page.fill('[data-sq-search]', 'bacarat');
    await page.waitForSelector('.sq-result-item');
    const firstHit = await page.$eval('.sq-result-item', (b) => b.textContent);
    check(`${tag}: typo "bacarat" finds Baccarat Rouge 540`, /Baccarat Rouge 540/.test(firstHit), firstHit);
    await shot(page, '03b-search');
    await page.click('.sq-result-item');
    await page.waitForSelector('.sq-picked .sq-picked__notes');
    await page.click('.sq-pop__tile[data-id="ysl-black-opium"]');
    await page.waitForFunction(() => document.querySelectorAll('.sq-picked').length === 2);
    const inside = await page.$$eval('.sq-picked', (l) => l.map((e) => e.querySelector('.sq-picked__name').textContent + ' | ' + e.querySelector('.sq-picked__notes').textContent));
    const chipsUnderBox = await page.evaluate(() => !!(document.querySelector('[data-sq-search]').compareDocumentPosition(document.querySelector('.sq-picked-list')) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(document.querySelector('.sq-picked-list').compareDocumentPosition(document.querySelector('.sq-pop')) & Node.DOCUMENT_POSITION_FOLLOWING));
    check(`${tag}: both picks shown as chips with notes, right under the box (max 2)`, inside.length === 2 && chipsUnderBox && inside.every((t) => /\| \S/.test(t)), inside.join(' / '));
    await shot(page, '03c-inside');
    await page.click('[data-act=next][data-q=ref]');
    await page.waitForSelector('.sq-chip');
    const tabooScreen = await page.evaluate(() => ({ title: document.querySelector('.sq-q .sq-title').textContent, hint: document.querySelector('.sq-q .sq-sub')?.textContent,
      chips: [...document.querySelectorAll('.sq-chips--taboo .sq-chip span')].map((e) => e.textContent), andAlso: /and also/i.test(document.querySelector('.sq-q').textContent),
      switches: document.querySelectorAll('.sq-q [data-a=strong], .sq-q [data-a=office]').length }));
    check(`${tag}: taboo answers named by notes, Oud and Smoke & incense separate`, tabooScreen.chips.join('|') === 'Very sweet|Powdery|Intense florals|Marine & ozonic|Oud|Smoke & incense|Coconut|Patchouli|Nothing in particular', tabooScreen.chips.join('|'));
    check(`${tag}: taboo screen = "What would you rather avoid?" + "Select all that apply." + one grid with "Nothing in particular"; switches moved out`,
      tabooScreen.title === 'What would you rather avoid?' && tabooScreen.hint === 'Select all that apply.' && tabooScreen.chips.includes('Nothing in particular') && !tabooScreen.andAlso && tabooScreen.switches === 0, JSON.stringify(tabooScreen.chips));
    for (const a of ['too-sweet', 'coconut']) await page.click(`[data-act=toggle][data-a="${a}"]`);
    await shot(page, '04-taboos');
    await page.click('[data-act=next][data-q=taboos]');
    await page.waitForSelector('.sq-chips--moments');
    // v3.11: moments, nothing chosen beforehand, Continue waits for one; the office line appears only with Work & study
    const m0 = await page.evaluate(() => ({ title: document.querySelector('.sq-q .sq-title').textContent, labels: [...document.querySelectorAll('.sq-chips--moments .sq-chip span')].map((e) => e.textContent),
      pressed: document.querySelectorAll('.sq-chips--moments [aria-pressed=true]').length, disabled: document.querySelector('[data-act=next][data-q=week]').disabled, office: !!document.querySelector('[data-a=office]') }));
    check(`${tag}: "Which moments would you like a fragrance for?" - 7 moments in the owner's order, none chosen, Continue waits, no office line yet`,
      m0.title === 'Which moments would you like a fragrance for?' && m0.labels.join('|') === 'Everyday & errands|Work & study|Evenings & dates|Special occasions|Home & family|Sport & active|Me-time' && m0.pressed === 0 && m0.disabled && !m0.office, JSON.stringify(m0));
    // work, evenings, everyday, events
    for (const row of [0, 3, 1, 4]) await page.click(`[data-act=moment][data-row="${row}"]`);
    await page.click('[data-act=toggle][data-a=office]');
    check(`${tag}: after Work & study, "My workplace or classroom prefers subtle scents" appears and can be ticked`, (await page.getAttribute('[data-a=office]', 'aria-pressed')) === 'true');
    // taking Work & study away takes the office line (and its tick) with it; put both back
    await page.click('[data-act=moment][data-row="0"]');
    const officeGone = await page.evaluate(() => !document.querySelector('[data-a=office]'));
    await page.click('[data-act=moment][data-row="0"]');
    const officeBackUnticked = (await page.getAttribute('[data-a=office]', 'aria-pressed')) === 'false';
    await page.click('[data-act=toggle][data-a=office]');
    check(`${tag}: removing Work & study removes the office line and its tick`, officeGone && officeBackUnticked);
    await shot(page, '05-week');
    // UX step 4: Continue stays in view on a long screen, counter "4 / 10", persona list waits, viewport shot
    await page.evaluate(() => window.scrollTo(0, 0));
    const ux4 = await page.evaluate(() => { const r = document.querySelector('[data-act=next][data-q=week]').getBoundingClientRect(), p = document.querySelector('.sq-section--personas');
      const n = document.querySelector('.sq-q .sq-next'), anc = []; for (let e = n; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.overflow !== 'visible' || cs.position === 'sticky') anc.push(e.tagName + '#' + e.id + '.' + e.className + ':' + cs.overflow + ':' + cs.position); }
      return { anc, rt: r.top, ih: innerHeight, inView: r.top >= 0 && r.bottom <= innerHeight, step: document.querySelector('.sq-top .sq-step').textContent, personas: p ? getComputedStyle(p).display : 'missing' }; });
    check(`${tag}: week screen - Continue visible without scrolling, counter "4 / 10", persona list hidden during the quiz`, ux4.inView && ux4.step === '4 / 10' && ux4.personas === 'none', JSON.stringify(ux4));
    await page.screenshot({ path: `${SHOTS}/${vp.name}-05b-week-viewport.png` });
    await page.click('[data-act=next][data-q=week]');
    await shot(page, '06-how');
    await choose(page, '[data-act=answer][data-a=full-wardrobe]');
    await page.click('[data-act=toggle][data-a=confident]');
    await page.click('[data-act=toggle][data-a=attractive]');
    await page.click('[data-act=toggle][data-a=calm]');
    const limit = await page.evaluate(() => ({ calm: document.querySelector('[data-a=calm]').getAttribute('aria-pressed'), msg: document.querySelector('[data-sq-count]').textContent }));
    check(`${tag}: a third feeling is not taken silently: "You can pick 2" message, the two stay`, limit.calm === 'false' && /You can pick 2/.test(limit.msg), JSON.stringify(limit));
    check(`${tag}: "How do you want to feel?" with Carefree, three in a row`, await page.evaluate(() => document.querySelector('.sq-q .sq-title').textContent === 'How do you want to feel?' && [...document.querySelectorAll('.sq-tile__label')].pop().textContent === 'Carefree' && getComputedStyle(document.querySelector('.sq-tiles[data-q=feel]')).gridTemplateColumns.split(' ').length === 3));
    await shot(page, '07-feel');
    // back button: back to "how", forward again
    await page.click('[data-act=back]');
    await page.waitForSelector('[data-act=answer][data-a=full-wardrobe][aria-pressed=true]');
    await choose(page, '[data-act=answer][data-a=full-wardrobe]');
    await page.click('[data-act=next][data-q=feel]');
    const reach = await page.evaluate(() => ({ title: document.querySelector('.sq-q .sq-title').textContent, labels: [...document.querySelectorAll('.sq-tile__label')].map((e) => e.textContent),
      dots: [...document.querySelectorAll('.sq-tile .sq-dots')].map((d) => d.querySelectorAll('.sq-dot.is-on').length), strong: !!document.querySelector('[data-a=strong]') }));
    check(`${tag}: "How noticeable should your fragrance be?" = 3 growing-dot answers, no "Strong scents bother me" switch`, reach.title === 'How noticeable should your fragrance be?' && reach.labels.join('|') === 'Close to skin|Moderate|Strong' && reach.dots.join('') === '123' && !reach.strong, JSON.stringify(reach));
    await shot(page, '08-presence');
    await choose(page, '[data-act=answer][data-a=noticed]');
    await shot(page, '09-matters');
    check(`${tag}: What matters = Easy to wear / Our bestsellers / Something less expected, one card per row`, await page.evaluate(() => [...document.querySelectorAll('.sq-tile__label')].map((e) => e.textContent).join('|') === 'Easy to wear|Our bestsellers|Something less expected' && !!document.querySelector('.sq-tiles[data-layout=rows]')));
    await choose(page, '[data-act=answer][data-a=easy]');
    await shot(page, '10-climate');
    const seasons = await page.evaluate(() => ({ title: document.querySelector('.sq-q .sq-title').textContent, labels: [...document.querySelectorAll('.sq-tile__label')].map((e) => e.textContent), icons: document.querySelectorAll('.sq-tile svg.sq-icon, .sq-tile img.sq-icon').length }));
    check(`${tag}: "When will you wear it?" = 5 season icons, several can be chosen`, seasons.title === 'When will you wear it?' && seasons.labels.join('|') === 'Winter|Spring|Summer|Fall|All year' && seasons.icons === 5, JSON.stringify(seasons));
    for (const a of ['winter', 'spring', 'summer', 'fall']) await page.click(`[data-act=toggle][data-a=${a}]`);
    check(`${tag}: all four seasons become "All year"`, await page.evaluate(() => [...document.querySelectorAll('.sq-tiles [aria-pressed=true]')].map((b) => b.dataset.a).join() === 'all-year'));
    await page.click('[data-act=toggle][data-a=fall]');
    check(`${tag}: a single season replaces "All year"`, await page.evaluate(() => [...document.querySelectorAll('.sq-tiles [aria-pressed=true]')].map((b) => b.dataset.a).join() === 'fall'));
    await page.click('[data-act=toggle][data-a=winter]');
    await page.click('[data-act=next][data-q=climate]');
    check(`${tag}: For Her has no men's style photos (women's come later)`, await page.evaluate(() => !document.querySelector('.sq-tiles img[src*="sq-photo-style"]')));
    await page.click('[data-act=toggle][data-a=classic]');
    await page.click('[data-act=toggle][data-a=minimal]');
    await shot(page, '11-style');
    const sty = await page.evaluate(() => ({ title: document.querySelector('.sq-q .sq-title').textContent, hint: document.querySelector('.sq-q .sq-sub').textContent, n: document.querySelectorAll('.sq-tiles [aria-pressed=true]').length, btn: document.querySelector('[data-act=next][data-q=style]').textContent.trim() }));
    check(`${tag}: "Which clothing style feels most like you?" - up to two styles, ends with "See my matches"`, sty.title === 'Which clothing style feels most like you?' && sty.hint === 'Pick up to two.' && sty.n === 2 && sty.btn === 'See my matches', JSON.stringify(sty));
    await page.click('[data-act=next][data-q=style]');
    await page.waitForSelector('.sq-result');
    const st = await resultState(page);
    await shot(page, '12-result-A');
    check(`${tag}: persona list and the page's own sections are back under the result`, await page.evaluate(() => getComputedStyle(document.querySelector('.sq-section--personas')).display !== 'none' && getComputedStyle(document.querySelector('[data-existing-content]')).display !== 'none'));
    check(`${tag}: one card per moment, in the owner's order`, st.items.length === 4 && st.slots[0] === 'Everyday Signature' && st.slots[1] === 'Work & Presence' && st.slots[2] === 'Evening & Seduction', st.slots.join(', '));
    check(`${tag}: >= 2 houses, no repeats`, new Set(st.houses).size >= 2 && new Set(st.items.map((i) => i.handle)).size === st.items.length, st.houses.join(', '));
    check(`${tag}: persona, scent profile (3 families), why-lines all different`, st.persona && st.profile === 3 && new Set(st.why).size === st.why.length && st.why.length === st.items.length, st.persona);
    check(`${tag}: never recommends the named perfume`, !st.items.some((i) => /baccarat-rouge-540/.test(i.handle)));
    check(`${tag}: "In common with <perfume>: notes" lines (two named perfumes)`, st.shares.length >= 1 && st.shares.every((s) => /^In common with (Baccarat Rouge 540|Black Opium): .+\.$/.test(s)), st.shares[0]);
    const top = await page.evaluate(() => ({ built: document.querySelector('.sq-built')?.textContent, summary: document.querySelector('.sq-summary span')?.textContent, edit: !!document.querySelector('[data-act=edit]'),
      wearOpen: [...document.querySelectorAll('.sq-wear')].some((d) => d.open), btnH: Math.max(...[...document.querySelectorAll('.sq-card .sq-btn--sm')].map((b) => b.getBoundingClientRect().height)),
      inside: [...document.querySelectorAll('.sq-card .sq-btn--sm')].filter((b) => b.offsetParent).every((b) => b.getBoundingClientRect().right <= b.closest('.sq-card').getBoundingClientRect().right + 0.5) }));
    check(`${tag}: result says "Built around your Baccarat Rouge 540 and Black Opium.", sums up the answers, offers "Change answers"; How to wear folded; one-line sample buttons`,
      top.built === 'Built around your Baccarat Rouge 540 and Black Opium.' && top.summary === 'For Her · Everyday & errands, Work & study, Evenings & dates, Special occasions · Moderate · Winter, Fall' && top.edit && !top.wearOpen && top.btnH < 44 && top.inside, JSON.stringify(top));
    const alts = await page.$$eval('.sq-alt summary', (l) => l.length);
    check(`${tag}: "Also fits this slot" collapsed on each card`, alts === st.items.length && !(await page.isVisible('.sq-alt p')));
    check(`${tag}: no email field anywhere`, (await page.$$('input[type=email], input[name*=mail]')).length === 0);
    const url = decodeURIComponent(page.url());
    check(`${tag}: URL carries the answers`, /[?&]sq=her\.r~mfk-baccarat-rouge-540\+r~ysl-black-opium\._\.too-sweet\+coconut\+office\.1101100\.full-wardrobe\.confident\+attractive\.noticed\.easy\.fall\+winter\.classic\+minimal/.test(url), url.replace(BASE, ''));

    await page.click('[data-act=share-open]');
    await page.waitForFunction(() => document.querySelector('[data-sq-preview]')?.src?.startsWith('blob:'));
    await shot(page, '13-share-A');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=download]')]);
    const imgPath = `${SHOTS}/share-story-${vp.name}-A.png`;
    await download.saveAs(imgPath);
    const size = pngSize(fs.readFileSync(imgPath));
    check(`${tag}: share image is 1080x1920`, size.w === 1080 && size.h === 1920, `${size.w}x${size.h}`);
    await page.click('[data-act=copy]');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const ctx2 = await newContext({ viewport: { width: vp.width, height: vp.height } });
    const page2 = await ctx2.newPage();
    await page2.goto(copied);
    await page2.waitForSelector('.sq-result');
    const st2 = await resultState(page2);
    check(`${tag}: copied link reopens the same result`, st2.persona === st.persona && JSON.stringify(st2.items) === JSON.stringify(st.items) && (await page2.$('.sq-shared')) != null, copied.replace(BASE, ''));
    await shot(page2, '14-shared-link');
    await ctx2.close();

    await page.click('.sq-card--slot > .sq-card__body > [data-act=add]');
    await page.waitForSelector('.sq-btn--done');
    await page.waitForFunction(() => document.querySelector('#cart-count')?.textContent === '1');
    check(`${tag}: "Add sample" adds one item and updates the header count`, true);
    await Promise.all([page.waitForURL(`${BASE}/cart`), page.click('[data-act=add-all]')]);
    const payload = adds[adds.length - 1];
    const expected = { items: st.items.map((i) => ({ id: i.variant, quantity: 1 })) };
    check(`${tag}: "Add all" POSTs /cart/add.js {items:[{id,quantity:1}...]}`, JSON.stringify(payload) === JSON.stringify(expected), JSON.stringify(payload));
    report.cart_payloads.push({ run: tag, payload });
    await page.screenshot({ path: `${SHOTS}/${vp.name}-15-cart-mock.png` });
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    report.runs.push({ run: tag, ...st });
    await ctx.close();
  }
  // ---------------------------------------------------------------- run B: "I don't have one"
  {
    const tag = `${vp.name}-B`;
    const ctx = await newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PAGE);
    await page.click('[data-act=start]');
    await choose(page, '[data-act=answer][data-a=him]');
    await page.click('[data-act=no-ref]');
    await page.waitForSelector('[data-act=toggle][data-a=woods]');
    for (const f of ['woods', 'citrus', 'spices']) await page.click(`[data-act=toggle][data-a=${f}]`);
    await shot(page, '03-notes-B');
    await page.click('[data-act=next][data-q=notes]');
    await page.click('[data-act=next][data-q=taboos]'); // nothing ticked
    for (const row of [1, 3, 5]) await page.click(`[data-act=moment][data-row="${row}"]`);
    await page.click('[data-act=next][data-q=week]');
    await choose(page, '[data-act=answer][data-a=day-night]');
    await page.click('[data-act=toggle][data-a=free]');
    await page.click('[data-act=next][data-q=feel]');
    await choose(page, '[data-act=answer][data-a=close]');
    await choose(page, '[data-act=answer][data-a=unique]');
    await page.click('[data-act=toggle][data-a=summer]');
    await page.click('[data-act=next][data-q=climate]');
    const stylePhotos = await page.evaluate(() => ['classic', 'dramatic', 'romantic', 'minimal', 'casual', 'sporty'].map((a) => (document.querySelector(`[data-a=${a}] img`)?.getAttribute('src') || '').split('/').pop()));
    await page.waitForFunction(() => [...document.querySelectorAll('.sq-tiles img')].every((i) => i.complete && i.naturalWidth > 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/${vp.name}-11b-style-him.png` });
    check(`${tag}: For Him sees the owner's style photos`, stylePhotos.every((f, i) => f.startsWith(`sq-photo-style-${['classic', 'dramatic', 'romantic', 'minimal', 'casual', 'sporty'][i]}-him.webp?v=`)), stylePhotos.join(', '));
    await page.click('[data-act=toggle][data-a=sporty]');
    await page.click('[data-act=next][data-q=style]');
    await page.waitForSelector('.sq-result');
    const st = await resultState(page);
    await shot(page, '12-result-B');
    check(`${tag}: day & night -> 2 slots (Everyday Signature + Evening & Seduction)`, st.items.length === 2 && st.slots.includes('Everyday Signature') && st.slots.includes('Evening & Seduction'), st.slots.join(', '));
    check(`${tag}: no "shares" line without a named perfume; profile shown`, st.shares.length === 0 && st.profile === 3);
    const code = decodeURIComponent(page.url()).split('sq=')[1];
    check(`${tag}: taboo screen left empty still gives a valid link`, /^him\.none\.woods\+citrus\+spices\.-\.0101010\.day-night\./.test(code), code);
    // "Change answers" goes back to screen 1 with every answer kept
    await page.click('[data-act=edit]');
    await page.waitForSelector('.sq-q[data-q=for]');
    check(`${tag}: "Change answers" reopens screen 1 with the answers kept`, (await page.getAttribute('[data-act=answer][data-a=him]', 'aria-pressed')) === 'true');
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    report.runs.push({ run: tag, ...st });
    await ctx.close();
  }
  // ---------------------------------------------------------------- run C: deep link inside a theme preview
  {
    const tag = `${vp.name}-C`;
    const ctx = await newContext({ viewport: { width: vp.width, height: vp.height }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const code = 'both.r~le-labo-santal-33._.heavy-oud-smoke.1201011.full-wardrobe.calm.close.trending.spring.minimal';
    await page.goto(`${PAGE}?preview_theme_id=123456789&sq=${encodeURIComponent(code)}`);
    await page.waitForSelector('.sq-result');
    const st = await resultState(page);
    check(`${tag}: deep link opens the result directly`, st.items.length >= 3, st.slots.join(', '));
    await page.click('[data-act=share-open]');
    await page.click('[data-act=copy]');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    check(`${tag}: copied link keeps preview_theme_id`, /preview_theme_id=123456789/.test(copied) && /sq=/.test(copied), copied.replace(BASE, ''));
    check(`${tag}: page URL still has preview_theme_id after the result`, /preview_theme_id=123456789/.test(page.url()));
    await shot(page, '12-result-C-deeplink');
    report.runs.push({ run: tag, ...st });
    await ctx.close();
  }
}

// screen 2 tiles follow screen 1: her -> 12 feminine, him -> 12 masculine, both -> 12 unisex
{
  const G = Object.fromEntries(JSON.parse(fs.readFileSync('quiz/data/popular-perfumes.json', 'utf8')).perfumes.map((p) => [p.id, p.gender]));
  for (const vp of VIEWPORTS) {
    const ctx = await newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const seen = {};
    for (const [who, want] of [['her', 'F'], ['him', 'M'], ['both', 'U']]) {
      await page.goto(PAGE);
      await page.click('[data-act=start]');
      await choose(page, `[data-act=answer][data-a=${who}]`);
      await page.waitForSelector('.sq-pop__tile');
      const ids = await page.$$eval('.sq-pop__tile', (l) => l.map((b) => b.dataset.id));
      const imgs = await page.$$eval('.sq-pop__tile img', (l) => l.length);
      seen[who] = ids;
      const wrong = ids.filter((id) => G[id] !== want);
      check(`${vp.name}: screen 2 tiles for "${who}" are all ${want === 'F' ? 'feminine' : want === 'M' ? 'masculine' : 'unisex'}`, ids.length === 12 && imgs === 12 && !wrong.length, wrong.length ? 'wrong: ' + wrong.join(', ') : ids.slice(0, 4).join(', ') + ' …');
      await settle(page);
      await fullShot(page, `${SHOTS}/${vp.name}-03-ref-tiles-${who}.png`);
      if (who === 'her') {
        const order = await page.evaluate(() => {
          const s = document.querySelector('[data-sq-search]'), t = document.querySelector('.sq-pop');
          return { searchFirst: !!(s.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING), title: document.querySelector('.sq-q .sq-title').textContent, placeholder: document.querySelector('[data-sq-search]').placeholder, hint: document.querySelector('.sq-q .sq-sub').textContent, noneNearBox: !!document.querySelector('.sq-pick [data-act=no-ref]'), tiles: document.querySelector('.sq-pop-title--tiles')?.textContent };
        });
        check(`${vp.name}: screen 2 reads "Do you have a signature scent?" -> one hint -> name box + "I don't have one" -> "Or tap one of these" tiles`, order.searchFirst && order.title === 'Do you have a signature scent?' && order.placeholder === 'Type a perfume, e.g. Santal 33' && order.hint === 'Type its name or tap a bottle. Up to two.' && order.noneNearBox && order.tiles === 'Or tap one of these', JSON.stringify(order));
        // tap the last tile: the page must not jump to the top, the search box must not take focus (no phone keyboard)
        const last = ids[ids.length - 1];
        await page.locator(`.sq-pop__tile[data-id="${last}"]`).scrollIntoViewIfNeeded();
        const before = await page.evaluate(() => window.scrollY);
        await page.click(`.sq-pop__tile[data-id="${last}"]`);
        await page.waitForSelector(`[data-sq-picked="r~${last}"]`);
        await page.waitForTimeout(600);
        const after = await page.evaluate(() => ({ y: window.scrollY, active: document.activeElement?.matches('[data-sq-search]') }));
        check(`${vp.name}: tapping a tile keeps the place on the page and opens no keyboard`, after.y >= before - 5 && !after.active, `scrollY ${before} -> ${after.y}`);
        await page.screenshot({ path: `${SHOTS}/${vp.name}-03d-ref-tile-picked.png` });
        await page.click(`.sq-pop__tile[data-id="${last}"]`);
        await page.waitForTimeout(200);
        const gone = await page.$$eval('.sq-picked', (l) => l.length).catch(() => 0);
        const pressed = await page.getAttribute(`.sq-pop__tile[data-id="${last}"]`, 'aria-pressed');
        check(`${vp.name}: a second tap on a chosen tile takes it back out`, gone === 0 && pressed === 'false');
      }
    }
    const overlap = seen.her.filter((id) => seen.him.includes(id) || seen.both.includes(id)).length + seen.him.filter((id) => seen.both.includes(id)).length;
    check(`${vp.name}: her / him / both tiles do not overlap`, overlap === 0, `${overlap} shared`);
    await ctx.close();
  }
}

// set card follows screen 1: her -> feminine / unisex sets, him -> masculine / unisex, both -> any
{
  const SET_GENDER = Object.fromEntries(JSON.parse(fs.readFileSync('theme-files/assets/scent-quiz-aromastylist.json', 'utf8')).catalog.set_gender);
  const CASES = [
    ['her', 'her.r~dior-sauvage._.none.1202000.one-bottle.energised.noticed.easy.fall+winter.romantic', ['Feminine', 'Unisex'], true],
    ['him', 'him.r~viktor-and-rolf-spicebomb._.none.1201000.one-bottle.attractive.noticed.easy.fall+winter.classic', ['Masculine', 'Unisex'], true],
    ['both', 'both.r~dior-sauvage._.none.1202000.one-bottle.energised.noticed.easy.fall+winter.romantic', ['Feminine', 'Masculine', 'Unisex'], false], // Unisex answer: unisex perfumes rank first, so a gendered set may fall outside the 10% window,
    // the same answers as "her" above, as him: The Modern Muse (feminine) must not be offered
    ['him (her answers)', 'him.r~dior-sauvage._.none.1202000.one-bottle.energised.noticed.easy.fall+winter.romantic', ['Masculine', 'Unisex'], false],
    // the run reported from the live preview
    ['him (reported run)', 'him.none.woods+amber.none.1201000.full-wardrobe.energised.noticed.unique.summer.sporty', ['Masculine', 'Unisex'], false],
  ];
  const ctx = await newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const [who, code, allowed, mustShow] of CASES) {
    await page.goto(`${PAGE}?sq=${encodeURIComponent(code)}`);
    await page.waitForSelector('.sq-result');
    const set = await page.$eval('.sq-set [data-act=add-set]', (b) => b.dataset.handle).catch(() => null);
    const g = set ? SET_GENDER[set] : null;
    check(`set card for ${who}: ${set ? `${set} (${g})` : 'hidden'}`, (set ? allowed.includes(g) : true) && (!mustShow || !!set), allowed.join(' / ') + ' allowed');
    if (who === 'her') await fullShot(page, `${SHOTS}/390-16-set-card-her.png`);
  }
  await ctx.close();
}

// analytics: one whole session, no personal data
{
  const ctx = await newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.goto(`${PAGE}?sq=${encodeURIComponent('her.r~ysl-black-opium._.none.1101000.full-wardrobe.attractive.noticed.easy.fall+winter.romantic')}`);
  await page.waitForSelector('.sq-result');
  await page.click('[data-act=share-open]');
  await page.click('[data-act=copy]');
  await page.click('.sq-card--slot > .sq-card__body > [data-act=add]');
  await page.waitForSelector('.sq-btn--done');
  await page.click('[data-act=restart]');
  await choose(page, '[data-act=answer][data-a=her]');
  const events = await page.evaluate(() => window.__sqEvents);
  const names = events.map((e) => e.name);
  for (const n of ['quiz_started', 'quiz_shared', 'quiz_add_to_cart']) check(`analytics: ${n} published`, names.includes(n));
  check('analytics: no personal data (no email / name / ip / customer fields)', !/@|email|phone|customer|first_name|last_name|"ip"/i.test(JSON.stringify(events)));
  report.analytics_sample = events;
  await ctx.close();
}

// no JavaScript: quiz hidden, the rest of the page visible, persona list is static HTML
{
  const ctx = await newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  check('no-JS: quiz hidden, existing page content visible', !(await page.isVisible('[data-scent-quiz]')) && (await page.isVisible('[data-existing-content]')));
  const personas = await page.$$eval('.sq-personas__list li', (l) => l.length);
  check('no-JS: "All scent personas" is static HTML (SEO)', personas === 18, `${personas} personas`);
  await page.screenshot({ path: `${SHOTS}/390-00-no-js.png`, fullPage: true });
  await ctx.close();
}

// weight budgets
const theme = (d) => fs.readdirSync(`theme-files/${d}`).map((f) => [`${d}/${f}`, fs.statSync(`theme-files/${d}/${f}`).size]);
const files = [...theme('sections'), ...theme('templates'), ...theme('assets')];
const images = files.filter(([f]) => f.endsWith('.webp'));
const code = files.filter(([f]) => /^assets\/.*\.(js|css|json)$/.test(f));
const codeTotal = code.reduce((s, [, n]) => s + n, 0), imgTotal = images.reduce((s, [, n]) => s + n, 0);
report.weight = { files: Object.fromEntries(files), code_total: codeTotal, images: images.length, images_total: imgTotal };
check('every theme file <= 60 KB (images aside)', files.filter(([f]) => !f.endsWith('.webp')).every(([, n]) => n <= 60000), code.map(([f, n]) => `${f} ${(n / 1024).toFixed(1)} KB`).join(', '));
check(`JS + CSS + JSON ${(codeTotal / 1024).toFixed(1)} KB <= 200 KB`, codeTotal <= 200000);
check(`${images.length} images ${(imgTotal / 1024).toFixed(0)} KB <= 1.8 MB, each <= 30 KB`, imgTotal <= 1800000 && images.every(([, n]) => n <= 30 * 1024));

await browser.close();
server.kill();
fs.writeFileSync('tests/reports/e2e.json', JSON.stringify(report, null, 2) + '\n');
const failed = report.checks.filter((c) => !c.ok);
console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
