// Build theme-files/ from the engine + one brand:
//   theme-files/sections/scent-quiz.liquid      (copy of quiz/engine/sections)
//   theme-files/assets/scent-quiz.js / .css     (copies of quiz/engine/assets)
//   theme-files/assets/scent-quiz-<brand>.json  (config + compact catalog, minified)
//   theme-files/templates/<brand>.scent-quiz.section.json  (section entry with all blocks, for INSTALL.md)
// Usage: node scripts/build-theme-files.mjs [brand]
import fs from 'node:fs';
import path from 'node:path';
import { taste, FAMILIES, CANON, encVec, encCanon } from './taste.mjs';

const BRAND = process.argv[2] || 'aromastylist';
const SRC = `quiz/brands/${BRAND}`;
const OUT = 'theme-files';
const LIMIT = 60 * 1024;

const config = JSON.parse(fs.readFileSync(`${SRC}/config.json`, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(`${SRC}/catalog.json`, 'utf8'));
const refFile = `${SRC}/reference-perfumes.json`;
const reference = fs.existsSync(refFile) ? JSON.parse(fs.readFileSync(refFile, 'utf8')).perfumes : [];

const VALUES = {
  gender: ['Feminine', 'Masculine', 'Unisex'],
  moment: ['everyday', 'work', 'evening', 'special-occasions'],
  mood: ['morning-boost', 'focus-flow', 'romance-presence', 'celebrate-indulge', 'relax-wind-down', 'move-thrive', 'harmony-meditation'],
  presence: ['close', 'noticed', 'fills'],
  season: ['hot', 'mild', 'cold'],
};

// one char per value: digit = index (store fact, or High/Medium derived), letter = Low-confidence derived
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
  const gender = p.store.gender.length ? p.store.gender.map(fact) : d.gender ? [d.gender] : [];
  const moment = p.store.moment ? [fact(p.store.moment)] : d.moment ? [d.moment] : [];
  const mood = p.store.moods.length ? p.store.moods.map(fact) : d.moods || [];
  return {
    gender: cell('gender', gender),
    moment: cell('moment', moment),
    mood: cell('mood', mood),
    presence: cell('presence', d.presence ? [d.presence] : []),
    season: cell('season', d.season || []),
  };
}

// common image prefix
const imgs = catalog.products.map((p) => p.image).filter(Boolean);
let base = imgs[0].slice(0, imgs[0].lastIndexOf('/files/') + 7);
if (!imgs.every((i) => i.startsWith(base))) base = '';
const houses = [...new Set(catalog.products.map((p) => p.house))].sort();
// key notes for the cards come from the taste file (canonical notes), so the catalog row carries none
const FIELDS = ['handle', 'title', 'house', 'image', 'gender', 'moment', 'mood', 'presence', 'season', 'variant', 'price', 'available'];

function row(p) {
  const variant = p.variants.find((v) => v.id === p.sample_variant_id);
  const d = dims(p);
  return [
    p.handle,
    p.title,
    houses.indexOf(p.house),
    p.image ? p.image.slice(base.length).replace(/\?v=\d+$/, '') : '',
    d.gender, d.moment, d.mood, d.presence, d.season,
    variant.id,
    variant.price,
    p.variants.some((v) => v.available) ? 1 : 0,
  ];
}

const merged = {
  ...config,
  built_at: new Date().toISOString(),
  catalog: {
    img: base,
    houses,
    values: VALUES,
    fields: FIELDS,
    items: catalog.products.filter((p) => !p.is_set).map(row),
    sets: catalog.products.filter((p) => p.is_set).map(row),
  },
};

// sanity: every answer tag value exists in the catalog vocabulary
for (const q of config.questions) for (const a of q.answers || []) for (const [dim, w] of Object.entries(a.tags || {})) {
  for (const v of Object.keys(w)) if (!VALUES[dim].includes(v)) throw new Error(`answer ${q.id}/${a.id}: unknown ${dim} value ${v}`);
}

// ---- taste file: note-family profile + canonical notes per product, and the reference perfumes
const tasteOf = (p) => (p.notes ? taste(p.notes) : null);
const memberTaste = (s) => {
  // a set tastes like the average of its member perfumes
  const ms = (s.set_members || []).map((m) => catalog.products.find((p) => p.handle === m.handle)).filter((p) => p && p.notes).map(tasteOf);
  if (!ms.length) return null;
  const vec = FAMILIES.map((_, i) => ms.reduce((a, t) => a + t.vec[i], 0) / ms.length);
  const count = {};
  ms.forEach((t) => t.canon.slice(0, 4).forEach((c) => (count[c] = (count[c] || 0) + 1)));
  return { vec, canon: Object.entries(count).sort((a, b) => b[1] - a[1]).map(([c]) => c) };
};
const tasteRow = (t) => (t ? [encVec(t.vec), encCanon(t.canon)] : ['', '']);
const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ours = new Set(catalog.products.map((p) => norm(`${p.house} ${p.title}`)));
const refs = reference.filter((r) => !ours.has(norm(`${r.house} ${r.name}`)));
const tasteFile = {
  families: FAMILIES,
  canon: CANON.map(([, label, fam]) => [label, FAMILIES.indexOf(fam)]),
  items: catalog.products.filter((p) => !p.is_set).map((p) => tasteRow(tasteOf(p))),
  sets: catalog.products.filter((p) => p.is_set).map((p) => tasteRow(memberTaste(p))),
  refs: refs.map((r) => { const t = taste(r); return [r.id, r.name, r.house, encVec(t.vec), encCanon(t.canon), r.popular ? 1 : 0]; }),
};

// placeholder image for a note-family answer without one: the most typical in-stock perfume of that family
for (const q of merged.questions) for (const a of q.answers || []) {
  if (a.image || !a.family) continue;
  const k = FAMILIES.indexOf(a.family);
  const best = catalog.products.filter((p) => !p.is_set && p.notes && p.image && p.variants.some((v) => v.available))
    .map((p) => ({ p, share: tasteOf(p).vec[k] })).sort((x, y) => y.share - x.share)[0];
  if (best) a.image = best.p.image.replace(/\?v=\d+$/, '');
}

// review list for the owner: how each reference perfume was read
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
const refRows = reference.map((r) => {
  const t = taste(r);
  const fams = FAMILIES.map((f, i) => [f, t.vec[i]]).filter(([, v]) => v > 0.04).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, v]) => `${f} ${Math.round(v * 100)}%`).join('; ');
  const inCat = ours.has(norm(`${r.house} ${r.name}`));
  return [r.id, r.house, r.name, [...r.top, ...r.heart, ...r.base].join('; '), t.canon.slice(0, 6).join('; '), fams, inCat ? 'ours (catalog notes used)' : 'reference'];
});
fs.writeFileSync(`${SRC}/reference-review.csv`, ['id,house,name,listed notes,read as,top families,source', ...refRows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n');

fs.mkdirSync(`${OUT}/sections`, { recursive: true });
fs.mkdirSync(`${OUT}/assets`, { recursive: true });
fs.mkdirSync(`${OUT}/templates`, { recursive: true });
fs.copyFileSync('quiz/engine/sections/scent-quiz.liquid', `${OUT}/sections/scent-quiz.liquid`);
fs.copyFileSync('quiz/engine/assets/scent-quiz.js', `${OUT}/assets/scent-quiz.js`);
fs.copyFileSync('quiz/engine/assets/scent-quiz.css', `${OUT}/assets/scent-quiz.css`);
const jsonName = `scent-quiz-${BRAND}.json`;
fs.writeFileSync(`${OUT}/assets/${jsonName}`, JSON.stringify(merged));
const tasteName = `scent-quiz-${BRAND}-taste.json`;
fs.writeFileSync(`${OUT}/assets/${tasteName}`, JSON.stringify(tasteFile));
fs.copyFileSync('quiz/engine/sections/scent-quiz-personas.liquid', `${OUT}/sections/scent-quiz-personas.liquid`);

// Section entry for the page template: every question / answer / persona as a block, prefilled from config.
// Images are left empty on purpose: the engine falls back to the config image until the owner picks one.
const blocks = {};
const order = [];
const add = (id, b) => { blocks[id] = b; order.push(id); };
for (const q of config.questions) {
  add(`q_${q.id}`.replace(/[^a-z0-9_]/gi, '_'), { type: 'question', settings: { question_id: q.id, title: q.title } });
  for (const a of q.answers || []) add(`a_${q.id}_${a.id}`.replace(/[^a-z0-9_]/gi, '_'), { type: 'answer', settings: { question_id: q.id, answer_id: a.id, label: a.label } });
}
const section = {
  type: 'scent-quiz',
  blocks,
  block_order: order,
  settings: { config_file: jsonName, taste_file: tasteName, color_palette: 'scheme-1' },
};
const pBlocks = {}, pOrder = [];
for (const p of config.personas.list) {
  const id = `p_${p.key}`.replace(/[^a-z0-9_]/gi, '_');
  pBlocks[id] = { type: 'persona', settings: { persona_key: p.key, name: p.name, line: p.line } };
  pOrder.push(id);
}
const personaSection = { type: 'scent-quiz-personas', blocks: pBlocks, block_order: pOrder, settings: { color_palette: 'scheme-1', title: 'All scent personas', intro: '' } };
fs.writeFileSync(`${OUT}/templates/${BRAND}.scent-quiz.section.json`, JSON.stringify({ scent_quiz: section, scent_quiz_personas: personaSection }, null, 2) + '\n');

// sizes
const files = ['sections/scent-quiz.liquid', 'sections/scent-quiz-personas.liquid', 'assets/scent-quiz.js', 'assets/scent-quiz.css', `assets/${jsonName}`, `assets/${tasteName}`];
let total = 0;
for (const f of files) {
  const n = fs.statSync(path.join(OUT, f)).size;
  if (f.startsWith('assets/')) total += n;
  console.log(`${f.padEnd(34)} ${(n / 1024).toFixed(1).padStart(6)} KB${n > LIMIT ? '  <-- over 60 KB!' : ''}`);
  if (n > LIMIT) process.exitCode = 1;
}
console.log(`assets total (js+css+json)         ${(total / 1024).toFixed(1).padStart(6)} KB (budget 150 KB)${total > 150 * 1024 ? ' <-- OVER' : ''}`);
console.log(`blocks: quiz ${order.length}, personas ${pOrder.length} (max 50 each) | reference perfumes ${refs.length} (+${reference.length - refs.length} already ours)`);
if (order.length > 50 || pOrder.length > 50) process.exitCode = 1;
