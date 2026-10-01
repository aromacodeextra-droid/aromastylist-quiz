"""Turn the downloaded official bottle images (quiz/data/img-src/<id>.*) into theme assets
theme-files/assets/sq-ref-<id>.webp: background flattened to the quiz card colour, bottle centred and padded,
600x600 square, webp <= 30 KB. Writes the manifest quiz/data/images.json (source URL per image).
Usage: python3 scripts/v3-images.py   (needs Pillow + numpy)"""
import glob, io, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

CARD = (255, 255, 255)  # --sq-card on aromastylist.com (scheme-1 bg_secondary)
SIZE, PAD, MAXB = 600, 0.08, 30 * 1024
SRC, OUT = 'quiz/data/img-src', 'theme-files/assets'

def smooth_c(rgb, y, x):
    h, w = rgb.shape[:2]
    y0, x0 = (0 if y == 0 else h - 12), (0 if x == 0 else w - 12)
    return rgb[y0:y0 + 12, x0:x0 + 12].reshape(-1, 3).mean(axis=0)

def flatten(img):
    """Transparent PNGs: composite on the card colour. Opaque packshots: flood-fill the background from the
    borders (colours close to the corner colour) and paint it the card colour."""
    img = img.convert('RGBA')
    if max(img.size) > 1200: img.thumbnail((1200, 1200), Image.LANCZOS)
    a = np.array(img).astype(np.int16)
    if (a[..., 3] < 250).mean() > 0.01:
        bg = Image.new('RGBA', img.size, CARD + (255,))
        return Image.alpha_composite(bg, img).convert('RGB'), 'alpha'
    rgb = a[..., :3]
    h, w = rgb.shape[:2]
    smooth = ndimage.uniform_filter(rgb.astype(np.float32), size=(5, 5, 1))  # film grain must not stop the fill
    # background model: a smooth quadratic surface fitted to the outer border band (handles studio vignettes)
    yy, xx = np.mgrid[0:h, 0:w]
    Y, X = yy / h - 0.5, xx / w - 0.5
    band = np.zeros((h, w), bool)
    b = max(4, int(min(h, w) * 0.04))
    band[:b] = band[-b:] = True; band[:, :b] = band[:, -b:] = True
    A = np.stack([np.ones(band.sum()), X[band], Y[band], X[band] ** 2, Y[band] ** 2, X[band] * Y[band]], 1)
    full = np.stack([np.ones(h * w), X.ravel(), Y.ravel(), X.ravel() ** 2, Y.ravel() ** 2, (X * Y).ravel()], 1)
    model = np.stack([(full @ np.linalg.lstsq(A, smooth[..., c][band], rcond=None)[0]).reshape(h, w) for c in range(3)], 2)
    ref = smooth[band].mean(axis=0)
    # background = pixels close to the model that connect to the border; widen the tolerance until it is reached
    for tol in (22, 32, 44):
        close = np.abs(smooth - model).max(axis=2) <= tol
        lab, _ = ndimage.label(close)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        seen = np.isin(lab, list(edge))
        if seen.mean() > 0.45: break
    out = rgb.copy()
    out[seen] = CARD
    return Image.fromarray(out.astype(np.uint8), 'RGB'), 'flood (bg %s)' % ','.join(str(int(v)) for v in ref)

def square(img):
    a = np.array(img).astype(np.int16)
    mask = np.abs(a - np.array(CARD)).max(axis=2) > 12
    ys, xs = np.where(mask)
    if len(xs): img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    w, h = img.size
    side = int(max(w, h) / (1 - 2 * PAD))
    canvas = Image.new('RGB', (side, side), CARD)
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)

def save(img, path):
    for q in range(86, 20, -4):
        buf = io.BytesIO(); img.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= MAXB: break
    open(path, 'wb').write(buf.getvalue())
    return buf.tell(), q

meta = {}
for f in sorted(glob.glob('quiz/data/raw/img-out-*.json')):
    for x in json.load(open(f)): meta[x['id']] = x
popular = json.load(open('quiz/data/popular-meta.json'))
wanted = popular['popular'] + popular['images']
manifest = []
for id in wanted:
    m = meta.get(id, {})
    files = [p for p in glob.glob(f'{SRC}/{id}.*')]
    row = {'id': id, 'tile': id in popular['popular'], 'source_url': m.get('image_url', ''), 'page_url': m.get('page_url', ''), 'source_type': m.get('source_type', 'none') if files else 'none', 'comment': m.get('comment', '')}
    out = f'{OUT}/sq-ref-{id}.webp'
    if files and m.get('source_type') not in (None, 'none'):
        if m.get('levels'):
            # pale glass on a light studio grey: cutting the background out would cut the glass too,
            # so lift the grey to the card colour with levels instead
            img = Image.open(files[0]).convert('RGB')
            a = np.array(img).astype(np.float32)
            bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3)]), axis=0)
            img, how = Image.fromarray(np.clip(a * (255.0 / bg), 0, 255).astype(np.uint8)), 'levels (bg %s -> white)' % ','.join(str(int(v)) for v in bg)
        else:
            img, how = flatten(Image.open(files[0]))
        n, q = save(square(img), out)
        row.update({'file': f'theme-files/assets/sq-ref-{id}.webp', 'bytes': n, 'webp_quality': q, 'background': how})
    elif os.path.exists(out):
        os.remove(out)
    manifest.append(row)
json.dump({'note': 'Official bottle images for the 12 popular tiles and the next 48 most-searched perfumes. Source: the brand\'s own site (else Sephora / Nordstrom). Processed by scripts/v3-images.py: background flattened to the card colour #ffffff, centred, 8% padding, 600x600 webp <= 30 KB. "none" = the brand site blocked every request; the quiz then shows a text tile / text row.', 'images': manifest}, open('quiz/data/images.json', 'w'), indent=1)
done = [r for r in manifest if r.get('file')]
print(f"{len(done)} of {len(manifest)} images; total {sum(r['bytes'] for r in done)/1024:.0f} KB; largest {max([r['bytes'] for r in done] or [0])/1024:.1f} KB; tiles {sum(1 for r in done if r['tile'])}/12")
print('none:', ' '.join(r['id'] for r in manifest if not r.get('file')))
