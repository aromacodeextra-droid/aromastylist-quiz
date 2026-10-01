// Run the engine's own scoring (theme-files/assets/scent-quiz.js) over the built config + taste file.
//  A. every perfume a visitor can name (our shelf + reference list) x "More like it" / "Complete my wardrobe",
//     each with 4 random sets of the other answers (fixed seed)
//  B. every combination of 1-3 loved note families (skip path), each with 3 random sets of the other answers
//  C. the 756 v1 combinations of the tag questions, on the skip path with one family
// Every run must give >= 3 in-stock perfumes from >= 2 houses, no sets, not the named perfume itself,
// never rely on Low-confidence values alone, and survive the share-link round trip.
// Usage: node tests/combinations.mjs [brand]
import fs from 'node:fs';
import vm from 'node:vm';

const BRAND = process.argv[2] || 'aromastylist';
vm.runInThisContext(fs.readFileSync('theme-files/assets/scent-quiz.js', 'utf8'), { filename: 'scent-quiz.js' });
const E = globalThis.ScentQuiz;
const config = JSON.parse(fs.readFileSync(`theme-files/assets/scent-quiz-${BRAND}.json`, 'utf8'));
const tasteData = JSON.parse(fs.readFileSync(`theme-files/assets/scent-quiz-${BRAND}-taste.json`, 'utf8'));
const model = E.buildModel(config, tasteData);
const S = config.scoring;
const Q = config.questions;
const qi = (id) => Q.findIndex((q) => q.id === id);

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];

// build a state: answers by question id; anything not given is random (for single questions)
function makeState(given) {
  const state = [];
  Q.forEach((q, i) => {
    if (!E.isVisible(model, state, i)) { state[i] = null; return; }
    if (q.id in given) state[i] = given[q.id];
    else if (q.type === 'perfume') state[i] = 'skip';
    else if (q.type === 'multi') state[i] = [q.answers[0]];
    else state[i] = pickOne(q.answers);
  });
  return state;
}

const counts = {}, failures = [], setShown = {}, shelfCounts = {};
const shelfStats = Object.fromEntries((config.wardrobes || []).map((w) => [w.id, { shelves: 0, onTag: 0 }]));
let runs = 0, fallbacks = 0;
const quality = { similar: { cos: 0, shared: 0, n: 0 }, complement: { cos: 0, thread: 0, n: 0 }, families: { cos: 0, n: 0 } };
const sizeHist = {};

function run(given, label) {
  const state = makeState(given);
  const answers = E.flatten(state);
  const ctx = E.tasteContext(model, state);
  const res = E.recommend(model, answers, { taste: ctx });
  runs++;
  const items = res.items, problems = [];
  const houses = new Set(items.map((r) => r.p.house));
  if (items.length < S.result_min) problems.push(`only ${items.length} items`);
  if (houses.size < 2) problems.push(`only ${houses.size} house`);
  if (items.some((r) => !r.p.available)) problems.push('out-of-stock item');
  if (items.some((r) => r.p.isSet)) problems.push('set in main list');
  if (ctx && ctx.handle && items.some((r) => r.p.handle === ctx.handle)) problems.push('named perfume recommended back');
  if (!res.fallback && items.some((r) => !(r.solid > 0 && r.solid >= r.low))) problems.push('low-confidence-only pick');
  if (!res.persona) problems.push('no persona');
  // wardrobes: one perfume per occasion / per mood
  for (const w of config.wardrobes || []) {
    const shelves = E.wardrobe(model, answers, w.question, { taste: ctx });
    const want = Q[qi(w.question)].answers.length;
    const hs = shelves.map((r) => r.p.handle);
    const hc = {};
    shelves.forEach((r) => (hc[r.p.house] = (hc[r.p.house] || 0) + 1));
    if (shelves.length !== want) problems.push(`${w.id}: ${shelves.length}/${want} shelves`);
    if (new Set(hs).size !== hs.length) problems.push(`${w.id}: repeated perfume`);
    if (shelves.some((r) => !r.p.available || r.p.isSet)) problems.push(`${w.id}: unavailable or set`);
    if (ctx && ctx.handle && hs.includes(ctx.handle)) problems.push(`${w.id}: named perfume on a shelf`);
    if (Object.values(hc).some((n) => n > S.max_per_house)) problems.push(`${w.id}: house over limit`);
    const mine = answers.find((x) => x.q === w.question);
    if (shelves.length && shelves[0].shelf !== mine) problems.push(`${w.id}: visitor's own shelf not first`);
    const tag = (r) => { const t = r.shelf.tags; const d = Object.keys(t)[0]; const v = Object.keys(t[d]).sort((x, y) => t[d][y] - t[d][x])[0]; return r.p.dims[d].some((x) => x.v === v && !x.low); };
    shelfStats[w.id].shelves += shelves.length;
    shelfStats[w.id].onTag += shelves.filter(tag).length;
    shelves.forEach((r) => (shelfCounts[r.p.handle] = (shelfCounts[r.p.handle] || 0) + 1));
  }
  const code = E.encodeCode(model, state);
  const back = E.parseCode(model, code);
  if (!back || E.encodeCode(model, back) !== code) problems.push(`code does not round-trip: ${code}`);
  if (problems.length) failures.push({ label, code, problems });
  if (res.fallback) fallbacks++;
  sizeHist[items.length] = (sizeHist[items.length] || 0) + 1;
  items.forEach((r) => (counts[r.p.handle] = (counts[r.p.handle] || 0) + 1));
  if (res.set) setShown[res.set.p.handle] = (setShown[res.set.p.handle] || 0) + 1;
  if (ctx) {
    const top3 = items.slice(0, 3);
    const q = quality[ctx.mode];
    top3.forEach((r) => {
      q.n++;
      q.cos += E.cosine(ctx.vec, r.p.vec);
      if (ctx.mode === 'similar') q.shared += r.shared.length >= 1 ? 1 : 0;
      if (ctx.mode === 'complement') q.thread += r.shared.length >= 1 ? 1 : 0;
    });
  }
}

// A. named perfumes
const named = [
  ...model.products.filter((p) => p.vec).map((p) => ({ kind: 'own', id: p.handle })),
  ...model.refs.map((r) => ({ kind: 'ref', id: r.id })),
];
const modeQ = Q[qi('mode')];
for (const pf of named) for (const m of modeQ.answers) for (let k = 0; k < 4; k++) run({ ref: pf, mode: m }, `${pf.kind}:${pf.id}/${m.id}`);

// B. loved families (skip path)
const famQ = Q[qi('notes')];
const fa = famQ.answers;
const famSets = [];
for (let a = 0; a < fa.length; a++) {
  famSets.push([fa[a]]);
  for (let b = a + 1; b < fa.length; b++) {
    famSets.push([fa[a], fa[b]]);
    for (let c = b + 1; c < fa.length; c++) famSets.push([fa[a], fa[b], fa[c]]);
  }
}
for (const fs_ of famSets) for (let k = 0; k < 3; k++) run({ ref: 'skip', notes: fs_ }, `families:${fs_.map((x) => x.id).join('+')}`);

// C. all v1 tag combinations on the skip path
const tagIds = ['for', 'when', 'mood', 'presence', 'weather'];
let combos = [{}];
for (const id of tagIds) combos = combos.flatMap((c) => Q[qi(id)].answers.map((a) => ({ ...c, [id]: a })));
combos.forEach((c, i) => run({ ...c, ref: 'skip', notes: [fa[i % fa.length]] }, 'tags'));

const byHandle = Object.fromEntries(model.products.map((p) => [p.handle, p]));
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
const never = model.products.filter((p) => !counts[p.handle]);
const avg = (q, k) => (q.n ? +(q[k] / q.n).toFixed(3) : null);
const report = {
  brand: BRAND,
  runs, passed: runs - failures.length, failures: failures.slice(0, 50), failure_count: failures.length,
  fallback_results: fallbacks, items_per_result: sizeHist,
  named_perfumes: named.length, family_sets: famSets.length, tag_combinations: combos.length,
  match_quality: {
    similar_avg_family_cosine_top3: avg(quality.similar, 'cos'),
    similar_share_top3_with_a_shared_key_note: avg(quality.similar, 'shared'),
    complement_avg_family_cosine_top3: avg(quality.complement, 'cos'),
    complement_share_top3_with_a_thread_note: avg(quality.complement, 'thread'),
    families_avg_cosine_top3: avg(quality.families, 'cos'),
  },
  distinct_products_recommended: Object.keys(counts).length,
  catalog_perfumes: model.products.length,
  max_share_of_results: top.length ? +(top[0][1] / runs).toFixed(3) : 0,
  top10: top.map(([h, n]) => ({ handle: h, title: `${byHandle[h].house} - ${byHandle[h].title}`, times: n })),
  never_recommended: never.map((p) => `${p.house} - ${p.title}`),
  wardrobes: Object.fromEntries(Object.entries(shelfStats).map(([k, v]) => [k, { shelves: v.shelves, share_carrying_the_shelf_tag: +(v.onTag / v.shelves).toFixed(3) }])),
  distinct_products_on_shelves: Object.keys(shelfCounts).length,
  set_card_shown: Object.values(setShown).reduce((a, b) => a + b, 0),
  set_card_by_set: setShown,
};
fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync(`tests/reports/combinations-${BRAND}.json`, JSON.stringify(report, null, 2) + '\n');

console.log(`runs: ${runs} (named perfumes ${named.length} x 2 modes x 4, family sets ${famSets.length} x 3, tag combos ${combos.length})`);
console.log(`passed: ${report.passed}, failed: ${failures.length}`);
failures.slice(0, 10).forEach((f) => console.log('  FAIL', f.label, f.problems.join('; ')));
console.log('items per result:', sizeHist, '| fallback results:', fallbacks);
console.log('match quality:', report.match_quality);
console.log(`distinct perfumes recommended: ${report.distinct_products_recommended} of ${report.catalog_perfumes}; most frequent in ${(report.max_share_of_results * 100).toFixed(1)}% of runs`);
console.log('top 10:');
report.top10.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t.title} (${t.times})`));
console.log(`never recommended: ${never.length}`);
console.log('wardrobes:', report.wardrobes, `| distinct perfumes on shelves: ${report.distinct_products_on_shelves}`);
console.log(`set card shown in ${report.set_card_shown} of ${runs} results`, setShown);
process.exitCode = failures.length ? 1 : 0;
