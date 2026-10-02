# Where we are (resume here)

Last saved: 2026-10-02, version **quiz-v3.16**, branch `quiz-v3` (pushed to GitHub).

## Preview

- Theme copy (unpublished): **"Xtra – scent quiz (copy of live, 2026-09-30)"**, id `189533225240`.
- Link: https://aromastylist.com/pages/find-your-perfume?preview_theme_id=189533225240
- The live theme and the rest of the site are untouched. The owner publishes herself.
- The copy holds exactly the repo files of v3.16, checked by md5 on 2026-10-02: 89 files from `theme-files/`
  (sections, js, css, two JSON files, 59 bottle images, 19 owner icons, 5 style photos) plus `templates/page.find-your-perfume.json` =
  `docs/theme-copy/page.find-your-perfume.json`.
- The second copy "Home Journal" (`189529096472`) still has an old version; update it only if asked.

## Done in the review round (owner + reviewer notes of 2026-10-02)

- v3.9 general: select + Continue on every screen, "See my matches" at the end, "Pick one / up to two / all that
  apply", limit message, sans for answers, page sections below the quiz hidden while answering, image version `?v=`.
- v3.10 screen 1 "Which fragrances do you prefer?" (For Her / For Him / Unisex); avoid answers by notes, Oud and
  Smoke & incense separate.
- v3.11 "Which moments would you like a fragrance for?" (7 moments, owner order Everyday > Work > Evenings > Special >
  Home > Sport > Me-time; office line only after Work & study).
- v3.12 screens 6-10: Carefree, "How noticeable…", matters as rows (Easy to wear / Our bestsellers / Something less
  expected), seasons 2x2 + All year, up to two clothing styles.

Details per version: `CHANGELOG.md`.

## Next

1. Result screen: v3.13 done (built-around line, answer summary + Change answers, short cards, compact buttons).
   Waiting for the owner's look on her phone.
2. Owner icons in place (v3.15): screen 1, feelings, moments, What matters. Still to come: avoid-screen and
   season icons (optional; built-in season icons work), women's clothing-style photos (put them in
   `quiz/brands/aromastylist/photos-src/style-<answer>-her.png`, run `python3 scripts/v3-photos.py`), and a Sporty
   photo (men's and women's). When the owner sends icons / photos, drop them in `theme-files/assets/` with these names and rebuild:
   - screen 1: `sq-icon-for-her.svg`, `sq-icon-for-him.svg`, `sq-icon-for-both.svg`
   - feelings: `sq-icon-feel-<confident|attractive|calm|energised|festive|free>.svg`
   - moments: `sq-icon-week-<everyday-errands|work-study|evenings-dates|events-celebrations|family-home|sport|time-for-me-growth>.svg`
   - avoid: `sq-icon-avoid-<answer id>.svg`; seasons: `sq-icon-season-<winter|spring|summer|fall|all-year>.svg`
   SVG, or PNG/WebP 600x600 with transparent background.
   - styles (photos, fill the tile): `sq-photo-style-<classic|dramatic|romantic|minimal|casual|sporty>.webp`,
     square 600x600, under 60 KB each.
3. Config file size: 59.0 KB of the 60 KB per-file limit; free room before adding copy.
4. Open decisions: the site header (theme, not the quiz) is left as is unless the owner asks.

## How to rebuild, test, upload

```
node scripts/build-theme-files.mjs        # theme-files/ from quiz/ sources
node scripts/build-page-template.cjs      # docs/theme-copy/page.find-your-perfume.json
node tests/search.mjs && node tests/combinations.mjs && node tests/e2e.mjs
```

Upload: Shopify Admin `themeFilesUpsert` on theme `189533225240` with body `{type: URL}` pointing to
`raw.githubusercontent.com/aromacodeextra-droid/aromastylist-quiz/<commit>/theme-files/...` (and
`docs/theme-copy/page.find-your-perfume.json` for `templates/page.find-your-perfume.json` whenever a question title or
answer label changes, because the section blocks there override the config). Then compare `checksumMd5` with local md5.
