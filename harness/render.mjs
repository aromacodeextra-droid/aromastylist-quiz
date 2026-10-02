// Render theme-files/sections/scent-quiz.liquid with liquidjs and the block settings from
// theme-files/templates/<brand>.scent-quiz.section.json, inside a mock of the find-your-perfume page.
// Output: harness/index.html (served by harness/server.mjs).
import fs from 'node:fs';
import { Liquid, Tag } from 'liquidjs';

const BRAND = process.env.BRAND || 'aromastylist';
const liquid = new Liquid({ jsTruthy: false });

// Shopify-only tags / filters the section uses
liquid.registerTag('schema', class extends Tag {
  constructor(token, remain, l) {
    super(token, remain, l);
    // swallow everything up to {% endschema %} (like {% raw %})
    while (remain.length) { const t = remain.shift(); if (t.name === 'endschema') return; }
    throw new Error('{% schema %} not closed');
  }
  * render() {}
});
liquid.registerFilter('asset_url', (f) => `/theme-files/assets/${f}`);
liquid.registerFilter('stylesheet_tag', (u) => `<link href="${u}" rel="stylesheet" type="text/css" media="all" />`);
liquid.registerFilter('image_url', (img, opts) => `${img.src}${img.src.includes('?') ? '&' : '?'}width=${(opts && opts.width) || 600}`);

const tplAll = JSON.parse(fs.readFileSync(`theme-files/templates/${BRAND}.scent-quiz.section.json`, 'utf8'));
async function renderSection(key, file) {
  const tpl = tplAll[key];
  const blocks = tpl.block_order.map((id) => ({
    id, type: tpl.blocks[id].type,
    settings: { image: null, ...tpl.blocks[id].settings },
    shopify_attributes: `data-shopify-editor-block='{"id":"${id}"}'`,
  }));
  const src = fs.readFileSync(file, 'utf8');
  // schema defaults fill the settings the template leaves out, as Shopify does
  const schema = JSON.parse(src.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/)[1]);
  const settings = { ...tpl.settings };
  for (const st of schema.settings || []) if (st.id && settings[st.id] === undefined && st.default !== undefined) settings[st.id] = st.default;
  const section = { id: `template--harness__${key}`, settings, blocks };
  const html = await liquid.parseAndRender(src, { section, request: { design_mode: false }, routes: { all_products_collection_url: '/collections/all' } });
  return { section, html, count: blocks.length };
}
const quiz = await renderSection('scent_quiz', 'theme-files/sections/scent-quiz.liquid');
const personas = await renderSection('scent_quiz_personas', 'theme-files/sections/scent-quiz-personas.liquid');
const section = quiz.section;
const rendered = quiz.html;

// the live page's own sections around the quiz (simplified): header with cart counter, breadcrumbs,
// then the quiz, then placeholders for the page's existing image banners / collection list
const page = `<!doctype html>
<html lang="en" class="js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Find your Perfume – harness</title>
<!-- live theme stylesheets (read-only GET from the store CDN) so theme-wide rules are in play, as on the site -->
<link href="https://aromastylist.com/cdn/shop/t/70/assets/screen.css" rel="stylesheet" type="text/css" media="screen">
<link href="https://aromastylist.com/cdn/shop/t/70/assets/theme-xtra.css" rel="stylesheet" type="text/css" media="screen">
<link href="/harness/theme-vars.css" rel="stylesheet">
<link href="/harness/harness.css" rel="stylesheet">
<script>
  // mock of what Shopify injects on every storefront page
  window.Shopify = window.Shopify || {};
  Shopify.routes = { root: '/' };
  window.__sqEvents = [];
  Shopify.analytics = { publish: function (name, data) { window.__sqEvents.push({ name: name, data: JSON.parse(JSON.stringify(data)) }); console.log('[analytics]', name, JSON.stringify(data)); } };
</script>
</head>
<body>
<div id="root">
  <header class="hx-header palette-scheme-1">
    <a class="hx-logo" href="/">AROMA STYLIST <small>(harness)</small></a>
    <a class="hx-cart" href="/cart" data-panel="cart" aria-label="Cart">Bag <span id="cart-count">0</span> · <span id="cart-total">$0.00</span></a>
  </header>
  <main id="content">
    <nav class="hx-crumbs" aria-label="Breadcrumbs"><a href="/">Homepage</a> / Find your Perfume</nav>
    <div id="shopify-section-${section.id}" class="shopify-section shopify-section-scent-quiz">
${rendered}
    </div>
    <div id="shopify-section-${personas.section.id}" class="shopify-section shopify-section-scent-quiz-personas">
${personas.html}
    </div>
    <section class="hx-existing" data-existing-content>
      <h2>Existing page content</h2>
      <p>Image banners · Fresh · Clean · Fruity · Floral · Vanilla · Gourmand · Amber · Woody · Lavender · reviews - these sections stay exactly as they are on the live page.</p>
    </section>
  </main>
</div>
</body>
</html>
`;
fs.writeFileSync('harness/index.html', page);
console.log(`harness/index.html rendered (quiz ${quiz.count} blocks, personas ${personas.count} blocks)`);
