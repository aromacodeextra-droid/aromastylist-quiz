# Where we are (resume here)

Last saved: 2026-10-02, version **quiz-v3.32**, branch `quiz-v3` (pushed to GitHub).

## Preview

- **Live** (published by the owner on 2026-10-02, 17:40 UTC): the theme update "Updated copy of Xtra – scent quiz…",
  Xtra 8.3.0, id `189581852952`, now MAIN with quiz v3.31. The earlier quiz theme `189533225240` is no longer live.
- **Working copy** (unpublished): "Xtra 8.3.0 – scent quiz v3.32 SEO (copy of live, 2026-10-02)", id
  `189582835992`, duplicated from the live theme via `themeDuplicate` and holding v3.32 (section, js, css checked by md5).
  Preview: https://aromastylist.com/pages/find-your-perfume?preview_theme_id=189582835992 (needs admin login).
  Upload future versions here until the owner publishes it. Note: `themeFilesUpsert` to a theme that is still
  `processing` after duplication is silently overwritten; wait for `processing: false`, then upload. A schema
  header longer than 50 characters is rejected only when the body is sent as TEXT; with a URL body the file
  silently keeps its old content, so always compare md5 after an upload.
- The rest of the site is untouched.
- The copy holds exactly the repo files of v3.31, checked by md5 on 2026-10-02: 96 files from `theme-files/`
  (sections, js, css, two JSON files, 59 bottle images, 22 owner icons, 18 style photos (men's, women's, Unisex couples)) plus `templates/page.find-your-perfume.json` =
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

## SEO (started 2026-10-02)

- Done in v3.32: crawlable intro with `h1`, FAQ + FAQPage JSON-LD, no-JS fallback. Page is in `sitemap_pages_1.xml`
  and linked from the menu ("Quiz Find your Perfume" under Perfume Wardrobe).
- Owner's side (Shopify Admin > Online Store > Pages > Find your Perfume > Search engine listing): title and
  description suggested in the chat of 2026-10-02; Google Search Console: request indexing of the page URL.
- Ideas not done: homepage banner linking to the quiz (theme, owner), an og:image for the page (theme head),
  a blog post "How to find your signature perfume" linking to the quiz.

## Next

0. Card style unified on all icon screens (v3.27). Full pass of 2026-10-02 closed (v3.26-v3.31).
1. Result screen: v3.13 done (built-around line, answer summary + Change answers, short cards, compact buttons).
   Waiting for the owner's look on her phone.
2. Owner icons in place (v3.15): screen 1, feelings, moments, What matters. Still to come: avoid-screen and
   season icons (optional; built-in season icons work). All 12 clothing-style photos are in (photos-src -> `python3 scripts/v3-photos.py`). When the owner sends icons / photos, drop them in `theme-files/assets/` with these names and rebuild:
   - screen 1: `sq-icon-for-her.svg`, `sq-icon-for-him.svg`, `sq-icon-for-both.svg`
   - feelings: `sq-icon-feel-<confident|attractive|calm|energised|festive|free>.svg`
   - moments: `sq-icon-week-<everyday-errands|work-study|evenings-dates|events-celebrations|family-home|sport|time-for-me-growth>.svg`
   - avoid: `sq-icon-avoid-<answer id>.svg`; seasons: `sq-icon-season-<winter|spring|summer|fall|all-year>.svg`
   SVG, or PNG/WebP 600x600 with transparent background.
   - styles (photos, fill the tile): `sq-photo-style-<classic|dramatic|romantic|minimal|casual|sporty>.webp`,
     square 600x600, under 60 KB each.
3. Config file size: 59.0 KB of the 60 KB per-file limit; free room before adding copy.
4. Open decisions: the site header (theme, not the quiz) is left as is unless the owner asks.

## Template copies

- Branch `quiz-template` (frozen at `9281e40`, v3.31) and the Artifact page https://claude.ai/artifact/KWGEiTtcasiaeJVdxg5Vws;
  `TEMPLATE.md` says how to make the next quiz from them.

## How to rebuild, test, upload

```
node scripts/build-theme-files.mjs        # theme-files/ from quiz/ sources
node scripts/build-page-template.cjs      # docs/theme-copy/page.find-your-perfume.json
node tests/search.mjs && node tests/combinations.mjs && node tests/e2e.mjs
```

Upload: Shopify Admin `themeFilesUpsert` on the working copy (id in "Preview" above) with body `{type: URL}` pointing to
`raw.githubusercontent.com/aromacodeextra-droid/aromastylist-quiz/<commit>/theme-files/...` (and
`docs/theme-copy/page.find-your-perfume.json` for `templates/page.find-your-perfume.json` whenever a question title or
answer label changes, because the section blocks there override the config). Then compare `checksumMd5` with local md5.
