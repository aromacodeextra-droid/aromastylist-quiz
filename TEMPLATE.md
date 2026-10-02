# Using this quiz as a template for another quiz

The scent quiz is a brand-agnostic engine plus one brand folder. A new quiz on the same site = a new brand folder,
built with the same scripts, installed as a second pair of theme assets. Nothing in the engine needs to change.

Frozen copies of the finished quiz (v3.31, 2026-10-02):

- branch **`quiz-template`** and tag **`quiz-template-v3.31`** in this repository (never develop on them; branch
  off them);
- the Artifact page "Scent Quiz Template" (same files, downloadable).

## What a quiz is made of

| Part | Where | Shared or per quiz |
|---|---|---|
| Engine (questions, scoring, result, share card, cart) | `quiz/engine/assets/scent-quiz.js`, `.css` | shared by every quiz on the site |
| Theme sections (Shopify) | `theme-files/sections/scent-quiz.liquid`, `scent-quiz-personas.liquid` | shared |
| Brand config: questions, answers, slots, personas, copy, scoring weights | `quiz/brands/<brand>/config.json` | per quiz |
| Store catalog snapshot (products, collections, variants) | `quiz/brands/<brand>/catalog.json` | per quiz (or shared if same products) |
| Owner icons and photos (sources) | `quiz/brands/<brand>/icons-src/`, `photos-src/` | per quiz |
| 400 reference perfumes, their notes, bottle images | `quiz/data/`, `theme-files/assets/sq-ref-*.webp` | shared |
| Built theme files (what gets uploaded) | `theme-files/` | `scent-quiz-<brand>.json`, `scent-quiz-<brand>-taste.json`, `templates/<brand>.scent-quiz.section.json` per quiz; the rest shared |

## Making a new quiz, step by step

1. Branch off the template: `git checkout -b quiz-<name> quiz-template`.
2. Copy the brand folder: `cp -r quiz/brands/aromastylist quiz/brands/<name>` and set `"id": "<name>"` in its
   `config.json`.
3. Edit `quiz/brands/<name>/config.json`:
   - `questions`: titles, subtitles, answers (`id`, `label`, `hint`), `min` / `max`, `type` (`single`, `multi`,
     `families`, `perfume`, `taboo`, `week`), `layout` (`rows`, `rows-m`, `text`, `seasons`);
   - `slots`: the wardrobe cards (`id`, `label`, `text`, `where`, `time`);
   - `personas.list` (18 or any number) and `personas.matrix` (mood x reach -> persona key);
   - `copy`: every sentence the visitor reads;
   - `weights` / `scoring`: how much each answer counts.
   Answer ids and slot ids are what the engine, the tests and the share links use: change labels freely, change ids
   only together with the tests.
4. Icons and photos: put the owner's sheets in `icons-src/` and `photos-src/` and run `python3 scripts/v3-icons.py`
   (edit its `SHEETS` list) and `python3 scripts/v3-photos.py`. Files land in `theme-files/assets/` as
   `sq-icon-<screen>-<answer>.svg` and `sq-photo-<question>-<answer>-<her|him|both>.webp`. If two quizzes share the
   site and need different icons for the same answer id, give the new quiz other answer ids.
5. Build: `node scripts/build-theme-files.mjs <name>`. Every file must stay under 60 KB (the build stops otherwise).
6. Tests: `node tests/search.mjs && node tests/combinations.mjs && node tests/e2e.mjs` (the tests read the
   aromastylist files by name: point them at the new brand or copy them under `tests/<name>/`).
7. Install in Shopify (see `theme-files/INSTALL.md`): upload the shared files once, the per-quiz files for each quiz,
   add the two sections to the new page's JSON template from `templates/<name>.scent-quiz.section.json`, and set
   the section's `config_file` / `taste_file` to the new names. Two quizzes on two pages share the engine and images.
8. Preview on an unpublished theme copy, then the owner publishes.

## Rules that kept this quiz healthy

- Only static files under `theme-files/`; no build step on Shopify, nothing written to the store, no visitor data.
- Every CSS rule lives under `.sq-section`; the theme forces `img { height: auto !important }`, so quiz images set
  their size with `!important` too.
- Config under 60 KB: catalog handles are prefixed, variant ids in base 36, answers with an icon or photo carry no
  placeholder photo link.
- Changed a question title or an answer label? The section blocks in the page template override the config: rebuild
  and re-upload `templates/page.<page>.json` as well (`scripts/build-page-template.cjs` shows how).
- Changed an image? The build gives all images a new `?v=` version, so phones fetch the new file at once.
