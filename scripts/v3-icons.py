"""Owner icon sheets (quiz/brands/aromastylist/icons-src/*.png) -> one SVG per answer in theme-files/assets.

Each sheet holds a row (or two) of line icons on white. Icons are found as connected blobs, ordered row by row,
left to right, traced to vector (potracer) and written as sq-icon-<screen>-<answer>.svg in the sheet's gold.
Run: python3 scripts/v3-icons.py   (needs: pip install potracer scipy pillow numpy)
"""
import os
import numpy as np
import potrace
from PIL import Image
from scipy import ndimage

SRC = 'quiz/brands/aromastylist/icons-src'
OUT = 'theme-files/assets'
SHEETS = [
    ('feel.png', 2, ['feel-confident', 'feel-attractive', 'feel-calm', 'feel-energised', 'feel-festive', 'feel-free']),
    ('moments.png', 2, ['week-work-study', 'week-everyday-errands', 'week-family-home', 'week-evenings-dates',
                        'week-events-celebrations', 'week-sport', 'week-time-for-me-growth']),
    ('matters.png', 1, ['matters-easy', 'matters-trending', 'matters-unique']),
    ('for.png', 1, ['for-her', 'for-him', 'for-both']),
]


def trace(mask):
    path = potrace.Bitmap(mask).trace(turdsize=8, alphamax=1.0, opticurve=True, opttolerance=0.25)
    d = []
    for c in path:
        s = c.start_point
        d.append(f'M{s.x:.0f} {s.y:.0f}')
        for seg in c.segments:
            e = seg.end_point
            if seg.is_corner:
                d.append(f'L{seg.c.x:.0f} {seg.c.y:.0f}L{e.x:.0f} {e.y:.0f}')
            else:
                d.append(f'C{seg.c1.x:.0f} {seg.c1.y:.0f} {seg.c2.x:.0f} {seg.c2.y:.0f} {e.x:.0f} {e.y:.0f}')
        d.append('Z')
    return ''.join(d)


def inside(a, b):
    return a != b and a[0].start >= b[0].start and a[0].stop <= b[0].stop and a[1].start >= b[1].start and a[1].stop <= b[1].stop


for sheet, rows, names in SHEETS:
    rgb = np.asarray(Image.open(f'{SRC}/{sheet}').convert('RGB')).astype(float)
    lum = rgb.mean(2)
    lab, _ = ndimage.label(ndimage.binary_dilation(lum < 200, iterations=25))
    boxes = [b for b in ndimage.find_objects(lab) if (b[0].stop - b[0].start) * (b[1].stop - b[1].start) > 5000]
    boxes = [a for a in boxes if not any(inside(a, b) for b in boxes)]  # a star inside a bottle is part of it
    h = rgb.shape[0]
    boxes.sort(key=lambda b: (int((b[0].start + b[0].stop) / 2 / (h / rows)), b[1].start))
    assert len(boxes) == len(names), (sheet, len(boxes))
    gold = '#%02x%02x%02x' % tuple(int(v) for v in rgb[lum < 150].mean(0))
    for b, name in zip(boxes, names):
        crop = lum[b[0], b[1]]
        ch, cw = crop.shape
        side = int(max(ch, cw) * 1.08)
        canvas = np.full((side, side), 255.0)
        oy, ox = (side - ch) // 2, (side - cw) // 2
        canvas[oy:oy + ch, ox:ox + cw] = crop
        # trace at 1000 px so curves stay smooth
        big = np.asarray(Image.fromarray(canvas.astype(np.uint8)).resize((1000, 1000), Image.LANCZOS))
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'
               f'<path fill="{gold}" fill-rule="evenodd" d="{trace(big >= 190)}"/></svg>')
        path = f'{OUT}/sq-icon-{name}.svg'
        with open(path, 'w') as f:
            f.write(svg)
        print(f'{path} {os.path.getsize(path)} B')
