// Build quiz/data/popular-perfumes.json: the 400 most-worn perfumes (quiz/data/perfume-list.json) + the notes
// collected from the brands' own sites (quiz/data/raw/out-*.json), canonicalised to the canonical notes of
// scripts/taste.mjs. Perfumes we stock are linked to our product (our own notes win, as in v2).
import fs from 'node:fs';
import { taste, CANON } from './taste.mjs';

const list = JSON.parse(fs.readFileSync('quiz/data/perfume-list.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('quiz/brands/aromastylist/catalog.json', 'utf8'));
const raw = {};
const files = fs.readdirSync('quiz/data/raw').filter((f) => /^out-.*\.json$/.test(f)).sort();
// retries (out-r*) come after the first pass and only fill gaps
for (const f of files) for (const x of JSON.parse(fs.readFileSync(`quiz/data/raw/${f}`, 'utf8'))) {
  const n = ['top', 'heart', 'base', 'key'].reduce((s, k) => s + (x[k] || []).length, 0);
  if (n || !raw[x.id]) raw[x.id] = x;
}
const extra = fs.existsSync('quiz/data/popular-meta.json') ? JSON.parse(fs.readFileSync('quiz/data/popular-meta.json', 'utf8')) : { popular: [], images: [] };

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const STRIP = /\b(by|edp|eau de parfum|replica)\b/g;
// "Extrait" / "Extract" is a different perfume from the EDP, so it stays in the key (spelled one way)
const key = (house, title) => norm(title).replace(norm(house), '').replace(STRIP, '').replace(/\bextract\b/g, 'extrait').replace(/\s+/g, '');
const MANUAL = { 'creed-aventus': 'creed-aventus-for-men' };
const stock = catalog.products.filter((p) => !p.is_set);
function ownOf(r) {
  if (MANUAL[r.id]) return stock.find((p) => p.handle === MANUAL[r.id]) || null;
  const k = key(r.house, r.name);
  const hits = stock.filter((p) => p.house === r.house && key(p.house, p.title) === k);
  if (hits.length > 1) { const edp = hits.find((p) => /edp|eau de parfum/i.test(p.title)); return edp || hits[0]; }
  return hits[0] || null;
}
const canonIds = (notes) => notes.map((n) => {
  const s = String(n).toLowerCase();
  const hit = CANON.find((c) => !c[4] && c[3].test(s)) || CANON.find((c) => c[4] && c[3].test(s));
  return hit ? hit[0] : null;
});

const out = [], unmapped = {};
for (const r of list) {
  const x = raw[r.id] || {};
  const clean = (a) => (a || []).filter((n) => !/page|product|^n\/a$/i.test(n));
  const notes = { top: clean(x.top), heart: clean(x.heart), base: clean(x.base), key: clean(x.key) };
  const n = notes.top.length + notes.heart.length + notes.base.length + notes.key.length;
  const own = ownOf(r);
  const canonical = {};
  for (const t of ['top', 'heart', 'base', 'key']) {
    const ids = canonIds(notes[t]);
    ids.forEach((id, i) => { if (!id) unmapped[notes[t][i]] = (unmapped[notes[t][i]] || 0) + 1; });
    canonical[t] = [...new Set(ids.filter(Boolean))];
  }
  out.push({
    id: r.id, name: r.name, house: r.house, gender: r.gender, concentration: x.concentration && n ? x.concentration : r.concentration,
    flanker_of: r.flanker_of, aliases: r.aliases,
    popular: extra.popular.includes(r.id), image: extra.images.includes(r.id) || extra.popular.includes(r.id),
    notes, canonical,
    source_url: n ? x.source_url || '' : '', source_type: n ? x.source_type : 'none', method: n ? x.method || '' : '',
    comment: x.comment || '',
    in_store: own ? own.handle : null,
  });
}
fs.writeFileSync('quiz/data/popular-perfumes.json', JSON.stringify({
  note: 'The 400 most-worn designer and niche perfumes in the US (list: Sephora / Ulta / Nordstrom / Bloomingdale\'s bestseller lists and Fragrantica popularity pages for orientation only, plus the houses the store carries). Notes: the brand\'s own site (source_type "brand"), else the brand\'s page at Sephora / Nordstrom; method "fetch" = page read directly, "search" = the search engine\'s reading of that page. "canonical" = notes mapped to the canonical notes of scripts/taste.mjs ("key" = notes the brand lists without tiers). Perfumes we stock use our own product notes in the quiz (in_store).',
  built_at: new Date().toISOString().slice(0, 10),
  perfumes: out,
}, null, 1) + '\n');

const by = (f) => out.reduce((m, p) => { const k = f(p); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log('sources', by((p) => p.source_type), '| methods', by((p) => p.method || '-'));
console.log('in store', out.filter((p) => p.in_store).length, '| usable (notes or in store)', out.filter((p) => p.in_store || p.source_type !== 'none').length);
console.log('unmapped raw notes', Object.keys(unmapped).length, Object.entries(unmapped).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `${k}(${v})`).join(', '));
