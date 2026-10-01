// Read the live page's theme variables and font faces so the harness looks like the real site.
// GET https://aromastylist.com/pages/find-your-perfume  ->  harness/theme-vars.css
//   - every :root / [class*="palette-scheme-N"] custom-property block from the theme's inline <style>
//   - the @font-face rules of the theme fonts (body + heading), with absolute URLs
import fs from 'node:fs';

const URL_ = process.argv[2] || 'https://aromastylist.com/pages/find-your-perfume';
const ORIGIN = new URL(URL_).origin;
const html = await (await fetch(URL_)).text();
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);

const out = [`/* Extracted from ${URL_} on ${new Date().toISOString().slice(0, 10)} by scripts/extract-theme-vars.mjs. Harness only - not uploaded. */`];
const vars = [];
for (const css of styles) {
  for (const m of css.matchAll(/([^{}]*(?::root|palette-scheme-\d)[^{}]*)\{([^{}]*--[^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/^\/\*[\s\S]*?\*\//, '').trim();
    if (!sel || /jdgm/.test(m[2])) continue;
    vars.push(`${sel} {${m[2]}}`);
  }
}
const fontFamilies = new Set();
for (const v of vars) for (const m of v.matchAll(/--main_ff(?:_h)?:\s*"([^"]+)"/g)) fontFamilies.add(m[1]);
const faces = [];
for (const css of styles) {
  for (const m of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const fam = (m[0].match(/font-family:\s*["']?([^;"']+)/) || [])[1];
    if (fontFamilies.has(fam)) faces.push(m[0].replace(/url\((["']?)\/\//g, 'url($1https://').replace(/url\((["']?)\//g, `url($1${ORIGIN}/`));
  }
}
out.push(...faces, ...vars);
fs.writeFileSync('harness/theme-vars.css', out.join('\n') + '\n');
console.log(`fonts: ${[...fontFamilies].join(', ')} (${faces.length} @font-face) | variable blocks: ${vars.length}`);
