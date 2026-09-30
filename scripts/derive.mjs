// Step 2: fill gaps INSIDE catalog.json (never in Shopify).
// Every derived value is computed from the product's NOTES (not marketing copy) and stores
// { value, notes: [driving notes], confidence: High|Medium|Low }.
// Writes catalog.json (in place) + derived-review.csv for the owner.
import fs from 'node:fs';

const DIR = process.argv[2] || 'quiz/brands/aromastylist';
const CAT = `${DIR}/catalog.json`;
const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));

// ---------------------------------------------------------------- lexicon
// keyword syntax: plain word = whole word (plural s allowed); trailing * = prefix match
const LEX = {
  citrus: 'bergamot* lemon* lime mandarin* orange grapefruit tangerine yuzu citron* citrus* petitgrain neroli kumquat cedrat verbena vervain litsea blood orange',
  aquatic: 'sea marine aquatic water ozonic salt seaweed mineral driftwood calone rain sand',
  green: 'green galbanum violet leaf fig leaf grass hay tomato leaf leaves bamboo mate maté cannabis rhubarb cucumber snake plant olive leaf',
  aromatic: 'lavender rosemary sage basil mint peppermint thyme juniper* artemisia wormwood absinthe geranium eucalyptus tarragon laurel bay leaf myrtle fennel coriander fern angelica* cypress pine fir aromatic* herbal herbs davana buchu',
  tea: 'tea matcha oolong',
  floral: 'rose jasmine* sambac tuberose ylang* orange blossom magnolia gardenia peony lily lilies lily-of-the-valley freesia violet osmanthus heliotrope orchid mimosa narcissus carnation marigold lotus hyacinth honeysuckle hibiscus lilac champaca cyclamen frangipani floral* flower* blossom* petal* boronia linden broom sweet pea pomarose dianthus hawthorn wildflowers',
  iris: 'iris orris*',
  musk: 'musk* ambrette ambrettolide muscone cashmeran iso e super hedione aldehyde* cotton* clean habanolide',
  radiant: 'ambergris ambroxan ambrox ambrofix',
  lightwoods: 'cedar* sandalwood* vetiver* cashmere wood guaiac* amyris papyrus blonde woods blond wood* white wood woods woody* akigalawood javanol georgywood hinoki teak* oak oakwood mahogany rosewood palisander cypriol* palo santo cabreuva blackwood dry wood',
  oud: 'oud agarwood',
  amber: 'amber amberwood amber wood labdanum* cistus* grey amber black amber',
  resin: 'benzoin myrrh frankincense olibanum incense opoponax styrax elemi* tolu* peru balsam balsam* copal resin* mastic gurjan*',
  leather: 'leather suede birch tar cade castoreum',
  tobacco: 'tobacco*',
  vanilla: 'vanilla*',
  gourmand: 'tonka* caramel* praline chocolate cocoa cacao coffee honey almond* marshmallow milk cream* whipped cream sugar candy candied* toffee brioche pistachio hazelnut chestnut marron* rice malt licorice maple coconut* ice cream loukhoum gourmand* raw sugar pink sugar gummy',
  spice: 'cinnamon clove* saffron cardamom nutmeg pepper* peppercorn* ginger cumin paprika anise star anise caraway spice* spicy chili chilli timur safraleine curry',
  fruity: 'peach* pear apple* plum raspberry cherry berry berries blackcurrant* black currant* cassis pineapple mango lychee litchi apricot passionfruit passion fruit melon strawberry guava fruit* fruity* greengage red currant blueberry blackberry',
  boozy: 'rum cognac whiskey whisky brandy champagne liquor mojito',
  earthy: 'patchouli* oakmoss moss earthy roots',
  smoke: 'smoke smoky birch',
  powdery: 'powder* powdery heliotrope',
  lavender: 'lavender',
  sandal: 'sandalwood* palo santo',
  woodsmasc: 'cedar* vetiver* guaiac* oak oakwood birch cypriol* cypress',
  sweetfem: 'caramel* praline marshmallow candy candied* sugar whipped cream cotton candy pink sugar gummy toffee',
};

const MATCHERS = Object.fromEntries(Object.entries(LEX).map(([cat, s]) => {
  // multi-word keywords first
  const words = [];
  const toks = s.split(' ');
  // rebuild phrases: tokens are separated by single spaces; phrases are known multi-word entries
  const phrases = ['violet leaf', 'fig leaf', 'tomato leaf', 'snake plant', 'olive leaf', 'bay leaf', 'orange blossom', 'sweet pea', 'iso e super', 'cashmere wood', 'blonde woods', 'blond wood*', 'white wood', 'palo santo', 'dry wood', 'amber wood', 'grey amber', 'black amber', 'peru balsam', 'birch tar', 'whipped cream', 'ice cream', 'raw sugar', 'pink sugar', 'star anise', 'black currant*', 'passion fruit', 'red currant', 'blood orange', 'cotton candy'];
  let i = 0;
  while (i < toks.length) {
    const three = toks.slice(i, i + 3).join(' ');
    const two = toks.slice(i, i + 2).join(' ');
    if (phrases.includes(three)) { words.push(three); i += 3; } else if (phrases.includes(two)) { words.push(two); i += 2; } else { words.push(toks[i]); i += 1; }
  }
  const res = words.map((w) => {
    const esc = w.replace(/\*$/, '').replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${esc}${w.endsWith('*') ? '' : '(s|es)?(?![a-z])'}`, 'i');
  });
  return [cat, res];
}));

// notes that must NOT count for a category even though a keyword matches
const EXCLUDE = {
  citrus: /orange blossom|orange flower|orange leaves|bitter orange leaves|lemon blossom|mock orange/,
  floral: /violet leaf|violet leaves|rose ?wood|rosemary|fig leaf|fruit blossom|coffee flower|lime blossom|flower water|cotton flower/,
  green: /violet leaves?$/, // violet leaf counts as green - keep (no-op placeholder)
  musk: /cotton candy/,
  amber: /ambergris|ambrette|ambroxan|ambrox/,
  fruity: /fruity notes? of|grapefruit|breadfruit/,
  gourmand: /coconut water|rice husk|milk thistle|cream(y)? (floral|musk)|creamy/,
  spice: /pepper tree|spicy floral/,
  lightwoods: /woody notes—warm|woody\/musky/, // descriptors, keep counted - placeholder
  aquatic: /water lily|waterlily|rose water|sandalwood|sandalo/,
};

function cats(note) {
  const out = [];
  for (const [c, res] of Object.entries(MATCHERS)) {
    if (EXCLUDE[c] && EXCLUDE[c].test(note) && !['green', 'lightwoods'].includes(c)) continue;
    if (res.some((r) => r.test(note))) out.push(c);
  }
  return out;
}

// tier weights: base notes carry the dry-down, top notes fade first
const TIER_W = { top: 0.8, heart: 1, base: 1.2, flat: 1 };

function profile(p) {
  const hits = {}; // cat -> [{note, w}]
  const add = (tier, list) => list.forEach((note) => cats(note).forEach((c) => (hits[c] ||= []).push({ note, w: TIER_W[tier], tier })));
  if (p.notes_flat) add('flat', p.notes.heart);
  else { add('top', p.notes.top); add('heart', p.notes.heart); add('base', p.notes.base); }
  const sc = (c) => (hits[c] || []).reduce((s, h) => s + h.w, 0);
  const notes = (c) => (hits[c] || []).map((h) => h.note);
  const count = p.notes.top.length + p.notes.heart.length + p.notes.base.length;
  return { hits, sc, notes, count };
}

const uniq = (a) => [...new Set(a)];
const conf = (score, hi, mid) => (score >= hi ? 'High' : score >= mid ? 'Medium' : 'Low');
const capMedium = (c, pr) => (pr.count <= 3 && c === 'High' ? 'Medium' : c);

// ---------------------------------------------------------------- presence
function presence(p, pr) {
  let s = 0;
  const up = [];
  const down = [];
  const push = (c, w, cap, arr) => {
    const hs = pr.hits[c] || [];
    if (!hs.length) return;
    const v = Math.min(cap, hs.reduce((a, h) => a + w * (h.tier === 'top' ? 0.6 : 1), 0));
    s += arr === up ? v : -v;
    arr.push(...hs.map((h) => h.note));
  };
  push('oud', 2, 2.5, up);
  push('leather', 1.5, 2, up);
  push('tobacco', 1.5, 2, up);
  push('amber', 1, 1.8, up);
  push('resin', 0.8, 1.8, up);
  push('smoke', 0.5, 0.8, up);
  push('earthy', 0.4, 0.6, up);
  push('radiant', 0.6, 1, up); // ambergris / ambroxan project well beyond the skin
  push('boozy', 0.4, 0.6, up);
  push('spice', 0.25, 0.6, up);
  // heavy vanilla: vanilla together with other gourmand / amber / resin
  if (pr.hits.vanilla) {
    const heavy = (pr.hits.gourmand?.length || 0) + (pr.hits.amber?.length || 0) + (pr.hits.resin?.length || 0) >= 2;
    s += heavy ? 1 : 0.4;
    up.push(...pr.notes('vanilla'));
  }
  push('citrus', 0.35, 1.2, down);
  push('tea', 1, 1, down);
  push('iris', 0.7, 0.9, down);
  push('musk', 0.45, 1.2, down);
  push('aquatic', 0.5, 0.8, down);
  push('green', 0.3, 0.6, down);
  const c = p.concentration;
  if (c === 'extrait') { s += 1.5; up.push('extrait concentration'); }
  if (c === 'elixir' || c === 'parfum') { s += 0.8; up.push(`${c} concentration`); }
  if (c === 'cologne') { s -= 1.5; down.push('cologne concentration'); }
  if (c === 'edt') { s -= 0.5; down.push('eau de toilette'); }
  if (c === 'oil') { s -= 0.5; down.push('oil (sits on skin)'); }
  const value = s >= 2.2 ? 'fills' : s <= 0.2 ? 'close' : 'noticed';
  const margin = value === 'fills' ? s - 2.2 : value === 'close' ? 0.2 - s : Math.min(s - 0.2, 2.2 - s);
  const drivers = value === 'close' ? down : value === 'fills' ? up : [...up, ...down];
  let confidence = conf(margin + Math.min(drivers.length, 4) * 0.15, 1.1, 0.5);
  confidence = capMedium(confidence, pr);
  return { value, notes: uniq(drivers).slice(0, 8), confidence, score: +s.toFixed(2) };
}

// ---------------------------------------------------------------- season
function season(p, pr) {
  const f = pr.sc;
  const sum = (arr) => arr.reduce((a, [c, w]) => a + f(c) * w, 0);
  const DEF = {
    hot: [['citrus', 1], ['aquatic', 1], ['green', 1], ['aromatic', 1], ['tea', 1], ['fruity', 0.4]],
    mild: [['floral', 0.8], ['lightwoods', 0.7], ['iris', 1], ['powdery', 0.6], ['musk', 0.5], ['fruity', 0.4]],
    cold: [['amber', 1], ['vanilla', 1], ['gourmand', 1], ['oud', 1.2], ['spice', 0.8], ['leather', 1], ['resin', 1], ['tobacco', 1], ['boozy', 1], ['earthy', 0.5], ['radiant', 0.5], ['smoke', 0.6]],
  };
  const scores = Object.fromEntries(Object.entries(DEF).map(([k, v]) => [k, sum(v)]));
  const max = Math.max(...Object.values(scores));
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const out = [];
  for (const [k, v] of Object.entries(scores)) {
    if (v <= 0 || v < Math.max(1, 0.55 * max)) continue;
    const drivers = uniq(DEF[k].flatMap(([c]) => pr.notes(c)));
    const share = v / total;
    let confidence = v >= 3 && share >= 0.38 ? 'High' : v >= 1.8 && share >= 0.25 ? 'Medium' : 'Low';
    confidence = capMedium(confidence, pr);
    out.push({ value: k, notes: drivers.slice(0, 8), confidence, score: +v.toFixed(2) });
  }
  if (!out.length) {
    // nothing matched strongly: default to mild, flagged Low
    out.push({ value: 'mild', notes: [...pr.notes('lightwoods'), ...pr.notes('musk')].slice(0, 4), confidence: 'Low', score: 0 });
  }
  return out;
}

// ---------------------------------------------------------------- gender
const GENDERED_MOODS = ['focus-flow', 'romance-presence', 'celebrate-indulge'];
function gender(p, pr, moods) {
  // the product NAME states it outright ("No. 1 Masculine", "Aventus for Her", "pour Homme")
  const t = p.title.toLowerCase();
  const titleG = /\b(masculine|for men|for him|pour homme|homme|uomo)\b/.test(t) ? 'Masculine' : /\b(feminine|for women|for her|pour femme|femme|donna)\b/.test(t) ? 'Feminine' : null;
  if (titleG) return { value: titleG, notes: [`product name: "${p.title}"`], confidence: 'High' };
  if (!moods.some((m) => GENDERED_MOODS.includes(m))) {
    return { value: 'Unisex', notes: ['owner rule: gender only matters for Focus & Flow, Romance & Presence, Celebrate & Indulge'], confidence: 'High' };
  }
  const f = pr.sc;
  // owner's read: woods, amber and herbs read masculine
  const masc = f('woodsmasc') + 0.5 * f('sandal') + f('oud') + f('amber') + f('aromatic') + f('leather') + f('tobacco') + 0.4 * f('spice') + 0.5 * f('earthy');
  const fem = f('floral') + 0.8 * f('fruity') + f('sweetfem') + 0.6 * f('powdery') + 0.4 * f('vanilla') + 0.5 * f('iris');
  const tot = masc + fem;
  const ratio = tot ? (masc - fem) / tot : 0;
  const value = ratio > 0.25 ? 'Masculine' : ratio < -0.25 ? 'Feminine' : 'Unisex';
  const mNotes = uniq(['woodsmasc', 'oud', 'amber', 'aromatic', 'leather', 'tobacco'].flatMap(pr.notes));
  const fNotes = uniq(['floral', 'fruity', 'sweetfem', 'powdery', 'iris'].flatMap(pr.notes));
  const notes = value === 'Masculine' ? mNotes : value === 'Feminine' ? fNotes : [...mNotes.slice(0, 4), ...fNotes.slice(0, 4)];
  const strength = value === 'Unisex' ? 0.25 - Math.abs(ratio) : Math.abs(ratio) - 0.25;
  let confidence = tot >= 4 && strength >= 0.2 ? 'High' : tot >= 2.5 && strength >= 0.08 ? 'Medium' : 'Low';
  confidence = capMedium(confidence, pr);
  return { value, notes: notes.slice(0, 8), confidence, score: +ratio.toFixed(2) };
}

// ---------------------------------------------------------------- mood
const MOOD_DEF = {
  'morning-boost': [['citrus', 1], ['green', 0.7], ['aquatic', 0.6], ['tea', 0.6], ['fruity', 0.3]],
  'focus-flow': [['aromatic', 1], ['woodsmasc', 0.7], ['tea', 0.7], ['iris', 0.6], ['citrus', 0.3], ['musk', 0.3]],
  'romance-presence': [['floral', 0.8], ['musk', 0.4], ['amber', 0.7], ['oud', 0.7], ['vanilla', 0.4], ['leather', 0.4]],
  'celebrate-indulge': [['gourmand', 1], ['boozy', 1.2], ['fruity', 0.6], ['vanilla', 0.6], ['spice', 0.4]],
  'relax-wind-down': [['lavender', 1.5], ['sandal', 0.8], ['musk', 0.5], ['powdery', 0.6], ['tea', 0.5], ['vanilla', 0.3]],
  'move-thrive': [['aquatic', 1], ['citrus', 0.6], ['green', 0.7], ['aromatic', 0.3]],
  'harmony-meditation': [['resin', 1], ['sandal', 0.8], ['oud', 0.5], ['tea', 0.4], ['smoke', 0.5]],
};
function mood(p, pr) {
  const scores = Object.entries(MOOD_DEF).map(([m, def]) => [m, def.reduce((a, [c, w]) => a + pr.sc(c) * w, 0), def]).sort((a, b) => b[1] - a[1]);
  const [top, second, third] = scores;
  const picks = [top];
  if (second[1] >= 0.85 * top[1] && second[1] > 0) picks.push(second);
  const ref = picks.length > 1 ? third[1] : second[1];
  return picks.map(([m, v, def]) => {
    const margin = v ? (v - ref) / v : 0;
    let confidence = v >= 3 && margin >= 0.3 ? 'High' : v >= 1.5 && margin >= 0.12 ? 'Medium' : 'Low';
    confidence = capMedium(confidence, pr);
    return { value: m, notes: uniq(def.flatMap(([c]) => pr.notes(c))).slice(0, 8), confidence, score: +v.toFixed(2) };
  });
}

// ---------------------------------------------------------------- sets: from member perfumes
function majority(values) {
  const c = {};
  values.forEach((v) => (c[v] = (c[v] || 0) + 1));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------- run
const byHandle = Object.fromEntries(cat.products.map((p) => [p.handle, p]));
const rows = [];
const row = (h, field, d) => rows.push([h, field, d.value, d.notes.join('; '), d.confidence]);

for (const p of cat.products.filter((x) => !x.is_set)) {
  const pr = profile(p);
  const d = {};
  d.presence = presence(p, pr);
  d.season = season(p, pr);
  if (!p.store.moods.length) d.moods = mood(p, pr);
  const moods = p.store.moods.length ? p.store.moods : d.moods.map((m) => m.value);
  if (!p.store.gender.length) d.gender = gender(p, pr, moods);
  p.derived = d;
  row(p.handle, 'presence', d.presence);
  d.season.forEach((s) => row(p.handle, 'season', s));
  if (d.moods) d.moods.forEach((m) => row(p.handle, 'mood', m));
  if (d.gender) row(p.handle, 'gender', d.gender);
}

for (const s of cat.products.filter((x) => x.is_set)) {
  const members = s.set_members.map((m) => byHandle[m.handle]).filter(Boolean);
  const n = members.length;
  const names = members.map((m) => `${m.house} ${m.title}`);
  const setConf = (share) => (n >= 4 && share >= 0.6 ? 'High' : n >= 3 && share >= 0.4 ? 'Medium' : 'Low');
  const vote = (vals, k = 1) => {
    const mj = majority(vals);
    return mj.slice(0, k).map(([v, c]) => ({ value: v, notes: names, confidence: setConf(c / n) }));
  };
  const moodsOf = (m) => (m.store.moods.length ? m.store.moods : m.derived.moods.map((x) => x.value));
  const genderOf = (m) => (m.store.gender.length ? m.store.gender : [m.derived.gender.value]);
  const d = {};
  d.moment = vote(members.map((m) => m.store.moment))[0];
  d.moods = vote(members.flatMap(moodsOf), 2);
  const g = members.flatMap(genderOf);
  const fem = g.filter((x) => x === 'Feminine').length, masc = g.filter((x) => x === 'Masculine').length;
  d.gender = { value: fem && masc ? 'Unisex' : fem ? 'Feminine' : masc ? 'Masculine' : 'Unisex', notes: names, confidence: setConf(Math.max(fem, masc, g.filter((x) => x === 'Unisex').length) / Math.max(1, g.length)) };
  d.presence = vote(members.map((m) => m.derived.presence.value))[0];
  d.season = vote(members.flatMap((m) => m.derived.season.map((x) => x.value)), 2);
  s.derived = d;
  row(s.handle, 'moment', d.moment);
  d.moods.forEach((m) => row(s.handle, 'mood', m));
  row(s.handle, 'gender', d.gender);
  row(s.handle, 'presence', d.presence);
  d.season.forEach((x) => row(s.handle, 'season', x));
}

fs.writeFileSync(CAT, JSON.stringify(cat, null, 1) + '\n');
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
fs.writeFileSync(`${DIR}/derived-review.csv`, ['handle,field,value,driving notes,confidence', ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n');

// summary
const by = (f) => rows.filter((r) => r[1] === f);
const confCount = (rs) => ['High', 'Medium', 'Low'].map((c) => `${c} ${rs.filter((r) => r[4] === c).length}`).join(' / ');
console.log(`derived values: ${rows.length} (${confCount(rows)})`);
for (const f of ['presence', 'season', 'gender', 'mood', 'moment']) {
  const rs = by(f);
  const vals = majority(rs.map((r) => r[2])).map(([v, c]) => `${v}:${c}`).join(' ');
  console.log(`  ${f.padEnd(8)} ${String(rs.length).padStart(3)}  ${confCount(rs)}   ${vals}`);
}
