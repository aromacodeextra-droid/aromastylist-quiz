# Install: scent quiz v2 on aromastylist.com (Xtra 8.2.0)

For the agent doing the upload (Claude in Cowork, Shopify connector). Work only in an **unpublished copy of the
live theme**. Never publish, never edit the live theme, and write nothing to the store: no products, collections,
metafields, pages or files. The owner reviews the copy and publishes it herself.

## 1. Files to upload (theme copy -> Edit code)

Upload each file byte for byte from this folder. Nothing is built on the Shopify side. All six files are new.

| Repo file | Theme path | Size |
|---|---|---|
| `theme-files/sections/scent-quiz.liquid` | `sections/scent-quiz.liquid` | 5 KB |
| `theme-files/sections/scent-quiz-personas.liquid` | `sections/scent-quiz-personas.liquid` | 3 KB |
| `theme-files/assets/scent-quiz.js` | `assets/scent-quiz.js` | 51 KB |
| `theme-files/assets/scent-quiz.css` | `assets/scent-quiz.css` | 16 KB |
| `theme-files/assets/scent-quiz-aromastylist.json` | `assets/scent-quiz-aromastylist.json` (questions, copy, catalog) | 56 KB |
| `theme-files/assets/scent-quiz-aromastylist-taste.json` | `assets/scent-quiz-aromastylist-taste.json` (note profiles, perfumes people can name) | 16 KB |

**Do not change any existing theme file** except the one template in step 2 (`layout/theme.liquid`,
`settings_data.json`, snippets and CSS stay untouched). The sections load their own CSS and JS, and every CSS rule
is scoped to `.sq-section`, so nothing else on the site changes.

## 2. Template: add both sections to the find-your-perfume page

1. In the theme copy, find the template that `/pages/find-your-perfume` uses. On the live site it holds the
   sections `main-page`, `section_grid_UPENYR` (image banners) and `section_collection_list_wTRGUj`. It is most
   likely `templates/page.find-your-perfume.json`. Confirm this by finding the JSON template whose `sections`
   contain those three keys.
   - **If the page uses the shared `templates/page.json`** (used by other pages too), stop and ask the owner.
2. Open that template JSON. From [`templates/aromastylist.scent-quiz.section.json`](templates/aromastylist.scent-quiz.section.json),
   add **both** objects to `"sections"`, as is:
   - `"scent_quiz"`: type `scent-quiz`, 42 blocks;
   - `"scent_quiz_personas"`: type `scent-quiz-personas`, 18 blocks.
3. In `"order"`, insert `"scent_quiz"` directly **after `"main-page"`**, then `"scent_quiz_personas"` right after it.
   Leave every other section and its order as it is.
4. Save. If Shopify rejects the JSON, re-check the commas around the inserted objects. Do not edit other keys.

### Section settings

| Section | Setting | Value |
|---|---|---|
| `scent_quiz` | `config_file` | `scent-quiz-aromastylist.json` |
| `scent_quiz` | `taste_file` | `scent-quiz-aromastylist-taste.json` |
| `scent_quiz` | `color_palette` | `scheme-1` |
| `scent_quiz` | `intro_kicker`, `intro_title`, `intro_text`, `start_label` | leave empty (texts come from the config file) |
| `scent_quiz_personas` | `color_palette` | `scheme-1` |
| `scent_quiz_personas` | `title` | `All scent personas` |
| `scent_quiz_personas` | `intro`, `open` | empty / unchecked |

### Blocks of `scent_quiz` (all prefilled in the JSON file; image pickers stay empty)

An empty image picker means the quiz shows a default image from the config file. Images the owner sends later
(see `docs/IMAGES.md`) go into these pickers.

| Question id | Question | Answer blocks (answer_id) |
|---|---|---|
| `for` | Who is it for? | `her`, `him`, `both` |
| `ref` | Name a perfume you already love | none: search and popular picks come from the taste file |
| `mode` | What do you want next? (only after a perfume was named) | `similar`, `complement` |
| `notes` | Which notes pull you in? (only after "Skip") | `citrus`, `green`, `aquatic`, `florals`, `white-florals`, `fruity`, `gourmand`, `woods`, `amber`, `oud-leather`, `spices`, `musk-powder` |
| `when` | When will you wear it most? | `everyday`, `work`, `evening`, `special` |
| `mood` | What should it do for you? | the 7 moods |
| `presence` | How present should it be? | `close`, `noticed`, `fills` |
| `weather` | Your weather right now? | `hot`, `mild`, `cold` |

That is 8 question blocks + 34 answer blocks = 42 (the limit is 50). Persona texts are in the second section
(18 blocks), because both together would exceed Shopify's 50-block limit. The ids (`question_id`, `answer_id`,
`persona_key`) must match the config file. Only labels, texts and images should be edited.

## 3. Check in the theme preview (do not publish)

Open the preview of the theme copy at `/pages/find-your-perfume`:

- The intro "Find your perfume. Then build the wardrobe around it." and a gold "Start the quiz" button appear above the image banners.
- Question 2: type `black opium` and tap the result. The next screen shows "Inside Black Opium" with its notes and family bars.
- Finish the quiz: the result shows a persona, 3 to 5 perfumes, and on each card "Shares the … of your Black Opium."
- Go back, choose "Skip" at question 2: the note-family question appears instead.
- `/pages/find-your-perfume?sq=her.r~ysl-black-opium.similar._.everyday.romance-presence.noticed.mild` opens straight into the result.
- "All scent personas" below the quiz opens a list of 18 personas.
- Header, menu, other sections and other pages look exactly as before.
- "Add sample" in the preview really adds to the preview session's cart. Remove it again afterwards.

## 4. What the quiz calls at runtime (standard storefront endpoints, read-only except the cart)

- `GET /products/<handle>.js`: re-checks stock and the cheapest (sample) variant of the top candidates.
- `POST /cart/add.js` with `{"items":[{"id":<variant id>,"quantity":1}, ...]}`, then `GET /cart.js` to update `#cart-count` / `#cart-total`.
- "Add all" sends the visitor to `/cart` (config `cart.mode: "page"`; see CHANGELOG for why the drawer is not used).
- `Shopify.analytics.publish`: `quiz_started`, `quiz_completed` (answers incl. the named perfume id and mode, persona, product handles), `quiz_shared`, `quiz_add_to_cart`. No personal data.

## 5. Updating the catalog later (repo only)

```
npm run fetch && node scripts/build-catalog.mjs && npm run derive && npm run build && npm run test:combos
```

Then re-upload `assets/scent-quiz-aromastylist.json` and `assets/scent-quiz-aromastylist-taste.json`.
