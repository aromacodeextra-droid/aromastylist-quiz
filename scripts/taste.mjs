// Taste analysis shared by our catalog and the reference perfumes people name in the quiz.
// notes {top, heart, base} -> canonical notes (~80) + a 12-family profile (shares that sum to 1).
// The same function runs on both sides, so "similar" compares like with like.

export const FAMILIES = ['citrus', 'green', 'aquatic', 'florals', 'white_florals', 'fruity', 'gourmand', 'woods', 'amber', 'oud_leather', 'spices', 'musk_powder'];

// [id, label, family, keyword pattern, catch-all?]  (pattern is matched against one lower-case note name)
export const CANON = [
  ['bergamot', 'bergamot', 'citrus', /bergamot/],
  ['lemon', 'lemon', 'citrus', /lemon|citron|cedrat|yuzu|verbena|vervain|litsea|citrus|ber gamot/],
  ['mandarin', 'mandarin', 'citrus', /mandarin|tangerine|clementine|kumquat/],
  ['orange', 'orange', 'citrus', /^(?!.*(blossom|flower|leaves|leaf)).*\borange\b/],
  ['grapefruit', 'grapefruit', 'citrus', /grapefruit|pomelo/],
  ['lime', 'lime', 'citrus', /\blime\b|lime peel/],
  ['neroli', 'neroli', 'citrus', /neroli|petitgrain/],
  ['lavender', 'lavender', 'green', /lavend/],
  ['sage', 'sage', 'green', /\bsage\b|clary/],
  ['mint', 'mint', 'green', /mint|menthol/],
  ['herbs', 'aromatic herbs', 'green', /basil|rosemary|thyme|tarragon|artemisia|wormwood|absinthe|juniper|laurel|bay leaf|myrtle|fennel|eucalyptus|aromatic|herb|davana|angelica|buchu/],
  ['tea', 'tea', 'green', /\btea\b|matcha|oolong|\bmat[eé]\b/],
  ['fig', 'fig', 'green', /\bfig/],
  ['greens', 'green notes', 'green', /green|galbanum|violet lea|grass|\bhay\b|bamboo|leaves|\bleaf\b|rhubarb|cucumber|tomato|cannabis|pine(?!apple)|fir\b|cypress/, true],
  ['sea', 'sea notes', 'aquatic', /\bsea\b|marine|aquatic|(?<!rose )water(?! ?lily)|ozon|\bsalt\b|seaweed|mineral|\brain\b|calone|aquozone|driftwood/],
  ['rose', 'rose', 'florals', /\brose(?!mary|wood)|pomarose/],
  ['peony', 'peony', 'florals', /peony/],
  ['violet', 'violet', 'florals', /violet(?! lea)/],
  ['lily', 'lily of the valley', 'florals', /lily|muguet|lilac|freesia|hyacinth|cyclamen|bellflower/],
  ['magnolia', 'magnolia', 'florals', /magnolia|lotus|orchid|carnation|geranium|pelargonium|mimosa|marigold|osmanthus|heliotrope|honeysuckle|hibiscus|narcissus|floral|flower|petal/, true],
  ['jasmine', 'jasmine', 'white_florals', /jasmin|sambac|hedione/],
  ['tuberose', 'tuberose', 'white_florals', /tuberose/],
  ['orange_blossom', 'orange blossom', 'white_florals', /orange (blossom|flower)|bigarade flower/],
  ['ylang', 'ylang-ylang', 'white_florals', /ylang|yang-ylang/],
  ['gardenia', 'gardenia', 'white_florals', /gardenia|frangipani|champaca|white flower|white floral/],
  ['peach', 'peach', 'fruity', /peach|apricot|nectarine/],
  ['pear', 'pear', 'fruity', /\bpear/],
  ['apple', 'apple', 'fruity', /\bapple|quince/],
  ['berries', 'berries', 'fruity', /berr|currant|cassis/],
  ['cherry', 'cherry', 'fruity', /cherr/],
  ['plum', 'plum', 'fruity', /plum|prune|dried fruit/],
  ['lychee', 'lychee', 'fruity', /lychee|litchi/],
  ['tropical', 'tropical fruit', 'fruity', /pineapple|mango|passion|guava|melon|tropical|fruit/, true],
  ['vanilla', 'vanilla', 'gourmand', /vanill/],
  ['tonka', 'tonka bean', 'gourmand', /tonka|coumarin/],
  ['caramel', 'caramel', 'gourmand', /caramel|toffee|praline|sugar|candy|marshmallow|gourmand|sweet|meringue|malt|brioche|licorice|maple|\brice\b|loukhoum|lactone/],
  ['chocolate', 'chocolate', 'gourmand', /chocolate|cocoa|cacao/],
  ['coffee', 'coffee', 'gourmand', /coffee|espresso/],
  ['honey', 'honey', 'gourmand', /honey|beeswax|immortelle/],
  ['coconut', 'coconut', 'gourmand', /coconut/],
  ['almond', 'almond', 'gourmand', /almond|pistachio|hazelnut|chestnut|marzipan|walnut|\bnuts?\b/],
  ['milk', 'milk & cream', 'gourmand', /milk|cream|butter/],
  ['boozy', 'rum & cognac', 'gourmand', /\brum\b|cognac|whisk|brandy|champagne|liqu|bourbon(?! vanilla)|wine/],
  ['cedar', 'cedar', 'woods', /cedar/],
  ['sandalwood', 'sandalwood', 'woods', /sandal|palo santo/],
  ['vetiver', 'vetiver', 'woods', /vetiver/],
  ['patchouli', 'patchouli', 'woods', /patchoul/],
  ['guaiac', 'guaiac wood', 'woods', /guaiac/],
  ['cashmere', 'cashmere wood', 'woods', /cashmer|cashmeran/],
  ['moss', 'oakmoss', 'woods', /moss/],
  ['woods', 'woods', 'woods', /wood|akigalawood|cypriol|nagarmotha|papyrus|\boak\b|hinoki|teak|mahogany|iso e super|javanol|amyris|cabreuva|earthy|roots/, true],
  ['amber', 'amber', 'amber', /\bamber(?!gris)|amberwood|labdanum|cistus/],
  ['benzoin', 'benzoin', 'amber', /benzoin|tolu|peru|balsam|styrax|copal|elemi|resin|opoponax|mastic/],
  ['incense', 'incense', 'amber', /incense|olibanum|frankincense/],
  ['myrrh', 'myrrh', 'amber', /myrrh/],
  ['oud', 'oud', 'oud_leather', /\boud|agarwood|aoud/],
  ['leather', 'leather', 'oud_leather', /leather|suede/],
  ['tobacco', 'tobacco', 'oud_leather', /tobacco/],
  ['smoke', 'smoke', 'oud_leather', /smok|birch|cade|truffle/],
  ['saffron', 'saffron', 'spices', /saffron|safraleine/],
  ['cardamom', 'cardamom', 'spices', /cardamom/],
  ['cinnamon', 'cinnamon', 'spices', /cinnamon|cassia/],
  ['pepper', 'pepper', 'spices', /pepper|peppercorn|timur/],
  ['clove', 'clove & spice', 'spices', /clove|nutmeg|cumin|caraway|anise|coriander|spic|chil|paprika|carrot/, true],
  ['ginger', 'ginger', 'spices', /ginger/],
  ['musk', 'musk', 'musk_powder', /musk|muscone|ambrette|ambrettolide|habanolide|skin/],
  ['iris', 'iris', 'musk_powder', /iris|orris/],
  ['powder', 'powdery notes', 'musk_powder', /powder|aldehyde|cotton|clean|soap/],
  ['ambergris', 'ambergris', 'musk_powder', /ambergris|ambrox|ambrofix|ambroxan|cetalox/],
];

const TIER_W = { top: 0.8, heart: 1, base: 1.2 }; // family profile: the dry-down lasts longest
// order of the key notes: the heart carries a perfume's signature; broad words ("woods", "floral") rank last
const KEY_W = { top: 1, heart: 1.3, base: 1.1 };

// returns { vec: number[12] (shares), canon: string[] (ids, strongest first) }
export function taste(notes) {
  const fam = new Array(FAMILIES.length).fill(0);
  const canon = new Map();
  for (const tier of ['top', 'heart', 'base']) {
    for (const raw of notes[tier] || []) {
      const n = String(raw).toLowerCase();
      // specific notes first, broad catch-alls ("floral", "woody", "fruit") only if nothing specific matched
      const hit = CANON.find((c) => !c[4] && c[3].test(n)) || CANON.find((c) => c[4] && c[3].test(n));
      if (!hit) continue;
      const w = TIER_W[tier];
      fam[FAMILIES.indexOf(hit[2])] += w;
      canon.set(hit[0], (canon.get(hit[0]) || 0) + KEY_W[tier] * (hit[4] ? 0.5 : 1));
    }
  }
  const sum = fam.reduce((a, b) => a + b, 0) || 1;
  return {
    vec: fam.map((x) => x / sum),
    canon: [...canon.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
  };
}

// compact encoding for the theme JSON: 12 digits (share x 10, rounded, max 9) + canon indices (2 digits each)
export const encVec = (vec) => vec.map((x) => Math.min(9, Math.round(x * 10))).join('');
export const encCanon = (ids, max = 8) => ids.slice(0, max).map((id) => String(CANON.findIndex((c) => c[0] === id)).padStart(2, '0')).join('');
