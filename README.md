# aromastylist-quiz

Scent quiz for aromastylist.com: a theme section driven by a config file. The engine is brand-agnostic, so the
same files can later serve a second brand with its own config and catalog.

```
quiz/engine/               brand-agnostic section, JS, CSS (no brand text, images or products)
quiz/brands/aromastylist/  config.json, catalog.json (store data + derived values), derived-review.csv
theme-files/               the exact files to upload into the theme + INSTALL.md
harness/                   local page rendering the real section with the live theme look
tests/                     756-combination scoring test, Playwright e2e; reports in tests/reports/
screenshots/               e2e screenshots (390px and 1440px), share images, live page for comparison
scripts/                   fetch catalog, parse notes, derive values, build theme files, extract theme vars
```

## Commands

```
npm install
npm run fetch                    # public storefront -> data-raw/ (read-only, max 3 parallel)
node scripts/build-catalog.mjs   # -> quiz/brands/aromastylist/catalog.json
npm run derive                   # derived values + derived-review.csv
npm run build                    # -> theme-files/ (checks 60 KB / 150 KB limits)
npm run test:combos              # all 756 answer combinations
npm run harness                  # http://localhost:8787/pages/find-your-perfume
npm run test:e2e                 # Playwright end to end + screenshots
```

## New brand

Add `quiz/brands/<brand>/config.json` and `catalog.json` in the same shape, then run
`node scripts/build-theme-files.mjs <brand>` to get `assets/scent-quiz-<brand>.json` and the template section
JSON. The section, JS and CSS stay the same.
