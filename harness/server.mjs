// Local static server for the harness + mocks of the storefront endpoints the quiz calls.
//   GET  /  and /pages/find-your-perfume  -> harness/index.html (re-rendered at start)
//   GET  /products/<handle>.js            -> built from quiz/brands/<brand>/catalog.json (Ajax API shape)
//   POST /cart/add.js                     -> validates {items:[{id,quantity}]}, logs the payload
//   GET  /cart.js, /cart                  -> mock cart state / page
//   GET  /__harness/cart-log              -> every add.js payload received (for tests)
// No dependencies. Usage: node harness/server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PORT = +(process.argv[2] || process.env.PORT || 8787);
const BRAND = process.env.BRAND || 'aromastylist';
const ROOT = path.resolve('.');
const LOG = 'harness/logs/cart-add.jsonl';

execFileSync(process.execPath, ['harness/render.mjs'], { stdio: 'inherit' });
const catalog = JSON.parse(fs.readFileSync(`quiz/brands/${BRAND}/catalog.json`, 'utf8'));
const byHandle = Object.fromEntries(catalog.products.map((p) => [p.handle, p]));
const byVariant = {};
catalog.products.forEach((p) => p.variants.forEach((v) => (byVariant[v.id] = { p, v })));
fs.mkdirSync('harness/logs', { recursive: true });

let cart = [];
const addLog = [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const cartJson = () => ({
  item_count: cart.reduce((s, i) => s + i.quantity, 0),
  total_price: Math.round(cart.reduce((s, i) => s + i.price * i.quantity, 0)),
  currency: 'USD',
  items: cart,
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);

  if (req.method === 'POST' && p === '/cart/add.js') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch { return send(res, 400, { status: 400, description: 'bad json' }); }
      const entry = { at: new Date().toISOString(), payload: data };
      addLog.push(entry);
      fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
      console.log('[cart/add.js]', JSON.stringify(data));
      const items = Array.isArray(data.items) ? data.items : [];
      const bad = items.find((i) => !byVariant[i.id] || !(i.quantity > 0));
      if (!items.length || bad) return send(res, 422, { status: 422, description: `unknown variant ${bad && bad.id}` });
      const added = items.map((i) => {
        const { p: prod, v } = byVariant[i.id];
        const line = { id: v.id, quantity: i.quantity, price: Math.round(v.price * 100), title: `${prod.title} - ${v.title}`, handle: prod.handle, vendor: prod.house };
        const ex = cart.find((c) => c.id === v.id);
        if (ex) ex.quantity += i.quantity; else cart.push({ ...line });
        return line;
      });
      send(res, 200, { items: added });
    });
    return;
  }
  if (p === '/cart.js') return send(res, 200, cartJson());
  if (p === '/cart/clear.js') { cart = []; return send(res, 200, cartJson()); }
  if (p === '/__harness/cart-log') return send(res, 200, addLog);
  if (p === '/cart') {
    const c = cartJson();
    return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cart (mock)</title>
<body style="font-family:sans-serif;padding:24px"><h1>Cart (mock)</h1><p data-count>${c.item_count} items · $${(c.total_price / 100).toFixed(2)}</p>
<ul>${cart.map((i) => `<li data-variant="${i.id}">${i.vendor} - ${i.title} × ${i.quantity}</li>`).join('')}</ul><p><a href="/pages/find-your-perfume">Back to the quiz</a></p></body>`, TYPES['.html']);
  }
  const prod = p.match(/^\/products\/([^/]+)\.js$/);
  if (prod) {
    const x = byHandle[prod[1]];
    if (!x) return send(res, 404, { status: 404 });
    return send(res, 200, { handle: x.handle, title: x.title, vendor: x.house, variants: x.variants.map((v) => ({ id: v.id, title: v.title, available: v.available, price: Math.round(v.price * 100) })) });
  }

  let file = p === '/' || p === '/pages/find-your-perfume' ? '/harness/index.html' : p;
  file = path.join(ROOT, file);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, () => console.log(`harness: http://localhost:${PORT}/pages/find-your-perfume`));
