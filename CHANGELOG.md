# Changelog

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
