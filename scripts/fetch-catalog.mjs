// Step 1: build quiz/brands/aromastylist/catalog.json from the PUBLIC storefront only.
// Read-only GETs, max 3 parallel requests, exponential backoff on 429/5xx.
// Usage: node scripts/fetch-catalog.mjs [brandDir]
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://aromastylist.com';
const OUT_DIR = process.argv[2] || 'quiz/brands/aromastylist';
const RAW_DIR = 'data-raw';
const MAX_PARALLEL = 3;

const MOODS = ['morning-boost', 'focus-flow', 'romance-presence', 'celebrate-indulge', 'relax-wind-down', 'move-thrive', 'harmony-meditation'];
const MOMENTS = ['everyday', 'work', 'evening', 'special-occasions'];
const GENDERS = { feminine: 'Feminine', 'masculine-activities': 'Masculine', unisex: 'Unisex' };
const SETS = ['aroma-box'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, type = 'json', attempt = 0) {
  const res = await fetch(url, { headers: { 'user-agent': 'aromastylist-quiz-catalog-builder (read-only)' } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 6) throw new Error(`${res.status} after retries: ${url}`);
    const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt;
    console.warn(`  ${res.status} on ${url} - waiting ${wait}ms`);
    await sleep(wait);
    return get(url, type, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return type === 'json' ? res.json() : res.text();
}

// run fn over items with at most MAX_PARALLEL in flight
async function pool(items, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: MAX_PARALLEL }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
      await sleep(150);
    }
  }));
  return out;
}

async function paged(base) {
  const all = [];
  for (let page = 1; ; page++) {
    const { products } = await get(`${base}?limit=250&page=${page}`);
    all.push(...products);
    if (products.length < 250) break;
  }
  return all;
}

const decode = (s) => s
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, ' ').replace(/&ndash;|&mdash;/g, '-').replace(/&[a-z]+;/g, ' ')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();

// Return the decoded text of the `.accordion-a` <details> whose <summary> starts with "Notes".
// Parsing into tiers happens offline in scripts/notes.mjs (formats vary per house).
function notesText(html) {
  const i = html.indexOf('accordion-a');
  if (i < 0) return null;
  const re = /<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(html))) {
    if (/^\s*Notes\b/i.test(decode(m[1]))) return decode(m[2].replace(/[•·]/g, '\n• '));
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  console.log('products.json ...');
  const all = await paged(`${ORIGIN}/products.json`);
  const perfumes = all.filter((p) => p.product_type === 'Perfumes and Colognes');
  console.log(`  ${all.length} products, ${perfumes.length} perfumes`);

  const membership = {};
  const collections = {};
  const handles = [...MOODS, ...MOMENTS, ...Object.keys(GENDERS), ...SETS];
  await pool(handles, async (h) => {
    const [prods, meta] = await Promise.all([paged(`${ORIGIN}/collections/${h}/products.json`), get(`${ORIGIN}/collections/${h}.json`).catch(() => null)]);
    membership[h] = new Set(prods.map((p) => p.handle));
    const c = meta?.collection || {};
    collections[h] = { handle: h, title: c.title || h, image: c.image?.src || null, count: prods.length };
    console.log(`  /collections/${h}: ${prods.length}`);
  });

  console.log('product pages (notes) ...');
  let done = 0;
  const notes = await pool(perfumes, async (p) => {
    const html = await get(`${ORIGIN}/products/${p.handle}`, 'text').catch((e) => (console.warn('  ' + e.message), ''));
    if (++done % 25 === 0) console.log(`  ${done}/${perfumes.length}`);
    return notesText(html);
  });

  const products = perfumes.map((p, i) => {
    const moods = MOODS.filter((h) => membership[h].has(p.handle));
    const moments = MOMENTS.filter((h) => membership[h].has(p.handle));
    const genders = Object.keys(GENDERS).filter((h) => membership[h].has(p.handle)).map((h) => GENDERS[h]);
    const isSet = SETS.some((h) => membership[h].has(p.handle));
    const n = notes[i];
    return {
      handle: p.handle,
      title: p.title,
      house: p.vendor,
      product_type: p.product_type,
      image: p.images?.[0]?.src || null,
      is_set: isSet,
      moods,
      moment: moments[0] || null,
      moments_all: moments,
      gender: genders.length === 1 ? genders[0] : genders.length ? genders : null,
      notes_text: n,
      // sets have no notes; their description lists the member perfumes ("• House – Title (EDP) 2ml")
      body_text: isSet ? decode((p.body_html || '').replace(/[•·]/g, '\n• ')) : undefined,
      tags: p.tags,
      variants: p.variants.map((v) => ({ id: v.id, title: v.title, price: Number(v.price), available: v.available })),
    };
  });

  const out = { source: ORIGIN, fetched_at: new Date().toISOString(), collections, products };
  fs.writeFileSync(path.join(RAW_DIR, 'catalog.fetched.json'), JSON.stringify(out, null, 1));
  const withNotes = products.filter((p) => p.notes_text).length;
  console.log(`done: ${products.length} perfumes, notes for ${withNotes}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
