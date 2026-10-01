// The sandbox's HTTPS proxy re-signs TLS with its own CA. Node trusts that CA; the bundled Chromium does not.
// Instead of disabling certificate checks, external requests from the browser are fetched by Node
// (normal TLS verification) and handed back to the page. Responses are cached on disk for repeat runs.
import fs from 'node:fs';
import crypto from 'node:crypto';

const CACHE = '.cache/external';
fs.mkdirSync(CACHE, { recursive: true });

export async function routeExternal(context) {
  await context.route(/^https:\/\//, async (route) => {
    const req = route.request();
    const url = req.url();
    const key = crypto.createHash('sha1').update(req.method() + url).digest('hex');
    const file = `${CACHE}/${key}`;
    try {
      if (req.method() === 'GET' && fs.existsSync(file)) {
        const meta = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
        return route.fulfill({ status: meta.status, headers: meta.headers, body: fs.readFileSync(file) });
      }
      const res = await fetch(url, { method: req.method(), headers: { 'user-agent': req.headers()['user-agent'] || 'Mozilla/5.0', accept: req.headers().accept || '*/*' }, body: req.method() === 'GET' ? undefined : req.postDataBuffer() });
      const body = Buffer.from(await res.arrayBuffer());
      const headers = {};
      res.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(k)) headers[k] = v; });
      headers['access-control-allow-origin'] ||= '*';
      if (req.method() === 'GET' && res.ok) {
        fs.writeFileSync(file, body);
        fs.writeFileSync(`${file}.json`, JSON.stringify({ status: res.status, headers }));
      }
      return route.fulfill({ status: res.status, headers, body });
    } catch (e) {
      return route.abort();
    }
  });
}
