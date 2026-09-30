// Build theme-files/ from the engine + one brand:
//   theme-files/sections/scent-quiz.liquid      (copy of quiz/engine/sections)
//   theme-files/assets/scent-quiz.js / .css     (copies of quiz/engine/assets)
//   theme-files/assets/scent-quiz-<brand>.json  (config + compact catalog, minified)
//   theme-files/templates/<brand>.scent-quiz.section.json  (section entry with all blocks, for INSTALL.md)
// Usage: node scripts/build-theme-files.mjs [brand]
import fs from 'node:fs';
import path from 'node:path';

const BRAND = process.argv[2] || 'aromastylist';
const SRC = `quiz/brands/${BRAND}`;
const OUT = 'theme-files';
const LIMIT = 60 * 1024;

const config = JSON.parse(fs.readFileSync(`${SRC}/config.json`, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(`${SRC}/catalog.json`, 'utf8'));

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
const FIELDS = ['handle', 'title', 'house', 'image', 'gender', 'moment', 'mood', 'presence', 'season', 'variant', 'price', 'available', 'notes'];

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
// generic words and descriptors that the Notes accordion sometimes lists as if they were notes
const GENERIC = /^(notes?|.* notes|.* accords?|accords?|fresh|warm|sweet|woody|woods|floral|fruity|spicy|smooth|creamy|clean|citrusy|earthy|resinous|aromatic|powdery|herbal|green|rich|bright|crisp|juicy|spice|resins?|flowers|leaves|leaf|musky|sensual|invigorating|refreshing|uplifting|grounding|refined|depth|opulent|intriguing|inviting|comforting|velvety|vibrant|alluring|peppery|dry|tropical|romantic|herbaceous|peachy|sweet .*|slightly .*|adding .*|subtly .*|deeply .*|\d+ .*)$/;
function keyNotes(p) {
  if (!p.notes) return '';
  const clean = (l) => l.filter((x) => !GENERIC.test(x) && x.split(' ').length <= 3);
  const n = { top: clean(p.notes.top), heart: clean(p.notes.heart), base: clean(p.notes.base) };
  // two key notes keep the file under 60 KB: the opening and the dry-down
  const pick = [n.top[0] || n.heart[0], n.base[0] || n.heart[1] || n.heart[0]].filter(Boolean);
  const all = [...n.top, ...n.heart, ...n.base];
  for (const x of all) { if (pick.length >= 2) break; if (!pick.includes(x)) pick.push(x); }
  return [...new Set(pick)].slice(0, 2).filter((x) => x.length <= 24).join(', ');
}

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
    p.is_set ? '' : keyNotes(p),
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
for (const q of config.questions) for (const a of q.answers) for (const [dim, w] of Object.entries(a.tags)) {
  for (const v of Object.keys(w)) if (!VALUES[dim].includes(v)) throw new Error(`answer ${q.id}/${a.id}: unknown ${dim} value ${v}`);
}

fs.mkdirSync(`${OUT}/sections`, { recursive: true });
fs.mkdirSync(`${OUT}/assets`, { recursive: true });
fs.mkdirSync(`${OUT}/templates`, { recursive: true });
fs.copyFileSync('quiz/engine/sections/scent-quiz.liquid', `${OUT}/sections/scent-quiz.liquid`);
fs.copyFileSync('quiz/engine/assets/scent-quiz.js', `${OUT}/assets/scent-quiz.js`);
fs.copyFileSync('quiz/engine/assets/scent-quiz.css', `${OUT}/assets/scent-quiz.css`);
const jsonName = `scent-quiz-${BRAND}.json`;
fs.writeFileSync(`${OUT}/assets/${jsonName}`, JSON.stringify(merged));

// Section entry for the page template: every question / answer / persona as a block, prefilled from config.
// Images are left empty on purpose: the engine falls back to the config image until the owner picks one.
const blocks = {};
const order = [];
const add = (id, b) => { blocks[id] = b; order.push(id); };
for (const q of config.questions) {
  add(`q_${q.id}`.replace(/[^a-z0-9_]/gi, '_'), { type: 'question', settings: { question_id: q.id, title: q.title } });
  for (const a of q.answers) add(`a_${q.id}_${a.id}`.replace(/[^a-z0-9_]/gi, '_'), { type: 'answer', settings: { question_id: q.id, answer_id: a.id, label: a.label } });
}
for (const p of config.personas.list) add(`p_${p.key}`.replace(/[^a-z0-9_]/gi, '_'), { type: 'persona', settings: { persona_key: p.key, name: p.name, line: p.line } });
const section = {
  type: 'scent-quiz',
  blocks,
  block_order: order,
  settings: { config_file: jsonName, color_palette: 'scheme-1', show_personas: true, personas_title: 'All scent personas', personas_intro: '' },
};
fs.writeFileSync(`${OUT}/templates/${BRAND}.scent-quiz.section.json`, JSON.stringify({ scent_quiz: section }, null, 2) + '\n');

// sizes
const files = ['sections/scent-quiz.liquid', 'assets/scent-quiz.js', 'assets/scent-quiz.css', `assets/${jsonName}`];
let total = 0;
for (const f of files) {
  const n = fs.statSync(path.join(OUT, f)).size;
  if (f.startsWith('assets/')) total += n;
  console.log(`${f.padEnd(34)} ${(n / 1024).toFixed(1).padStart(6)} KB${n > LIMIT ? '  <-- over 60 KB!' : ''}`);
  if (n > LIMIT) process.exitCode = 1;
}
console.log(`assets total (js+css+json)         ${(total / 1024).toFixed(1).padStart(6)} KB (budget 150 KB)${total > 150 * 1024 ? ' <-- OVER' : ''}`);
console.log(`blocks: ${order.length} (max 50)`);
