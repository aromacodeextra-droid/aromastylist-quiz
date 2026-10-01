# Install: scent quiz v3 on aromastylist.com (Xtra 8.2.0)

For the agent doing the upload (Claude in Cowork, Shopify connector). Work only in an **unpublished copy of the
live theme**. Never publish, never edit the live theme, and write nothing to the store: no products, collections,
metafields, pages or files. The owner reviews the copy and publishes it herself.

Every file comes from this folder as a static file (raw GitHub URL of branch `quiz-v3`). Nothing is built on the
Shopify side. The quiz stores no visitor data and has no email field.

## 1. Files to upload (theme copy -> Edit code)

Upload each file byte for byte. If an older version (v1 / v2) is already in the theme copy, **replace** it.

| Repo file | Theme path | Size |
|---|---|---|
| `theme-files/sections/scent-quiz.liquid` | `sections/scent-quiz.liquid` | 5 KB |
| `theme-files/sections/scent-quiz-personas.liquid` | `sections/scent-quiz-personas.liquid` | 3 KB |
| `theme-files/assets/scent-quiz.js` | `assets/scent-quiz.js` | 46 KB |
| `theme-files/assets/scent-quiz.css` | `assets/scent-quiz.css` | 18 KB |
| `theme-files/assets/scent-quiz-aromastylist.json` | `assets/scent-quiz-aromastylist.json` (questions, slots, copy, our catalog) | 59 KB |
| `theme-files/assets/scent-quiz-aromastylist-taste.json` | `assets/scent-quiz-aromastylist-taste.json` (notes of our perfumes + the 400 popular perfumes) | 49 KB |
| `theme-files/assets/sq-ref-<id>.webp` (59 files) | `assets/sq-ref-<id>.webp`, same names | 7–30 KB each, 860 KB in all |

The 59 images are binary: upload them as files (the Shopify "Add a new asset" upload, or the Admin API
`themeFilesUpsert` with the file's raw GitHub URL as `url`). Do not paste them as text. The quiz finds them next to its
config file (`assets/`), so the names must stay exactly `sq-ref-<id>.webp`. A missing image only turns that tile
into a text tile; nothing breaks.

**Do not change any other theme file** except the one template in step 2. Every CSS rule is scoped to `.sq-section`.

## 2. Template: the two sections on the find-your-perfume page

1. Find the template `/pages/find-your-perfume` uses (the JSON template whose `sections` hold `main-page`,
   `section_grid_UPENYR` and `section_collection_list_wTRGUj`; most likely `templates/page.find-your-perfume.json`).
   - **If the page uses the shared `templates/page.json`**, stop and ask the owner.
2. From [`templates/aromastylist.scent-quiz.section.json`](templates/aromastylist.scent-quiz.section.json) take both objects:
   - `"scent_quiz"`: type `scent-quiz`, **49 blocks** (v2 had 42 — replace the whole object, do not merge blocks);
   - `"scent_quiz_personas"`: type `scent-quiz-personas`, 18 blocks.
   If the template already has `scent_quiz` / `scent_quiz_personas` (v2), replace both objects. Otherwise add them.
3. In `"order"`, `"scent_quiz"` comes directly **after `"main-page"`**, then `"scent_quiz_personas"`. Leave every other
   section and its order as it is.
4. Save. If Shopify rejects the JSON, re-check the commas around the replaced objects.

### Section settings

| Section | Setting | Value |
|---|---|---|
| `scent_quiz` | `config_file` | `scent-quiz-aromastylist.json` |
| `scent_quiz` | `taste_file` | `scent-quiz-aromastylist-taste.json` |
| `scent_quiz` | `color_palette` | `scheme-1` |
| `scent_quiz` | `intro_kicker`, `intro_title`, `intro_text`, `start_label` | leave empty (texts come from the config file) |
| `scent_quiz_personas` | `color_palette` / `title` | `scheme-1` / `All scent personas` |

### Blocks of `scent_quiz` (prefilled; image pickers stay empty)

Blocks exist for the questions with image tiles. An empty picker shows the default image from the config file
(store collection / product images, as in v2). The perfume search, the taboo chips and the week grid have no blocks
(Shopify's limit is 50 blocks per section); their texts are in the config file.

| Question id | Screen | Answer blocks (answer_id) |
|---|---|---|
| `for` | 1 Who is it for? | `her`, `him`, `both` |
| `notes` | 2b Which notes pull you in? (only after "I don't have one") | `citrus`, `green`, `aquatic`, `florals`, `white-florals`, `fruity`, `gourmand`, `woods`, `amber`, `oud-leather`, `spices`, `musk-powder` |
| `how` | 5 How do you wear perfume? | `one-bottle`, `day-night`, `full-wardrobe` |
| `feel` | 6 With it on, you want to feel… | `confident`, `attractive`, `calm`, `energised`, `festive`, `free` |
| `presence` | 7 How far should it reach? | `close`, `noticed`, `fills` |
| `matters` | 8 What matters most? | `easy`, `trending`, `unique` |
| `climate` | 9 When will you wear it? | `winter`, `spring`, `summer`, `fall`, `all-year` |
| `style` | 10 Which style is most you? | `classic`, `dramatic`, `romantic`, `minimal`, `casual`, `sporty` |

8 question blocks + 41 answer blocks = 49. Screens 2 (`ref`), 3 (`taboos`) and 4 (`week`) are config-only.

## 3. v3 checks in the theme preview (do not publish)

Open `/pages/find-your-perfume?preview_theme_id=<copy id>`:

1. "Start the quiz" -> **Who is it for?** -> **Do you have a signature scent?**: a "Type its name" box, then "Or tap one of
   these" with 12 bottle tiles, different for
   each answer of screen 1 — **Her**: Black Opium, La Vie Est Belle, Coco Mademoiselle, Miss Dior, J'adore, Libre … (all
   feminine); **Him**: Sauvage, Bleu de Chanel, Y, Acqua di Giò, Aventus, Le Male … (all masculine); **Both**: Baccarat
   Rouge 540, Santal 33, Tobacco Vanille, Lost Cherry … (all unisex). No broken images. Go back, change the answer, the
   tiles change.
2. Tap a tile: the page stays where it is and an "Inside <name>" card appears above Continue; tap it again to remove it.
   Type `bacarat`: the first row is Maison Francis Kurkdjian · Baccarat Rouge 540 ("on our shelf"). Tap it: an
   **Inside Baccarat Rouge 540** card with notes and family bars. Type `lveb`, `br540`, `savage elixir`: each finds it.
3. Tap a second perfume (max 2). Continue. Then **I don't have one** on a second pass shows the 12 note-family tiles.
4. Taboos: tick `Coconut` and `My office is scent-sensitive`. Week: Work a lot, Evenings a lot, Everyday sometimes.
   How: A full wardrobe. Finish the remaining screens.
5. Result **Your Perfume Wardrobe**: persona, "Your scent profile" (3 families with %), one card per slot with
   Work & Presence and Evening & Seduction first, each card with "Shares the … of your …", a why-line, "How to wear",
   "Add sample · $…" and a collapsed "Also fits this slot". No two cards the same, at least 2 houses.
6. "Share my wardrobe" shows a 9:16 image (persona, slot names, perfumes, `aromastylist.com/pages/find-your-perfume`).
   "Copy link" gives a link that **still contains `preview_theme_id`** and reopens the same result.
7. `/pages/find-your-perfume?sq=her.r~ysl-black-opium._.none.1101000.full-wardrobe.attractive.noticed.easy.fall+winter.romantic`
   opens straight into a result.
8. "All scent personas" below the quiz opens the list of 18 personas.
9. No email field anywhere. Header, menu, other sections and other pages look exactly as before.
10. "Add sample" / "Add all" really add to the preview session's cart. Remove the items again afterwards.

## 4. What the quiz calls at runtime (standard storefront endpoints, read-only except the cart)

- `GET /products/<handle>.js`: re-checks stock and the cheapest available (sample) variant of the leading candidates.
- `POST /cart/add.js` with `{"items":[{"id":<variant id>,"quantity":1}, ...]}`, then `GET /cart.js` for `#cart-count` / `#cart-total`.
- `GET assets/sq-ref-<id>.webp`: the bottle images (theme assets).
- `Shopify.analytics.publish`: `quiz_started`, `quiz_completed` (answer code, persona, slots, product handles),
  `quiz_shared`, `quiz_add_to_cart`. No personal data. Nothing is stored about the visitor.

## 5. Updating later (repo only)

```
node scripts/v3-data.mjs && python3 scripts/v3-images.py && node scripts/build-theme-files.mjs
node tests/search.mjs && node tests/combinations.mjs && node tests/e2e.mjs
```

Then re-upload the changed files from `theme-files/`.
