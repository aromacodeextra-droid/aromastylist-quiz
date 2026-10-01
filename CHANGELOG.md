# Changelog

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
