# Install: scent quiz on aromastylist.com (Xtra 8.2.0)

For the agent doing the upload (Claude in Cowork, Shopify connector). Work only in an **unpublished copy of the
live theme**. Never publish, never edit the live theme, and write nothing to the store: no products, collections,
metafields, pages or files. The owner reviews the copy and publishes it herself.

## 1. Files to upload (theme copy -> Edit code)

Upload each file byte for byte from this folder. Nothing is built on the Shopify side.

| Repo file | Theme path | Size |
|---|---|---|
| `theme-files/sections/scent-quiz.liquid` | `sections/scent-quiz.liquid` (new file) | 6 KB |
| `theme-files/assets/scent-quiz.js` | `assets/scent-quiz.js` (new file) | 33 KB |
| `theme-files/assets/scent-quiz.css` | `assets/scent-quiz.css` (new file) | 11 KB |
| `theme-files/assets/scent-quiz-aromastylist.json` | `assets/scent-quiz-aromastylist.json` (new file) | 58 KB |

All four files are new. **Do not change any existing theme file** except the one template in step 2
(`layout/theme.liquid`, `settings_data.json`, snippets and CSS stay untouched). The section loads its own CSS and
JS, and every CSS rule is scoped to `.sq-section`, so nothing else on the site changes.

## 2. Template: add the section to the find-your-perfume page

1. In the theme copy, find the template that `/pages/find-your-perfume` uses. On the live site it holds the
   sections `main-page`, `section_grid_UPENYR` (image banners) and `section_collection_list_wTRGUj`. It is most
   likely `templates/page.find-your-perfume.json`. Confirm this by finding the JSON template whose `sections`
   contain those three keys.
   - **If the page uses the shared `templates/page.json`** (used by other pages too), stop and ask the owner.
     Adding the quiz there would show it on every page, and switching the page to a new template is a store
     change.
2. Open that template JSON and add the object in
   [`templates/aromastylist.scent-quiz.section.json`](templates/aromastylist.scent-quiz.section.json)
   to `"sections"`, under the key `"scent_quiz"`. Copy it as is: section type `scent-quiz`, 43 blocks, settings below.
3. In `"order"`, insert `"scent_quiz"` directly **after `"main-page"`** (before `"section_grid_UPENYR"`), so the
   quiz sits under the page title and above the existing banners. Leave every other section and its order as it is.
4. Save. If Shopify rejects the JSON, re-check the commas around the inserted object. Do not edit other keys.

### Section settings (template `page.find-your-perfume.json` -> `sections.scent_quiz.settings`)

| Setting | Value |
|---|---|
| `config_file` | `scent-quiz-aromastylist.json` |
| `color_palette` | `scheme-1` (cream background, gold headings and buttons, as on the live page) |
| `intro_kicker`, `intro_title`, `intro_text`, `start_label` | leave empty (texts come from the config file) |
| `show_personas` | `true` (static "All scent personas" list below the quiz, for search engines) |
| `personas_title` | `All scent personas` |
| `personas_intro` | empty |

### Blocks (all prefilled in the JSON file; image pickers stay empty)

An empty image picker means the quiz shows the default image from the config file (the mood/moment collection
images, and product images for Q1, Q4 and Q5). The owner can replace any of them later in the theme editor.

| Block type | Count | question_id / key | ids and labels |
|---|---|---|---|
| question | 5 | `for`, `when`, `mood`, `presence`, `weather` | Who is it for? · When will you wear it most? · What should it do for you? · How present should it be? · Your weather right now? |
| answer (Q1) | 3 | `for` | `her` Her · `him` Him · `both` Both of us / no rule |
| answer (Q2) | 4 | `when` | `everyday` Everyday Signature · `work` Work & Presence · `evening` Evening & Seduction · `special` Special Occasions |
| answer (Q3) | 7 | `mood` | `morning-boost` Morning Boost · `focus-flow` Focus & Flow · `romance-presence` Romance & Presence · `celebrate-indulge` Celebrate & Indulge · `relax-wind-down` Relax & Wind Down · `move-thrive` Move & Thrive · `harmony-meditation` Harmony & Meditation |
| answer (Q4) | 3 | `presence` | `close` Close to the skin · `noticed` Noticed in the room · `fills` Fills the room |
| answer (Q5) | 3 | `weather` | `hot` Hot and humid · `mild` Mild · `cold` Cold |
| persona | 18 | persona keys | first-light, sunlit-signal, bright-entrance, quiet-signature, sharp-edit, boardroom-pull, skin-secret, slow-burn, after-hours-magnet, sweet-confidant, golden-hour-guest, grand-entrance, soft-landing, cashmere-evening, clean-stride, open-air, still-point, temple-smoke |

That makes 43 blocks (the limit is 50). The ids (`question_id`, `answer_id`, `persona_key`) must match the config
file. Only labels, texts and images should be edited.

## 3. Check in the theme preview (do not publish)

Open the preview of the theme copy at `/pages/find-your-perfume`:

- The intro "Five questions. Your first scent wardrobe." and a gold "Start the quiz" button appear above the image banners.
- Click through all 5 questions: the result shows a persona name and 3 to 5 perfumes, each with "Add sample · $x".
- `/pages/find-your-perfume?sq=her.evening.romance-presence.fills.cold` opens straight into the result "The After-Hours Magnet".
- Header, menu, other sections and other pages look exactly as before.
- "Add sample" in the preview really adds to the preview session's cart. Remove it again afterwards.

## 4. What the quiz calls at runtime (all standard storefront endpoints, read-only except the cart)

- `GET /products/<handle>.js`: re-checks stock and the cheapest (sample) variant of the top candidates.
- `POST /cart/add.js` with `{"items":[{"id":<variant id>,"quantity":1}, ...]}`, then `GET /cart.js` to update `#cart-count` / `#cart-total`.
- "Add all" sends the visitor to `/cart` (config `cart.mode: "page"`; see CHANGELOG for why the drawer is not used).
- `Shopify.analytics.publish`: `quiz_started`, `quiz_completed` (answers, persona, product handles), `quiz_shared`, `quiz_add_to_cart`. No personal data.

## 5. Updating the catalog later (repo only)

```
npm run fetch && node scripts/build-catalog.mjs && npm run derive && npm run build && npm run test:combos
```

Then re-upload only `assets/scent-quiz-aromastylist.json`.
