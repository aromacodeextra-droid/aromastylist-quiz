// quiz/data/perfume-list.txt -> quiz/data/perfume-list.json (the 400 names, before notes are collected)
import fs from 'node:fs';
const DROP = ['Dior|Tobacolor', 'Dior|Poison Girl', 'Yves Saint Laurent|Kouros', 'Lancôme|Hypnôse', 'Lancôme|Miracle', 'Prada|Infusion d\'Iris',
  'Givenchy|L\'Interdit Rouge', 'Burberry|Brit for Her', 'Gucci|Bamboo', 'Versace|Crystal Noir', 'Dolce&Gabbana|Q by Dolce&Gabbana',
  'Kilian|Apple Brandy on the Rocks', 'Xerjoff|Lira', 'Amouage|Epic Woman', 'Clive Christian|No1 for Women', 'Montale|Roses Musk',
  'Creed|Himalaya', 'Hermès|Barénia', 'Acqua di Parma|Colonia Intensa', 'Louis Vuitton|Spell on You', 'Davidoff|Cool Water Woman',
  'Bvlgari|Omnia Crystalline', 'Nina Ricci|L\'Air du Temps', 'Coach|Coach for Men', 'Moschino|Toy Boy', 'Lacoste|L.12.12 Blanc',
  'Juicy Couture|Viva la Juicy', 'Penhaligon\'s|Halfeti'];
const ADD = ['Ralph Lauren|Polo', 'Chanel|Coco', 'Yves Saint Laurent|Paris', 'Elizabeth Arden|Red Door', 'Hugo Boss|Hugo Man',
  'Ralph Lauren|Polo Black', 'Jimmy Choo|Man', 'Carolina Herrera|212 Men', 'Rabanne|Pure XS'];
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const HOUSE_SLUG = { 'Yves Saint Laurent': 'ysl', 'Maison Francis Kurkdjian': 'mfk', 'Parfums de Marly': 'pdm', 'Jo Malone London': 'jo-malone', 'Giorgio Armani': 'armani', 'Emporio Armani': 'armani', 'Initio Parfums Prive': 'initio', 'Jean Paul Gaultier': 'jpg', 'Dolce&Gabbana': 'dg', 'Maison Margiela': 'margiela', 'Carolina Herrera': 'ch' };
const lines = fs.readFileSync('quiz/data/perfume-list.txt', 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
const rows = lines.map((l, i) => {
  const [house, name, gender, conc, aliases = '', flanker = ''] = l.split('|').map((s) => s.trim());
  return { idx: i, house, name, gender, concentration: conc, aliases: aliases.split(';').map((s) => s.trim()).filter(Boolean), flanker_of: flanker || null };
});
const key = (r) => `${r.house}|${r.name}`;
const main = rows.slice(0, 419).filter((r) => !DROP.includes(key(r)));
const extra = ADD.map((k) => rows.find((r) => key(r) === k));
if (extra.some((x) => !x)) throw new Error('ADD not found');
if (main.length !== 419 - DROP.length) throw new Error('DROP mismatch ' + main.length);
const list = [...main, ...extra];
const ids = new Set();
for (const r of list) {
  r.id = `${HOUSE_SLUG[r.house] || slug(r.house)}-${slug(r.name.replace(/^(Replica) /, ''))}`;
  if (ids.has(r.id)) throw new Error('dup id ' + r.id);
  ids.add(r.id);
  delete r.idx;
}
// flankers: max 2 per line
const per = {};
for (const r of list) if (r.flanker_of) {
  per[r.house + '|' + r.flanker_of] = (per[r.house + '|' + r.flanker_of] || 0) + 1;
  if (!list.some((x) => x.house === r.house && x.name === r.flanker_of)) console.warn('flanker without base line in list:', key(r));
}
for (const [k, n] of Object.entries(per)) if (n > 2) throw new Error('more than 2 flankers: ' + k);
fs.writeFileSync('quiz/data/perfume-list.json', JSON.stringify(list, null, 1) + '\n');
console.log(list.length, 'perfumes,', new Set(list.map((r) => r.house)).size, 'houses');
