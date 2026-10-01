// Build theme-files/ from the engine + one brand (v3):
//   theme-files/sections/scent-quiz.liquid, scent-quiz-personas.liquid   (copies of quiz/engine/sections)
//   theme-files/assets/scent-quiz.js / .css                               (minified copies of quiz/engine/assets)
//   theme-files/assets/scent-quiz-<brand>.json        (questions, slots, copy + compact catalog)
//   theme-files/assets/scent-quiz-<brand>-taste.json  (note profiles of our perfumes + the 400 popular perfumes)
//   theme-files/templates/<brand>.scent-quiz.section.json  (both section entries with their blocks, for INSTALL.md)
// Usage: node scripts/build-theme-files.mjs [brand]
import fs from 'node:fs';
import path from 'node:path';
import { taste, FAMILIES, CANON, encVec } from './taste.mjs';
import { minify } from 'terser';

const BRAND = process.argv[2] || 'aromastylist';
const SRC = `quiz/brands/${BRAND}`;
const OUT = 'theme-files';
const LIMIT = 60 * 1024;

const config = JSON.parse(fs.readFileSync(`${SRC}/config.json`, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(`${SRC}/catalog.json`, 'utf8'));
const popular = JSON.parse(fs.readFileSync('quiz/data/popular-perfumes.json', 'utf8')).perfumes;
const meta = JSON.parse(fs.readFileSync('quiz/data/popular-meta.json', 'utf8'));
const best = fs.existsSync('quiz/data/store-bestsellers.json') ? JSON.parse(fs.readFileSync('quiz/data/store-bestsellers.json', 'utf8')).rows : [];

const VALUES = {
  gender: ['Feminine', 'Masculine', 'Unisex'],
  moment: ['everyday', 'work', 'evening', 'special-occasions'],
  mood: ['morning-boost', 'focus-flow', 'romance-presence', 'celebrate-indulge', 'relax-wind-down', 'move-thrive', 'harmony-meditation'],
  presence: ['close', 'noticed', 'fills'],
  season: ['hot', 'mild', 'cold'],
};
function cell(dim, entries) {
  return entries.map(({ value, confidence }) => {
    const i = VALUES[dim].indexOf(value);
    if (i < 0) throw new Error(`unknown ${dim} value ${value}`);
    return confidence === 'Low' ? String.fromCharCode(97 + i) : String(i);
  }).join('');
}
const fact = (v) => ({ value: v, confidence: 'Store' });
function dims(p) {
  const d = p.derived || {};
  return {
    gender: cell('gender', p.store.gender.length ? p.store.gender.map(fact) : d.gender ? [d.gender] : []),
    moment: cell('moment', p.store.moment ? [fact(p.store.moment)] : d.moment ? [d.moment] : []),
    mood: cell('mood', p.store.moods.length ? p.store.moods.map(fact) : d.moods || []),
    presence: cell('presence', d.presence ? [d.presence] : []),
    season: cell('season', d.season || []),
  };
}
const norm = (x) => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const hot = new Set(best.map(([t]) => norm(t)));
const isHot = (p) => hot.has(norm(p.title)) || [...hot].some((t) => norm(p.title).startsWith(t) || t.startsWith(norm(p.title)));

const imgs = catalog.products.map((p) => p.image).filter(Boolean);
let base = imgs[0].slice(0, imgs[0].lastIndexOf('/files/') + 7);
if (!imgs.every((i) => i.startsWith(base))) base = '';
const houses = [...new Set(catalog.products.map((p) => p.house))].sort();
// handle prefix per house (the longest "xxx-" prefix most of its handles share); rows store "~rest"
const hpre = houses.map((h) => {
  const hs = catalog.products.filter((p) => p.house === h).map((p) => p.handle);
  const cand = {};
  hs.forEach((x) => { const parts = x.split('-'); for (let i = 1; i < parts.length; i++) { const k = parts.slice(0, i).join('-') + '-'; cand[k] = (cand[k] || 0) + 1; } });
  const best = Object.entries(cand).filter(([, n]) => n >= Math.max(1, hs.length / 2)).sort((x, y) => y[0].length - x[0].length)[0];
  return best ? best[0] : '';
});
const shortHandle = (p) => { const pre = hpre[houses.indexOf(p.house)]; return pre && p.handle.startsWith(pre) && p.handle.length > pre.length ? '~' + p.handle.slice(pre.length) : p.handle; };
const FIELDS = ['handle', 'title', 'house', 'image', 'gender', 'moment', 'mood', 'presence', 'season', 'variant', 'price', 'available'];
function row(p) {
  const variant = p.variants.find((v) => v.id === p.sample_variant_id);
  const d = dims(p);
  return [shortHandle(p), p.title, houses.indexOf(p.house), p.image ? p.image.slice(base.length).replace(/\?v=\d+$/, '') : '',
    d.gender, d.moment, d.mood, d.presence, d.season, variant.id, variant.price, p.variants.some((v) => v.available) ? 1 : 0];
}
const items = catalog.products.filter((p) => !p.is_set);
const sets = catalog.products.filter((p) => p.is_set);

// ---- taste: canonical notes (ALL of them, so taboos and why-lines can check every note) + family profile
const tasteOf = (p) => (p.notes ? taste(p.notes) : null);
const encAll = (ids) => ids.map((id) => String(CANON.findIndex((c) => c[0] === id)).padStart(2, '0')).join('');
const tasteRow = (t) => (t ? [encVec(t.vec), encAll(t.canon)] : ['', '']);
const memberTaste = (s) => {
  const ms = (s.set_members || []).map((m) => items.find((p) => p.handle === m.handle)).filter((p) => p && p.notes).map(tasteOf);
  if (!ms.length) return null;
  const vec = FAMILIES.map((_, i) => ms.reduce((a, t) => a + t.vec[i], 0) / ms.length);
  const all = [...new Set(ms.flatMap((t) => t.canon))];
  return { vec, canon: all };
};
const refHouses = [...new Set(popular.map((r) => r.house))].sort();
const order = [...meta.popular, ...popular.map((r) => r.id).filter((id) => !meta.popular.includes(id))];
const byId = Object.fromEntries(popular.map((r) => [r.id, r]));
const refs = order.map((id) => {
  const r = byId[id];
  const own = r.in_store ? items.findIndex((p) => p.handle === r.in_store) : -1;
  const n = r.notes.top.length + r.notes.heart.length + r.notes.base.length + r.notes.key.length;
  // brand "key" notes (no tiers) weigh like heart notes
  const t = own < 0 && n ? taste({ top: r.notes.top, heart: [...r.notes.heart, ...r.notes.key], base: r.notes.base }) : null;
  const flags = (meta.popular.includes(id) ? 1 : 0) | (fs.existsSync(`${OUT}/assets/sq-ref-${id}.webp`) ? 2 : 0) | (own < 0 && !t ? 4 : 0);
  const out = [r.id, r.name, refHouses.indexOf(r.house), r.gender, t ? encVec(t.vec) : '', t ? encAll(t.canon) : '', flags, (r.aliases || []).join('|')];
  if (own >= 0) out.push(own);
  return out;
});
const tasteFile = {
  families: FAMILIES,
  canon: CANON.map(([id, label, fam, , broad]) => (broad ? [label, FAMILIES.indexOf(fam), id, 1] : [label, FAMILIES.indexOf(fam), id])),
  houses: refHouses,
  items: items.map((p) => tasteRow(tasteOf(p))),
  sets: sets.map((p) => tasteRow(memberTaste(p))),
  popular: meta.popular,
  house_aliases: meta.house_aliases || {},
  refs,
};

// ---- config: placeholder images for answers without one (note families, styles): the most typical in-stock perfume
const typical = (fams, skip) => items.filter((p) => p.notes && p.image && p.variants.some((v) => v.available) && !skip.has(p.handle))
  .map((p) => ({ p, s: fams.reduce((a, f) => a + tasteOf(p).vec[FAMILIES.indexOf(f)], 0) })).sort((x, y) => y.s - x.s)[0];
const usedImg = new Set();
for (const q of config.questions) for (const a of q.answers || []) {
  if (a.image) continue;
  const fams = a.family ? [a.family] : a.families;
  if (!fams) continue;
  const t = typical(fams, usedImg);
  if (t) { a.image = t.p.image.replace(/\?v=\d+$/, ''); usedImg.add(t.p.handle); }
}
// answer images on the store CDN are written relative to it ("@files/x.png") to keep the asset under 60 KB
const CDN = base.replace(/(files|collections)\/$/, '');
for (const q of config.questions) for (const a of q.answers || []) if (a.image && CDN && a.image.startsWith(CDN)) a.image = '@' + a.image.slice(CDN.length);
delete config.gender.note;
const merged = {
  ...config,
  cdn: CDN,
  catalog: {
    img: base, houses, hpre, values: VALUES, fields: FIELDS,
    items: items.map(row), sets: sets.map(row),
    // indices into items: the store bestsellers and the perfumes inside each set
    hot: items.map((p, i) => (isHot(p) ? i : -1)).filter((i) => i >= 0),
    set_members: sets.map((s) => (s.set_members || []).map((m) => items.findIndex((p) => p.handle === m.handle)).filter((i) => i >= 0)),
  },
};

fs.mkdirSync(`${OUT}/sections`, { recursive: true });
fs.mkdirSync(`${OUT}/assets`, { recursive: true });
fs.mkdirSync(`${OUT}/templates`, { recursive: true });
fs.copyFileSync('quiz/engine/sections/scent-quiz.liquid', `${OUT}/sections/scent-quiz.liquid`);
fs.copyFileSync('quiz/engine/sections/scent-quiz-personas.liquid', `${OUT}/sections/scent-quiz-personas.liquid`);
const js = await minify(fs.readFileSync('quiz/engine/assets/scent-quiz.js', 'utf8'), { compress: true, mangle: true, format: { comments: /^!/ } });
fs.writeFileSync(`${OUT}/assets/scent-quiz.js`, js.code + '\n');
const css = fs.readFileSync('quiz/engine/assets/scent-quiz.css', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
fs.writeFileSync(`${OUT}/assets/scent-quiz.css`, css + '\n');
const jsonName = `scent-quiz-${BRAND}.json`, tasteName = `scent-quiz-${BRAND}-taste.json`;
fs.writeFileSync(`${OUT}/assets/${jsonName}`, JSON.stringify(merged));
fs.writeFileSync(`${OUT}/assets/${tasteName}`, JSON.stringify(tasteFile));

// ---- section entries. Blocks only for questions with image tiles (Shopify: max 50 blocks per section);
// the perfume search, the taboo chips and the week grid are edited in the config file.
const blocks = {}, blockOrder = [];
const add = (id, b) => { blocks[id] = b; blockOrder.push(id); };
for (const q of config.questions) {
  if (!['single', 'multi', 'families'].includes(q.type)) continue;
  add(`q_${q.id}`.replace(/[^a-z0-9_]/gi, '_'), { type: 'question', settings: { question_id: q.id, title: q.title } });
  for (const a of q.answers) add(`a_${q.id}_${a.id}`.replace(/[^a-z0-9_]/gi, '_'), { type: 'answer', settings: { question_id: q.id, answer_id: a.id, label: a.label } });
}
const section = { type: 'scent-quiz', blocks, block_order: blockOrder, settings: { config_file: jsonName, taste_file: tasteName, color_palette: 'scheme-1' } };
const pBlocks = {}, pOrder = [];
for (const p of config.personas.list) {
  const id = `p_${p.key}`.replace(/[^a-z0-9_]/gi, '_');
  pBlocks[id] = { type: 'persona', settings: { persona_key: p.key, name: p.name, line: p.line } };
  pOrder.push(id);
}
const personaSection = { type: 'scent-quiz-personas', blocks: pBlocks, block_order: pOrder, settings: { color_palette: 'scheme-1', title: 'All scent personas', intro: '' } };
fs.writeFileSync(`${OUT}/templates/${BRAND}.scent-quiz.section.json`, JSON.stringify({ scent_quiz: section, scent_quiz_personas: personaSection }, null, 2) + '\n');

// ---- sizes (budgets: each file <= 60 KB; js + css + json <= 200 KB; images <= 1.8 MB)
const files = ['sections/scent-quiz.liquid', 'sections/scent-quiz-personas.liquid', 'templates/' + BRAND + '.scent-quiz.section.json', 'assets/scent-quiz.js', 'assets/scent-quiz.css', `assets/${jsonName}`, `assets/${tasteName}`];
let total = 0;
for (const f of files) {
  const n = fs.statSync(path.join(OUT, f)).size;
  if (/\.(js|css|json)$/.test(f) && f.startsWith('assets/')) total += n;
  console.log(`${f.padEnd(44)} ${(n / 1024).toFixed(1).padStart(6)} KB${n > 60000 ? '  <-- over 60 KB!' : ''}`);
  if (n > LIMIT || n > 60000) process.exitCode = 1;
}
const webp = fs.readdirSync(`${OUT}/assets`).filter((f) => /^sq-ref-.*\.webp$/.test(f));
const imgTotal = webp.reduce((s, f) => s + fs.statSync(`${OUT}/assets/${f}`).size, 0);
console.log(`assets js+css+json total ${(total / 1024).toFixed(1)} KB (budget 200)${total > 200 * 1024 ? ' <-- OVER' : ''}`);
console.log(`images: ${webp.length} webp, ${(imgTotal / 1024).toFixed(0)} KB (budget 1800), largest ${webp.length ? (Math.max(...webp.map((f) => fs.statSync(`${OUT}/assets/${f}`).size)) / 1024).toFixed(1) : 0} KB`);
console.log(`blocks: quiz ${blockOrder.length}, personas ${pOrder.length} (max 50 each) | refs ${refs.length} (${refs.filter((r) => r[6] & 4).length} without notes)`);
if (total > 200 * 1024 || imgTotal > 1800 * 1024 || blockOrder.length > 50) process.exitCode = 1;
