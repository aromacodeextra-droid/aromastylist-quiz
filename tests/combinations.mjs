// Run every answer combination through the engine's own scoring (theme-files/assets/scent-quiz.js)
// against the built config+catalog. Every combination must give >= 3 in-stock perfumes from >= 2 houses,
// no Discovery Sets in the main list, and never rely on Low-confidence values alone.
// Usage: node tests/combinations.mjs [brand]  -> prints a report and writes tests/reports/combinations-<brand>.json
import fs from 'node:fs';
import vm from 'node:vm';

const BRAND = process.argv[2] || 'aromastylist';
// run the engine exactly as the browser would (a plain script); it registers globalThis.ScentQuiz
vm.runInThisContext(fs.readFileSync('theme-files/assets/scent-quiz.js', 'utf8'), { filename: 'scent-quiz.js' });
const engine = globalThis.ScentQuiz;
const config = JSON.parse(fs.readFileSync(`theme-files/assets/scent-quiz-${BRAND}.json`, 'utf8'));
const model = engine.buildModel(config);
const S = config.scoring;

const qs = config.questions;
let combos = [[]];
for (const q of qs) combos = combos.flatMap((c) => q.answers.map((a) => [...c, a]));

const counts = {};
const setShown = {};
const personas = {};
const failures = [];
let fallbacks = 0;
let minItems = Infinity, maxItems = 0, sizeHist = {};
for (const answers of combos) {
  const res = engine.recommend(model, answers);
  const code = engine.encodeCode(answers);
  const items = res.items;
  const houses = new Set(items.map((r) => r.p.house));
  const problems = [];
  if (items.length < S.result_min) problems.push(`only ${items.length} items`);
  if (houses.size < 2) problems.push(`only ${houses.size} house`);
  if (items.some((r) => !r.p.available)) problems.push('out-of-stock item');
  if (items.some((r) => r.p.isSet)) problems.push('set in main list');
  if (!res.fallback && items.some((r) => !(r.solid > 0 && r.solid >= r.low))) problems.push('low-confidence-only pick');
  if (!res.persona) problems.push('no persona');
  if (engine.encodeCode(engine.parseCode(config, code)) !== code) problems.push('code does not round-trip');
  if (problems.length) failures.push({ code, problems });
  if (res.fallback) fallbacks++;
  minItems = Math.min(minItems, items.length);
  maxItems = Math.max(maxItems, items.length);
  sizeHist[items.length] = (sizeHist[items.length] || 0) + 1;
  items.forEach((r) => (counts[r.p.handle] = (counts[r.p.handle] || 0) + 1));
  if (res.set) setShown[res.set.p.handle] = (setShown[res.set.p.handle] || 0) + 1;
  personas[res.persona.key] = (personas[res.persona.key] || 0) + 1;
}

const byHandle = Object.fromEntries(model.products.map((p) => [p.handle, p]));
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
const never = model.products.filter((p) => !counts[p.handle]);
const report = {
  brand: BRAND,
  combinations: combos.length,
  passed: combos.length - failures.length,
  failures,
  fallback_results: fallbacks,
  items_per_result: { min: minItems, max: maxItems, histogram: sizeHist },
  distinct_products_recommended: Object.keys(counts).length,
  catalog_perfumes: model.products.length,
  top10: top.map(([h, n]) => ({ handle: h, title: `${byHandle[h].house} - ${byHandle[h].title}`, times: n })),
  never_recommended: never.map((p) => `${p.house} - ${p.title}`),
  set_card_shown: Object.values(setShown).reduce((a, b) => a + b, 0),
  set_card_by_set: setShown,
  personas_used: Object.keys(personas).length,
};
fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync(`tests/reports/combinations-${BRAND}.json`, JSON.stringify(report, null, 2) + '\n');

console.log(`combinations: ${report.combinations}, passed: ${report.passed}, failed: ${failures.length}`);
failures.slice(0, 10).forEach((f) => console.log('  FAIL', f.code, f.problems.join('; ')));
console.log(`items per result: ${minItems}-${maxItems}`, sizeHist, `| fallback results: ${fallbacks}`);
console.log(`distinct perfumes recommended: ${report.distinct_products_recommended} of ${report.catalog_perfumes}`);
console.log('top 10:');
report.top10.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t.title} (${t.times})`));
console.log(`never recommended: ${never.length}`);
console.log(`set card shown in ${report.set_card_shown} of ${combos.length} results`, setShown);
console.log(`personas used: ${report.personas_used}`);
process.exitCode = failures.length ? 1 : 0;
