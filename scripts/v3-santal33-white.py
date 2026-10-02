# Santal 33 tile: Le Labo's packshot is clear glass on a grey studio. The grey is divided out row by row (flat field),
# the bottle outline is taken from its glass edges, and everything outside it becomes white.
# Run: python3 scripts/v3-santal33-white.py  (downloads the brand image listed in quiz/data/images.json)
import os
import urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'https://lelabo.ips.photos/lelabo-java/images/skus/100PS33100__PRODUCT_01--IMG_1200--SANTAL33-883562345.jpg'
OUT = 'theme-files/assets/sq-ref-le-labo-santal-33.webp'
req = urllib.request.Request(SRC, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as r, open('/tmp/s33.jpg', 'wb') as f:
    f.write(r.read())
a = np.asarray(Image.open('/tmp/s33.jpg').convert('RGB')).astype(float)
H, W, _ = a.shape

# 1. bottle outline: outermost sharp glass edges per row, made symmetric around the bottle's axis
lum = ndimage.gaussian_filter(a.mean(2), 1.2)
g = np.hypot(ndimage.sobel(lum, 1), ndimage.sobel(lum, 0))
cx, Y0, Y1 = 601.5, 447, 1043          # axis and top / bottom of the bottle in the 1200 px packshot
half = np.zeros(H)
for y in range(Y0, Y1):
    idx = np.where(g[y, 440:780] > 40)[0] + 440
    if len(idx) >= 2:
        cands = [h for h in (cx - idx[0], idx[-1] - cx) if h > 20]   # the shorter side: the shadow widens the other
        half[y] = min(cands) if cands else 0
seg = half[Y0:Y1]
i = np.arange(len(seg))
seg = ndimage.median_filter(np.interp(i, i[seg > 0], seg[seg > 0]), size=25)
half[Y0:Y1] = seg
sil = np.zeros((H, W), bool)
for y in range(Y0, Y1):
    sil[y, int(cx - half[y] - 1):int(cx + half[y] + 2)] = True
m = ndimage.gaussian_filter(sil.astype(float), 1.2)

# 2. flat field: background per row, interpolated between the bare studio left and right of the bottle
xs = np.arange(W)
bg = np.zeros_like(a)
for c in range(3):
    ch = ndimage.uniform_filter1d(a[..., c], 25, axis=0)
    left, right = np.median(ch[:, 300:430], 1), np.median(ch[:, 800:930], 1)
    bg[..., c] = left[:, None] + (right - left)[:, None] * ((xs - 365) / 500)[None, :]
flat = np.clip(a / bg * 255, 0, 255)
out = flat * m[..., None] + 255 * (1 - m[..., None])

# 3. square crop, bottle at 80 % of the height like the other tiles
side = int((Y1 - Y0) / 0.80)
cy, c = (Y0 + Y1) // 2, int(cx)
im = Image.fromarray(np.clip(out[cy - side // 2:cy - side // 2 + side, c - side // 2:c - side // 2 + side], 0, 255).astype(np.uint8))
im = im.resize((600, 600), Image.LANCZOS)
for q in range(85, 40, -5):
    im.save(OUT, 'WEBP', quality=q, method=6)
    if os.path.getsize(OUT) <= 30000:
        break
print(OUT, os.path.getsize(OUT), 'q', q)
