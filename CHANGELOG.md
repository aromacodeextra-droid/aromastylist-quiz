# Changelog

## quiz-v3.7 (2026-10-01) — seasons and sillage (owner's decision, Fragrantica style)

- Screen "Your climate?" -> **"When will you wear it?"**: Winter, Spring, Summer, Fall (pick any number) or "All year"
  (exclusive). Each answer has a line icon. Seasons chosen together are merged (the strongest weight per season wins).
- Screen "How present should it be?" -> **"How far should it reach?"**: Close to skin · Moderate · Strong, shown as
  1 / 2 / 3 growing dots. "Close to skin" never puts a strong (room-filling) perfume in the wardrobe.
- The switch "Strong scents bother me" is gone (Close to skin replaces it). Old share links that carry it still open.
- Owner icons: a file `assets/sq-icon-<screen>-<answer>.svg|png|webp` (e.g. `sq-icon-season-winter.svg`) found at
  build time replaces the built-in icon of that answer.
- A typed share link with a plain `+` (read by the browser as a space) now opens too.
- Changed theme files: `assets/scent-quiz.js`, `assets/scent-quiz.css`, `assets/scent-quiz-aromastylist.json`,
  `templates/aromastylist.scent-quiz.section.json` (climate/presence blocks, 49 blocks). Combinations 28,220 / 0 failures,
  e2e 82 / 82.

## quiz-v3.6 (2026-10-01) — UX step 3: screen 3 "What would you rather avoid?"

- Title "What would you rather avoid?", one hint "Select all that apply.". One grid of 8 answers with "Nothing in
  particular" in it; short hints in normal case (Caramel, honey · Iris, violet · Oud, incense · Tuberose, gardenia ·
  Sea notes, ozone). "AND ALSO" and "We will never put these in your wardrobe" are gone. Chosen answers: tick + frame.
- The two switches moved to where they belong (owner's decision): "Strong scents bother me" above the answers of
  "How present should it be?", "My office is scent-sensitive" under the Work / study row of the week screen. They still
  belong to the taboo answer, so the matching logic and the share-link format are unchanged; "Nothing in particular"
  no longer clears them.
- Changed theme files: `assets/scent-quiz.js`, `assets/scent-quiz.css`, `assets/scent-quiz-aromastylist.json`. e2e 80 / 80.

## quiz-v3.5 (2026-10-01) — UX step 2: screen 2 "Do you have a signature scent?"

- One hint instead of three: "Type its name or tap a bottle. Up to two." The "Type its name" label moved into the box
  ("Type a perfume, e.g. Santal 33", light grey so it does not read as typed text; the label stays for screen readers).
- Chosen perfumes appear **right under the box** as compact chips: name, house, 4 notes, × to remove. They replace the
  big "Inside <name>" cards with family bars.
- "I don't have one" sits right under the box; at the bottom only Continue.
- A chosen bottle tile shows a tick in the corner plus the frame.
- Changed theme files: `assets/scent-quiz.js`, `assets/scent-quiz.css`, `assets/scent-quiz-aromastylist.json`. e2e 74 / 74.

## quiz-v3.4 (2026-10-01) — UX step 1: screen 1 "Who is it for?"

- Third answer "Both of us / no rule" -> **"Unisex"** (one meaning per button). With Unisex, unisex perfumes now rank
  first in every slot; the others stay possible. The set card rule stays "any" (there are no unisex sets).
- Less empty space above the question (section top padding 32 -> 12 px on phones, 56 -> 24 px on desktop; tighter
  progress bar and title margins): the question and its three answers fit on one phone screen (answers end at 420 px
  of 844).
- Changed theme files: `assets/scent-quiz.js`, `assets/scent-quiz.css`, `assets/scent-quiz-aromastylist.json`, and the
  page template's block label (`templates/page.find-your-perfume.json`, block `a_for_both`; snapshot in `docs/theme-copy/`).
- Tests: combinations 0 failures; e2e 74 / 74 (the Unisex set-card case may now be hidden: no unisex set within 10%).

## quiz-v3.3.2 (2026-10-01) — name first, then house; aligned tiles

- Owner's rule: the perfume's name always comes first, the house under it. Applied to the 12 tiles on screen 2, the
  search rows, the result cards and "Also fits this slot".
- Tiles: photo, then the name in a fixed box (3 lines on phones, 2 on desktop), then the house in a fixed 2-line box, so
  across the grid every name starts on the same line and every house starts on the same line. Long names show in full
  (no "…"): Stronger With You Intensely, Born in Roma Donna, Replica By the Fireplace, English Pear & Freesia.
- Changed theme files: `assets/scent-quiz.js`, `assets/scent-quiz.css`. e2e 74 / 74.

## quiz-v3.3.1 (2026-10-01) — two tile photos

- **1 Million** (him): the rabanne.com photo carried a 2023 award badge, so the bottle came out small and off-centre.
  Replaced with the clean packshot from the brand's Sephora page (1 Million EDT, P269120).
- **Santal 33** (both): clear glass on Le Labo's grey studio background cannot be cut out without losing the glass (the
  tile showed grey patches and a shadow streak). The tile now keeps the brand's grey background, square crop around the
  bottle. All 36 tiles were checked by eye after this.
- Changed theme files: `assets/sq-ref-rabanne-1-million.webp`, `assets/sq-ref-le-labo-santal-33.webp`. e2e 74 / 74.

## quiz-v3.3 (2026-10-01) — screen 2 made clear

Owner's feedback from the phone preview: screen 2 started with pictures and a "Search" box at the very bottom, so it was
not clear what to do.
- The question is now **"Do you have a signature scent?"** ("The perfume you wear most, or love most. Type its name, or
  tap it below. You can choose two."). Then a **"Type its name"** box (was "Search", at the bottom), then **"Or tap one of
  these"** with the 12 bottle tiles, then what was chosen and Continue / I don't have one.
- Tapping a tile no longer jumps to the top of the quiz and no longer puts the cursor in the search box (which opened the
  keyboard on phones). The "Inside <name>" card slides into view instead. A second tap on a chosen tile removes it.
- House names break only after "&" (Dolce& / Gabbana), never inside a word.
- Light Blue tile: new brand-site photo (front view with cap; the old one showed the cap off and came out pale).
- A typed share link with a plain `+` (read by the browser as a space) now opens too.
- Changed theme files: `assets/scent-quiz.js`, `assets/scent-quiz.css`, `assets/scent-quiz-aromastylist.json`,
  `assets/sq-ref-dg-light-blue.webp`. Template unchanged.
- Tests: e2e 74 / 74 (new: screen order and wording, tile tap keeps the place and opens no keyboard, second tap removes);
  combinations 23,612 runs 0 failures; search 100 / 100.

## quiz-v3.2 (2026-10-01) — screen 2 tiles follow "Who is it for?"

- Owner's report from the preview: the 12 bottle tiles on "Your signature scent" were the same for her and for him
  (one tile per note family, mixed genders).
- Now three sets of 12, by the perfume's own gender (`quiz/data/popular-meta.json` -> `popular_by_for`), all with images:
  - **Her** (feminine): Black Opium, La Vie Est Belle, Coco Mademoiselle, Miss Dior, J'adore, Libre, Good Girl, Delina,
    Born in Roma Donna, Light Blue, Bloom, Paradoxe.
  - **Him** (masculine): Sauvage, Bleu de Chanel, Y, Acqua di Giò, Aventus, Le Male, Spicebomb, Stronger With You
    Intensely, Eros, 1 Million, Layton, Dior Homme Intense.
  - **Both** (unisex): Baccarat Rouge 540, Santal 33, Tobacco Vanille, Lost Cherry, Oud Wood, Wood Sage & Sea Salt,
    Gypsy Water, Angels' Share, Ombré Leather, By the Fireplace, Glossier You, English Pear & Freesia.
- Search: perfumes of the visitor's gender (and unisex) rank first; nothing is hidden, so a woman who wears Sauvage still
  finds it.
- Long house names wrap inside the tile on phones (Dolce&Gabbana was cut off).
- Changed theme files: `assets/scent-quiz.js`, `assets/scent-quiz.css`, `assets/scent-quiz-aromastylist-taste.json`.
  No new images, template unchanged.
- Tests: combinations 23,612 runs (part B now all 36 tiles x 128 taboo sets x 4 climates), 0 failures; e2e 68 / 68
  (new: tiles for her / him / both are all of that gender and do not overlap, at 390 and 1440 px); search 100 / 100.

## quiz-v3.1 (2026-10-01) — the set card respects "Who is it for?"

- Bug from the live preview: a "Him" run (notes woods + amber, Energised, Unique, Hot & humid, Sporty) was offered
  **The Modern Muse**, a feminine Discovery Set. The set card checked the visitor's gender only through the owner
  rule for perfumes, and the old derived set gender called The Modern Muse "Unisex" although all five perfumes in it
  are in the store's feminine collection.
- Sets are in no gender collection in the store, so each set's gender now comes from the store gender collections
  (feminine / masculine-activities / unisex) of the perfumes inside it: only feminine-only members -> Feminine, only
  masculine-only -> Masculine, all wearable by both -> Unisex, both kinds -> the majority. It is written into the
  config as `catalog.set_gender` (inspectable):
  - Feminine: Platinum Whisper, Modern Icons, Midnight Bloom, Gilded Gatsby Glam, The Modern Muse, Chromatic Couture
  - Masculine: Black Ties, The Executive Edit, Modern Legends (1 feminine-only member vs 3 masculine-only), After Hours
  - Unisex: none
- The set card now follows screen 1 exactly: her -> feminine or unisex sets, him -> masculine or unisex, both -> any.
  If no eligible set scores within 10% of the top pick, the card is hidden (the reported run now shows no set card).
- Changed theme files: only `assets/scent-quiz.js` and `assets/scent-quiz-aromastylist.json`. The template, the
  sections, the CSS, the taste file and the images are byte-for-byte unchanged.
- Tests: `combinations.mjs` adds the check "set card gender conflict" (set gender recomputed independently from the
  catalog) and 180 runs of the reported Him case: **11,324 runs, 0 failures** (on the old code the same check finds
  537 conflicts). Set card shown in 913 runs (her 222, him 312, both 379). `e2e.mjs`: 5 set-card cases (her, him,
  both, him with the "her" answers, the reported run) -> **60 / 60**. Search 100 / 100.
- Weight: JS 46.0 KB, config 59.5 KB (decimal, limit 60), total code 172.7 KB (limit 200).

## quiz-v3 (2026-10-01) — a perfume-stylist consultation

Owner's verdict on v2.1: "not working". The root cause: the "name a perfume" step knew 63 perfumes, so most visitors
hit "not in our list". v3 fixes that first, then rebuilds the quiz as ten screens that end in a wardrobe.

### Step 1 — 400 popular perfumes (`quiz/data/`)
- **400 of the most-worn designer and niche perfumes in the US** (`perfume-list.txt` / `.json`), her and him, no
  celebrity lines, no body mists, no dupes, max 2 flankers per line (Sauvage Elixir, Black Opium Le Parfum,
  Bleu de Chanel Parfum …). Bestseller lists were used for orientation only.
- **Notes from the brand's own site, with the source URL for every perfume** (`popular-perfumes.json`, raw notes +
  notes mapped to the canonical notes):
  - brand site: **326** (166 read from the page itself, 160 from the search engine's reading of that brand page);
  - the brand's page at Sephora: **17** (brand site unreachable or without notes);
  - none: **57**, because the brand sites block automated requests (Guerlain, Hermès, Bvlgari, Cartier, Kilian,
    Acqua di Parma, Louis Vuitton, Calvin Klein …) or publish no notes (Xerjoff 40 Knots / Torino21, ELdO You or
    Someone Like You). **21 of these 57 are on our shelf**, so the quiz uses our own product notes for them.
  - **364 of 400 can be matched by notes.** The other 36 are still found by search; when one is picked, the quiz
    says the house does not publish its notes and asks for the note families instead (screen 2b).
- Fragrantica / Parfumo / Fragella were not used as data. No notes were filled in from memory.
- 75 of the 400 are perfumes we stock: search shows them once, marked "on our shelf", with our notes.
- **Search**: fuzzy (up to 2 typos, swapped letters), house-first or name-first, aliases (BR540, LVEB, Bacarat,
  Santal, BDC …) and house short names (YSL, MFK, PDM, D&G, JPG …). 400 popular + 299 of ours.
- `store-bestsellers.json`: our own unit sales per product title for the last 365 days (read-only analytics query;
  titles and counts only) — used for "What everyone's talking about".

### Step 2 — bottle images (`theme-files/assets/sq-ref-<id>.webp`, manifest `quiz/data/images.json`)
- **59 of 60** official bottle images: **33 from the brand site, 26 from the brand's Sephora page**. 1 missing:
  Givenchy L'Interdit (Givenchy blocks every request and Sephora US does not list the EDP) — it shows as a text row.
- Background flattened to the card colour (#ffffff), centred, padded, 600x600 webp, **860 KB in all, largest 29.5 KB**.
- The 12 popular tiles: Sauvage, Wood Sage & Sea Salt, Acqua di Giò, Miss Dior, J'adore, Lost Cherry, La Vie Est
  Belle, Bleu de Chanel, Baccarat Rouge 540, Ombré Leather, Spicebomb, Paradoxe (one per note family; 4 her, 4 him,
  4 shared). The other 340 are text rows in the dropdown (house in small caps + name).

### Steps 3–4 — ten screens and "Your Perfume Wardrobe"
- Screens: for · signature scent (12 tiles + search, up to 2, "Inside <name>" card; or "I don't have one" -> up to 3 note
  families) · taboos (hard filter) + "strong scents bother me" / "scent-sensitive office" · where the week goes
  (7 rows x rarely / sometimes / a lot) · how you wear perfume (one bottle / day & night / full wardrobe) · feel (up to 2)
  · presence · what matters · climate · style.
- Weights: perfume similarity 35%, week slot 20%, feel 15%, presence 10%, climate 10%, style 5% + matters 5%.
  Gender applies only to Focus & Flow, Romance & Presence, Celebrate & Indulge (owner rule).
- Every week row at "sometimes" / "a lot" becomes a slot, biggest first; Family & home is always close to the skin;
  a scent-sensitive office keeps the Work slot close.
- Result: persona (chosen by overlap with the picks' notes; a persona whose line names a note none of the picks
  carry is never shown), scent profile (top 3 families), one card per slot: image, house, name, "Shares the … of your …"
  (only notes both really carry), a why-line from that perfume's own matched tags and real notes (never the same
  twice in a result), how to wear, "Add sample" (cheapest available variant), "Also fits this slot" (collapsed).
  Never the perfume you named. Ready-made set card only within 10% of the top pick. Add all, share story
  (1080x1920 with slots), copy link — links keep `preview_theme_id`. No email field anywhere.
- Blocks: 48 in the quiz section (questions with image tiles), 18 in the personas section.

### Step 5 — verified
- `tests/combinations.mjs`: **11,144 wardrobes** — 5,000 random answer sets (5,000 distinct) + all 12 popular
  perfumes x 128 taboo combinations x 4 climates — **27,416 slots, 0 failures** in all 17 checks: every slot filled,
  in stock, no duplicates, no sets, >= 2 houses, zero tabooed notes (checked against the raw notes), strong-scent
  toggle, gender rule, named perfume never recommended, no repeated why-line, no why-line or shares-line naming a note
  the perfume lacks, no persona line naming a note no pick has, set card within 10%, share link round trip.
  283 of 299 perfumes appear; the most frequent (Clive Christian E Cashmere Musk) fills 7% of slots.
  - The random generator carried over from v2 falls into a cycle of ~10,000–15,000 values in floating point, so a long
    run repeats the same "random" answers (my first v3 run touched only 28 perfumes because of it; v2's enumerated
    combinations were not affected, only its random filler answers). Replaced with mulberry32 and the test now counts
    distinct answer sets. The first run with it found one real bug (a perfume exactly at the "too sweet" threshold
    slipped through because family shares are stored rounded); fixed.
- `tests/search.mjs`: **100 / 100** misspelled queries resolve to the right perfume (target 95). Note: three search
  fixes (house short names, "parfum" as an optional word, popularity tie-break) were made against this same list.
- `tests/e2e.mjs` at 390 and 1440 px: **55 / 55** — run with named perfumes, run with "I don't have one", deep link
  inside a theme preview, share image 1080x1920, copied link reopens the same result, "Add all" payload, analytics
  without personal data, no-JS page. Screenshots in `screenshots/`.
- Weight: JS 45.8 KB + CSS 18.0 KB + config 59.2 KB + taste 49.2 KB = **172.1 KB** (budget 200; all decimal KB, every
  file < 60 KB); images 880 KB (budget 1.8 MB).

### Not done / notes
- Superseded: `quiz/brands/aromastylist/reference-perfumes.json` and `reference-review.csv` (v2's 63) are no longer built.
- Image originals (16 MB) are not committed; `images.json` has every source URL.
- A few images are not ideal: Light Blue (clear glass shot on grey comes out pale), 1 Million (brand image carries an award badge).

## quiz-v2.1 (2026-10-01) — wardrobe by occasion and by mood

- The result now has three tabs: **Your matches** (3–5 best), **By occasion** (4 shelves: Everyday Signature,
  Work & Presence, Evening & Seduction, Special Occasions) and **By mood** (7 shelves, one per mood collection).
  Every shelf is filled for the visitor's taste and other answers. Their own shelf comes first, marked "Your pick".
  "Add all" adds the open tab. Shelf texts come from the Wardrobe Concept.
- Checks: all 4,546 engine runs fill all 4 + 7 shelves with no repeats, and 100% of shelf perfumes carry that
  shelf's occasion or mood; e2e 105/105 at 390 and 1440 px.
- Code review of the whole branch: one bug fixed (after "Skip", the "Your notes" bars showed every chosen family at
  100%; now shares, e.g. 33% each).
- Theme JS and CSS are minified at build; readable sources stay in `quiz/engine`. Total 124 KB (budget 150).

## quiz-v2 (2026-10-01) — "a perfume you already love"

The owner's decision: the visitor names a perfume they love, the quiz reads what is inside it and recommends what
we have, either **more like it** or **to complete the wardrobe**.

### Built
- **Note analysis** (`scripts/taste.mjs`): every note is mapped to ~70 canonical notes and 12 note families
  (Citrus, Green & herbs, Fresh & aquatic, Rose & florals, White florals, Fruity, Vanilla & gourmand, Woods,
  Amber & resins, Oud/leather/smoke, Spices, Musk/iris/powder). The same function reads our 299 perfumes (notes from
  our product pages) and the perfumes visitors can name, so they are compared like with like.
- **Perfumes visitors can name**: all 299 of ours plus 63 well-known ones we don't stock
  (`quiz/brands/aromastylist/reference-perfumes.json`, notes simplified from the brands' published pyramids).
  **Owner: please check `reference-review.csv`** (how each one was read).
- **New questions**: "Name a perfume you already love" (search or 18 popular picks, or Skip), then
  "More like it / Complete my wardrobe" with the perfume's DNA on screen ("Inside Black Opium: coffee · jasmine ·
  almond · vanilla · patchouli" + family bars). After Skip: "Which notes pull you in?" (pick up to 3 of 12 families).
- **Matching**: family-profile similarity + shared key notes, on top of the v1 answer tags.
  - More like it: same DNA, other houses.
  - Complete my wardrobe: one shared note (the thread) in a differently shaped perfume.
  - If the named perfume is ours, it is shown separately ("Your favourite is on our shelf") and never repeated in the list.
  - Discovery Sets are now scored by the perfumes inside them.
- **Result**: the named perfume's DNA, and on each card "Shares the vanilla, cedar and patchouli of your Black Opium."
  plus the v1 reason line.
- **Persona list** moved into its own section (`scent-quiz-personas`) because Shopify allows 50 blocks per section.
- Second theme asset `scent-quiz-aromastylist-taste.json` (16 KB).

### Verified
- 4,546 engine runs. Each of 362 nameable perfumes × both modes × 4 random answer sets, all 298 combinations of
  1–3 note families × 3, and the 756 v1 tag combinations. **All pass:** 3–5 in-stock perfumes, ≥ 2 houses, no sets,
  never the named perfume itself, share link round-trips.
- Match quality:
  - "More like it": top 3 have average family similarity 0.73, and 97% share at least one key note.
  - "Complete my wardrobe": 100% share a thread note, average similarity 0.41 (different on purpose).
- **Coverage fixed:** all 299 perfumes appear in some result (v1: 80 never did). The most frequent perfume appears in
  7% of runs. Every Discovery Set now appears, Modern Icons included (v1: never).
- Playwright e2e at 390 and 1440 px: 83/83 checks.
- Weight 139.7 KB (budget 150). Every file < 60 KB.

### Not yet / notes
- Search needs typing (optional): the popular picks are one tap.
- Answer images for the note families are placeholders (the most typical perfume of each family) until the owner
  sends the images in `docs/IMAGES.md`.
- The rest of `docs/QUIZ-V2-PLAN.md` (four-shelf wardrobe result, wear and rotate tips, tweak and compare-with-a-friend)
  is the next round.

## quiz-v1 (2026-09-30)

First version of the scent quiz for aromastylist.com (phase 1 of a reusable template).

### Built
- **Catalog** (`quiz/brands/aromastylist/catalog.json`): read from the public storefront only. 299 perfumes
  (product type "Perfumes and Colognes") and 10 Discovery Sets from 45 houses, with variants, images,
  mood / moment / gender collections and notes parsed from each product page's Notes accordion (299 of 299).
  Sets list their member perfumes (46 of 50 matched; the other 4 are not sold separately).
- **Derived values** (inside catalog.json, never in Shopify): presence and season for every perfume, gender for
  the 100 without a gender collection, mood for the 30 without one, and all tags of the 10 sets (voted from their
  members). Each value stores its driving notes and a confidence. Review list: `quiz/brands/aromastylist/derived-review.csv`.
  - 988 derived values: High 503 · Medium 356 · **Low 129**.
  - Low values count at half weight and can never be the only reason a perfume is recommended.
- **Engine** (`quiz/engine/`, brand-agnostic): section + JS + CSS. No brand text, images or products in the engine.
- **AromaStylist config** (`quiz/brands/aromastylist/config.json`): 5 questions, 18 scent personas, copy.
- **Theme files** (`theme-files/`) ready for upload, plus `theme-files/INSTALL.md`.
- **Harness + tests**: `harness/` (real Liquid rendered with liquidjs, live theme CSS / variables / fonts, mocked
  cart endpoints), `tests/combinations.mjs`, `tests/e2e.mjs`, `screenshots/`.

### Verified
- All 756 answer combinations: each returns 3 to 5 in-stock perfumes from at least 2 houses, no sets in the main
  list, no fallback needed (5 picks in 624, 4 in 50, 3 in 82). 219 of 299 perfumes appear in at least one result.
  - Most recommended: Guerlain Aqua Allegoria Forte Mandarine Basilic (112), Hermès Un Jardin Sur Le Nil (101),
    Rosendo Mateu Nº 5 (69), Hermès Un Jardin Sur Le Toit (68), Rosendo Mateu Nº 1 (66), Clive Christian E Cashmere
    Musk (65), Etat Libre d'Orange Sous Le Pont Mirabeau (59), Maison Crivelli Absinthe Boréale (59), Maison Crivelli
    Santal Volcanique (57), Xerjoff Accento Overdose (56).
  - Never recommended: 80 perfumes (listed in `tests/reports/combinations-aromastylist.json`). Main reason: on equal
    scores the owner's rule "in stock first, then lower price" favours the cheaper samples.
  - The "ready-made set" card appears in 195 of 756 results.
- Playwright: 5 full runs at 390px and 5 at 1440px, share image 1080x1920, copied link reopens the same result,
  "Add all" posts `{"items":[{"id":…,"quantity":1},…]}` to the mocked `/cart/add.js`, analytics events without
  personal data, no-JS leaves the page as is. 73/73 checks.
- Weight: JS 32.3 KB + CSS 11.1 KB + JSON 58.1 KB = 101.5 KB (budget 150 KB). Every file < 60 KB.

### Deliberately not done (risk) / notes
- **"Add all" opens the cart page (`/cart`), not the Xtra side drawer.** Re-rendering Xtra's drawer from outside
  its own JS could not be tested without the live theme and might break the drawer's buttons. The engine supports
  `cart.mode: "drawer"` in the config if the owner wants to try it in the theme copy.
- **Answer images are left empty in the image pickers.** The agent must not upload files to the store, so the quiz
  shows the collection / product images from the config until the owner picks her own in the theme editor.
- **Template name not confirmed** (no Shopify access). INSTALL.md explains how to find it and to stop if the page
  uses the shared `page.json`.
- The colour scheme setting is a plain select (scheme-1 … scheme-8) instead of Shopify's `color_scheme` type, so
  the section cannot fail validation if the theme's scheme group differs.
- The share image is text only (persona, top 3, URL in the theme fonts). No product photos, to keep it light and
  independent of image CORS.
- Analytics events are published with `Shopify.analytics.publish`. To read them, the owner adds a custom pixel in
  Settings → Customer events that subscribes to `quiz_started`, `quiz_completed`, `quiz_shared` and `quiz_add_to_cart`.
- Test infrastructure: this sandbox's Chromium does not trust the proxy certificate, so the tests route the
  browser's external requests through Node (normal TLS checks) instead of disabling certificate checks.
