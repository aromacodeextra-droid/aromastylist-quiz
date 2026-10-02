// Persona distribution over uniformly random answers (no fixed answers, unlike part B of the combinations test).
// Run: node scripts/persona-spread.mjs [runs]
import fs from 'node:fs';
import vm from 'node:vm';
vm.runInThisContext(fs.readFileSync('theme-files/assets/scent-quiz.js', 'utf8'), { filename: 'scent-quiz.js' });
const E = globalThis.ScentQuiz;
const config = JSON.parse(fs.readFileSync('theme-files/assets/scent-quiz-aromastylist.json', 'utf8'));
const tasteData = JSON.parse(fs.readFileSync('theme-files/assets/scent-quiz-aromastylist-taste.json', 'utf8'));
const model = E.buildModel(config, tasteData);
const Q = (id) => config.questions.find((q) => q.id === id);
let seed = 11;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const one = (a) => a[Math.floor(rnd() * a.length)];
const some = (a, max, min = 0) => { const n = min + Math.floor(rnd() * (max - min + 1)); return [...a].sort(() => rnd() - 0.5).slice(0, n); };
const ids = (q) => Q(q).answers.map((a) => a.id);
const refPool = [...model.refs.filter((r) => !r.noNotes).map((r) => ({ k: 'r', id: r.id })), ...model.products.filter((p) => p.vec).map((p) => ({ k: 'p', id: p.handle }))];
const NOTE_TABOOS = Q('taboos').answers.filter((a) => a.rule && a.rule.notes).map((a) => a.id);
const N = +process.argv[2] || 20000, count = {};
for (let i = 0; i < N; i++) {
  const st = { for: one(ids('for')) };
  if (rnd() < 0.3) { st.ref = 'none'; st.notes = some(ids('notes'), 3, 1); } else st.ref = some(refPool, 2, 1);
  st.taboos = rnd() < 0.3 ? ['none'] : some(NOTE_TABOOS, 3);
  const rows = Q('week').rows.map(() => (rnd() < 0.45 ? 1 : 0)); if (!rows.some(Boolean)) rows[0] = 1; st.week = rows;
  st.how = one(ids('how'));
  st.feel = some(ids('feel'), 2, 1);
  st.presence = one(ids('presence'));
  st.matters = one(ids('matters'));
  st.climate = rnd() < 0.2 ? ['all-year'] : some(ids('climate').filter((x) => x !== 'all-year'), 4, 1);
  st.style = some(ids('style'), 2, 1);
  const res = E.wardrobe(model, st);
  const k = res.persona ? res.persona.key : '-';
  count[k] = (count[k] || 0) + 1;
}
const rows = Object.entries(count).sort((a, b) => b[1] - a[1]);
for (const [k, n] of rows) console.log(`${k.padEnd(20)} ${(n / N * 100).toFixed(1)}%`);
console.log('personas seen:', rows.length, 'of', config.personas.list.length, '| max', (rows[0][1] / N * 100).toFixed(1) + '%', '| min', (rows[rows.length - 1][1] / N * 100).toFixed(1) + '%');
