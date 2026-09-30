// Step 1b: data-raw/catalog.fetched.json -> quiz/brands/<brand>/catalog.json
// Store facts only (collections, variants, parsed notes). Derived values are added by scripts/derive.mjs.
import fs from 'node:fs';
import { parseNotes, concentration } from './notes.mjs';

const OUT = process.argv[2] || 'quiz/brands/aromastylist/catalog.json';
const raw = JSON.parse(fs.readFileSync('data-raw/catalog.fetched.json', 'utf8'));

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// house names in set copy differ from vendors ("By Kilian" / "Kilian", "Initio" / "Initio Parfums Prive")
const HOUSE_ALIAS = { 'roja parfums': 'roja dove' };
const houseKey = (h) => {
  const n = norm(h);
  return (HOUSE_ALIAS[n] || n).replace(/^by /, '').replace(/ parfums? prives?$/, '').trim();
};

// "• Parfums de Marly – Delina Exclusif (EDP) 1.5ml ..." -> member handles
function setMembers(body, perfumes) {
  const lines = (body || '').split('\n').filter((l) => l.trim().startsWith('•'));
  const found = [];
  for (const l of lines) {
    const m = l.replace(/^[•\s]+/, '').match(/^(.+?)\s+[–-]\s+(.+?)(?:\s*\(|\s+\d|$)/);
    if (!m) continue;
    const house = houseKey(m[1]);
    const title = norm(m[2]);
    const sameHouse = perfumes.filter((p) => houseKey(p.house) === house);
    const hit = sameHouse.find((p) => norm(p.title) === title)
      || sameHouse.find((p) => title.startsWith(norm(p.title)) || norm(p.title).startsWith(title))
      || sameHouse.find((p) => norm(p.title).includes(title) || title.includes(norm(p.title)));
    found.push({ listed: `${m[1]} – ${m[2]}`.trim(), handle: hit ? hit.handle : null });
  }
  return found;
}

const perfumes = raw.products.filter((p) => !p.is_set);
const products = raw.products.map((p) => {
  const n = parseNotes(p.notes_text);
  const available = p.variants.filter((v) => v.available);
  const sample = (available.length ? available : p.variants).slice().sort((a, b) => a.price - b.price)[0];
  const genders = p.gender == null ? [] : [].concat(p.gender);
  return {
    handle: p.handle,
    title: p.title,
    house: p.vendor ?? p.house,
    image: p.image,
    is_set: p.is_set,
    store: { moment: p.moment, moods: p.moods, gender: genders },
    notes: n ? { top: n.top, heart: n.heart, base: n.base } : null,
    notes_flat: n ? n.flat : null,
    family: n ? n.family : null,
    concentration: concentration(p.notes_text, p.title),
    set_members: p.is_set ? setMembers(p.body_text, perfumes) : undefined,
    sample_variant_id: sample.id,
    variants: p.variants,
  };
});

const out = {
  brand: 'aromastylist',
  source: raw.source,
  fetched_at: raw.fetched_at,
  note: 'Built from the public storefront (products.json, collections/*/products.json, product page Notes accordion). Read-only.',
  collections: raw.collections,
  products,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
const s = products.filter((p) => !p.is_set);
console.log(`catalog: ${products.length} products (${s.length} perfumes, ${products.length - s.length} sets), notes ${s.filter((p) => p.notes).length}/${s.length}`);
for (const p of products.filter((x) => x.is_set)) console.log(`  set ${p.handle}: ${p.set_members.filter((m) => m.handle).length}/${p.set_members.length} members matched`, p.set_members.filter((m) => !m.handle).map((m) => m.listed));
