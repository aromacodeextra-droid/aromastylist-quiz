// Parse the raw "Notes" accordion text from a product page into tiers.
// Formats seen on aromastylist.com:
//   "Top: a, b\nHeart: c\nBase: d\n\nPerfumer X. Eau de parfum, 2018.\n\nFragrance Family: Y"
//   "• Fragrance Family: Y • Key Notes: • A • B • C"
//   "Top Passionfruit, Saffron and Rose Heart Agarwood (Oud), Benzoin Base Leather, Amber and Labdanum."
//   "• Vanilla (Madagascar vanilla absolute, Fair for Life) • Coconut Powder • Tonka Bean"

const PROSE = /^(perfumer|perfumers|created|launched|eau de|extrait|parfum\b|cologne\b|concentration|longevity|sillage|note:|\d{4}|by |a |an |the |this |it |matière|matiere|house |composed|inspired|natural|vegan|\d+%)/i;

export function parseNotes(text) {
  if (!text) return null;
  const familyM = text.match(/Fragrance Family\s*:\s*([^\n•]+)/i);
  const family = familyM ? familyM[1].trim().replace(/[.;]$/, '') : null;
  let body = text
    .replace(/Fragrance Family\s*:\s*[^\n•]+/gi, '\n')
    .replace(/Key Notes\s*:?/gi, '\n')
    .replace(/Olfactory (?:family|notes)\s*:\s*/gi, '\n');

  // tiers with an explicit colon (possibly inline)
  const lab = /\b(Top|Head|Heart|Middle|Base|Dry[- ]?down)(?:\s+notes?)?\s*:\s*/g;
  let tiers = sliceTiers(body, lab);
  if (!tiers) {
    // "Top X Heart Y Base Z" without colons - only when all three capitalised words appear in order
    const noColon = /(?:^|\n|\s)(Top|Heart|Middle|Base)(?:\s+notes?)?\s+(?=[A-Z])/g;
    const words = [...body.matchAll(noColon)].map((m) => m[1]);
    if (words[0] === 'Top' && words.includes('Base')) tiers = sliceTiers(body, noColon);
  }
  if (tiers) return { ...tiers, family, flat: false };

  // flat list: bullets, else first line
  const bullets = body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('•')).map((l) => l.slice(1).trim()).filter(Boolean);
  const src = bullets.length ? bullets.filter((b) => !PROSE.test(b)) : body.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 1);
  const flat = uniq(src.flatMap(items));
  return { top: [], heart: flat, base: [], family, flat: true };
}

function sliceTiers(body, re) {
  const hits = [...body.matchAll(re)];
  if (!hits.length) return null;
  const out = { top: [], heart: [], base: [] };
  hits.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : body.length;
    let seg = body.slice(start, end);
    // the last tier ends where prose starts (blank line or a sentence)
    seg = seg.split(/\n\s*\n/)[0];
    const lines = seg.split('\n').map((l) => l.replace(/^•\s*/, '').trim()).filter((l) => l && !PROSE.test(l));
    const key = /^(top|head)/i.test(m[1]) ? 'top' : /^(heart|middle)/i.test(m[1]) ? 'heart' : 'base';
    out[key].push(...lines.flatMap(items));
  });
  for (const k of Object.keys(out)) out[k] = uniq(out[k]);
  return out.top.length + out.heart.length + out.base.length ? out : null;
}

// split a list line into note names
function items(line) {
  return line
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\.\s+[A-Z].*$/, '') // drop a trailing sentence
    .replace(/^single material\s*:\s*/i, '')
    .split(/,|;|\s+and\s+|\s+&\s+|•/)
    .map((x) => x.split(/\s[–-]\s|—|:\s/)[0]) // "Bergamot – bright citrus pop" -> "Bergamot"
    .map((x) => x.replace(/^(or|with|plus)\s+/i, '').replace(/[.:]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((x) => x && x.split(' ').length <= 5 && !PROSE.test(x));
}

const uniq = (a) => [...new Set(a)];

export function concentration(text, title) {
  const s = `${title || ''} ${text || ''}`.toLowerCase();
  if (/extrait/.test(s)) return 'extrait';
  if (/\belixir\b/.test(s)) return 'elixir';
  if (/eau de cologne|\bcologne\b/.test(s)) return 'cologne';
  if (/eau de toilette|\bedt\b/.test(s)) return 'edt';
  if (/perfume oil|\boil\b|attar/.test(s)) return 'oil';
  if (/eau de parfum|\bedp\b/.test(s)) return 'edp';
  if (/\bparfum\b|\bintense\b/.test(s)) return 'parfum';
  return null;
}
