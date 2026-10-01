# aromastylist-quiz

Scent quiz for aromastylist.com: a theme section driven by a config file. The engine is brand-agnostic, so the
same files can later serve a second brand with its own config and catalog.

```
quiz/engine/               brand-agnostic section, JS, CSS (no brand text, images or products)
quiz/brands/aromastylist/  config.json, catalog.json (store data + derived values), derived-review.csv
quiz/data/                 v3: the 400 popular perfumes (brand-site notes + sources), images manifest, store bestsellers
theme-files/               the exact files to upload into the theme + INSTALL.md
harness/                   local page rendering the real section with the live theme look
tests/                     combinations (11k wardrobes), search (100 typos), Playwright e2e; reports in tests/reports/
screenshots/               e2e screenshots (390px and 1440px), share images, live page for comparison
scripts/                   fetch catalog, parse notes, derive values, build theme files, extract theme vars
```

## Commands

```
npm install
npm run fetch                    # public storefront -> data-raw/ (read-only, max 3 parallel)
node scripts/build-catalog.mjs   # -> quiz/brands/aromastylist/catalog.json
npm run derive                   # derived values + derived-review.csv
node scripts/v3-data.mjs         # quiz/data/raw -> quiz/data/popular-perfumes.json (400 perfumes)
python3 scripts/v3-images.py     # quiz/data/img-src -> theme-files/assets/sq-ref-*.webp (needs pillow, numpy, scipy)
npm run build                    # -> theme-files/ (checks 60 KB per file, 200 KB code, 1.8 MB images, 50 blocks)
npm run test:combos              # 5,000 random + 6,144 popular x taboos x climates wardrobes
npm run test:search              # 100 misspelled perfume names
npm run harness                  # http://localhost:8787/pages/find-your-perfume
npm run test:e2e                 # Playwright end to end + screenshots
```

## New brand

Add `quiz/brands/<brand>/config.json` and `catalog.json` in the same shape, then run
`node scripts/build-theme-files.mjs <brand>` to get `assets/scent-quiz-<brand>.json` and the template section
JSON. The section, JS and CSS stay the same.
