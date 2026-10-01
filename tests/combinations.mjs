// Run the engine's own wardrobe builder (theme-files/assets/scent-quiz.js) over the built config + taste files.
//  A. 5,000 random answer sets (fixed seed): 0-2 named perfumes (popular list + our shelf) or "I don't have one" + note families,
//     random taboos / toggles, week, how, feel, presence, matters, climate, style
//  B. every one of the 36 popular tiles (12 for her, 12 for him, 12 for both) x every combination of the 7 taboos (128) x the 4 climates, other answers random
// Checks, recomputed from the raw notes in catalog.json (not from the engine's encoding):
//  every requested slot filled, in stock, no duplicates (picks and "also fits"), no sets, >= 2 houses when >= 2 slots,
//  zero tabooed notes, "strong scents bother me" -> nothing that fills the room, gender rule, never the perfume they named,
//  no two cards share a why-line, no why-line / shares-line names a note the perfume lacks, no persona line names a note
//  none of the picks have, the share link reopens the same result.
// Usage: node tests/combinations.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { taste, CANON, FAMILIES } from '../scripts/taste.mjs';

vm.runInThisContext(fs.readFileSync('theme-files/assets/scent-quiz.js', 'utf8'), { filename: 'scent-quiz.js' });
const E = globalThis.ScentQuiz;
const config = JSON.parse(fs.readFileSync('theme-files/assets/scent-quiz-aromastylist.json', 'utf8'));
const tasteData = JSON.parse(fs.readFileSync('theme-files/assets/scent-quiz-aromastylist-taste.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('quiz/brands/aromastylist/catalog.json', 'utf8'));
const popular = JSON.parse(fs.readFileSync('quiz/data/popular-perfumes.json', 'utf8')).perfumes;
const model = E.buildModel(config, tasteData);
const Q = (id) => config.questions.find((q) => q.id === id);
const c = config.copy;

// ground truth: canonical notes from the raw catalog notes
const truth = {};
for (const p of catalog.products) if (p.notes) { const t = taste(p.notes); truth[p.handle] = { canon: new Set(t.canon), vec: t.vec }; }
const refTruth = {};
for (const r of popular) {
  if (r.in_store) { refTruth[r.id] = truth[r.in_store]; continue; }
  const n = r.notes;
  if (n.top.length + n.heart.length + n.base.length + n.key.length) { const t = taste({ top: n.top, heart: [...n.heart, ...n.key], base: n.base }); refTruth[r.id] = { canon: new Set(t.canon), vec: t.vec }; }
}
// set gender, recomputed here from the store gender collections of each set's members (independent of the build)
const setGender = {};
for (const st of catalog.products.filter((p) => p.is_set)) {
  let f = 0, m = 0;
  for (const mem of st.set_members || []) {
    const g = catalog.products.find((x) => x.handle === mem.handle)?.store.gender || [];
    const her = g.includes('Feminine') || g.includes('Unisex'), him = g.includes('Masculine') || g.includes('Unisex');
    if (g.length && her && !him) f++; else if (g.length && him && !her) m++;
  }
  setGender[st.handle] = f > m ? 'Feminine' : m > f ? 'Masculine' : 'Unisex';
}
const labelToId = Object.fromEntries(CANON.map(([id, label]) => [label, id]));

// mulberry32 (fixed seed): 32-bit integer maths, so the sequence does not collapse in floating point
let seed = 7;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const one = (a) => a[Math.floor(rnd() * a.length)];
const some = (a, max, min = 0) => { const n = min + Math.floor(rnd() * (max - min + 1)); return [...a].sort(() => rnd() - 0.5).slice(0, n); };
const ids = (q) => Q(q).answers.map((a) => a.id);
const refPool = [...model.refs.filter((r) => !r.noNotes).map((r) => ({ k: 'r', id: r.id })), ...model.products.filter((p) => p.vec).map((p) => ({ k: 'p', id: p.handle }))];
const NOTE_TABOOS = Q('taboos').answers.filter((a) => a.rule && a.rule.notes).map((a) => a.id);

function randomState(fixed = {}) {
  const st = { for: one(ids('for')) };
  if (rnd() < 0.2) { st.ref = 'none'; st.notes = some(ids('notes'), 3, 1); }
  else st.ref = some(refPool, 2, 1);
  const tb = rnd() < 0.25 ? ['none'] : some(NOTE_TABOOS, 4);
  if (tb[0] !== 'none') { if (rnd() < 0.3) tb.push('strong'); if (rnd() < 0.3) tb.push('office'); }
  st.taboos = tb;
  st.week = Q('week').rows.map(() => Math.floor(rnd() * 3));
  st.how = one(ids('how'));
  st.feel = some(ids('feel'), 2, 1);
  st.presence = one(ids('presence'));
  st.matters = one(ids('matters'));
  st.climate = one(ids('climate'));
  st.style = one(ids('style'));
  return Object.assign(st, fixed);
}

const stats = { setsBy: {}, runs: 0, fail: {}, slots: 0, picks: {}, persona: {}, sets: 0, examples: [] };
const fail = (k, detail) => { stats.fail[k] = (stats.fail[k] || 0) + 1; if (stats.examples.length < 30) stats.examples.push(k + ': ' + detail); };

function tabooHit(handle, rules) {
  const t = truth[handle];
  if (!t) return null;
  for (const a of rules) {
    if (!a.rule || !a.rule.notes) continue;
    if (a.rule.notes.some((n) => t.canon.has(n))) return a.id;
    if (a.rule.family && t.vec[FAMILIES.indexOf(a.rule.family)] >= a.rule.max_share) return a.id;
  }
  return null;
}
// the note labels a sentence names, e.g. "Made for every day: bergamot, cedar and musk, close to the skin."
function namedNotes(text, part) {
  let s = text;
  if (part === 'why') s = s.slice(s.indexOf(':') + 1).replace(/,\s*(close to the skin|with a soft trail|with a trail that fills the room)\.$/, '').replace(/\.$/, '');
  else s = s.replace(/^Shares the /, '').replace(/ of your .*$/, '');
  return s.split(/, | and /).map((x) => x.trim()).filter(Boolean);
}
function personaOk(persona, picks) {
  const have = new Set(picks.flatMap((h) => [...(truth[h]?.canon || [])]));
  return (persona.notes || []).every((req) => req.some((n) => (n.startsWith('fam:') ? CANON.some(([id, , f]) => f === n.slice(4) && have.has(id)) : have.has(n))));
}

function run(st) {
  stats.runs++;
  const res = E.wardrobe(model, st);
  const why = E.whyLines(model, res, c);
  const want = E.slotsFor(model, st);
  const rows = res.rows.filter((r) => r.pick);
  stats.slots += want.length;
  if (rows.length !== want.length || !want.length) fail('slot not filled', `${E.encodeCode(model, st)} wanted ${want.length} got ${rows.length}`);
  const handles = rows.map((r) => r.pick.p.handle);
  const all = handles.concat(res.rows.filter((r) => r.alt).map((r) => r.alt.p.handle));
  if (new Set(all).size !== all.length) fail('duplicate', handles.join(','));
  const rules = (st.taboos || []).map((id) => Q('taboos').answers.find((a) => a.id === id));
  const named = Array.isArray(st.ref) ? st.ref.map((v) => (v.k === 'p' ? v.id : model.refById[v.id].own?.handle)).filter(Boolean) : [];
  rows.forEach((r, i) => {
    const p = r.pick.p, h = p.handle;
    stats.picks[h] = (stats.picks[h] || 0) + 1;
    if (!p.available) fail('out of stock', h);
    if (p.isSet) fail('set in a slot', h);
    const hit = tabooHit(h, rules);
    if (hit) fail('tabooed note', `${h} breaks ${hit}`);
    if ((st.taboos || []).includes('strong') && p.dims.presence.some((d) => d.v === 'fills' && !d.low)) fail('strong scent', h);
    if (!E.genderOk(model, p, st.for)) fail('gender rule', h);
    if (named.includes(h)) fail('named perfume recommended', h);
    if (!why[i]) fail('no why-line', h);
    else for (const n of namedNotes(why[i], 'why')) if (!truth[h] || !truth[h].canon.has(labelToId[n])) fail('why names a note it lacks', `${h}: "${n}" in "${why[i]}"`);
    const sh = E.sharesLine(model, r.pick, c);
    if (sh) {
      const ref = r.pick.ref, refC = ref.id ? refTruth[ref.id] : truth[ref.handle];
      for (const n of namedNotes(sh, 'shares')) if (!truth[h].canon.has(labelToId[n]) || !refC || !refC.canon.has(labelToId[n])) fail('shares-line names a note not shared', `${h}/${ref.name}: ${n}`);
    }
  });
  if (new Set(why.filter(Boolean)).size !== why.filter(Boolean).length) fail('duplicate why-line', why.join(' | '));
  if (rows.length >= 2 && new Set(rows.map((r) => r.pick.p.house)).size < 2) fail('one house', handles.join(','));
  if (!personaOk(res.persona, handles)) fail('persona names a note no pick has', `${res.persona.key}: ${handles.join(',')}`);
  stats.persona[res.persona.key] = (stats.persona[res.persona.key] || 0) + 1;
  if (res.set) {
    stats.sets++;
    if (res.set.score < 0.9 * rows[0].pick.score - 1e-9) fail('set card not within 10%', 'set card gender conflict', res.set.p.handle);
    const g = setGender[res.set.p.handle];
    stats.setsBy[st.for] = (stats.setsBy[st.for] || 0) + 1;
    if ((st.for === 'her' && g === 'Masculine') || (st.for === 'him' && g === 'Feminine')) fail('set card gender conflict', `${st.for} got ${res.set.p.handle} (${g})`);
  }
  const code = E.encodeCode(model, st), back = E.parseCode(model, code);
  if (!back) fail('share link does not parse', code);
  else {
    const again = E.wardrobe(model, back).rows.filter((r) => r.pick).map((r) => r.pick.p.handle);
    if (again.join() !== handles.join()) fail('share link gives another result', code);
  }
}

const t0 = Date.now();
const distinct = new Set();
for (let i = 0; i < 5000; i++) { const st = randomState(); distinct.add(E.encodeCode(model, st)); run(st); }
const partA = stats.runs;
const usedA = Object.keys(stats.picks).length;
const taboSets = [];
for (let m = 0; m < 1 << NOTE_TABOOS.length; m++) taboSets.push(NOTE_TABOOS.filter((_, i) => m & (1 << i)));
const POPULAR = [...new Set(Object.values(tasteData.popular).flat())];
for (const id of POPULAR) for (const tb of taboSets) for (const cl of ids('climate')) run(randomState({ ref: [{ k: 'r', id }], notes: undefined, taboos: tb.length ? tb : ['none'], climate: cl }));
// C. the case found in the live preview: Him, no perfume, woods + amber, Energised, Unique, Hot & humid, Sporty
for (const tb of [['none'], [], ['coconut']]) for (const how of ids('how')) for (let w = 0; w < 20; w++) {
  run(randomState({ for: 'him', ref: 'none', notes: ['woods', 'amber'], taboos: tb, how, feel: ['energised'], matters: 'unique', climate: 'hot-humid', style: 'sporty' }));
}
const partB = stats.runs - partA;

const counts = Object.entries(stats.picks).sort((a, b) => b[1] - a[1]);
const lines = [
  `combinations: ${stats.runs} runs (A random ${partA}, ${distinct.size} distinct, B 36 popular tiles x taboos x climates + the reported Him case ${partB}), ${stats.slots} slots, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  `failures: ${Object.keys(stats.fail).length ? JSON.stringify(stats.fail) : 'none'}`,
  ...['slot not filled', 'out of stock', 'duplicate', 'set in a slot', 'one house', 'tabooed note', 'strong scent', 'gender rule', 'named perfume recommended', 'no why-line', 'duplicate why-line', 'why names a note it lacks', 'shares-line names a note not shared', 'persona names a note no pick has', 'set card not within 10%', 'share link does not parse', 'share link gives another result']
    .map((k) => `  ${k.padEnd(38)} ${stats.fail[k] || 0}`),
  `perfumes used: ${usedA} in the random part A, ${counts.length} overall, of ${model.products.filter((p) => p.available).length} in stock; most used: ${counts.slice(0, 8).map(([h, n]) => `${h} ${n}`).join(', ')}`,
  `personas: ${Object.entries(stats.persona).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`,
  `ready-made set card shown in ${stats.sets} of ${stats.runs} (her ${stats.setsBy.her || 0}, him ${stats.setsBy.him || 0}, both ${stats.setsBy.both || 0}); set genders: ${Object.entries(setGender).map(([h, g]) => h + ' ' + g).join(', ')}`,
  ...stats.examples.slice(0, 15).map((e) => '  e.g. ' + e),
];
console.log(lines.join('\n'));
fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync('tests/reports/combinations-aromastylist.txt', lines.join('\n') + '\n');
fs.writeFileSync('tests/reports/combinations-aromastylist.json', JSON.stringify({ runs: stats.runs, partA, partB, slots: stats.slots, failures: stats.fail, examples: stats.examples, picks: stats.picks, personas: stats.persona, sets: stats.sets }, null, 1));
if (Object.keys(stats.fail).length) process.exitCode = 1;
