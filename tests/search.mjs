// 100 misspelled / abbreviated queries people really type -> the right perfume must be the first hit.
// Uses the engine's own search (theme-files/assets/scent-quiz.js) over the built taste + config files.
// Target: >= 95 of 100. Usage: node tests/search.mjs
import fs from 'node:fs';
import vm from 'node:vm';

vm.runInThisContext(fs.readFileSync('theme-files/assets/scent-quiz.js', 'utf8'), { filename: 'scent-quiz.js' });
const E = globalThis.ScentQuiz;
const model = E.buildModel(JSON.parse(fs.readFileSync('theme-files/assets/scent-quiz-aromastylist.json', 'utf8')),
  JSON.parse(fs.readFileSync('theme-files/assets/scent-quiz-aromastylist-taste.json', 'utf8')));
const index = E.buildIndex(model);

// [query, expected id (popular list id, or p:<our handle>)]
const CASES = [
  ['br540', 'mfk-baccarat-rouge-540'], ['BR 540', 'mfk-baccarat-rouge-540'], ['bacarat rouge', 'mfk-baccarat-rouge-540'], ['baccarat rogue 540', 'mfk-baccarat-rouge-540'],
  ['barcarat', 'mfk-baccarat-rouge-540'], ['kurkdjian baccarat', 'mfk-baccarat-rouge-540'], ['santal', 'le-labo-santal-33'], ['santal 33', 'le-labo-santal-33'],
  ['santl 33', 'le-labo-santal-33'], ['le labo santal', 'le-labo-santal-33'], ['La Vie Est Belle', 'lancome-la-vie-est-belle'], ['LVEB', 'lancome-la-vie-est-belle'],
  ['la vie est bele', 'lancome-la-vie-est-belle'], ['lavie est belle', 'lancome-la-vie-est-belle'], ['lancome la vie', 'lancome-la-vie-est-belle'], ['sauvage', 'dior-sauvage'],
  ['savage dior', 'dior-sauvage'], ['dior savuage', 'dior-sauvage'], ['sauvage elixer', 'dior-sauvage-elixir'], ['savage elixir', 'dior-sauvage-elixir'],
  ['blue de chanel', 'chanel-bleu-de-chanel'], ['bleu de chanel', 'chanel-bleu-de-chanel'], ['chanel bleu parfum', 'chanel-bleu-de-chanel-parfum'], ['bdc', 'chanel-bleu-de-chanel'],
  ['coco mademoiselle', 'chanel-coco-mademoiselle'], ['coco madmoiselle', 'chanel-coco-mademoiselle'], ['coco mademoisele', 'chanel-coco-mademoiselle'], ['chanel no 5', 'chanel-n-5'],
  ['chanel number 5', 'chanel-n-5'], ['chance eau tendre', 'chanel-chance-eau-tendre'], ['chance tendre', 'chanel-chance-eau-tendre'], ['black opium', 'ysl-black-opium'],
  ['black opuim', 'ysl-black-opium'], ['ysl black opium', 'ysl-black-opium'], ['black opium le parfum', 'ysl-black-opium-le-parfum'], ['libre ysl', 'ysl-libre'],
  ['ysl libre intense', 'ysl-libre-intense'], ['ysl y', 'ysl-y'], ['mon paris', 'ysl-mon-paris'], ['jadore', 'dior-j-adore'],
  ['j adore dior', 'dior-j-adore'], ['miss dior', 'dior-miss-dior'], ['mis dior', 'dior-miss-dior'], ['delina', 'pdm-delina'],
  ['delinah', 'pdm-delina'], ['parfums de marly layton', 'pdm-layton'], ['layton', 'pdm-layton'], ['aventus', 'creed-aventus'],
  ['creed aventis', 'creed-aventus'], ['aventus creed', 'creed-aventus'], ['green irish tweed', 'creed-green-irish-tweed'], ['angels share', 'kilian-angels-share'],
  ['angel share kilian', 'kilian-angels-share'], ['killian angels share', 'kilian-angels-share'], ['good girl', 'ch-good-girl'], ['carolina herrera good girl', 'ch-good-girl'],
  ['tobacco vanilla', 'tom-ford-tobacco-vanille'], ['tobaco vanille', 'tom-ford-tobacco-vanille'], ['tom ford lost cherry', 'tom-ford-lost-cherry'], ['lost cherri', 'tom-ford-lost-cherry'],
  ['oud wood', 'tom-ford-oud-wood'], ['ombre leather', 'tom-ford-ombre-leather'], ['f fabulous', 'tom-ford-fucking-fabulous'], ['black orchid', 'tom-ford-black-orchid'],
  ['acqua di gio', 'armani-acqua-di-gio'], ['aqua di gio', 'armani-acqua-di-gio'], ['acqua di gio profondo', 'armani-acqua-di-gio-profondo'], ['stronger with you intensely', 'armani-stronger-with-you-intensely'],
  ['stronger with you intensly', 'armani-stronger-with-you-intensely'], ['armani si', 'armani-si'], ['light blue', 'dg-light-blue'], ['dolce gabbana light blue', 'dg-light-blue'],
  ['ligth blue', 'dg-light-blue'], ['le male', 'jpg-le-male'], ['jean paul gaultier le male elixir', 'jpg-le-male-elixir'], ['le male elixer', 'jpg-le-male-elixir'],
  ['1 million', 'rabanne-1-million'], ['one million paco', 'rabanne-1-million'], ['invictus', 'rabanne-invictus'], ['eros versace', 'versace-eros'],
  ['versace eros flame', 'versace-eros-flame'], ['spicebomb', 'viktor-and-rolf-spicebomb'], ['spice bomb extreme', 'viktor-and-rolf-spicebomb-extreme'], ['flowerbomb', 'viktor-and-rolf-flowerbomb'],
  ['flower bomb', 'viktor-and-rolf-flowerbomb'], ['gypsy water', 'byredo-gypsy-water'], ['gipsy water', 'byredo-gypsy-water'], ['mojave ghost', 'byredo-mojave-ghost'],
  ['jazz club', 'margiela-jazz-club'], ['replica jazz club', 'margiela-jazz-club'], ['by the fire place', 'margiela-by-the-fireplace'], ['wood sage sea salt', 'jo-malone-wood-sage-and-sea-salt'],
  ['english pear freesia', 'jo-malone-english-pear-and-freesia'], ['glossier you', 'glossier-glossier-you'], ['vanilla 28', 'kayali-vanilla-28'], ['kayali vanila', 'kayali-vanilla-28'],
  ['born in roma', 'valentino-born-in-roma-donna'], ['paradoxe', 'prada-paradoxe'], ['prada paradox', 'prada-paradoxe'], ['daisy marc jacobs', 'marc-jacobs-daisy'],
];
let ok = 0;
const fails = [];
for (const [q, want] of CASES) {
  const hit = E.search(index, q, 5);
  const top = hit[0] ? (hit[0].kind === 'p' ? 'p:' + hit[0].id : hit[0].id) : null;
  if (top === want) ok++; else fails.push(`${q} -> ${top || 'nothing'} (want ${want}; got ${hit.slice(0, 3).map((h) => h.house + ' ' + h.name).join(' | ')})`);
}
console.log(`search: ${ok}/${CASES.length} misspelled queries resolve to the right perfume (target >= 95)`);
fails.forEach((f) => console.log('  miss: ' + f));
fs.mkdirSync('tests/reports', { recursive: true });
fs.writeFileSync('tests/reports/search.txt', `search: ${ok}/${CASES.length} resolve (target >= 95)\n` + fails.map((f) => 'miss: ' + f).join('\n') + '\n');
if (CASES.length !== 100) { console.log('expected 100 cases, have', CASES.length); process.exitCode = 1; }
if (ok < 95) process.exitCode = 1;
