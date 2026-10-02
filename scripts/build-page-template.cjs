// Builds docs/theme-copy/page.find-your-perfume.json: the find-your-perfume page template of the theme copy
// (the page's own sections + the two quiz sections from theme-files/templates). Run after build-theme-files.mjs.
const fs = require('fs'), crypto = require('crypto');
const repo = JSON.parse(fs.readFileSync('theme-files/templates/aromastylist.scent-quiz.section.json', 'utf8'));
const img = (id, rows, cols) => [id, { type: 'image', settings: { overlay_opacity: 0, color_palette: '', text_position: 'text-center', cols, rows, title: '<h2>Image banner</h2>', title_underline_style: 'none', text: '', show_link: true, link_text: 'Button', link_url: '', button_style: 'primary plain', show_overlay_link: true, overlay_url: '', show_look: false, product_list: [], look_btn_style: 'buy_button plain', look_position: 'end', show_look_label: false, look_label_text: 'Label' } }];
const grid = [img('image_aKH7t4', 2, 1), img('image_AjcgyK', 1, 1), img('image_td9GN4', 1, 1), img('image_Tmy7wq', 1, 2), img('image_JHT6ax', 2, 1)];
function page(label) {
  const sq = JSON.parse(JSON.stringify(repo.scent_quiz));
  sq.blocks.a_for_both.settings.label = label;
  return {
    sections: {
      breadcrumbs: { type: 'breadcrumbs', settings: { hide_mobile: false } },
      'main-page': { type: 'main-page', settings: { max_width: 980, content_alignment: 'center', text_alignment: 'center', spacing_desktop: 50, spacing_mobile: 30, fix_zindex: 0 } },
      section_grid_UPENYR: { type: 'section-grid', blocks: Object.fromEntries(grid), block_order: grid.map((g) => g[0]), name: 't:sections.grid.presets.name',
        settings: { number_of_columns: '4', height: 'size-s', width: 'boxed', space_between: 16, image_zoom: true, image_move: false, layout_mobile: 'rows', mobile_height: 'size-s', spacing_desktop: 50, spacing_mobile: 30, fix_zindex: 0 } },
      section_collection_list_wTRGUj: { type: 'section-collection-list', name: 't:sections.collection_list.presets.name',
        settings: { collections: ['citrus', 'clean-fragrance', 'feminine-activities', 'white-floral', 'vanilla', 'gourmand', 'amber', 'woody', 'lavender'], image_ratio: 'portrait', fill_images: true, layout: 'slider', number_of_items: 5, text_alignment: 'start', width: 'wide', title: '', title_underline_style: 'none', show_link: false, link_text: 'Button', link_url: '/', button_style: 'primary plain', collection_title_size: 'h5', mobile_layout: 'slider', spacing_desktop: 50, spacing_mobile: 30, fix_zindex: 0 } },
      scent_quiz: sq,
      scent_quiz_personas: repo.scent_quiz_personas,
    },
    order: ['breadcrumbs', 'main-page', 'scent_quiz', 'scent_quiz_personas', 'section_grid_UPENYR', 'section_collection_list_wTRGUj'],
  };
}
const head = '/*\n * ------------------------------------------------------------\n * IMPORTANT: The contents of this file are auto-generated.\n *\n * This file may be updated by the Shopify admin theme editor\n * or related systems. Please exercise caution as any changes\n * made to this file may be overwritten.\n * ------------------------------------------------------------\n */\n';
const oldTxt = head + JSON.stringify(page('Both of us / no rule'), null, 2) + '\n';
const newTxt = head + JSON.stringify(page('Unisex'), null, 2) + '\n';
console.log('rebuilt original:', Buffer.byteLength(oldTxt), crypto.createHash('md5').update(oldTxt).digest('hex'), '(theme: 14366 5534e289711bc4b9793998b00f68ff70)');
fs.writeFileSync('docs/theme-copy/page.find-your-perfume.json', newTxt);
console.log('new:', Buffer.byteLength(newTxt), crypto.createHash('md5').update(newTxt).digest('hex'));
